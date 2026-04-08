import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import {
  AppConfigModule,
  LoggerModule,
  PrismaModule,
  OutboxModule,
} from '@app/core';

/**
 * Outbox Worker Module.
 *
 * Lightweight standalone NestJS app that runs the outbox relay
 * as a dedicated single-instance process.
 *
 * Why separate?
 * - When API scales to N replicas, only ONE relay should poll the outbox
 * - Prevents N replicas doing redundant 1s polls against the DB
 * - Worker can have different resource limits (low CPU, low memory)
 * - Crash isolation: relay crash doesn't take down the API
 *
 * Usage:
 *   node dist/workers/outbox-worker.js
 */
@Module({
  imports: [
    // Background scheduling for cron-based relay
    ScheduleModule.forRoot(),

    // Event emitter for local event dispatch
    EventEmitterModule.forRoot({
      global: true,
      wildcard: true,
      delimiter: '.',
    }),

    // Core infrastructure
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    OutboxModule,
  ],
})
export class OutboxWorkerModule {}
