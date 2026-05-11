import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { Roles, CurrentUser, AuthenticatedUser } from '@app/core';

import { CreateFolderUseCase } from '../application/use-cases/create-folder.use-case';
import { UpdateFolderUseCase } from '../application/use-cases/update-folder.use-case';
import { DeleteFolderUseCase } from '../application/use-cases/delete-folder.use-case';
import { AssignFeaturesUseCase } from '../application/use-cases/assign-features.use-case';
import { ImportFileUseCase } from '../application/use-cases/import-file.use-case';
import { ExportFolderUseCase } from '../application/use-cases/export-folder.use-case';

import {
  FOLDER_REPOSITORY,
  IFolderRepository,
} from '../domain/repositories/folder.repository';

import {
  CreateFolderDto,
  UpdateFolderDto,
  AssignFeaturesDto,
  FolderListQuery,
  FolderResponseDto,
  FolderSummaryDto,
  ImportResponseDto,
} from '../application/dtos/folder.dto';
import { Folder } from '../domain/entities/folder.entity';

@ApiTags('Catalog — Folders')
@ApiBearerAuth('JWT')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly createFolderUseCase: CreateFolderUseCase,
    private readonly updateFolderUseCase: UpdateFolderUseCase,
    private readonly deleteFolderUseCase: DeleteFolderUseCase,
    private readonly assignFeaturesUseCase: AssignFeaturesUseCase,
    private readonly importFileUseCase: ImportFileUseCase,
    private readonly exportFolderUseCase: ExportFolderUseCase,
    @Inject(FOLDER_REPOSITORY)
    private readonly folderRepo: IFolderRepository,
  ) {}

  // ═══════════════════════════════════════════
  // FOLDERS
  // ═══════════════════════════════════════════

  @Get('folders')
  @ApiOperation({ summary: 'List root-level folders' })
  @ApiResponse({ status: 200, description: 'Paginated root folders' })
  async listRootFolders(
    @Query() query: FolderListQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.folderRepo.findRoots(user.userId, query);
  }

  @Post('folders')
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new folder' })
  @ApiBody({ type: CreateFolderDto })
  @ApiResponse({ status: 201, description: 'Folder created' })
  @ApiResponse({ status: 409, description: 'Duplicate folder name' })
  async createFolder(
    @Body() dto: CreateFolderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FolderResponseDto> {
    const folder = await this.createFolderUseCase.execute(dto, user.userId);
    return this.toResponseDto(folder);
  }

  @Get('folders/:id')
  @ApiOperation({ summary: 'Get a single folder with children' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Folder details' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  async getFolder(@Param('id') id: string): Promise<FolderResponseDto> {
    const folder = await this.folderRepo.findById(id);
    if (!folder) {
      throw new Error(`Folder not found: ${id}`);
    }

    const childrenResult = await this.folderRepo.findChildren(id);
    const children: FolderSummaryDto[] = childrenResult.data.map((child) => ({
      id: child.id,
      name: child.name,
      level: child.level,
      featureCount: child.featureCount,
      hasChildren: child.level >= 0, // simplified: will be refined in full build
    }));
    const pagination = childrenResult.pagination;

    return {
      ...this.toResponseDto(folder),
      children,
    };
  }

  @Patch('folders/:id')
  @Roles('editor', 'admin')
  @ApiOperation({ summary: 'Update folder (rename, move)' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  @ApiBody({ type: UpdateFolderDto })
  @ApiResponse({ status: 200, description: 'Folder updated' })
  @ApiResponse({ status: 409, description: 'Version conflict' })
  async updateFolder(
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FolderResponseDto> {
    const folder = await this.updateFolderUseCase.execute(id, dto, user.userId);
    return this.toResponseDto(folder);
  }

  @Delete('folders/:id')
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a folder' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  @ApiResponse({ status: 204, description: 'Folder deleted' })
  @ApiResponse({
    status: 409,
    description: 'Folder has children (use recursive)',
  })
  async deleteFolder(
    @Param('id') id: string,
    @Query('recursive') recursive: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.deleteFolderUseCase.execute(
      id,
      user.userId,
      recursive === 'true',
    );
  }

  @Get('folders/:id/children')
  @ApiOperation({ summary: 'List immediate children of a folder' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  async listChildren(@Param('id') id: string, @Query() query: FolderListQuery) {
    return this.folderRepo.findChildren(id, query);
  }

  @Get('folders/:id/features')
  @ApiOperation({ summary: 'List features in a folder' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  async listFeatures(@Param('id') id: string) {
    const featureIds = await this.folderRepo.getFeatureIdsInFolder(id);
    return { featureIds, count: featureIds.length };
  }

  // ═══════════════════════════════════════════
  // FEATURE ASSIGNMENT
  // ═══════════════════════════════════════════

  @Post('folders/:id/assign')
  @Roles('editor', 'admin')
  @ApiOperation({ summary: 'Assign features to a folder' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  @ApiBody({ type: AssignFeaturesDto })
  async assignFeatures(
    @Param('id') id: string,
    @Body() dto: AssignFeaturesDto,
  ): Promise<{ assignedCount: number }> {
    const assignedCount = await this.assignFeaturesUseCase.execute(
      id,
      dto.featureIds,
    );
    return { assignedCount };
  }

  @Delete('folders/:folderId/features/:featureId')
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a feature from a folder' })
  @ApiParam({ name: 'folderId', description: 'Folder ID (UUID)' })
  @ApiParam({ name: 'featureId', description: 'Feature ID (UUID)' })
  async removeFeature(
    @Param('folderId') folderId: string,
    @Param('featureId') featureId: string,
  ): Promise<void> {
    await this.folderRepo.removeFeatureFromFolder(featureId);

    // Update the count
    const currentCount = await this.folderRepo.countFeaturesInFolder(folderId);
    await this.folderRepo.updateFeatureCount(
      folderId,
      currentCount - (currentCount - 1),
    );
  }

  // ═══════════════════════════════════════════
  // FILE IMPORT
  // ═══════════════════════════════════════════

  @Post('folders/:id/import')
  @Roles('editor', 'admin')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload file and import as features' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Import completed' })
  @ApiResponse({ status: 413, description: 'File too large' })
  async importFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportResponseDto> {
    if (!file) {
      throw new Error('No file provided');
    }
    return this.importFileUseCase.execute(id, file);
  }

  // ═══════════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════════

  @Get('folders/:id/export')
  @ApiOperation({ summary: 'Export folder as GeoJSON' })
  @ApiParam({ name: 'id', description: 'Folder ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'GeoJSON FeatureCollection download',
  })
  async exportFolder(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportFolderUseCase.execute(id);
    const folderName = result.metadata.folderName.replace(
      /[^a-zA-Z0-9_-]/g,
      '_',
    );

    res.setHeader('Content-Type', 'application/geo+json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${folderName}.geojson"`,
    );
    res.json(result);
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  private toResponseDto(folder: Folder): FolderResponseDto {
    return {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      ownerId: folder.ownerId,
      description: folder.description,
      path: folder.path,
      level: folder.level,
      sortOrder: folder.sortOrder,
      version: folder.version,
      featureCount: folder.featureCount,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
      children: undefined,
    };
  }
}
