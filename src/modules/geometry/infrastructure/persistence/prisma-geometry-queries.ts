import { Injectable } from '@nestjs/common';
import { PrismaService, InvalidGeometryError } from '@app/core';
import {
  IFeatureQueries,
  ISpatialQueries,
} from '../../application/use-cases/queries/geometry-queries.interface';
import {
  FeatureListQuery,
  FeatureDto,
} from '../../application/dtos/geometry.dto';
import { SpatialQueryDto } from '../../application/dtos/spatial-query.dto';

interface FeatureRow {
  id: string;
  name: string;
  description: string | null;
  geometry_type: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
  tags: string[];
  current_version: number;
  created_by: string;
  updated_by: string;
  created_at: Date;
  updated_at: Date;
}

interface SpatialQueryResultRow {
  id: string;
  name: string;
  geometry_type: string;
  geometry: Record<string, unknown>;
  distance_m: number | null;
}

interface BufferResultRow {
  id: string;
  result_geometry: Record<string, unknown>;
}

@Injectable()
export class PrismaGeometryQueries implements IFeatureQueries, ISpatialQueries {
  constructor(private readonly prisma: PrismaService) {}

  async listFeatures(query: FeatureListQuery): Promise<{
    data: FeatureDto[];
    pagination: { hasMore: boolean; limit: number; total: number };
  }> {
    const limit = Math.min(query.limit || 50, 200);
    const conditions: string[] = ['is_deleted = FALSE'];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Bounding box filter (spatial)
    if (query.bbox) {
      const [minLng, minLat, maxLng, maxLat] = query.bbox
        .split(',')
        .map(Number);
      conditions.push(
        `geometry && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`,
      );
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    if (query.geometryType) {
      conditions.push(`geometry_type = $${paramIndex}`);
      params.push(query.geometryType);
      paramIndex++;
    }

    if (query.createdBy) {
      conditions.push(`created_by = $${paramIndex}::uuid`);
      params.push(query.createdBy);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const ALLOWED_SORT_COLUMNS = ['updated_at', 'created_at', 'name'] as const;
    const sortColumn = (ALLOWED_SORT_COLUMNS as readonly string[]).includes(
      query.sort || '',
    )
      ? query.sort
      : 'updated_at';
    const orderDirection = query.order === 'asc' ? 'ASC' : 'DESC';
    const orderBy = `${sortColumn} ${orderDirection}`;

    const features = await this.prisma.$queryRawUnsafe<FeatureRow[]>(
      `SELECT id, name, description, geometry_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        properties, tags, current_version, created_by, updated_by,
        created_at, updated_at
      FROM geometry.features
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}`,
      ...params,
      limit + 1,
    );

    const hasMore = features.length > limit;
    const data = features.slice(0, limit).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      geometryType: row.geometry_type,
      geometry: row.geometry,
      properties: row.properties,
      tags: row.tags,
      currentVersion: row.current_version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      data,
      pagination: {
        hasMore,
        limit,
        total: data.length,
      },
    };
  }

  async getFeature(id: string): Promise<FeatureDto> {
    const [row] = await this.prisma.$queryRawUnsafe<FeatureRow[]>(
      `SELECT id, name, description, geometry_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        properties, tags, current_version, created_by, updated_by,
        created_at, updated_at
      FROM geometry.features
      WHERE id = $1::uuid AND is_deleted = FALSE`,
      id,
    );

    if (!row) {
      throw new InvalidGeometryError(`Feature not found: ${id}`);
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      geometryType: row.geometry_type,
      geometry: row.geometry,
      properties: row.properties,
      tags: row.tags,
      currentVersion: row.current_version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async executeSpatialQuery(dto: SpatialQueryDto) {
    const limit = Math.min(dto.limit || 50, 200);
    const geoJson = JSON.stringify(dto.queryGeometry);
    const startTime = Date.now();

    let spatialCondition: string;

    switch (dto.operation) {
      case 'intersects':
        spatialCondition = `ST_Intersects(geometry, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`;
        break;
      case 'contains':
        spatialCondition = `ST_Contains(geometry, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`;
        break;
      case 'within':
        spatialCondition = `ST_Within(geometry, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))`;
        break;
      case 'within_distance':
        if (!dto.params?.distanceMeters) {
          throw new InvalidGeometryError(
            'distanceMeters required for within_distance operation',
          );
        }
        spatialCondition = `ST_DWithin(
          geometry::geography,
          ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography,
          ${dto.params.distanceMeters}
        )`;
        break;
      default: {
        const _exhaustcheck: never = dto.operation;
        throw new InvalidGeometryError(
          `Unsupported operation: ${String(_exhaustcheck)}`,
        );
      }
    }

    let typeFilter = '';
    if (dto.params?.geometryType) {
      typeFilter = ` AND geometry_type = '${dto.params.geometryType}'`;
    }

    const results = await this.prisma.$queryRawUnsafe<SpatialQueryResultRow[]>(
      `SELECT id, name, geometry_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        ST_Distance(
          geometry::geography,
          ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography
        ) as distance_m
      FROM geometry.features
      WHERE ${spatialCondition}
        AND is_deleted = FALSE
        ${typeFilter}
      ORDER BY distance_m ASC
      LIMIT $2`,
      geoJson,
      limit,
    );

    const executionTimeMs = Date.now() - startTime;

    return {
      operation: dto.operation,
      resultCount: results.length,
      data: results.map((r) => ({
        id: r.id,
        name: r.name,
        geometryType: r.geometry_type,
        geometry: r.geometry,
        distance: r.distance_m
          ? Math.round(r.distance_m * 100) / 100
          : undefined,
      })),
      executionTimeMs,
    };
  }

  async bufferFeature(featureId: string, distanceMeters: number) {
    const [result] = await this.prisma.$queryRawUnsafe<BufferResultRow[]>(
      `SELECT
        id,
        ST_AsGeoJSON(
          ST_Buffer(geometry::geography, $2)::geometry
        )::json as result_geometry
      FROM geometry.features
      WHERE id = $1::uuid AND is_deleted = FALSE`,
      featureId,
      distanceMeters,
    );

    if (!result) {
      throw new InvalidGeometryError(`Feature not found: ${featureId}`);
    }

    return {
      sourceFeatureId: featureId,
      distanceMeters,
      resultGeometry: result.result_geometry,
    };
  }
}
