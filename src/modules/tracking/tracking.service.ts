import { Injectable } from '@nestjs/common';
import { PrismaService, NotFoundError, DuplicateError, BusinessRuleError } from '@app/core';
import { v4 as uuidv4 } from 'uuid';

// ─── DTOs ─────────────────────────────────────────────────────

export interface CreateSessionDto {
  deviceId: string;
  config?: {
    minIntervalMs?: number;
    maxSpeedKmh?: number;
    accuracyThresholdM?: number;
    trackingMode?: 'continuous' | 'on_move';
  };
}

export interface IngestLocationDto {
  sessionId: string;
  points: Array<{
    lat: number;
    lng: number;
    altitude?: number;
    speed?: number;
    bearing?: number;
    accuracy?: number;
    timestamp: string;
  }>;
}

export interface LocationQuery {
  from?: string;
  to?: string;
  resolution?: 'raw' | '5min' | '1hr';
  cursor?: string;
  limit?: number;
}

// ─── Service ──────────────────────────────────────────────────

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new tracking session for a device.
   */
  async createSession(dto: CreateSessionDto, userId: string) {
    // Check for existing active session on this device
    const existing = await this.prisma.trackingSession.findFirst({
      where: { deviceId: dto.deviceId, status: 'active' },
    });

    if (existing) {
      throw new DuplicateError('TrackingSession', 'deviceId', dto.deviceId);
    }

    const apiKey = uuidv4(); // Simple API key for device auth

    const session = await this.prisma.trackingSession.create({
      data: {
        deviceId: dto.deviceId,
        ownerId: userId,
        status: 'active',
        minIntervalMs: dto.config?.minIntervalMs ?? 1000,
        maxSpeedKmh: dto.config?.maxSpeedKmh ?? 200,
        accuracyThresholdM: dto.config?.accuracyThresholdM ?? 50,
        trackingMode: dto.config?.trackingMode ?? 'continuous',
      },
    });

    return {
      id: session.id,
      deviceId: session.deviceId,
      status: session.status,
      config: {
        minIntervalMs: session.minIntervalMs,
        maxSpeedKmh: session.maxSpeedKmh,
        accuracyThresholdM: session.accuracyThresholdM,
        trackingMode: session.trackingMode,
      },
      apiKey, // Device uses this for ingestion
      startedAt: session.startedAt,
    };
  }

  /**
   * List tracking sessions.
   */
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
        lastLocation: s.lastLat && s.lastLng
          ? { lat: s.lastLat, lng: s.lastLng, timestamp: s.lastLocationAt }
          : null,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      })),
    };
  }

  /**
   * Get a single tracking session.
   */
  async getSession(sessionId: string) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundError('TrackingSession', sessionId);

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
      lastLocation: session.lastLat && session.lastLng
        ? { lat: session.lastLat, lng: session.lastLng, timestamp: session.lastLocationAt }
        : null,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    };
  }

  /**
   * End a tracking session.
   */
  async endSession(sessionId: string) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundError('TrackingSession', sessionId);
    if (session.status === 'ended') {
      throw new BusinessRuleError('Session is already ended');
    }

    const updated = await this.prisma.trackingSession.update({
      where: { id: sessionId },
      data: { status: 'ended', endedAt: new Date() },
    });

    return {
      id: updated.id,
      status: updated.status,
      endedAt: updated.endedAt,
      totalPoints: Number(updated.totalPoints),
      totalDistanceM: updated.totalDistanceM,
    };
  }

  /**
   * Ingest location points (for MVP — direct DB insert, not Kafka).
   * In production, this is replaced by the Tracking Ingestion service → Kafka pipeline.
   */
  async ingestLocations(dto: IngestLocationDto) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) throw new NotFoundError('TrackingSession', dto.sessionId);
    if (session.status !== 'active') {
      throw new BusinessRuleError('Session is not active');
    }

    // Batch insert via raw SQL for TimescaleDB hypertable
    const values = dto.points
      .map(
        (p) =>
          `('${p.timestamp}'::timestamptz, '${dto.sessionId}'::uuid, '${session.deviceId}'::uuid, ${p.lat}, ${p.lng}, ${p.altitude ?? 'NULL'}, ${p.speed ?? 'NULL'}, ${p.bearing ?? 'NULL'}, ${p.accuracy ?? 'NULL'})`,
      )
      .join(',\n');

    await this.prisma.$queryRawUnsafe(`
      INSERT INTO tracking.location_points
        (time, session_id, device_id, lat, lng, altitude, speed, bearing, accuracy)
      VALUES ${values}
    `);

    // Update session stats
    const lastPoint = dto.points[dto.points.length - 1];
    await this.prisma.trackingSession.update({
      where: { id: dto.sessionId },
      data: {
        totalPoints: { increment: dto.points.length },
        lastLocationAt: new Date(lastPoint.timestamp),
        lastLat: lastPoint.lat,
        lastLng: lastPoint.lng,
      },
    });

    return { accepted: dto.points.length, queued: true };
  }

  /**
   * Get location history for a session.
   */
  async getLocations(sessionId: string, query: LocationQuery) {
    const limit = Math.min(query.limit || 1000, 5000);
    const table = this.getLocationTable(query.resolution);

    const conditions: string[] = [`session_id = '${sessionId}'::uuid`];

    if (query.from) conditions.push(`time >= '${query.from}'::timestamptz`);
    if (query.to) conditions.push(`time <= '${query.to}'::timestamptz`);

    let selectFields: string;
    if (query.resolution === 'raw' || !query.resolution) {
      selectFields = 'time as timestamp, lat, lng, altitude, speed, bearing, accuracy';
    } else {
      selectFields = 'bucket as timestamp, avg_lat as lat, avg_lng as lng, avg_speed as speed, point_count';
    }

    const locations = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT ${selectFields}
      FROM ${table}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${query.resolution === 'raw' || !query.resolution ? 'time' : 'bucket'} ASC
      LIMIT ${limit}`,
    );

    return {
      sessionId,
      timeRange: { from: query.from, to: query.to },
      resolution: query.resolution || 'raw',
      data: locations,
      pagination: { hasMore: locations.length === limit, limit },
    };
  }

  /**
   * Get tracking trail as GeoJSON LineString.
   */
  async getTrail(sessionId: string, from?: string, to?: string) {
    const conditions: string[] = [
      `session_id = '${sessionId}'::uuid`,
      `is_filtered = FALSE`,
    ];

    if (from) conditions.push(`time >= '${from}'::timestamptz`);
    if (to) conditions.push(`time <= '${to}'::timestamptz`);

    const [result] = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
        ST_AsGeoJSON(ST_MakeLine(geom ORDER BY time))::json as geometry,
        COUNT(*) as point_count,
        ST_Length(ST_MakeLine(geom ORDER BY time)::geography) as distance_m,
        MIN(time) as start_time,
        MAX(time) as end_time,
        AVG(speed) as avg_speed
      FROM tracking.location_points
      WHERE ${conditions.join(' AND ')}`,
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
        avgSpeedMs: result.avg_speed ? Math.round(result.avg_speed * 100) / 100 : null,
      },
    };
  }

  private getLocationTable(resolution?: string): string {
    switch (resolution) {
      case '5min': return 'tracking.location_5min';
      case '1hr': return 'tracking.location_1hr';
      default: return 'tracking.location_points';
    }
  }
}
