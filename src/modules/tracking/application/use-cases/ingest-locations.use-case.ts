import { Injectable, Inject } from '@nestjs/common';
import { NotFoundError, BusinessRuleError } from '@app/core';
import {
  ITrackingSessionRepository,
  TRACKING_SESSION_REPOSITORY,
} from '../../domain/repositories/tracking-session.repository';
import {
  ILocationRepository,
  LOCATION_REPOSITORY,
} from '../../domain/repositories/location.repository';
import { IngestLocationDto } from '../dtos/tracking.dto';

@Injectable()
export class IngestLocationsUseCase {
  constructor(
    @Inject(TRACKING_SESSION_REPOSITORY)
    private readonly sessionRepository: ITrackingSessionRepository,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: ILocationRepository,
  ) {}

  async execute(dto: IngestLocationDto) {
    if (!dto.points || dto.points.length === 0) {
      return { accepted: 0, queued: false };
    }

    // 1. Fetch domain entity
    const session = await this.sessionRepository.findById(dto.sessionId);
    if (!session) throw new NotFoundError('TrackingSession', dto.sessionId);

    // 2. Validate Domain Rules explicitly inside entity
    if (!session.isActive()) {
      throw new BusinessRuleError('Session is not active');
    }

    // Prepare payloads and calculate batch stats
    const distanceM = 0; // In a real geo apps, you'd calculate haversine distance delta here or let DB handle it. We will leave roughly 0 for now as it matches original logic.
    const lastPoint = dto.points[dto.points.length - 1];

    const payloads = dto.points.map((p) => ({
      sessionId: dto.sessionId,
      deviceId: session.deviceId,
      lat: p.lat,
      lng: p.lng,
      altitude: p.altitude,
      speed: p.speed,
      bearing: p.bearing,
      accuracy: p.accuracy,
      timestamp: new Date(p.timestamp),
    }));

    // 3. Dispatch directly to batch data store
    await this.locationRepository.saveBatch(payloads);

    // 4. Update core Domain State
    session.updateLatestLocation(
      dto.points.length,
      distanceM,
      lastPoint.lat,
      lastPoint.lng,
      new Date(lastPoint.timestamp),
    );

    await this.sessionRepository.save(session);

    return { accepted: dto.points.length, queued: true };
  }
}
