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
  retry_count: number;
  max_retries: number;
}

export interface PrismaTransactionClient {
  $queryRawUnsafe: <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => Promise<T>;
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
    tx: PrismaTransactionClient, // Prisma interactive transaction
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
    tx: PrismaTransactionClient,
    limit = 100,
    schema = 'geometry',
  ): Promise<OutboxRecord[]> {
    return tx.$queryRawUnsafe(
      `SELECT id, event_type, aggregate_id, aggregate_type, payload,
              correlation_id, created_at, published_at, retry_count, max_retries
       FROM ${schema}.outbox
       WHERE published_at IS NULL
       ORDER BY id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      limit,
    );
  }

  /**
   * Mark outbox events as published (after Kafka ack).
   */
  async markPublished(
    tx: PrismaTransactionClient,
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

  /**
   * Moves an event to the Dead Letter Queue after max retries.
   */
  async moveToDeadLetter(
    tx: PrismaTransactionClient,
    event: OutboxRecord | Record<string, unknown>,
    errorMessage: string,
    schema = 'geometry',
  ): Promise<void> {
    // 1. Insert into outbox_dlq
    await tx.$queryRawUnsafe(
      `INSERT INTO ${schema}.outbox_dlq
        (original_id, event_type, aggregate_id, payload, error_message, retry_count)
       VALUES ($1, $2, $3::uuid, $4::jsonb, $5, $6)`,
      event.id as bigint,
      ((event as Record<string, unknown>).event_type ||
        event.eventType) as string,
      ((event as Record<string, unknown>).aggregate_id ||
        event.aggregateId) as string,
      JSON.stringify(event.payload),
      errorMessage,
      ((event as Record<string, unknown>).retry_count as number) || 0,
    );

    // 2. Delete from original outbox
    await tx.$queryRawUnsafe(
      `DELETE FROM ${schema}.outbox WHERE id = $1`,
      event.id as bigint,
    );
  }

  /**
   * Increment the retry count for a failed event.
   */
  async incrementRetry(
    tx: PrismaTransactionClient,
    eventId: bigint,
    errorMessage: string,
    schema = 'geometry',
  ): Promise<void> {
    await tx.$queryRawUnsafe(
      `UPDATE ${schema}.outbox
       SET retry_count = retry_count + 1,
           last_error = $2,
           failed_at = NOW(),
           published_at = NULL
       WHERE id = $1`,
      eventId,
      errorMessage,
    );
  }
}
