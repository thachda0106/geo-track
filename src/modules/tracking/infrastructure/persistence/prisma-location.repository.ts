import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import {
  ILocationRepository,
  LocationPointPayload,
} from '../../domain/repositories/location.repository';

@Injectable()
export class PrismaLocationRepository implements ILocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveBatch(points: LocationPointPayload[]): Promise<void> {
    if (!points.length) return;

    // Batch insert via raw SQL for TimescaleDB hypertable (parameterized)
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;

    for (const p of points) {
      placeholders.push(
        `($${paramIdx}::timestamptz, $${paramIdx + 1}::uuid, $${paramIdx + 2}::uuid, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8})`,
      );
      values.push(
        p.timestamp,
        p.sessionId,
        p.deviceId,
        p.lat,
        p.lng,
        p.altitude ?? null,
        p.speed ?? null,
        p.bearing ?? null,
        p.accuracy ?? null,
      );
      paramIdx += 9;
    }

    await this.prisma.$queryRawUnsafe(
      `INSERT INTO tracking.location_points
        (time, session_id, device_id, lat, lng, altitude, speed, bearing, accuracy)
      VALUES ${placeholders.join(', ')}`,
      ...values,
    );
  }
}
