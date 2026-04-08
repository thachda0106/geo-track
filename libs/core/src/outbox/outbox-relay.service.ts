import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OutboxService } from './outbox.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Polling relay that reads unpublished events from the outbox
 * and emits them to the internal Event Bus.
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
      // 1. Fetch unpublished events (polls 'geometry' schema outbox)
      // Note: In a multi-schema setup, we'd poll all outboxes or have dedicated relays
      await this.prisma.$transaction(async (tx) => {
        const events = await this.outboxService.fetchUnpublished(tx, 50, 'geometry');
        
        if (events.length === 0) {
          return; // No events, exit transaction
        }

        this.logger.debug(`Found ${events.length} unpublished events in outbox.`);

        const publishedIds: bigint[] = [];

        // 2. Publish locally (in memory)
        for (const event of events) {
          try {
            // Fire event locally (idempotent consumers will handle it)
            this.eventEmitter.emit((event as any).event_type || event.eventType, {
              ...event.payload,
              _eventId: event.id,
              _correlationId: (event as any).correlation_id || event.correlationId,
            });

            publishedIds.push(event.id);
            
          } catch (err) {
            const error = err as Error;
            this.logger.error(
              `Failed to publish event ${event.id}: ${error.message}`,
              error.stack,
            );
          }
        }

        // 3. Mark as published in DB to avoid double processing
        if (publishedIds.length > 0) {
          await this.outboxService.markPublished(tx, publishedIds, 'geometry');
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
}

