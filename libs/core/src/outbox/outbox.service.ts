import { Injectable } from '@nestjs/common';
import { AppLoggerService } from '../logger/logger.service';

// ═══════════════════════════════════════════════════════
// Outbox Event Types
// ═══════════════════════════════════════════════════════

export interface OutboxEvent {
  eventType: string;
  aggregateId: string;
  aggregateType?: string;
  payload: Record<string, unknown>;
  correlationId: string;
}

export interface OutboxRecord extends OutboxEvent {
  id: bigint;
  createdAt: Date;
  publishedAt: Date | null;
}

// ═══════════════════════════════════════════════════════
// Outbox Service
// ═══════════════════════════════════════════════════════

/**
 * Transactional Outbox helper.
 *
 * Guarantees at-least-once delivery by writing domain events
 * to the outbox table within the same database transaction as
 * the business operation.
 *
 * Usage (inside a Prisma transaction):
 * ```typescript
 * await this.prisma.$transaction(async (tx) => {
 *   // 1. Business operation
 *   const feature = await tx.$queryRawUnsafe(...);
 *
 *   // 2. Publish event (same transaction!)
 *   await this.outbox.publishEvent(tx, {
 *     eventType: 'FeatureCreated',
 *     aggregateId: feature.id,
 *     payload: { featureId: feature.id, name: feature.name },
 *     correlationId,
 *   });
 * });
 * ```
 *
 * A separate outbox poller (or CDC) reads unpublished events
 * and pushes them to Kafka/Redpanda.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly logger: AppLoggerService) {}

  /**
   * Insert an event into the outbox table (within a transaction).
   *
   * @param tx - Prisma interactive transaction client
   * @param event - The domain event to publish
   * @param schema - Database schema containing the outbox table (default: 'geometry')
   */
  async publishEvent(
    tx: any, // Prisma interactive transaction
    event: OutboxEvent,
    schema = 'geometry',
  ): Promise<void> {
    await tx.$queryRawUnsafe(
      `INSERT INTO ${schema}.outbox
        (event_type, aggregate_id, aggregate_type, payload, correlation_id)
      VALUES ($1, $2::uuid, $3, $4::jsonb, $5::uuid)`,
      event.eventType,
      event.aggregateId,
      event.aggregateType || 'Unknown',
      JSON.stringify(event.payload),
      event.correlationId,
    );

    this.logger.debug(
      `Outbox event queued: ${event.eventType} for ${event.aggregateId}`,
      'OutboxService',
    );
  }

  /**
   * Fetch unpublished outbox events (for the poller).
   *
   * @param limit - Maximum number of events to fetch
   * @param schema - Database schema (default: 'geometry')
   */
  async fetchUnpublished(
    tx: any,
    limit = 100,
    schema = 'geometry',
  ): Promise<OutboxRecord[]> {
    return tx.$queryRawUnsafe(
      `SELECT id, event_type, aggregate_id, aggregate_type, payload,
              correlation_id, created_at, published_at
       FROM ${schema}.outbox
       WHERE published_at IS NULL
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      limit,
    ) as Promise<OutboxRecord[]>;
  }

  /**
   * Mark outbox events as published (after Kafka ack).
   */
  async markPublished(
    tx: any,
    eventIds: bigint[],
    schema = 'geometry',
  ): Promise<void> {
    if (eventIds.length === 0) return;

    const idList = eventIds.map((id) => id.toString()).join(',');
    await tx.$queryRawUnsafe(
      `UPDATE ${schema}.outbox
       SET published_at = NOW()
       WHERE id IN (${idList})`,
    );
  }
}
