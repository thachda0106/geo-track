import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import { TrackingSession } from '../../domain/entities/tracking-session.entity';
import { ITrackingSessionRepository } from '../../domain/repositories/tracking-session.repository';

@Injectable()
export class PrismaTrackingSessionRepository implements ITrackingSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TrackingSession | null> {
    const data = await this.prisma.trackingSession.findUnique({
      where: { id },
    });
    if (!data) return null;
    return this.mapToDomain(data);
  }

  async findActiveByDevice(deviceId: string): Promise<TrackingSession | null> {
    const data = await this.prisma.trackingSession.findFirst({
      where: { deviceId, status: 'active' },
    });
    if (!data) return null;
    return this.mapToDomain(data);
  }

  async save(session: TrackingSession): Promise<void> {
    const config = session.config;

    // Upsert or Update depending on existence
    await this.prisma.trackingSession.upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        deviceId: session.deviceId,
        ownerId: session.ownerId,
        status: session.status,
        minIntervalMs: config.minIntervalMs,
        maxSpeedKmh: config.maxSpeedKmh,
        accuracyThresholdM: config.accuracyThresholdM,
        trackingMode: config.trackingMode,
        totalPoints: session.totalPoints,
        totalDistanceM: session.totalDistanceM,
        lastLat: session.lastLat || null,
        lastLng: session.lastLng || null,
        lastLocationAt: session.lastLocationAt || null,
        startedAt: session.startedAt,
        endedAt: session.endedAt || null,
      },
      update: {
        status: session.status,
        minIntervalMs: config.minIntervalMs,
        maxSpeedKmh: config.maxSpeedKmh,
        accuracyThresholdM: config.accuracyThresholdM,
        trackingMode: config.trackingMode,
        totalPoints: session.totalPoints,
        totalDistanceM: session.totalDistanceM,
        lastLat: session.lastLat || null,
        lastLng: session.lastLng || null,
        lastLocationAt: session.lastLocationAt || null,
        endedAt: session.endedAt || null,
      },
    });
  }

  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

  private mapToDomain(data: any): TrackingSession {
    return TrackingSession.reconstruct({
      id: data.id,
      deviceId: data.deviceId,
      ownerId: data.ownerId,
      status: data.status as 'active' | 'ended',
      config: {
        minIntervalMs: data.minIntervalMs,
        maxSpeedKmh: data.maxSpeedKmh,
        accuracyThresholdM: data.accuracyThresholdM,
        trackingMode: data.trackingMode as 'continuous' | 'on_move',
      } as any,
      totalPoints: Number(data.totalPoints || 0),
      totalDistanceM: data.totalDistanceM || 0,
      lastLat: data.lastLat,
      lastLng: data.lastLng,
      lastLocationAt: data.lastLocationAt,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
    });
  }
}
