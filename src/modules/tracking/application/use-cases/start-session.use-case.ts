import { Injectable, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateSessionDto } from '../dtos/tracking.dto';
import {
  ITrackingSessionRepository,
  TRACKING_SESSION_REPOSITORY,
} from '../../domain/repositories/tracking-session.repository';
import { TrackingSession } from '../../domain/entities/tracking-session.entity';
import { DuplicateError } from '@app/core';

@Injectable()
export class StartSessionUseCase {
  constructor(
    @Inject(TRACKING_SESSION_REPOSITORY)
    private readonly sessionRepository: ITrackingSessionRepository,
  ) {}

  async execute(dto: CreateSessionDto, userId: string) {
    // 1. Check for existing active session on this device
    const existing = await this.sessionRepository.findActiveByDevice(
      dto.deviceId,
    );
    if (existing) {
      throw new DuplicateError('TrackingSession', 'deviceId', dto.deviceId);
    }

    const sessionId = uuidv4();
    const apiKey = uuidv4(); // Simple API key for device auth

    // 2. Create rich domain entity
    const session = TrackingSession.create(
      sessionId,
      dto.deviceId,
      userId,
      dto.config,
    );

    // 3. Persist entity
    await this.sessionRepository.save(session);

    // Return application DTO
    return {
      id: session.id,
      deviceId: session.deviceId,
      status: session.status,
      config: {
        minIntervalMs: session.config.minIntervalMs,
        maxSpeedKmh: session.config.maxSpeedKmh,
        accuracyThresholdM: session.config.accuracyThresholdM,
        trackingMode: session.config.trackingMode,
      },
      apiKey, // Device uses this for ingestion
      startedAt: session.startedAt,
    };
  }
}
