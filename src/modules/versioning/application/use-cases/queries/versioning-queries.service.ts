import { Injectable } from '@nestjs/common';
import { PrismaService, NotFoundError } from '@app/core';
import {
  VersionListQuery,
  VersionTimelineRow,
  VersionSnapshotRow,
  TimelineEntryRow,
} from '../../dtos/versioning.dto';

@Injectable()
export class VersioningQueriesService {
  constructor(private readonly prisma: PrismaService) {}

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

    const versions = await this.prisma.$queryRawUnsafe<VersionTimelineRow[]>(
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
      data: versions.map((v) => {
        return {
          id: v.id,
          versionNumber: v.version_number,
          changeType: v.change_type,
          author: { id: v.author_id, displayName: v.author_name },
          message: v.message,
          vertexCount: v.vertex_count,
          areaSqm: v.area_sqm,
          lengthM: v.length_m,
          createdAt: v.created_at,
        };
      }),
      pagination: { hasMore: versions.length === limit, limit },
    };
  }

  async getVersion(featureId: string, versionNumber: number) {
    const [version] = await this.prisma.$queryRawUnsafe<VersionSnapshotRow[]>(
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

  async diffVersions(
    featureId: string,
    fromVersion: number,
    toVersion: number,
  ) {
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

  async getTimeline(
    featureId: string,
    from: string,
    to: string,
    granularity: 'version' | 'hour' | 'day' = 'version',
  ) {
    const entries = await this.prisma.$queryRawUnsafe<TimelineEntryRow[]>(
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
      entries: entries.map((e) => {
        return {
          timestamp: e.timestamp,
          versionNumber: e.version_number,
          geometry: e.geometry,
          changeType: e.change_type,
          authorId: e.author_id,
        };
      }),
    };
  }
}
