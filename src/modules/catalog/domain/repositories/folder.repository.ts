import { Folder } from '../entities/folder.entity';

export interface PaginatedFolders {
  data: Folder[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    limit: number;
    total: number;
  };
}

export interface FolderListQuery {
  cursor?: string;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface FeatureAssignment {
  featureId: string;
  folderId: string;
}

export const FOLDER_REPOSITORY = Symbol('FOLDER_REPOSITORY');

export interface IFolderRepository {
  // Queries
  findRoots(
    ownerId: string,
    query?: FolderListQuery,
  ): Promise<PaginatedFolders>;
  findById(id: string): Promise<Folder | null>;
  findChildren(
    parentId: string,
    query?: FolderListQuery,
  ): Promise<PaginatedFolders>;
  findDescendantIds(folderId: string): Promise<string[]>;
  findByNameAndParent(
    name: string,
    parentId: string | null,
    ownerId: string,
  ): Promise<Folder | null>;
  countByParent(parentId: string | null, ownerId: string): Promise<number>;

  // Mutations
  create(folder: Folder): Promise<Folder>;
  update(folder: Folder): Promise<Folder>;
  delete(id: string): Promise<void>;
  updateSubtreePaths(
    folderId: string,
    oldPathPrefix: string,
    newPathPrefix: string,
    levelDelta: number,
  ): Promise<void>;
  updateFeatureCount(folderId: string, delta: number): Promise<void>;
  updateFeatureCountsBatch(changes: Map<string, number>): Promise<void>;

  // Feature assignment
  assignFeatures(folderId: string, featureIds: string[]): Promise<number>;
  removeFeatureFromFolder(featureId: string): Promise<void>;
  getFeatureIdsInFolder(folderId: string): Promise<string[]>;
  countFeaturesInFolder(folderId: string): Promise<number>;
}
