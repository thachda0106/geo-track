import { Feature } from '../entities/feature.entity';

export const FEATURE_REPOSITORY = Symbol('FEATURE_REPOSITORY');

export interface IFeatureRepository {
  findById(id: string): Promise<Feature | null>;
  /**
   * Persists a new feature OR updates an existing feature.
   * Also guarantees that the corresponding Outbox domain event is written in the same transaction.
   * Note: Raw SQL insertion logic happens under the hood here.
   */
  save(feature: Feature, dispatchEvent?: boolean): Promise<Feature>;

  /**
   * Soft deletes a feature, ensuring version locking.
   * Also records a FeatureDeletedEvent.
   */
  delete(id: string, expectedVersion: number, deletedBy: string): Promise<void>;
}
