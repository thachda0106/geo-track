import { Injectable } from '@nestjs/common';
import {
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

/**
 * Prometheus metric providers for catalog operations.
 * Register in CatalogModule providers array.
 */

export const CATALOG_IMPORT_COUNTER = 'catalog_imports_total';
export const CATALOG_EXPORT_COUNTER = 'catalog_exports_total';
export const CATALOG_IMPORT_DURATION = 'catalog_import_duration_seconds';
export const CATALOG_EXPORT_DURATION = 'catalog_export_duration_seconds';
export const CATALOG_FOLDER_OPERATIONS = 'catalog_folder_operations_total';

export const CatalogImportCounter = makeCounterProvider({
  name: CATALOG_IMPORT_COUNTER,
  help: 'Total number of file import operations',
  labelNames: ['status', 'format'], // status: completed | partial | failed
});

export const CatalogExportCounter = makeCounterProvider({
  name: CATALOG_EXPORT_COUNTER,
  help: 'Total number of folder export operations',
  labelNames: ['status'], // status: completed | failed
});

export const CatalogImportDuration = makeHistogramProvider({
  name: CATALOG_IMPORT_DURATION,
  help: 'Duration of file import operations in seconds',
  labelNames: ['status'],
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
});

export const CatalogExportDuration = makeHistogramProvider({
  name: CATALOG_EXPORT_DURATION,
  help: 'Duration of folder export operations in seconds',
  labelNames: ['status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const CatalogFolderOperations = makeCounterProvider({
  name: CATALOG_FOLDER_OPERATIONS,
  help: 'Total number of folder CRUD operations',
  labelNames: ['operation'], // operation: create | update | delete
});

@Injectable()
export class CatalogMetricsService {
  // This service will be used in Phase 7+ for recording metrics
  // It wraps prom-client for easier testability
}
