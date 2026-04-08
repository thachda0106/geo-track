import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import {
  NotFoundError,
  ConflictError,
  InvalidGeometryError,
} from '@app/core';
import { v4 as uuidv4 } from 'uuid';

// ─── DTOs ─────────────────────────────────────────────────────

export interface CreateFeatureDto {
  name: string;
  description?: string;
  geometryType: 'Point' | 'LineString' | 'Polygon';
  geometry: GeoJsonGeometry;
  properties?: Record<string, unknown>;
  tags?: string[];
}

export interface UpdateFeatureDto {
  name?: string;
  description?: string;
  geometry?: GeoJsonGeometry;
  properties?: Record<string, unknown>;
  tags?: string[];
  expectedVersion: number; // optimistic locking
}

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface FeatureListQuery {
  bbox?: string;          // minLng,minLat,maxLng,maxLat
  geometryType?: string;
  tags?: string;
  createdBy?: string;
  cursor?: string;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ─── Service ──────────────────────────────────────────────────

@Injectable()
export class GeometryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new geometry feature.
   * Inserts geometry via raw SQL for PostGIS ST_GeomFromGeoJSON.
   */
  async createFeature(dto: CreateFeatureDto, userId: string) {
    const correlationId = uuidv4();
    const geoJson = JSON.stringify(dto.geometry);

    // Validate geometry type matches declared type
    if (dto.geometry.type !== dto.geometryType) {
      throw new InvalidGeometryError(
        `Declared type '${dto.geometryType}' does not match geometry type '${dto.geometry.type}'`,
      );
    }

    // Use raw SQL for PostGIS geometry insertion + outbox in single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Insert feature with PostGIS geometry
      const [feature] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO geometry.features
          (id, name, description, geometry_type, geometry, properties, tags, current_version, created_by, updated_by)
        VALUES
          (gen_random_uuid(), $1, $2, $3,
           ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
           $5::jsonb, $6::text[], 1, $7::uuid, $7::uuid)
        RETURNING id, name, description, geometry_type,
          ST_AsGeoJSON(geometry)::json as geometry,
          properties, tags, current_version, created_by, created_at, updated_at`,
        dto.name,
        dto.description || null,
        dto.geometryType,
        geoJson,
        JSON.stringify(dto.properties || {}),
        dto.tags || [],
        userId,
      );

      // 2. Insert outbox event (same transaction = guaranteed delivery)
      await tx.$queryRawUnsafe(
        `INSERT INTO geometry.outbox (event_type, aggregate_id, payload, correlation_id)
        VALUES ('FeatureCreated', $1::uuid, $2::jsonb, $3::uuid)`,
        feature.id,
        JSON.stringify({
          featureId: feature.id,
          name: feature.name,
          geometryType: feature.geometry_type,
          geometry: feature.geometry,
          properties: feature.properties,
          tags: feature.tags,
          createdBy: userId,
        }),
        correlationId,
      );

      return feature;
    });

    return this.mapFeature(result);
  }

  /**
   * Get a single feature by ID.
   */
  async getFeature(id: string) {
    const [feature] = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, description, geometry_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        properties, tags, current_version, created_by, updated_by,
        created_at, updated_at
      FROM geometry.features
      WHERE id = $1::uuid AND is_deleted = FALSE`,
      id,
    );

    if (!feature) {
      throw new NotFoundError('Feature', id);
    }

    return this.mapFeature(feature);
  }

  /**
   * List features with spatial filtering, pagination.
   */
  async listFeatures(query: FeatureListQuery) {
    const limit = Math.min(query.limit || 50, 200);
    const conditions: string[] = ['is_deleted = FALSE'];
    const params: unknown[] = [];
    let paramIndex = 1;

    // Bounding box filter (spatial)
    if (query.bbox) {
      const [minLng, minLat, maxLng, maxLat] = query.bbox.split(',').map(Number);
      conditions.push(
        `geometry && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)`,
      );
      params.push(minLng, minLat, maxLng, maxLat);
      paramIndex += 4;
    }

    // Type filter
    if (query.geometryType) {
      conditions.push(`geometry_type = $${paramIndex}`);
      params.push(query.geometryType);
      paramIndex++;
    }

    // Author filter
    if (query.createdBy) {
      conditions.push(`created_by = $${paramIndex}::uuid`);
      params.push(query.createdBy);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Whitelist ORDER BY to prevent injection
    const ALLOWED_SORT_COLUMNS = ['updated_at', 'created_at', 'name'] as const;
    const sortColumn = (ALLOWED_SORT_COLUMNS as readonly string[]).includes(query.sort || '')
      ? query.sort
      : 'updated_at';
    const orderDirection = query.order === 'asc' ? 'ASC' : 'DESC';
    const orderBy = `${sortColumn} ${orderDirection}`;

    const features = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, name, description, geometry_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        properties, tags, current_version, created_by,
        created_at, updated_at
      FROM geometry.features
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}`,
      ...params,
      limit + 1, // fetch one extra to detect hasMore
    );

    const hasMore = features.length > limit;
    const data = features.slice(0, limit).map(this.mapFeature);

    return {
      data,
      pagination: {
        hasMore,
        limit,
        total: data.length,
      },
    };
  }

  /**
   * Update a feature with optimistic locking.
   */
  async updateFeature(id: string, dto: UpdateFeatureDto, userId: string) {
    const correlationId = uuidv4();

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock and check version
      const [current] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, current_version, ST_AsGeoJSON(geometry)::json as geometry
        FROM geometry.features
        WHERE id = $1::uuid AND is_deleted = FALSE
        FOR UPDATE`,
        id,
      );

      if (!current) {
        throw new NotFoundError('Feature', id);
      }

      if (current.current_version !== dto.expectedVersion) {
        throw new ConflictError('Feature', current.current_version, dto.expectedVersion);
      }

      // 2. Build parameterized update SET clause
      const sets: string[] = [];
      const updateParams: unknown[] = [id]; // $1 = id (for WHERE clause)
      let paramIdx = 2;

      // Always update version, updatedBy, updatedAt
      sets.push(`current_version = $${paramIdx}`);
      updateParams.push(current.current_version + 1);
      paramIdx++;

      sets.push(`updated_by = $${paramIdx}::uuid`);
      updateParams.push(userId);
      paramIdx++;

      sets.push(`updated_at = NOW()`);

      if (dto.name !== undefined) {
        sets.push(`name = $${paramIdx}`);
        updateParams.push(dto.name);
        paramIdx++;
      }
      if (dto.description !== undefined) {
        sets.push(`description = $${paramIdx}`);
        updateParams.push(dto.description);
        paramIdx++;
      }
      if (dto.properties !== undefined) {
        sets.push(`properties = $${paramIdx}::jsonb`);
        updateParams.push(JSON.stringify(dto.properties));
        paramIdx++;
      }
      if (dto.tags !== undefined) {
        sets.push(`tags = $${paramIdx}::text[]`);
        updateParams.push(dto.tags);
        paramIdx++;
      }
      if (dto.geometry) {
        sets.push(`geometry = ST_SetSRID(ST_GeomFromGeoJSON($${paramIdx}), 4326)`);
        updateParams.push(JSON.stringify(dto.geometry));
        paramIdx++;
      }

      // 3. Update feature (fully parameterized)
      const [updated] = await tx.$queryRawUnsafe<any[]>(
        `UPDATE geometry.features
        SET ${sets.join(', ')}
        WHERE id = $1::uuid
        RETURNING id, name, description, geometry_type,
          ST_AsGeoJSON(geometry)::json as geometry,
          properties, tags, current_version, updated_by, updated_at`,
        ...updateParams,
      );

      // 4. Outbox event
      await tx.$queryRawUnsafe(
        `INSERT INTO geometry.outbox (event_type, aggregate_id, payload, correlation_id)
        VALUES ('FeatureUpdated', $1::uuid, $2::jsonb, $3::uuid)`,
        id,
        JSON.stringify({
          featureId: id,
          previousVersion: current.current_version,
          newVersion: current.current_version + 1,
          geometry: updated.geometry,
          previousGeometry: current.geometry,
          properties: updated.properties,
          updatedBy: userId,
        }),
        correlationId,
      );

      return this.mapFeature(updated);
    });
  }

  /**
   * Soft-delete a feature.
   */
  async deleteFeature(id: string, expectedVersion: number, userId: string) {
    const correlationId = uuidv4();

    await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, current_version FROM geometry.features
        WHERE id = $1::uuid AND is_deleted = FALSE FOR UPDATE`,
        id,
      );

      if (!current) throw new NotFoundError('Feature', id);
      if (current.current_version !== expectedVersion) {
        throw new ConflictError('Feature', current.current_version, expectedVersion);
      }

      await tx.$queryRawUnsafe(
        `UPDATE geometry.features
        SET is_deleted = TRUE, deleted_at = NOW(), updated_by = $2::uuid
        WHERE id = $1::uuid`,
        id,
        userId,
      );

      await tx.$queryRawUnsafe(
        `INSERT INTO geometry.outbox (event_type, aggregate_id, payload, correlation_id)
        VALUES ('FeatureDeleted', $1::uuid, $2::jsonb, $3::uuid)`,
        id,
        JSON.stringify({ featureId: id, lastVersion: current.current_version, deletedBy: userId }),
        correlationId,
      );
    });
  }

  private mapFeature(row: any) {
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
}
