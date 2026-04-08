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
   * Process an event idempotently (atomic — no TOCTOU race).
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING to atomically claim the event.
   * If the insert succeeds (row didn't exist), we process the event.
   * If the insert is a no-op (row already existed), we skip.
   * If the handler throws, we delete the inbox entry so the event can be retried.
   *
   * Returns true if the event was processed, false if it was a duplicate.
   */
  async processOnce(
    eventId: string,
    eventType: string,
    handler: () => Promise<void>,
  ): Promise<boolean> {
    // Atomic claim: INSERT succeeds only if event_id doesn't exist yet
    const result = await this.prisma.$queryRawUnsafe<{ inserted: boolean }[]>(
      `INSERT INTO versioning.inbox (event_id, event_type, processed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (event_id) DO NOTHING
       RETURNING TRUE as inserted`,
      eventId,
      eventType,
    );

    if (result.length === 0) {
      // Row already existed — duplicate event, skip
      this.logger.debug(
        `Inbox: skipping duplicate ${eventType} (${eventId})`,
        'InboxService',
      );
      return false;
    }

    try {
      await handler();
      this.logger.debug(
        `Inbox: processed ${eventType} (${eventId})`,
        'InboxService',
      );
      return true;
    } catch (error) {
      // Handler failed — rollback the inbox entry so event can be retried
      this.logger.warn(
        `Inbox: handler failed for ${eventType} (${eventId}), releasing for retry`,
        'InboxService',
      );
      await this.prisma.$queryRawUnsafe(
        `DELETE FROM versioning.inbox WHERE event_id = $1`,
        eventId,
      );
      throw error;
    }
  }
}
