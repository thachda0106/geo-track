import { BusinessRuleError } from '@app/core';
import { SessionConfig } from '../value-objects/session-config.vo';

export interface TrackingSessionProps {
  id: string;
  deviceId: string;
  ownerId: string;
  status: 'active' | 'ended';
  config: SessionConfig;
  totalPoints: number;
  totalDistanceM: number;
  lastLat?: number | null;
  lastLng?: number | null;
  lastLocationAt?: Date | null;
  startedAt: Date;
  endedAt?: Date | null;
}

export class TrackingSession {
  private constructor(private readonly props: TrackingSessionProps) {}

  get id(): string {
    return this.props.id;
  }
  get deviceId(): string {
    return this.props.deviceId;
  }
  get ownerId(): string {
    return this.props.ownerId;
  }
  get status(): 'active' | 'ended' {
    return this.props.status;
  }
  get config(): SessionConfig {
    return this.props.config;
  }
  get startedAt(): Date {
    return this.props.startedAt;
  }
  get endedAt(): Date | undefined | null {
    return this.props.endedAt;
  }

  get totalPoints(): number {
    return this.props.totalPoints;
  }
  get totalDistanceM(): number {
    return this.props.totalDistanceM;
  }
  get lastLat(): number | undefined | null {
    return this.props.lastLat;
  }
  get lastLng(): number | undefined | null {
    return this.props.lastLng;
  }
  get lastLocationAt(): Date | undefined | null {
    return this.props.lastLocationAt;
  }

  isActive(): boolean {
    return this.status === 'active';
  }

  endSession(): void {
    if (!this.isActive()) {
      throw new BusinessRuleError('Session is already ended');
    }
    this.props.status = 'ended';
    this.props.endedAt = new Date();
  }

  updateLatestLocation(
    pointCount: number,
    distanceM: number,
    lat: number,
    lng: number,
    timestamp: Date,
  ): void {
    if (!this.isActive()) {
      throw new BusinessRuleError('Cannot update location of an ended session');
    }
    this.props.totalPoints += pointCount;
    this.props.totalDistanceM += distanceM;
    this.props.lastLat = lat;
    this.props.lastLng = lng;

    // Only update timestamp if it's newer
    if (!this.props.lastLocationAt || timestamp > this.props.lastLocationAt) {
      this.props.lastLocationAt = timestamp;
    }
  }

  /**
   * Factory method for creating a brand new session.
   */
  static create(
    id: string,
    deviceId: string,
    ownerId: string,
    configProps?: any,
  ): TrackingSession {
    const config = SessionConfig.create(configProps);

    return new TrackingSession({
      id,
      deviceId,
      ownerId,
      status: 'active',
      config,
      totalPoints: 0,
      totalDistanceM: 0,
      startedAt: new Date(),
    });
  }

  /**
   * Reconstitute an existing session from infrastructure without triggering domain rules.
   */
  static reconstruct(props: TrackingSessionProps): TrackingSession {
    return new TrackingSession(props);
  }
}
