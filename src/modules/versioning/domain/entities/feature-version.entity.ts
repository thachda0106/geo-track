export interface SnapshotProps {
  geometry: any; // GeoJSON
  properties: any; // JSONB
  name: string;
}

export interface FeatureVersionProps {
  id: string;
  featureId: string;
  versionNumber: number;
  changeType: string;
  authorId: string;
  message: string | null;
  snapshot: SnapshotProps;
  diff: any;
  vertexCount: number;
  areaSqm: number;
  lengthM: number;
  createdAt: Date;
}

export class FeatureVersion {
  private constructor(private readonly props: FeatureVersionProps) {}

  get id(): string {
    return this.props.id;
  }
  get featureId(): string {
    return this.props.featureId;
  }
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get changeType(): string {
    return this.props.changeType;
  }
  get authorId(): string {
    return this.props.authorId;
  }
  get message(): string | null {
    return this.props.message;
  }
  get snapshot(): SnapshotProps {
    return this.props.snapshot;
  }

  get diff(): any {
    return this.props.diff;
  }
  get vertexCount(): number {
    return this.props.vertexCount;
  }
  get areaSqm(): number {
    return this.props.areaSqm;
  }
  get lengthM(): number {
    return this.props.lengthM;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  static reconstruct(props: FeatureVersionProps): FeatureVersion {
    return new FeatureVersion(props);
  }
}
