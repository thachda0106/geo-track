import { FeatureListQuery, FeatureDto } from '../../dtos/geometry.dto';
import { SpatialQueryDto } from '../../dtos/spatial-query.dto';

export const FEATURE_QUERIES = Symbol('FEATURE_QUERIES');
export const SPATIAL_QUERIES = Symbol('SPATIAL_QUERIES');

export interface IFeatureQueries {
  listFeatures(query: FeatureListQuery): Promise<{
    data: FeatureDto[];
    pagination: { hasMore: boolean; limit: number; total: number };
  }>;
  getFeature(id: string): Promise<FeatureDto>;
}

export interface ISpatialQueries {
  executeSpatialQuery(dto: SpatialQueryDto): Promise<{
    operation: string;
    resultCount: number;
    data: Array<{
      id: string;
      name: string;
      geometryType: string;
      geometry: Record<string, unknown>;
      distance?: number;
    }>;
    executionTimeMs: number;
  }>;

  bufferFeature(
    featureId: string,
    distanceMeters: number,
  ): Promise<{
    sourceFeatureId: string;
    distanceMeters: number;
    resultGeometry: Record<string, unknown>;
  }>;
}
