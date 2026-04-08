import { FeatureVersion } from '../entities/feature-version.entity';

export interface RevertOperationPayload {
  featureId: string;
  targetVersion: FeatureVersion;
  newVersionNumber: number;
  userId: string;
  message?: string;
}

export interface IFeatureVersionRepository {
  /**
   * Retrieves a specific version from the database.
   */
  getVersion(
    featureId: string,
    versionNumber: number,
  ): Promise<FeatureVersion | null>;

  /**
   * Complex transactional operation orchestrator to bypass strict DDD limits.
   * Performs the atomic revert across `geometry.features` and `versioning.versions` tables.
   */
  executeRevertTransaction(
    payload: RevertOperationPayload,
  ): Promise<FeatureVersion>;
}

export const FEATURE_VERSION_REPOSITORY = Symbol('FEATURE_VERSION_REPOSITORY');
