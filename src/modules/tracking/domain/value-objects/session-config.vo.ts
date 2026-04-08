export interface SessionConfigProps {
  minIntervalMs: number;
  maxSpeedKmh: number;
  accuracyThresholdM: number;
  trackingMode: 'continuous' | 'on_move';
}

export class SessionConfig {
  constructor(private readonly props: SessionConfigProps) {
    this.validate(props);
  }

  get minIntervalMs(): number {
    return this.props.minIntervalMs;
  }
  get maxSpeedKmh(): number {
    return this.props.maxSpeedKmh;
  }
  get accuracyThresholdM(): number {
    return this.props.accuracyThresholdM;
  }
  get trackingMode(): string {
    return this.props.trackingMode;
  }

  private validate(props: SessionConfigProps): void {
    if (props.minIntervalMs < 0)
      throw new Error('minIntervalMs cannot be negative');
    if (props.maxSpeedKmh <= 0) throw new Error('maxSpeedKmh must be positive');
  }

  static create(props?: Partial<SessionConfigProps>): SessionConfig {
    return new SessionConfig({
      minIntervalMs: props?.minIntervalMs ?? 1000,
      maxSpeedKmh: props?.maxSpeedKmh ?? 200,
      accuracyThresholdM: props?.accuracyThresholdM ?? 50,
      trackingMode: props?.trackingMode ?? 'continuous',
    });
  }
}
