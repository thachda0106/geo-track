import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import {
  LocationQuery,
  LocationRow,
  TrailResultRow,
} from '../../dtos/tracking.dto';

@Injectable()
export class TrackingQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CQRS: Bypass the domain model entirely for complex bulk reads
   */
  async getLocations(sessionId: string, query: LocationQuery) {
    const limit = Math.min(query.limit || 1000, 5000);
    const table = this.getLocationTable(query.resolution);

    const params: unknown[] = [];
    const conditions: string[] = [];
    let paramIdx = 1;

    conditions.push(`session_id = $${paramIdx}::uuid`);
    params.push(sessionId);
    paramIdx++;

    if (query.from) {
      conditions.push(`time >= $${paramIdx}::timestamptz`);
      params.push(query.from);
      paramIdx++;
    }
    if (query.to) {
      conditions.push(`time <= $${paramIdx}::timestamptz`);
      params.push(query.to);
      paramIdx++;
    }

    let selectFields: string;
    const isRaw = query.resolution === 'raw' || !query.resolution;
    if (isRaw) {
      selectFields =
        'time as timestamp, lat, lng, altitude, speed, bearing, accuracy';
    } else {
      selectFields =
        'bucket as timestamp, avg_lat as lat, avg_lng as lng, avg_speed as speed, point_count';
    }

    params.push(limit);

    const locations = await this.prisma.$queryRawUnsafe<LocationRow[]>(
      `SELECT ${selectFields}
      FROM ${table}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${isRaw ? 'time' : 'bucket'} ASC
      LIMIT $${paramIdx}`,
      ...params,
    );

    return {
      sessionId,
      timeRange: { from: query.from, to: query.to },
      resolution: query.resolution || 'raw',
      data: locations,
      pagination: { hasMore: locations.length === limit, limit },
    };
  }

  async getTrail(sessionId: string, from?: string, to?: string) {
    const params: unknown[] = [];
    const conditions: string[] = [];
    let paramIdx = 1;

    conditions.push(`session_id = $${paramIdx}::uuid`);
    params.push(sessionId);
    paramIdx++;

    conditions.push(`is_filtered = FALSE`);

    if (from) {
      conditions.push(`time >= $${paramIdx}::timestamptz`);
      params.push(from);
      paramIdx++;
    }
    if (to) {
      conditions.push(`time <= $${paramIdx}::timestamptz`);
      params.push(to);
      paramIdx++;
    }

    const [result] = await this.prisma.$queryRawUnsafe<TrailResultRow[]>(
      `SELECT
        ST_AsGeoJSON(ST_MakeLine(geom ORDER BY time))::json as geometry,
        COUNT(*) as point_count,
        ST_Length(ST_MakeLine(geom ORDER BY time)::geography) as distance_m,
        MIN(time) as start_time,
        MAX(time) as end_time,
        AVG(speed) as avg_speed
      FROM tracking.location_points
      WHERE ${conditions.join(' AND ')}`,
      ...params,
    );

    return {
      type: 'Feature' as const,
      geometry: result.geometry,
      properties: {
        sessionId,
        pointCount: Number(result.point_count),
        distanceM: Math.round(result.distance_m * 100) / 100,
        startTime: result.start_time,
        endTime: result.end_time,
        avgSpeedMs: result.avg_speed
          ? Math.round(result.avg_speed * 100) / 100
          : null,
      },
    };
  }

  async listSessions(userId: string, status?: string) {
    const sessions = await this.prisma.trackingSession.findMany({
      where: {
        ownerId: userId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      data: sessions.map((s) => ({
        id: s.id,
        deviceId: s.deviceId,
        status: s.status,
        totalPoints: Number(s.totalPoints),
        totalDistanceM: s.totalDistanceM,
        lastLocation:
          s.lastLat && s.lastLng
            ? { lat: s.lastLat, lng: s.lastLng, timestamp: s.lastLocationAt }
            : null,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      })),
    };
  }

  async getSessionOverview(sessionId: string) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    return {
      id: session.id,
      deviceId: session.deviceId,
      ownerId: session.ownerId,
      status: session.status,
      config: {
        minIntervalMs: session.minIntervalMs,
        maxSpeedKmh: session.maxSpeedKmh,
        accuracyThresholdM: session.accuracyThresholdM,
        trackingMode: session.trackingMode,
      },
      totalPoints: Number(session.totalPoints),
      totalDistanceM: session.totalDistanceM,
      lastLocation:
        session.lastLat && session.lastLng
          ? {
              lat: session.lastLat,
              lng: session.lastLng,
              timestamp: session.lastLocationAt,
            }
          : null,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  private getLocationTable(resolution?: string): string {
    switch (resolution) {
      case '5min':
        return 'tracking.location_5min';
      case '1hr':
        return 'tracking.location_1hr';
      default:
        return 'tracking.location_points';
    }
  }
}
