import { Module } from '@nestjs/common';
import { PrismaModule, LoggerModule } from '@app/core';

// Domain
import { FOLDER_REPOSITORY } from './domain/repositories/folder.repository';

// Application (Use Cases)
import { CreateFolderUseCase } from './application/use-cases/create-folder.use-case';
import { UpdateFolderUseCase } from './application/use-cases/update-folder.use-case';
import { DeleteFolderUseCase } from './application/use-cases/delete-folder.use-case';
import { AssignFeaturesUseCase } from './application/use-cases/assign-features.use-case';
import { ImportFileUseCase } from './application/use-cases/import-file.use-case';
import { ExportFolderUseCase } from './application/use-cases/export-folder.use-case';

// Infrastructure
import { FolderPrismaRepository } from './infrastructure/database/folder.prisma';
import { GeoJsonParser } from './infrastructure/file-parsers/geo-json.parser';
import { CsvParser } from './infrastructure/file-parsers/csv.parser';
import {
  CatalogImportCounter,
  CatalogExportCounter,
  CatalogImportDuration,
  CatalogExportDuration,
  CatalogFolderOperations,
} from './infrastructure/services/catalog.metrics';

// Presentation
import { CatalogController } from './presentation/catalog.controller';

@Module({
  imports: [PrismaModule, LoggerModule],
  controllers: [CatalogController],
  providers: [
    // Repository
    {
      provide: FOLDER_REPOSITORY,
      useClass: FolderPrismaRepository,
    },

    // File parsers (multi-provider)
    GeoJsonParser,
    CsvParser,
    {
      provide: 'FILE_PARSERS',
      useFactory: (geoJson: GeoJsonParser, csv: CsvParser) => [geoJson, csv],
      inject: [GeoJsonParser, CsvParser],
    },

    // Metrics
    CatalogImportCounter,
    CatalogExportCounter,
    CatalogImportDuration,
    CatalogExportDuration,
    CatalogFolderOperations,

    // Use Cases
    CreateFolderUseCase,
    UpdateFolderUseCase,
    DeleteFolderUseCase,
    AssignFeaturesUseCase,
    ImportFileUseCase,
    ExportFolderUseCase,
  ],
  exports: [FOLDER_REPOSITORY],
})
export class CatalogModule {}
