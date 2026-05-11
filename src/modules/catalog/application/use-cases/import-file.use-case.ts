import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { PrismaService, AppLoggerService } from '@app/core';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/repositories/folder.repository';
import { IFileParser } from '../../infrastructure/file-parsers/parser.interface';
import { ImportResponseDto } from '../dtos/folder.dto';

@Injectable()
export class ImportFileUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
    @Inject('FILE_PARSERS')
    private readonly parsers: IFileParser[],
    private readonly prisma: PrismaService,
    private readonly logger: AppLoggerService,
  ) {}

  async execute(
    folderId: string,
    file: Express.Multer.File,
  ): Promise<ImportResponseDto> {
    const startTime = Date.now();
    const logMeta = {
      folderId,
      fileName: file.originalname,
      fileSizeBytes: file.size,
    };

    this.logger.info('Import started', logMeta);

    const folder = await this.folderRepo.findById(folderId);
    if (!folder) {
      this.logger.warn(`Import failed: folder not found (${folderId})`);
      throw new Error(`Folder not found: ${folderId}`);
    }

    // Find the appropriate parser
    const parser = this.parsers.find((p) => p.supports(file.originalname));
    if (!parser) {
      this.logger.warn(
        `Import failed: unsupported format (${file.originalname})`,
      );
      throw new Error(
        `Unsupported file format: ${file.originalname}. Allowed: .geojson, .json, .csv`,
      );
    }

    // Parse the file
    const result = parser.parse(file.buffer, file.originalname);
    this.logger.info('File parsed', {
      ...logMeta,
      parseDurationMs: Date.now() - startTime,
      featureCount: result.features.length,
      errorCount: result.errors.length,
      geometryTypes: result.metadata.geometryTypes,
    });

    if (result.features.length === 0 && result.errors.length > 0) {
      this.logger.warn(
        `Import failed: all features had errors (${result.errors.length} errors)`,
      );
      return {
        jobId: uuid(),
        status: 'failed',
        featuresCreated: 0,
        featuresFailed: result.errors.length,
        errors: result.errors,
      };
    }

    // Create features in the geometry schema
    const createdIds: string[] = [];
    const jobId = uuid();

    try {
      await this.prisma.$transaction(async (tx: any) => {
        for (let i = 0; i < result.features.length; i++) {
          const feat = result.features[i];
          const featureId = uuid();
          const now = new Date();

          await tx.$executeRawUnsafe(
            `INSERT INTO geometry.features (id, name, description, geometry_type, geometry, properties, tags, current_version, created_by, updated_by, folder_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5), $6::jsonb, $7, 1, $8, $8, $9, $10, $10)`,
            featureId,
            feat.name,
            null,
            feat.geometry.type,
            JSON.stringify(feat.geometry),
            JSON.stringify(feat.properties),
            [],
            folder.ownerId,
            folderId,
            now,
          );

          createdIds.push(featureId);
        }

        await tx.$executeRawUnsafe(
          'UPDATE catalog.folders SET feature_count = feature_count + $1, updated_at = NOW() WHERE id = $2',
          result.features.length,
          folderId,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO catalog.import_jobs (id, folder_id, owner_id, file_name, file_size_bytes, file_format, status, features_total, features_created, features_failed, started_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          jobId,
          folderId,
          folder.ownerId,
          file.originalname,
          file.size,
          result.metadata.geometryTypes.join(','),
          result.errors.length > 0 ? 'partial' : 'completed',
          result.features.length,
          result.features.length,
          result.errors.length,
          new Date(),
          new Date(),
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database error';
      this.logger.error(
        `Import failed: database error — ${message}`,
        err instanceof Error ? err.stack : undefined,
        'ImportFileUseCase',
      );
      return {
        jobId,
        status: 'failed',
        featuresCreated: 0,
        featuresFailed: result.features.length,
        errors: [{ row: 0, message }],
      };
    }

    const totalDurationMs = Date.now() - startTime;
    this.logger.info('Import completed', {
      ...logMeta,
      jobId,
      status: result.errors.length > 0 ? 'partial' : 'completed',
      featuresCreated: createdIds.length,
      featuresFailed: result.errors.length,
      durationMs: totalDurationMs,
    });

    return {
      jobId,
      status: result.errors.length > 0 ? 'partial' : 'completed',
      featuresCreated: createdIds.length,
      featuresFailed: result.errors.length,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  }
}
