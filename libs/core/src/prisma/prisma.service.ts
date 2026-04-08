import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLoggerService } from '../logger/logger.service';

/**
 * Prisma service — single managed connection to PostgreSQL.
 * Handles connection lifecycle with NestJS module hooks.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly logger: AppLoggerService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL', 'PrismaService');

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      const prismaEvents = this as unknown as {
        $on(
          event: 'query',
          listener: (e: import('@prisma/client').Prisma.QueryEvent) => void,
        ): void;
      };

      prismaEvents.$on('query', (e) => {
        if (e.duration > 100) {
          this.logger.warn(
            `Slow query (${e.duration}ms): ${e.query}`,
            'PrismaService',
          );
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected', 'PrismaService');
  }

  /**
   * Execute raw SQL for PostGIS operations.
   * Prisma doesn't natively support PostGIS functions,
   * so we use $queryRawUnsafe for spatial queries.
   */
  async executeRawSpatial<T = unknown>(
    query: string,
    ...params: unknown[]
  ): Promise<T[]> {
    return this.$queryRawUnsafe<T[]>(query, ...params);
  }
}
