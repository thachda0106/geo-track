import { Global, Module } from '@nestjs/common';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from './redis.health';

/**
 * Redis Module.
 *
 * Provides a globally available Redis connection using ioredis.
 * Used for caching, rate limiting state, and pub/sub in future.
 *
 * Configuration:
 *   REDIS_HOST (default: localhost)
 *   REDIS_PORT (default: 6379)
 */
@Global()
@Module({
  imports: [
    NestRedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'single' as const,
        url: `redis://${configService.get('REDIS_HOST', 'localhost')}:${configService.get('REDIS_PORT', 6379)}`,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RedisHealthIndicator],
  exports: [NestRedisModule, RedisHealthIndicator],
})
export class RedisModule {}
