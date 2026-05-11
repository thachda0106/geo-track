import { Inject, Injectable } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/repositories/folder.repository';

@Injectable()
export class AssignFeaturesUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
  ) {}

  async execute(folderId: string, featureIds: string[]): Promise<number> {
    const folder = await this.folderRepo.findById(folderId);
    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    const assignedCount = await this.folderRepo.assignFeatures(
      folderId,
      featureIds,
    );

    // Update denormalized feature count
    const currentCount = await this.folderRepo.countFeaturesInFolder(folderId);
    await this.folderRepo.updateFeatureCount(
      folderId,
      currentCount - folder.featureCount,
    );

    return assignedCount;
  }
}
