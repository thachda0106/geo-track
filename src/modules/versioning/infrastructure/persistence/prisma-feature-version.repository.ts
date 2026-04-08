/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import { v4 as uuidv4 } from 'uuid';
import { FeatureVersion } from '../../domain/entities/feature-version.entity';
import {
  IFeatureVersionRepository,
  RevertOperationPayload,
} from '../../domain/repositories/feature-version.repository';

@Injectable()
export class PrismaFeatureVersionRepository implements IFeatureVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getVersion(
    featureId: string,
    versionNumber: number,
  ): Promise<FeatureVersion | null> {
    const [version] = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
        v.id, v.feature_id, v.version_number, v.change_type,
        ST_AsGeoJSON(v.snapshot_geometry)::json as snapshot_geometry,
        v.snapshot_properties, v.snapshot_name,
        v.diff, v.author_id, v.message,
        v.vertex_count, v.area_sqm, v.length_m,
        v.created_at
      FROM versioning.versions v
      WHERE v.feature_id = $1::uuid AND v.version_number = $2`,
      featureId,
      versionNumber,
    );

    if (!version) return null;

    return FeatureVersion.reconstruct({
      id: version.id,
      featureId: version.feature_id,
      versionNumber: version.version_number,
      changeType: version.change_type,
      authorId: version.author_id,
      message: version.message,
      snapshot: {
        geometry: version.snapshot_geometry,
        properties: version.snapshot_properties,
        name: version.snapshot_name,
      },
      diff: version.diff,
      vertexCount: version.vertex_count,
      areaSqm: version.area_sqm,
      lengthM: version.length_m,
      createdAt: version.created_at,
    });
  }

  async executeRevertTransaction(
    payload: RevertOperationPayload,
  ): Promise<FeatureVersion> {
    const { featureId, targetVersion, newVersionNumber, userId, message } =
      payload;
    const revertMessage =
      message || `Reverted to v${targetVersion.versionNumber}`;
    const newVersionId = uuidv4();

    await this.prisma.$transaction(async (tx) => {
      // 1. Update feature geometry to target version's snapshot (Crosses to Geometry domain)
      await tx.$queryRawUnsafe(
        `UPDATE geometry.features
        SET geometry = (
          SELECT snapshot_geometry FROM versioning.versions
          WHERE feature_id = $1::uuid AND version_number = $2
        ),
        name = $3,
        properties = $4::jsonb,
        current_version = $5,
        updated_by = $6::uuid,
        updated_at = NOW()
        WHERE id = $1::uuid`,
        featureId,
        targetVersion.versionNumber,
        targetVersion.snapshot.name,
        JSON.stringify(targetVersion.snapshot.properties),
        newVersionNumber,
        userId,
      );

      // 2. Create revert version record in versioning domain
      await tx.$queryRawUnsafe(
        `INSERT INTO versioning.versions
          (id, feature_id, version_number, change_type,
           snapshot_geometry, snapshot_properties, snapshot_name,
           author_id, message, vertex_count, area_sqm, length_m)
        SELECT 
          $3::uuid, feature_id, $4, 'revert',
          snapshot_geometry, snapshot_properties, snapshot_name,
          $5::uuid, $6, vertex_count, area_sqm, length_m
        FROM versioning.versions
        WHERE feature_id = $1::uuid AND version_number = $2`,
        featureId,
        targetVersion.versionNumber,
        newVersionId,
        newVersionNumber,
        userId,
        revertMessage,
      );
    });

    // Return the newly constructed revert node
    return FeatureVersion.reconstruct({
      id: newVersionId,
      featureId,
      versionNumber: newVersionNumber,
      changeType: 'revert',
      authorId: userId,
      message: revertMessage,
      snapshot: targetVersion.snapshot,
      diff: {}, // Computing diff on revert is skipped based on logic
      vertexCount: targetVersion.vertexCount,
      areaSqm: targetVersion.areaSqm,
      lengthM: targetVersion.lengthM,
      createdAt: new Date(),
    });
  }
}
