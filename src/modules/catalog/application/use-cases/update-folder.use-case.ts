import { Inject, Injectable } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/repositories/folder.repository';
import { Folder } from '../../domain/entities/folder.entity';
import { UpdateFolderDto } from '../dtos/folder.dto';

@Injectable()
export class UpdateFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
  ) {}

  async execute(
    id: string,
    dto: UpdateFolderDto,
    userId: string,
  ): Promise<Folder> {
    const folder = await this.folderRepo.findById(id);
    if (!folder) {
      throw new Error(`Folder not found: ${id}`);
    }

    // Version conflict check
    if (folder.version !== dto.version) {
      throw new Error(
        `Version conflict: expected ${dto.version}, current ${folder.version}`,
      );
    }

    let updated = folder.withIncrementedVersion();

    // Rename
    if (dto.name !== undefined && dto.name !== folder.name) {
      const existing = await this.folderRepo.findByNameAndParent(
        dto.name,
        folder.parentId,
        userId,
      );
      if (existing && existing.id !== id) {
        throw new Error(
          'A folder with this name already exists in this location',
        );
      }
      updated = updated.withName(dto.name);
    }

    // Move (change parent)
    if (dto.parentId !== undefined) {
      const newParentId = dto.parentId;
      if (newParentId !== folder.parentId) {
        // Cycle detection
        if (newParentId) {
          const descendants = await this.folderRepo.findDescendantIds(id);
          if (descendants.includes(newParentId)) {
            throw new Error('Cannot move a folder into one of its descendants');
          }

          const newParent = await this.folderRepo.findById(newParentId);
          if (!newParent) {
            throw new Error(`Target folder not found: ${newParentId}`);
          }
          if (newParent.level >= 10) {
            throw new Error('Maximum folder depth (10) reached');
          }

          const oldPath = updated.path;
          updated = updated.withParent(
            newParentId,
            newParent.path,
            newParent.level,
          );

          // Update paths for entire subtree
          await this.folderRepo.updateSubtreePaths(
            id,
            oldPath,
            updated.path,
            updated.level - folder.level,
          );
        } else {
          // Moving to root
          const oldPath = updated.path;
          updated = updated.withParent(null, null, 0);
          await this.folderRepo.updateSubtreePaths(
            id,
            oldPath,
            updated.path,
            -folder.level,
          );
        }
      }
    }

    // Description
    if (dto.description !== undefined) {
      updated = new Folder({
        ...updated,
        description: dto.description ?? null,
      });
    }

    // Sort order
    if (dto.sortOrder !== undefined) {
      updated = new Folder({ ...updated, sortOrder: dto.sortOrder });
    }

    return this.folderRepo.update(updated);
  }
}
