import { Injectable, Logger } from '@nestjs/common';
import * as CircuitBreaker from 'opossum';
import { PrismaService } from '@app/core';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

export interface LocationRow {
  location: Record<string, unknown>;
  speed: number;
  updated_at: Date;
}

@Injectable()
export class LocationCacheService {
  private readonly logger = new Logger(LocationCacheService.name);
  private breaker: CircuitBreaker;

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {
    // Breaker opens if >50% of requests fail within 10s. Tests recovery via half-open every 5s.
    this.breaker = new CircuitBreaker(this.fetchFromPostgres.bind(this), {
      timeout: 3000,
      errorThresholdPercentage: 50,
      resetTimeout: 5000,
    });

    this.breaker.on('open', () =>
      this.logger.warn(
        'Postgres circuit breaker OPEN — database under pressure',
      ),
    );
    this.breaker.on('halfOpen', () =>
      this.logger.warn('Postgres circuit breaker HALF-OPEN — testing recovery'),
    );
    this.breaker.on('close', () =>
      this.logger.log('Postgres circuit breaker CLOSED — recovered'),
    );
  }

  async getLatestLocation(deviceId: string): Promise<LocationRow | null> {
    try {
      // Try Fast Path
      const cached = await this.redis.get(`loc:${deviceId}`);
      if (cached) return JSON.parse(cached) as LocationRow;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Redis unavailable: ${error.message}`);
      } else {
        this.logger.error(`Redis unavailable: ${String(error)}`);
      }
    }

    // Slow Path via Circuit Breaker to prevent thundering herd on Postgres
    return this.breaker.fire(deviceId) as Promise<LocationRow | null>;
  }

  private async fetchFromPostgres(
    deviceId: string,
  ): Promise<LocationRow | null> {
    const loc = await this.prisma.$queryRaw<LocationRow[]>`
      SELECT location, speed, updated_at 
      FROM current_location 
      WHERE device_id = ${deviceId}::uuid 
      LIMIT 1`;
    if (!loc[0]) return null;
    return loc[0];
  }
}
