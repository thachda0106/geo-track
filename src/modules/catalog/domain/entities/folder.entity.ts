import { v4 as uuid } from 'uuid';

export interface FolderProps {
  id?: string;
  name: string;
  parentId: string | null;
  ownerId: string;
  description?: string | null;
  path?: string;
  level?: number;
  sortOrder?: number;
  version?: number;
  featureCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Folder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly ownerId: string;
  readonly description: string | null;
  readonly path: string;
  readonly level: number;
  readonly sortOrder: number;
  readonly version: number;
  readonly featureCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: FolderProps) {
    this.id = props.id ?? uuid();
    this.name = props.name;
    this.parentId = props.parentId ?? null;
    this.ownerId = props.ownerId;
    this.description = props.description ?? null;
    this.path = props.path ?? `root/${this.id}`;
    this.level = props.level ?? 0;
    this.sortOrder = props.sortOrder ?? 0;
    this.version = props.version ?? 1;
    this.featureCount = props.featureCount ?? 0;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
  }

  static createRoot(props: {
    name: string;
    ownerId: string;
    description?: string;
    sortOrder?: number;
  }): Folder {
    const id = uuid();
    return new Folder({
      id,
      name: props.name,
      parentId: null,
      ownerId: props.ownerId,
      description: props.description,
      path: `root/${id}`,
      level: 0,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  static createChild(props: {
    name: string;
    parentId: string;
    parentPath: string;
    parentLevel: number;
    ownerId: string;
    description?: string;
    sortOrder?: number;
  }): Folder {
    const id = uuid();
    return new Folder({
      id,
      name: props.name,
      parentId: props.parentId,
      ownerId: props.ownerId,
      description: props.description,
      path: `${props.parentPath}/${id}`,
      level: props.parentLevel + 1,
      sortOrder: props.sortOrder ?? 0,
    });
  }

  withName(name: string): Folder {
    return new Folder({ ...this.toProps(), name });
  }

  withParent(
    parentId: string | null,
    parentPath: string | null,
    parentLevel: number,
  ): Folder {
    const newPath =
      parentId && parentPath ? `${parentPath}/${this.id}` : `root/${this.id}`;
    return new Folder({
      ...this.toProps(),
      parentId,
      path: newPath,
      level: parentId ? parentLevel + 1 : 0,
    });
  }

  withIncrementedVersion(): Folder {
    return new Folder({ ...this.toProps(), version: this.version + 1 });
  }

  withFeatureCount(count: number): Folder {
    return new Folder({ ...this.toProps(), featureCount: count });
  }

  private toProps(): FolderProps {
    return {
      id: this.id,
      name: this.name,
      parentId: this.parentId,
      ownerId: this.ownerId,
      description: this.description,
      path: this.path,
      level: this.level,
      sortOrder: this.sortOrder,
      version: this.version,
      featureCount: this.featureCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
