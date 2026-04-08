# ADR-005: Real-Time Communication — Socket.IO with Redis Adapter

**Status**: Accepted  
**Date**: 2026-04-07  
**Deciders**: Architecture Team  

## Context

Real-time requirements: push 10K+ location updates/sec to map viewers, broadcast geometry edits, support 10K+ concurrent WebSocket connections across multiple server instances.

## Decision

**Socket.IO with Redis Adapter** for all real-time communication.

## Rationale

- **Rooms**: Natural fit for spatial subscriptions (subscribe to device/session/tile region)
- **Redis Adapter**: Multi-instance fan-out without custom pub/sub
- **Auto-reconnect**: Critical for mobile clients with flaky connections
- **Namespace isolation**: `/tracking` for locations, `/features` for geometry changes

## Channel Design

```
/tracking namespace:
  device:{deviceId}       → single device updates
  session:{sessionId}     → all devices in session
  bbox:{z}:{x}:{y}       → tile region subscription

/features namespace:
  feature:{featureId}     → single feature changes
  bbox:{z}:{x}:{y}       → features in tile region
```

## Consequences

- ✅ Built-in room management for spatial subscriptions
- ✅ Multi-instance scaling via Redis adapter
- ✅ Reliable reconnection with event replay
- ⚠️ ~15% overhead vs raw WebSocket — acceptable

## Alternatives Rejected

1. **Raw WebSocket**: No rooms, no reconnect, no fallback — too much custom code
2. **SSE**: Unidirectional only — can't send from client
3. **MQTT**: Separate broker, different protocol — overkill for web clients
