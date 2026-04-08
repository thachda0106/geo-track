import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

/**
 * Redis Health Indicator for Terminus health checks.
 *
 * Checks Redis connectivity by sending a PING command.
 * Used by the readiness probe to ensure Redis is available
 * before the load balancer routes traffic to this instance.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@InjectRedis() private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong: string = await this.redis.ping();
      if (pong === 'PONG') {
        return this.getStatus(key, true);
      }
      throw new Error(`Redis PING returned: ${pong}`);
    } catch (error) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
