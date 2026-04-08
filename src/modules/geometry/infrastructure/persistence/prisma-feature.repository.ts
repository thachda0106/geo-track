import { Injectable } from '@nestjs/common';
import { PrismaService, NotFoundError, ConflictError } from '@app/core';
import { v4 as uuidv4 } from 'uuid';
import { Feature } from '../../domain/entities/feature.entity';
import { IFeatureRepository } from '../../domain/repositories/feature.repository';

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

@Injectable()
export class PrismaFeatureRepository implements IFeatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Feature | null> {
    const [feature] = await this.prisma.$queryRawUnsafe<FeatureRow[]>(
      `SELECT id, name, description, geometry_type,
        ST_AsGeoJSON(geometry)::json as geometry,
        properties, tags, current_version, created_by, updated_by,
        created_at, updated_at
      FROM geometry.features
      WHERE id = $1::uuid AND is_deleted = FALSE`,
      id,
    );

    if (!feature) {
      return null;
    }

    return Feature.restore({
      id: feature.id,
      name: feature.name,
      description: feature.description,
      geometryType: feature.geometry_type as 'Point' | 'LineString' | 'Polygon',
      geometry: feature.geometry as { type: string; coordinates: unknown },
      properties: feature.properties,
      tags: feature.tags,
      currentVersion: feature.current_version,
      createdBy: feature.created_by,
      updatedBy: feature.updated_by,
      createdAt: feature.created_at,
      updatedAt: feature.updated_at,
    });
  }

  async save(feature: Feature): Promise<Feature> {
    const correlationId = uuidv4();
    const isNew = feature.getId() === '00000000-0000-0000-0000-000000000000';

    return this.prisma.$transaction(async (tx) => {
      let savedRow: FeatureRow;

      if (isNew) {
        // Create
        const [insertedRow] = await tx.$queryRawUnsafe<FeatureRow[]>(
          `INSERT INTO geometry.features
            (id, name, description, geometry_type, geometry, properties, tags, current_version, created_by, updated_by)
          VALUES
            (gen_random_uuid(), $1, $2, $3,
             ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
             $5::jsonb, $6::text[], 1, $7::uuid, $7::uuid)
          RETURNING id, name, description, geometry_type,
            ST_AsGeoJSON(geometry)::json as geometry,
            properties, tags, current_version, created_by, updated_by, created_at, updated_at`,
          feature.getName(),
          feature.getDescription(),
          feature.getGeometryType(),
          JSON.stringify(feature.getGeometry()),
          JSON.stringify(feature.getProperties()),
          feature.getTags(),
          feature.getCreatedBy(),
        );
        savedRow = insertedRow;

        // Outbox event
        await tx.$queryRawUnsafe(
          `INSERT INTO geometry.outbox (event_type, aggregate_id, payload, correlation_id)
          VALUES ('FeatureCreated', $1::uuid, $2::jsonb, $3::uuid)`,
          savedRow.id,
          JSON.stringify({
            featureId: savedRow.id,
            name: savedRow.name,
            geometryType: savedRow.geometry_type,
            geometry: savedRow.geometry,
            properties: savedRow.properties,
            tags: savedRow.tags,
            createdBy: savedRow.created_by,
          }),
          correlationId,
        );
      } else {
        // Update (optimistic locking enforced in domain usecase, but verified here strictly)
        const sets: string[] = [];
        const updateParams: unknown[] = [feature.getId()];
        let paramIdx = 2;

        sets.push(`current_version = $${paramIdx}`);
        updateParams.push(feature.getCurrentVersion());
        paramIdx++;

        sets.push(`updated_by = $${paramIdx}::uuid`);
        updateParams.push(feature.getUpdatedBy());
        paramIdx++;

        sets.push(`updated_at = NOW()`);

        sets.push(`name = $${paramIdx}`);
        updateParams.push(feature.getName());
        paramIdx++;

        sets.push(`description = $${paramIdx}`);
        updateParams.push(feature.getDescription());
        paramIdx++;

        sets.push(`properties = $${paramIdx}::jsonb`);
        updateParams.push(JSON.stringify(feature.getProperties()));
        paramIdx++;

        sets.push(`tags = $${paramIdx}::text[]`);
        updateParams.push(feature.getTags());
        paramIdx++;

        sets.push(
          `geometry = ST_SetSRID(ST_GeomFromGeoJSON($${paramIdx}), 4326)`,
        );
        updateParams.push(JSON.stringify(feature.getGeometry()));
        paramIdx++;

        const [updatedRow] = await tx.$queryRawUnsafe<FeatureRow[]>(
          `UPDATE geometry.features
          SET ${sets.join(', ')}
          WHERE id = $1::uuid AND current_version = ${feature.getCurrentVersion() - 1} AND is_deleted = FALSE
          RETURNING id, name, description, geometry_type,
            ST_AsGeoJSON(geometry)::json as geometry,
            properties, tags, current_version, created_by, updated_by, created_at, updated_at`,
          ...updateParams,
        );

        if (!updatedRow) {
          throw new ConflictError(
            'Feature',
            feature.getCurrentVersion() - 1,
            feature.getCurrentVersion(),
          );
        }

        savedRow = updatedRow;

        // Outbox event
        await tx.$queryRawUnsafe(
          `INSERT INTO geometry.outbox (event_type, aggregate_id, payload, correlation_id)
          VALUES ('FeatureUpdated', $1::uuid, $2::jsonb, $3::uuid)`,
          savedRow.id,
          JSON.stringify({
            featureId: savedRow.id,
            newVersion: savedRow.current_version,
            geometry: savedRow.geometry,
            properties: savedRow.properties,
            updatedBy: savedRow.updated_by,
          }),
          correlationId,
        );
      }

      return Feature.restore({
        id: savedRow.id,
        name: savedRow.name,
        description: savedRow.description,
        geometryType: savedRow.geometry_type as
          | 'Point'
          | 'LineString'
          | 'Polygon',
        geometry: savedRow.geometry as { type: string; coordinates: unknown },
        properties: savedRow.properties,
        tags: savedRow.tags,
        currentVersion: savedRow.current_version,
        createdBy: savedRow.created_by,
        updatedBy: savedRow.updated_by,
        createdAt: savedRow.created_at,
        updatedAt: savedRow.updated_at,
      });
    });
  }

  async delete(
    id: string,
    expectedVersion: number,
    deletedBy: string,
  ): Promise<void> {
    const correlationId = uuidv4();

    await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRawUnsafe<
        { id: string; current_version: number }[]
      >(
        `SELECT id, current_version FROM geometry.features
        WHERE id = $1::uuid AND is_deleted = FALSE FOR UPDATE`,
        id,
      );

      if (!current) throw new NotFoundError('Feature', id);
      if (current.current_version !== expectedVersion) {
        throw new ConflictError(
          'Feature',
          current.current_version,
          expectedVersion,
        );
      }

      await tx.$queryRawUnsafe(
        `UPDATE geometry.features
        SET is_deleted = TRUE, deleted_at = NOW(), updated_by = $2::uuid
        WHERE id = $1::uuid`,
        id,
        deletedBy,
      );

      await tx.$queryRawUnsafe(
        `INSERT INTO geometry.outbox (event_type, aggregate_id, payload, correlation_id)
        VALUES ('FeatureDeleted', $1::uuid, $2::jsonb, $3::uuid)`,
        id,
        JSON.stringify({
          featureId: id,
          lastVersion: current.current_version,
          deletedBy: deletedBy,
        }),
        correlationId,
      );
    });
  }
}
