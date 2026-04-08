import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisHealthIndicator } from '../redis/redis.health';

/**
 * Health check endpoints for liveness and readiness probes.
 * These are public (no auth required) for load balancer / K8s probes.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memoryHealth: MemoryHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Liveness probe — is the process alive?
   * Used by Kubernetes to know if the pod should be restarted.
   */
  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }

  /**
   * Readiness probe — can the process accept traffic?
   * Checks database connectivity, Redis, and memory usage.
   */
  @Get('ready')
  @Public()
  @HealthCheck()
  checkReady() {
    return this.health.check([
      // Database must be reachable
      () => this.prismaHealth.pingCheck('database', this.prisma),

      // Redis must be reachable
      () => this.redisHealth.isHealthy('redis'),

      // Memory heap must be under 512MB
      () => this.memoryHealth.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }
}
