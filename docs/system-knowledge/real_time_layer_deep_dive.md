# Real-Time Layer: Production Architecture & Implementation Guide

## 1. Deep Technical Explanation

A naive real-time layer simply attaches a WebSocket handler directly to the core API or the ingestion servers handling business logic. This guarantees catastrophic failure under scale. 

WebSockets are persistent TCP connections. In a Node.js/NestJS environment, every socket is backed by a libuv handle. The fundamental physics here are bound by two constraints: **memory footprints** and **event loop contention**. A standard Socket.io connection consumes approximately 50-100KB of heap memory to maintain framing buffers and internal mapping objects. 100,000 concurrent observers (dispatchers, user tracking links) equate to 5-10GB of sheer memory just for idle sockets.

More critically, pushing updates is synchronous at the user-land event loop level. If you broadcast a message to 10,000 clients dynamically, V8 has to serialize the object, construct 10,000 internal buffers, and enqueue 10,000 write operations for libuv. This blocks the main thread for milliseconds/seconds, halting incoming ping/pong heartbeats. When heartbeats are missed, clients assume the server died and simultaneously try to reconnect, resulting in a reconnect storm that completely kills the process.

To neutralize this, real-time gateways must be **pure, dumb push proxies**. They hold absolutely zero business logic, never interact with Postgres, and rely entirely on an external C-based broker (Redis) for routing logic. By routing all geospatial updates through a Redis Pub/Sub adapter, we force the high-throughput message tree resolution onto Redis's hyper-optimized C matrix, allowing the Node.js event loops to purely handle binary framing on small local socket subsets.

## 2. Production Architecture Details

**Data Flow at Runtime:**
1. A micro-batched write to TimescaleDB completes successfully.
2. The `TrackingWorker` (Kafka Consumer) fires a fire-and-forget publish to Redis: `redis.publish('fleet.update', binary_payload)`.
3. Independent, horizontal `WsGateway` pods, natively connected to Redis via native Pub/Sub, trap the event.
4. The `WsGateway` multiplexes the message specifically over the active OS TCP sockets in that node whose clients joined the referenced room (e.g., `fleet_id:123`).

**Threading & Async Behavior:**
- The HTTP connection upgrade (`GET` with `Connection: Upgrade`) is handled asynchronously by libuv. 
- Validation (JWT checking) must happen during the handshake phase over query parameters (because native browsers do not support custom Auth headers on `new WebSocket()`). 
- Dropping an invalid connection here is crucial; otherwise, unauthenticated sockets will consume TCP window buffers endlessly.

**Scaling Model:**
- We do not scale these pods based on CPU. A WS gateway masking memory or socket exhaustion might only sit at 15% CPU.
- Scaling occurs using Kubernetes HPA based on custom Prometheus metrics: **`concurrent_connections_per_pod`**. We set a ceiling (e.g., scale out when average connections per pod hits 15,000) to ensure the pod never triggers a V8 GC (Garbage Collection) "Stop The World" pause that crashes the heartbeat manager.

## 3. Code Implementation (REAL, NOT PSEUDO)

### 3.1 Redis Adapter Configuration
This binds Socket.io logic natively to Redis, so emitting to a room spans the entire Kubernetes cluster seamlessly.

```typescript
// redis-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    // The adapter patches native Socket.io emit() calls 
    // replacing them with Redis Pub/Sub calls cross-node
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
```

### 3.2 Secure WebSocket Gateway
We lock down the transport and reject connection polling fallbacks to prevent proxy exhaustion.

```typescript
// tracking.gateway.ts
import { 
  WebSocketGateway, 
  SubscribeMessage, 
  ConnectedSocket, 
  MessageBody,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsAuthGuard } from './ws-auth.guard'; // Decodes JWT on upgrade

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket'], // CRITICAL: Disable long-polling HTTP leaks
  pingInterval: 10000,       // OS TCP level pings
  pingTimeout: 5000,         // Clean up dead/zombie sockets on mobile drop
})
export class TrackingGateway {
  @WebSocketServer()
  server: Server;

  @UseGuards(WsAuthGuard) // Protects the physical room join
  @SubscribeMessage('subscribe_fleet')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody('fleet_id') fleetId: string
  ) {
    // Domain Check: Ensure attached user object has mapping rights to this fleet
    if (!client.data.user.accessedFleets.includes(fleetId)) {
       return { status: 'rejected', reason: 'Forbidden' };
    }

    // Leveraging native Socket.io room joining. 
    // The RedisAdapter silently syncs this local join to the Redis cluster
    await client.join(`fleet:${fleetId}`);
    return { status: 'joined', room: `fleet:${fleetId}` };
  }
}
```

### 3.3 The Worker Side Push (No Sockets required)
The backend processing the Kafka pipeline doesn't even need Socket.io logic. It literally commands the socket instances via raw Redis.

```typescript
// tracking.consumer.ts
async processAndPublish(location: LocationDto) {
  // Push to TimescaleDB
  await this.timescaleRepo.upsertCurrentLocation(location);
  
  // Directly command the Socket.io instances via Redis to emit
  // This bypasses CPU mapping in the worker completely. Room is 'fleet:XYZ'
  this.redisIoClient.to(`fleet:${location.fleetId}`).emit('loc_update', {
      d: location.deviceId,
      lat: location.lat,
      lng: location.lng,
      h: location.heading,
      s: location.speed // Shortened keys to save bandwidth
  });
}
```

## 4. Performance & Scaling

**Bottlenecks:**
- **OS Limits (`fs.file-max`)**: Every WebSocket consumes a file descriptor descriptor mapping. Standard Linux drops connections at 1024 (soft) or 65535 (hard). If you do not patch `/etc/security/limits.conf` inside your docker container runtime, scaling pods achieves nothing; the kernel strictly kills the socket at 65535.
- **Garbage Collection Pauses**: V8 GC is notorious for struggling with massive amounts of small object churn (e.g. creating/destroying frames for millions of location blasts). If GC pauses cross ~4 seconds, the Node process fails to reply to internal heartbeat ACKs, invoking a mass disconnect.

**Optimization techniques:**
- **Binary Framing (Serialization)**: Stop sending raw JSON strings. You should serialize location payloads utilizing standard schemas like Protobuf or MessagePack before broadcasting. Pushing arrays of raw bytes via Node limits the memory allocations needed for V8 `stringify` procedures.
- **Emit Debouncing**: Trackers might ping out bad hardware spikes at 10Hz. A frontend browser component will drop to 1 FPS trying to parse DOM changes 10 times a second. The gateway or worker must employ a throttle layer allowing a max `1Hz` emit rate per tracked entity.

## 5. Failure Scenarios

**Thundering Herd Storm:**
- *What happens*: A network spine blips or the Load Balancer restarts. 150,000 WebSocket connections drop simultaneously. All 150k browsers/phones immediately call `socket.connect()` at the exact same millisecond. The ensuing flood of TLS handshakes and Database lookups to validate tokens DDOS-es the entire company internal network, bringing down user auth for unrelated services.
- *Recovery Strategies*: Clients **must** implement exponential backoff with high jitter (`timeout = Math.random() * (interval^attempt) * 1000`). The Gateway Ingress (nginx) must implement strict connection rate-limiting for the `/socket.io/` upgrade path.

**Redis Pub/Sub Split:**
- *What happens*: The Redis cluster backing the adapter initiates a failover or crashes.
- *Recovery Strategies*: Cross-pod broadcasting halts. Local gateways handle active sockets, but the Redis Adapter immediately enters a reconnect loop. A well-tuned Redis Sentinel structure promotes a read replica to master in under 3 seconds. For tracking interfaces, map entity pins "pause" for 3 seconds, then naturally resume movement once the new Redis leader accepts the worker's updates.

**Zombie Pipes:**
- *What happens*: High-speed vehicles driving through tunnels lose 4G connectivity cleanly dropping the TCP `FIN` packet. The server keeps the socket mapped in RAM endlessly.
- *Recovery Strategies*: Server-side ping intervals (every 10s) are mandatory. If a client socket fails to ACK a Node.js ping frame within a tight timeout layer, aggressively dump the client reference to permit garbage collection to claim the memory block.

## 6. Common Mistakes

- **Global Broadcasts**: 
  `socket.broadcast.emit('new_loc')` is an architectural death-sentence. This forces the physical gateway to loop over its entire memory pool, clone the arrayBuffer object, and flush the OS tcp layer individually for every vehicle that moves. *Strictly restrict emit targeting to highly filtered socket rooms.*
- **Database Hydration in the Handshake**: 
  When a socket joins a room, many engineers query Postgres/Timescale internally inside the gateway handler to "fetch the last known 50 positions to paint the map line". If a thundering herd reconnect occurs, you just unleashed 150,000 `SELECT` operations upon your database, destroying the disk I/O. **Gateways must be dumb**. All historical hydration should be a vanilla stateless REST GET call `/api/fleet/xyz/history` referencing a localized CDN/Redis caching tier, fetched on the frontend entirely independently of the WebSocket open command.
- **Enabling HTTP Fallback Transports**: 
  Most libraries default to long-polling HTTP and upgrade to WS on success. For thousands of fast-moving markers, the polling fallback will destroy the HTTP load balancer by running out of SNAT ephemeral ports. Explicitly strip long-polling out.

## 7. Production Checklist

- [ ] Node docker images built tuning limits via `ulimit -n 1048576` and passing `--max-old-space-size=X` matching strict Kubernetes pod memory limits.
- [ ] Load balancer/Ingress controller configured setting explicitly high `proxy_read_timeout` (e.g. 86400s) specifically for the websocket locations to prevent Nginx cleanly killing idle long-running tracking boards.
- [ ] Websocket handshake authorization drops invalid tokens locally without cascading DB validation.
- [ ] Socket arrays emit raw Binary (MessagePack/Protobuf) for extreme payload compressions over the wire instead of uncompressed String structures.
- [ ] Pod auto-scaler uses custom connection-count metrics, scaling horizontally at ~15,000 sockets per pod maximum.
- [ ] Dead-connection detection (Ping/Pong heartbeating intervals) tuned tight (5s/10s).
- [ ] Redis maxmemory-policy verified specifically for PubSub queues so OOM forces an eviction of the subscriber stream rather than dropping the server node.
