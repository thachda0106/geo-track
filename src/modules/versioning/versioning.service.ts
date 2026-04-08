import { Injectable } from '@nestjs/common';
import { PrismaService, NotFoundError } from '@app/core';

// ─── DTOs ─────────────────────────────────────────────────────

export interface VersionListQuery {
  cursor?: string;
  limit?: number;
  from?: string; // ISO 8601
  to?: string;   // ISO 8601
}

export interface RevertDto {
  toVersion: number;
  message?: string;
}

// ─── Service ──────────────────────────────────────────────────

@Injectable()
export class VersioningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all versions for a feature (timeline).
   */
  async listVersions(featureId: string, query: VersionListQuery) {
    const limit = Math.min(query.limit || 50, 200);
    const conditions: string[] = ['v.feature_id = $1::uuid'];
    const params: unknown[] = [featureId];
    let paramIndex = 2;

    if (query.from) {
      conditions.push(`v.created_at >= $${paramIndex}::timestamptz`);
      params.push(query.from);
      paramIndex++;
    }

    if (query.to) {
      conditions.push(`v.created_at <= $${paramIndex}::timestamptz`);
      params.push(query.to);
      paramIndex++;
    }

    const versions = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
        v.id, v.version_number, v.change_type,
        v.author_id, v.message,
        v.vertex_count, v.area_sqm, v.length_m,
        v.created_at,
        u.display_name as author_name
      FROM versioning.versions v
      LEFT JOIN identity.users u ON u.id = v.author_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.version_number DESC
      LIMIT $${paramIndex}`,
      ...params,
      limit,
    );

    return {
      featureId,
      data: versions.map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        changeType: v.change_type,
        author: { id: v.author_id, displayName: v.author_name },
        message: v.message,
        vertexCount: v.vertex_count,
        areaSqm: v.area_sqm,
        lengthM: v.length_m,
        createdAt: v.created_at,
      })),
      pagination: { hasMore: versions.length === limit, limit },
    };
  }

  /**
   * Get a specific version with full snapshot.
   */
  async getVersion(featureId: string, versionNumber: number) {
    const [version] = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
        v.id, v.feature_id, v.version_number, v.change_type,
        ST_AsGeoJSON(v.snapshot_geometry)::json as snapshot_geometry,
        v.snapshot_properties, v.snapshot_name,
        v.diff, v.author_id, v.message,
        v.vertex_count, v.area_sqm, v.length_m,
        v.created_at,
        u.display_name as author_name
      FROM versioning.versions v
      LEFT JOIN identity.users u ON u.id = v.author_id
      WHERE v.feature_id = $1::uuid AND v.version_number = $2`,
      featureId,
      versionNumber,
    );

    if (!version) {
      throw new NotFoundError('Version', `${featureId}@v${versionNumber}`);
    }

    return {
      id: version.id,
      featureId: version.feature_id,
      versionNumber: version.version_number,
      changeType: version.change_type,
      snapshot: {
        geometry: version.snapshot_geometry,
        properties: version.snapshot_properties,
        name: version.snapshot_name,
      },
      diff: version.diff,
      author: { id: version.author_id, displayName: version.author_name },
      message: version.message,
      vertexCount: version.vertex_count,
      areaSqm: version.area_sqm,
      lengthM: version.length_m,
      createdAt: version.created_at,
    };
  }

  /**
   * Compare two versions and return diff.
   */
  async diffVersions(featureId: string, fromVersion: number, toVersion: number) {
    const [from, to] = await Promise.all([
      this.getVersion(featureId, fromVersion),
      this.getVersion(featureId, toVersion),
    ]);

    return {
      featureId,
      fromVersion,
      toVersion,
      diff: to.diff, // pre-computed diff stored in the version
      fromSnapshot: from.snapshot,
      toSnapshot: to.snapshot,
    };
  }

  /**
   * Get timeline entries optimized for time slider UI.
   */
  async getTimeline(
    featureId: string,
    from: string,
    to: string,
    granularity: 'version' | 'hour' | 'day' = 'version',
  ) {
    const entries = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
        v.version_number,
        v.change_type,
        ST_AsGeoJSON(v.snapshot_geometry)::json as geometry,
        v.author_id,
        v.created_at as timestamp
      FROM versioning.versions v
      WHERE v.feature_id = $1::uuid
        AND v.created_at BETWEEN $2::timestamptz AND $3::timestamptz
      ORDER BY v.version_number ASC`,
      featureId,
      from,
      to,
    );

    return {
      featureId,
      timeRange: { from, to },
      entries: entries.map((e) => ({
        timestamp: e.timestamp,
        versionNumber: e.version_number,
        geometry: e.geometry,
        changeType: e.change_type,
        authorId: e.author_id,
      })),
    };
  }

  /**
   * Revert a feature to a previous version.
   * Creates a new version with snapshot from the target version.
   */
  async revertToVersion(featureId: string, dto: RevertDto, userId: string) {
    const targetVersion = await this.getVersion(featureId, dto.toVersion);

    // Get current feature version number
    const [current] = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT current_version FROM geometry.features
      WHERE id = $1::uuid AND is_deleted = FALSE`,
      featureId,
    );

    if (!current) throw new NotFoundError('Feature', featureId);

    const newVersionNumber = current.current_version + 1;

    await this.prisma.$transaction(async (tx) => {
      // 1. Update feature geometry to target version's snapshot
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
        dto.toVersion,
        targetVersion.snapshot.name,
        JSON.stringify(targetVersion.snapshot.properties),
        newVersionNumber,
        userId,
      );

      // 2. Create revert version record
      await tx.$queryRawUnsafe(
        `INSERT INTO versioning.versions
          (id, feature_id, version_number, change_type,
           snapshot_geometry, snapshot_properties, snapshot_name,
           author_id, message)
        SELECT
          gen_random_uuid(), $1::uuid, $2, 'reverted',
          snapshot_geometry, snapshot_properties, snapshot_name,
          $3::uuid, $4
        FROM versioning.versions
        WHERE feature_id = $1::uuid AND version_number = $5`,
        featureId,
        newVersionNumber,
        userId,
        dto.message || `Reverted to version ${dto.toVersion}`,
        dto.toVersion,
      );
    });

    return {
      featureId,
      newVersion: newVersionNumber,
      revertedFromVersion: dto.toVersion,
      snapshot: targetVersion.snapshot,
    };
  }
}
