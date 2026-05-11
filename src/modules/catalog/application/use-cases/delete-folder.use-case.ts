import { Inject, Injectable } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/repositories/folder.repository';

@Injectable()
export class DeleteFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
  ) {}

  async execute(
    id: string,
    userId: string,
    recursive = false,
  ): Promise<{ unassignedFeatures: number }> {
    const folder = await this.folderRepo.findById(id);
    if (!folder) {
      throw new Error(`Folder not found: ${id}`);
    }

    const children = await this.folderRepo.findChildren(id);
    if (children.data.length > 0 && !recursive) {
      throw new Error(
        `Folder has ${children.pagination.total} sub-folders. Use recursive=true to delete all contents.`,
      );
    }

    // Unassign all features in this folder
    const featureIds = await this.folderRepo.getFeatureIdsInFolder(id);
    if (featureIds.length > 0) {
      for (const featureId of featureIds) {
        await this.folderRepo.removeFeatureFromFolder(featureId);
      }
    }

    // If recursive, also delete descendant folders
    if (recursive) {
      const descendantIds = await this.folderRepo.findDescendantIds(id);
      for (const descendantId of descendantIds) {
        const descFeatures =
          await this.folderRepo.getFeatureIdsInFolder(descendantId);
        for (const featureId of descFeatures) {
          await this.folderRepo.removeFeatureFromFolder(featureId);
        }
        await this.folderRepo.delete(descendantId);
      }
    }

    // Delete the folder itself
    await this.folderRepo.delete(id);

    return { unassignedFeatures: featureIds.length };
  }
}
