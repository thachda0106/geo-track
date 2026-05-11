import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import { Folder } from '../../domain/entities/folder.entity';
import {
  IFolderRepository,
  PaginatedFolders,
  FolderListQuery,
} from '../../domain/repositories/folder.repository';

@Injectable()
export class FolderPrismaRepository implements IFolderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRoots(
    ownerId: string,
    query?: FolderListQuery,
  ): Promise<PaginatedFolders> {
    const limit = query?.limit ?? 50;
    const sort = query?.sort ?? 'name';
    const order = query?.order ?? 'asc';

    const orderMap: Record<string, string> = {
      name: 'name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    };

    const [rows, total] = await Promise.all([
      this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM catalog.folders
         WHERE owner_id = $1 AND parent_id IS NULL
         ORDER BY sort_order ASC, ${orderMap[sort] ?? 'name'} ${order === 'desc' ? 'DESC' : 'ASC'}
         LIMIT $2`,
        ownerId,
        limit + 1, // Fetch one extra for hasMore detection
      ),
      this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        'SELECT COUNT(*) as count FROM catalog.folders WHERE owner_id = $1 AND parent_id IS NULL',
        ownerId,
      ),
    ]);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) => this.toEntity(r));

    return {
      data,
      cursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
      hasMore,
      limit,
      total: Number(total[0]?.count ?? 0),
    };
  }

  async findById(id: string): Promise<Folder | null> {
    const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM catalog.folders WHERE id = $1',
      id,
    );
    return rows.length > 0 ? this.toEntity(rows[0]) : null;
  }

  async findChildren(
    parentId: string,
    query?: FolderListQuery,
  ): Promise<PaginatedFolders> {
    const limit = query?.limit ?? 50;
    const order = query?.order ?? 'asc';

    const [rows, total] = await Promise.all([
      this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT * FROM catalog.folders
         WHERE parent_id = $1
         ORDER BY sort_order ${order === 'desc' ? 'DESC' : 'ASC'}, name ${order === 'desc' ? 'DESC' : 'ASC'}
         LIMIT $2`,
        parentId,
        limit + 1,
      ),
      this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
        'SELECT COUNT(*) as count FROM catalog.folders WHERE parent_id = $1',
        parentId,
      ),
    ]);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((r) => this.toEntity(r));

    return {
      data,
      cursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
      hasMore,
      limit,
      total: Number(total[0]?.count ?? 0),
    };
  }

  async findDescendantIds(folderId: string): Promise<string[]> {
    // Find the folder first to get its path
    const folder = await this.findById(folderId);
    if (!folder) return [];

    const rows = await this.prisma.$queryRawUnsafe<[{ id: string }[]]>(
      "SELECT id FROM catalog.folders WHERE path LIKE $1 || '/%'",
      folder.path,
    );
    return (rows as unknown as Array<{ id: string }>).map((r) => r.id);
  }

  async findByNameAndParent(
    name: string,
    parentId: string | null,
    ownerId: string,
  ): Promise<Folder | null> {
    const rows = parentId
      ? await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          'SELECT * FROM catalog.folders WHERE name = $1 AND parent_id = $2',
          name,
          parentId,
        )
      : await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          'SELECT * FROM catalog.folders WHERE name = $1 AND parent_id IS NULL AND owner_id = $2',
          name,
          ownerId,
        );
    return rows.length > 0 ? this.toEntity(rows[0]) : null;
  }

  async countByParent(
    parentId: string | null,
    ownerId: string,
  ): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
      parentId
        ? 'SELECT COUNT(*) as count FROM catalog.folders WHERE parent_id = $1'
        : 'SELECT COUNT(*) as count FROM catalog.folders WHERE parent_id IS NULL AND owner_id = $1',
      parentId ?? ownerId,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async create(folder: Folder): Promise<Folder> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO catalog.folders (id, name, parent_id, owner_id, description, path, level, sort_order, version, feature_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      folder.id,
      folder.name,
      folder.parentId,
      folder.ownerId,
      folder.description,
      folder.path,
      folder.level,
      folder.sortOrder,
      folder.version,
      folder.featureCount,
    );
    return folder;
  }

  async update(folder: Folder): Promise<Folder> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE catalog.folders
       SET name = $1, parent_id = $2, description = $3, path = $4, level = $5,
           sort_order = $6, version = $7, updated_at = NOW()
       WHERE id = $8`,
      folder.name,
      folder.parentId,
      folder.description,
      folder.path,
      folder.level,
      folder.sortOrder,
      folder.version,
      folder.id,
    );
    return folder;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'DELETE FROM catalog.folders WHERE id = $1',
      id,
    );
  }

  async updateSubtreePaths(
    folderId: string,
    oldPathPrefix: string,
    newPathPrefix: string,
    levelDelta: number,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE catalog.folders
       SET path = replace(path, $1, $2),
           level = level + $3
       WHERE path LIKE $1 || '/%'`,
      oldPathPrefix,
      newPathPrefix,
      levelDelta,
    );
  }

  async updateFeatureCount(folderId: string, delta: number): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'UPDATE catalog.folders SET feature_count = GREATEST(0, feature_count + $1) WHERE id = $2',
      delta,
      folderId,
    );
  }

  async updateFeatureCountsBatch(changes: Map<string, number>): Promise<void> {
    for (const [folderId, delta] of changes) {
      await this.updateFeatureCount(folderId, delta);
    }
  }

  async assignFeatures(
    folderId: string,
    featureIds: string[],
  ): Promise<number> {
    // Update features in the geometry schema to point to this folder
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE geometry.features
       SET folder_id = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[]) AND is_deleted = false`,
      folderId,
      featureIds,
    );
    return result;
  }

  async removeFeatureFromFolder(featureId: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE geometry.features
       SET folder_id = NULL, updated_at = NOW()
       WHERE id = $1 AND is_deleted = false`,
      featureId,
    );
  }

  async getFeatureIdsInFolder(folderId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<[{ id: string }[]]>(
      'SELECT id FROM geometry.features WHERE folder_id = $1 AND is_deleted = false',
      folderId,
    );
    return (rows as unknown as Array<{ id: string }>).map((r) => r.id);
  }

  async countFeaturesInFolder(folderId: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<[{ count: bigint }]>(
      'SELECT COUNT(*) as count FROM geometry.features WHERE folder_id = $1 AND is_deleted = false',
      folderId,
    );
    return Number(rows[0]?.count ?? 0);
  }

  private toEntity(row: Record<string, unknown>): Folder {
    return new Folder({
      id: row['id'] as string,
      name: row['name'] as string,
      parentId: (row['parent_id'] as string) ?? null,
      ownerId: row['owner_id'] as string,
      description: (row['description'] as string) ?? null,
      path: row['path'] as string,
      level: Number(row['level'] ?? 0),
      sortOrder: Number(row['sort_order'] ?? 0),
      version: Number(row['version'] ?? 1),
      featureCount: Number(row['feature_count'] ?? 0),
      createdAt: row['created_at'] as Date,
      updatedAt: row['updated_at'] as Date,
    });
  }
}
