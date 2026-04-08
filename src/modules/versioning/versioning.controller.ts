import { Controller, Get, Param, Query, Patch, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { RevertDto, VersionListQuery } from './application/dtos/versioning.dto';
import { Roles, CurrentUser, AuthenticatedUser } from '@app/core';
import { RevertFeatureUseCase } from './application/use-cases/revert-feature.use-case';
import { VersioningQueriesService } from './application/use-cases/queries/versioning-queries.service';

@ApiTags('Features Timeline')
@ApiBearerAuth('JWT')
@Controller('features')
export class FeatureVersionController {
  constructor(private readonly queriesService: VersioningQueriesService) {}

  @Get(':id/versions')
  @ApiOperation({ summary: 'List all versions for a given feature (Timeline)' })
  @ApiParam({ name: 'id', description: 'Feature ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Returns a paginated list of feature versions',
  })
  async listVersions(
    @Param('id') id: string,
    @Query() query: VersionListQuery,
  ) {
    return this.queriesService.listVersions(id, query);
  }

  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Get optimized timeline entries for a UI time slider',
  })
  @ApiParam({ name: 'id', description: 'Feature ID (UUID)' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Start date (ISO 8601)',
  })
  @ApiQuery({ name: 'to', required: true, description: 'End date (ISO 8601)' })
  @ApiQuery({
    name: 'granularity',
    required: false,
    enum: ['version', 'hour', 'day'],
  })
  @ApiResponse({
    status: 200,
    description: 'Returns optimized timeline geo-entries',
  })
  async getTimeline(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity?: 'version' | 'hour' | 'day',
  ) {
    return this.queriesService.getTimeline(id, from, to, granularity);
  }
}

@ApiTags('Versioning')
@ApiBearerAuth('JWT')
@Controller('versioning')
export class VersioningController {
  constructor(
    private readonly queriesService: VersioningQueriesService,
    private readonly revertFeatureUseCase: RevertFeatureUseCase,
  ) {}

  @Get(':featureId/v/:versionNumber')
  @ApiOperation({ summary: 'Get a specific version snapshot' })
  @ApiParam({ name: 'featureId', description: 'Feature ID (UUID)' })
  @ApiParam({
    name: 'versionNumber',
    description: 'Version Number',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the full geo-snapshot of the requested version',
  })
  @ApiResponse({ status: 404, description: 'Version not found' })
  async getVersion(
    @Param('featureId') featureId: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    return this.queriesService.getVersion(
      featureId,
      parseInt(versionNumber, 10),
    );
  }

  @Get(':featureId/diff')
  @ApiOperation({ summary: 'Re-calculate diff between any two versions' })
  @ApiParam({ name: 'featureId', description: 'Feature ID (UUID)' })
  @ApiQuery({
    name: 'from',
    required: true,
    description: 'Base version number',
    type: Number,
  })
  @ApiQuery({
    name: 'to',
    required: true,
    description: 'Target version number',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the diff and both snapshots',
  })
  async diffVersions(
    @Param('featureId') featureId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.queriesService.diffVersions(
      featureId,
      parseInt(from, 10),
      parseInt(to, 10),
    );
  }

  @Patch(':featureId/revert')
  @Roles('editor', 'admin')
  @ApiOperation({
    summary: 'Revert a feature to a previous version',
    description:
      'Creates a new version using the snapshot of the targeted older version.',
  })
  @ApiParam({ name: 'featureId', description: 'Feature ID (UUID) to revert' })
  @ApiBody({ type: RevertDto })
  @ApiResponse({ status: 200, description: 'Feature successfully reverted' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions',
  })
  @ApiResponse({ status: 404, description: 'Version or Feature not found' })
  async revertVersion(
    @Param('featureId') featureId: string,
    @Body() dto: RevertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.revertFeatureUseCase.execute(featureId, dto, user.userId);
  }
}
