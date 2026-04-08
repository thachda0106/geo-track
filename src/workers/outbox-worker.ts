import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { OutboxWorkerModule } from './outbox-worker.module';

/**
 * Outbox Worker entry point.
 *
 * Runs the outbox relay as a standalone process (no HTTP server).
 * The relay polls unpublished outbox events and emits them to consumers.
 *
 * Container target: `worker` in Dockerfile
 * K8s: Deployed as a Deployment with `replicas: 1` (single-instance)
 *
 * Usage:
 *   node dist/workers/outbox-worker.js
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(OutboxWorkerModule, {
    bufferLogs: true,
  });

  app.enableShutdownHooks();

  const logger = new Logger('OutboxWorker');
  logger.log('🔄 Outbox Worker started — polling for unpublished events...');

  // Keep the process alive (cron scheduler handles the work)
  // Graceful shutdown is handled by enableShutdownHooks()
}

bootstrap().catch((err) => {
  console.error('❌ Outbox Worker failed to start:', err);
  process.exit(1);
});
