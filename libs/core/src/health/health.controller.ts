import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health check endpoints for liveness and readiness probes.
 * These are public (no auth required) for load balancer / k8s probes.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
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
   * Checks database connectivity.
   */
  @Get('ready')
  @Public()
  @HealthCheck()
  checkReady() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
