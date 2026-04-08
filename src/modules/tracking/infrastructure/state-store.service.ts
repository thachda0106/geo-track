import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class StateStoreService {
  private readonly logger = new Logger(StateStoreService.name);

  // Lua script: ARGV[1]=timestamp, ARGV[2]=payload JSON, ARGV[3]=lon, ARGV[4]=lat
  // Returns 1 if updated, 0 if ignored (stale).
  private readonly UPSERT_LUA = `
    local current_ts_str = redis.call('HGET', KEYS[1], 'ts')
    local current_ts = tonumber(current_ts_str) or 0
    local new_ts = tonumber(ARGV[1])

    if new_ts >= current_ts then
      -- Update hash payload
      redis.call('HSET', KEYS[1], 'payload', ARGV[2], 'ts', ARGV[1])
      -- Update TTL to 24h
      redis.call('EXPIRE', KEYS[1], 86400)
      
      -- Update spatial index (ZSET)
      redis.call('GEOADD', KEYS[2], ARGV[3], ARGV[4], KEYS[1])
      return 1
    else
      return 0
    end
  `;

  constructor(@InjectRedis() private readonly redis: Redis) {
    this.redis.defineCommand('upsertLocationAtomic', {
      numberOfKeys: 2,
      lua: this.UPSERT_LUA,
    });
  }

  /**
   * Pipelined batch update executed after PostGIS commit.
   */
  async updateCurrentStateBatch(
    region: string,
    batch: Array<{
      id: string;
      ts: number;
      lon: number;
      lat: number;
      state: any;
    }>,
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    const geoKey = `region:${region}:geoset`;

    for (const msg of batch) {
      const deviceKey = `device:${msg.id}`;
      // Execute our custom atomic command inside the pipeline
      const p = pipeline as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      p.upsertLocationAtomic(
        deviceKey, // KEYS[1]
        geoKey, // KEYS[2]
        msg.ts.toString(), // ARGV[1]
        JSON.stringify(msg.state), // ARGV[2]
        msg.lon.toString(), // ARGV[3]
        msg.lat.toString(), // ARGV[4]
      );
    }

    try {
      // Sends all 500 commands in a single network round-trip.
      const results = (await pipeline.exec()) ?? [];
      // results is an array of [error, result] tuples.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const ignoredCount = results.filter(([err, res]) => res === 0).length;
      if (ignoredCount > 0) {
        this.logger.warn(
          `Dropped ${ignoredCount} stale location updates via Lua timestamp check.`,
        );
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error('Redis pipeline execution failed', error.stack);
      // Depending on strictness, we might throw or gracefully swallow.
      // Usually, if Postgres saved it, we don't crash. We reconstruct cache on read if missing.
    }
  }
}
