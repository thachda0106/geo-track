import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@app/core';
import { EachBatchPayload } from 'kafkajs';
import { Histogram } from 'prom-client';

@Injectable()
export class TrackingBatchProcessor {
  private readonly logger = new Logger(TrackingBatchProcessor.name);

  // Prometheus integration for observability
  private batchSizeHistogram = new Histogram({
    name: 'tracking_ingest_batch_size',
    help: 'Size of batches processed from Redpanda',
    buckets: [100, 500, 1000, 5000, 10000],
  });

  constructor(private readonly prisma: PrismaService) {}

  async processBatch(payload: EachBatchPayload) {
    this.batchSizeHistogram.observe(payload.batch.messages.length);

    if (payload.batch.messages.length === 0) return;

    // Fast-path parsing without class instantiation.
    // Using string arrays for UNNEST query injection.
    const deviceIds: string[] = [];
    const timestamps: string[] = [];
    const locations: string[] = [];
    const speeds: number[] = [];

    for (const message of payload.batch.messages) {
      if (!message.value) continue;
      // Bypassing JSON.parse if possible, but assuming standard payload here
      const val = JSON.parse(message.value.toString()) as {
        deviceId: string;
        timestamp: string;
        lng: number;
        lat: number;
        speed?: number;
      };
      deviceIds.push(val.deviceId);
      timestamps.push(val.timestamp);
      // ST_MakePoint explicitly expects Longitude then Latitude!
      locations.push(`POINT(${val.lng} ${val.lat})`);
      speeds.push(val.speed || 0.0);
    }

    try {
      // 1. RAW SQL Bulk Upsert using UNNEST
      // This sends a SINGLE parameterized query to Timescale, avoiding the standard
      // 65k parameter limit in Postgres by passing arrays natively.
      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO location_history (device_id, time, location, speed)
        SELECT 
            t.device_id::uuid,
            t.time::timestamptz,
            ST_SetSRID(ST_GeomFromText(t.location), 4326)::geography,
            t.speed::real
        FROM UNNEST(
            $1::text[], 
            $2::text[], 
            $3::text[], 
            $4::numeric[]
        ) AS t(device_id, time, location, speed)
        ON CONFLICT (device_id, time) DO NOTHING;
      `,
        deviceIds,
        timestamps,
        locations,
        speeds,
      );

      // 2. Mark specific offsets as completed for the partition
      payload.resolveOffset(
        payload.batch.messages[payload.batch.messages.length - 1].offset,
      );

      // 3. Heartbeat prevents consumer group rebalancing during heavy inserts
      await payload.heartbeat();

      // 4. Safely stage offset commits asynchronously
      await payload.commitOffsetsIfNecessary();
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Batch insert failed for partition ${payload.batch.partition}: ${error.message}`,
        );
      } else {
        this.logger.error(
          `Batch insert failed for partition ${payload.batch.partition}: ${String(error)}`,
        );
      }
      // Throwing allows Kafkajs to enact specific retry protocols and backoff strategies.
      throw error;
    }
  }
}
