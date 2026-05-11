import { Inject, Injectable } from '@nestjs/common';
import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../../domain/repositories/folder.repository';
import { Folder } from '../../domain/entities/folder.entity';
import { CreateFolderDto } from '../dtos/folder.dto';

@Injectable()
export class CreateFolderUseCase {
  constructor(
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
  ) {}

  async execute(dto: CreateFolderDto, userId: string): Promise<Folder> {
    // Validate max depth
    if (dto.parentId) {
      const parent = await this.folderRepo.findById(dto.parentId);
      if (!parent) {
        throw new Error(`Parent folder not found: ${dto.parentId}`);
      }
      if (parent.level >= 10) {
        throw new Error('Maximum folder depth (10) reached');
      }

      // Validate duplicate name
      const existing = await this.folderRepo.findByNameAndParent(
        dto.name,
        dto.parentId,
        userId,
      );
      if (existing) {
        throw new Error(
          'A folder with this name already exists in this location',
        );
      }

      const folder = Folder.createChild({
        name: dto.name,
        parentId: dto.parentId,
        parentPath: parent.path,
        parentLevel: parent.level,
        ownerId: userId,
        description: dto.description,
        sortOrder: dto.sortOrder,
      });

      return this.folderRepo.create(folder);
    }

    // Root folder
    const existing = await this.folderRepo.findByNameAndParent(
      dto.name,
      null,
      userId,
    );
    if (existing) {
      throw new Error('A folder with this name already exists at root level');
    }

    const folder = Folder.createRoot({
      name: dto.name,
      ownerId: userId,
      description: dto.description,
      sortOrder: dto.sortOrder,
    });

    return this.folderRepo.create(folder);
  }
}
