import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLoggerService } from '../logger/logger.service';

// ═══════════════════════════════════════════════════════
// Inbox Service — Idempotent Event Processing
// ═══════════════════════════════════════════════════════

/**
 * Inbox deduplication helper.
 *
 * Prevents double-processing of events by checking if an event ID
 * has already been processed. Uses the `inbox` table (currently in
 * the `versioning` schema per Prisma schema).
 *
 * Usage:
 * ```typescript
 * async handleFeatureCreated(event: DomainEvent) {
 *   if (await this.inbox.isProcessed(event.id)) {
 *     this.logger.debug('Skipping duplicate event', event.id);
 *     return;
 *   }
 *
 *   // Process event...
 *   await this.inbox.markProcessed(event.id, event.type);
 * }
 * ```
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  /**
   * Check if an event has already been processed.
   */
  async isProcessed(eventId: string): Promise<boolean> {
    const existing = await this.prisma.inbox.findUnique({
      where: { eventId },
    });
    return existing !== null;
  }

  /**
   * Mark an event as processed (after successful handling).
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING for safety
   * in case of concurrent invocations.
   */
  async markProcessed(eventId: string, eventType: string): Promise<void> {
    try {
      await this.prisma.inbox.create({
        data: {
          eventId,
          eventType,
        },
      });

      this.logger.debug(
        `Inbox: marked ${eventType} (${eventId}) as processed`,
        'InboxService',
      );
    } catch (error: any) {
      // P2002 = unique constraint violation (already processed)
      if (error?.code === 'P2002') {
        this.logger.debug(
          `Inbox: event ${eventId} already processed (duplicate)`,
          'InboxService',
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Process an event idempotently.
   *
   * Combines check + execute + mark in one call.
   * Returns true if the event was processed, false if it was a duplicate.
   */
  async processOnce(
    eventId: string,
    eventType: string,
    handler: () => Promise<void>,
  ): Promise<boolean> {
    if (await this.isProcessed(eventId)) {
      this.logger.debug(
        `Inbox: skipping duplicate ${eventType} (${eventId})`,
        'InboxService',
      );
      return false;
    }

    await handler();
    await this.markProcessed(eventId, eventType);
    return true;
  }
}
