import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, AppLoggerService } from '@app/core';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/repositories/folder.repository';

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: unknown;
    properties: Record<string, unknown>;
  }>;
  metadata: {
    folderId: string;
    folderName: string;
    exportedAt: string;
    featureCount: number;
  };
}

@Injectable()
export class ExportFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(folderId: string): Promise<GeoJsonFeatureCollection> {
    const startTime = Date.now();
    const logMeta = { folderId };

    this.logger.info('Export started', logMeta);

    const folder = await this.folderRepo.findById(folderId);
    if (!folder) {
      this.logger.warn(`Export failed: folder not found (${folderId})`);
      throw new Error(`Folder not found: ${folderId}`);
    }

    // Query all features in the folder with their PostGIS geometry
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string;
        geometry_type: string;
        geometry: unknown;
        properties: Record<string, unknown>;
        tags: string[];
        created_at: Date;
        updated_at: Date;
      }>
    >(
      `SELECT id, name, geometry_type, ST_AsGeoJSON(geometry)::jsonb as geometry, properties, tags, created_at, updated_at
       FROM geometry.features
       WHERE folder_id = $1 AND is_deleted = false
       ORDER BY created_at ASC`,
      folderId,
    );

    const features = rows.map((row) => ({
      type: 'Feature' as const,
      geometry: row.geometry,
      properties: {
        ...row.properties,
        id: row.id,
        name: row.name,
        geometryType: row.geometry_type,
        tags: row.tags,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      },
    }));

    const totalDurationMs = Date.now() - startTime;
    this.logger.info('Export completed', {
      ...logMeta,
      folderName: folder.name,
      featureCount: features.length,
      durationMs: totalDurationMs,
    });

    return {
      type: 'FeatureCollection',
      features,
      metadata: {
        folderId: folder.id,
        folderName: folder.name,
        exportedAt: new Date().toISOString(),
        featureCount: features.length,
      },
    };
  }
}
