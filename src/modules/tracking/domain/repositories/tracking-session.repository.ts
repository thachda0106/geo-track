import { TrackingSession } from '../entities/tracking-session.entity';

export interface ITrackingSessionRepository {
  findById(id: string): Promise<TrackingSession | null>;
  findActiveByDevice(deviceId: string): Promise<TrackingSession | null>;
  save(session: TrackingSession): Promise<void>;
}

export const TRACKING_SESSION_REPOSITORY = Symbol(
  'TRACKING_SESSION_REPOSITORY',
);
