import { InvalidGeometryError } from '@app/core';

export class Feature {
  constructor(
    private id: string,
    private name: string,
    private description: string | null,
    private geometryType: 'Point' | 'LineString' | 'Polygon',
    private geometry: { type: string; coordinates: unknown }, // GeoJSON structure
    private properties: Record<string, unknown>,
    private tags: string[],
    private currentVersion: number,
    private createdBy: string,
    private updatedBy: string,
    private createdAt: Date,
    private updatedAt: Date,
    private isDeleted: boolean = false,
  ) {
    this.validateGeometry();
  }

  // Domain Validation Logic
  private validateGeometry(): void {
    if (this.geometry.type !== this.geometryType) {
      throw new InvalidGeometryError(
        `Declared type '${this.geometryType}' does not match geometry type '${this.geometry.type}'`,
      );
    }
  }

  // Factory for mapping from raw database rows
  static restore(data: {
    id: string;
    name: string;
    description: string | null;
    geometryType: 'Point' | 'LineString' | 'Polygon';
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
    tags: string[];
    currentVersion: number;
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
    isDeleted?: boolean;
  }): Feature {
    return new Feature(
      data.id,
      data.name,
      data.description,
      data.geometryType,
      data.geometry,
      data.properties,
      data.tags,
      data.currentVersion,
      data.createdBy,
      data.updatedBy,
      data.createdAt,
      data.updatedAt,
      data.isDeleted ?? false,
    );
  }

  // Factory for creating a brand new feature
  static create(
    data: {
      name: string;
      description?: string;
      geometryType: 'Point' | 'LineString' | 'Polygon';
      geometry: { type: string; coordinates: unknown };
      properties?: Record<string, unknown>;
      tags?: string[];
    },
    createdBy: string,
  ): Feature {
    return new Feature(
      '00000000-0000-0000-0000-000000000000', // Temporary ID, assigned by DB
      data.name,
      data.description || null,
      data.geometryType,
      data.geometry,
      data.properties || {},
      data.tags || [],
      1,
      createdBy,
      createdBy,
      new Date(),
      new Date(),
      false,
    );
  }

  // Domain Behaviors
  updateInfo(
    params: {
      name?: string;
      description?: string;
      tags?: string[];
      properties?: Record<string, unknown>;
    },
    updatedBy: string,
  ): void {
    if (params.name !== undefined) this.name = params.name;
    if (params.description !== undefined) this.description = params.description;
    if (params.tags !== undefined) this.tags = params.tags;
    if (params.properties !== undefined) this.properties = params.properties;

    this.updatedBy = updatedBy;
    this.updatedAt = new Date();
  }

  updateGeometry(
    geometry: { type: string; coordinates: unknown },
    updatedBy: string,
  ): void {
    this.geometry = geometry;
    this.validateGeometry(); // Ensure it still matches the declared entity type

    this.updatedBy = updatedBy;
    this.updatedAt = new Date();
  }

  incrementVersion(): void {
    this.currentVersion++;
  }

  markDeleted(userId: string): void {
    this.isDeleted = true;
    this.updatedBy = userId;
    this.updatedAt = new Date();
  }

  // Getters
  getId(): string {
    return this.id;
  }
  getName(): string {
    return this.name;
  }
  getDescription(): string | null {
    return this.description;
  }
  getGeometryType(): string {
    return this.geometryType;
  }
  getGeometry(): { type: string; coordinates: unknown } {
    return this.geometry;
  }
  getProperties(): Record<string, unknown> {
    return this.properties;
  }
  getTags(): string[] {
    return this.tags;
  }
  getCurrentVersion(): number {
    return this.currentVersion;
  }
  getCreatedBy(): string {
    return this.createdBy;
  }
  getUpdatedBy(): string {
    return this.updatedBy;
  }
}
