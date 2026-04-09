import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Polling relay that reads unpublished events from the outbox
 * and emits them to the internal Event Bus.
 *
 * Safety guarantees:
 * - Uses FOR UPDATE SKIP LOCKED to avoid double-processing across replicas
 * - Only marks events as published after successful emission
 * - Failed events remain in outbox for retry on next poll
 * - Periodically cleans up stale published events to prevent table bloat
 *
 * In a distributed setup, this service would physically publish
 * to a message broker like Kafka/Redpanda instead of EventEmitter.
 */
@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);
  private isRelaying = false;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async relayEvents() {
    if (this.isRelaying) return;
    this.isRelaying = true;

    try {
      // 1. Fetch unpublished events (polls 'infrastructure' schema outbox)
      // Note: In a multi-schema setup, we'd poll all outboxes or have dedicated relays
      await this.prisma.$transaction(async (tx) => {
        const events = await this.outboxService.fetchUnpublished(
          tx,
          50,
          'infrastructure',
        );

        if (events.length === 0) {
          return; // No events, exit transaction
        }

        this.logger.debug(
          `Found ${events.length} unpublished events in outbox.`,
        );

        const publishedIds: bigint[] = [];
        const failedIds: bigint[] = [];

        // 2. Publish locally (in memory)
        for (const event of events) {
          try {
            const safeEvent = event as unknown as Record<string, unknown>;
            const eventType = (safeEvent.event_type ||
              safeEvent.eventType) as string;
            const correlationId = (safeEvent.correlation_id ||
              safeEvent.correlationId) as string;

            // Fire event locally (idempotent consumers will handle it)
            this.eventEmitter.emit(eventType, {
              ...event.payload,
              _eventId: event.id,
              _correlationId: correlationId,
            });

            publishedIds.push(event.id);
          } catch (err) {
            const error = err as Error;
            this.logger.error(
              `Failed to publish event ${event.id}: ${error.message}`,
              error.stack,
            );

            // DLQ Logic
            const safeEvent = event as unknown as Record<string, unknown>;
            const retryCount = (safeEvent.retry_count ??
              safeEvent.retryCount ??
              0) as number;
            const maxRetries = (safeEvent.max_retries ??
              safeEvent.maxRetries ??
              5) as number;

            if (retryCount >= maxRetries) {
              await this.outboxService.moveToDeadLetter(
                tx,
                event,
                error.message,
                'infrastructure',
              );
              this.logger.warn(
                `Event ${event.id} permanently failed and moved to DLQ after ${retryCount} retries.`,
              );
            } else {
              await this.outboxService.incrementRetry(
                tx,
                event.id,
                error.message,
                'infrastructure',
              );
              failedIds.push(event.id); // Track so we can log it
            }
          }
        }

        // 3. Only mark successfully emitted events as published
        if (publishedIds.length > 0) {
          await this.outboxService.markPublished(tx, publishedIds, 'infrastructure');
        }

        if (failedIds.length > 0) {
          this.logger.warn(
            `Outbox relay: ${failedIds.length} events failed to publish, will retry on next cycle`,
          );
        }
      });
    } catch (err) {
      const error = err as Error;
      this.logger.error(
        `Outbox relay encountered an error: ${error.message}`,
        error.stack,
      );
    } finally {
      this.isRelaying = false;
    }
  }

  /**
   * Cleanup published outbox events older than 24 hours.
   * Prevents unbounded table growth.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupPublishedEvents() {
    try {
      const result = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `WITH deleted AS (
          DELETE FROM infrastructure.outbox
          WHERE published_at IS NOT NULL
            AND published_at < NOW() - INTERVAL '24 hours'
          RETURNING id
        )
        SELECT COUNT(*) as count FROM deleted`,
      );
      const count = Number(result[0]?.count ?? 0);
      if (count > 0) {
        this.logger.log(`Cleaned up ${count} published outbox events`);
      }
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Outbox cleanup failed: ${error.message}`, error.stack);
    }
  }
}
