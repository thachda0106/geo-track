import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';

export interface CreateInitialVersionDto {
  featureId: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  name: string;
  authorId: string;
}

export interface CreateVersionSnapshotDto {
  featureId: string;
  versionNumber: number;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  name: string;
  authorId: string;
}

/**
 * Encapsulates the write side of the versioning boundaries exclusively invoked by internal domain events (Inbox)
 */
@Injectable()
export class CreateVersionUseCase {
  constructor(
    private readonly prisma: PrismaService, // Ideally mapped out to IFeatureVersionWriteRepository
  ) {}

  async createInitialVersion(data: CreateInitialVersionDto) {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO versioning.versions
        (id, feature_id, version_number, change_type,
         snapshot_geometry, snapshot_properties, snapshot_name,
         author_id, message)
      VALUES
        (gen_random_uuid(), $1::uuid, 1, 'created',
         ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
         $3::jsonb, $4, $5::uuid, 'Initial creation')`,
      data.featureId,
      JSON.stringify(data.geometry),
      JSON.stringify(data.properties || {}),
      data.name,
      data.authorId,
    );
  }

  async createVersionSnapshot(data: CreateVersionSnapshotDto) {
    await this.prisma.$queryRawUnsafe(
      `INSERT INTO versioning.versions
        (id, feature_id, version_number, change_type,
         snapshot_geometry, snapshot_properties, snapshot_name,
         author_id, message)
      VALUES
        (gen_random_uuid(), $1::uuid, $2, 'updated',
         ST_SetSRID(ST_GeomFromGeoJSON($3), 4326),
         $4::jsonb, $5, $6::uuid, 'Feature updated')`,
      data.featureId,
      data.versionNumber,
      JSON.stringify(data.geometry),
      JSON.stringify(data.properties || {}),
      data.name,
      data.authorId,
    );
  }
}
