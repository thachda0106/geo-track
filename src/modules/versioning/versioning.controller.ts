import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VersioningService, VersionListQuery, RevertDto } from './versioning.service';
import { Roles, CurrentUser, AuthenticatedUser } from '@app/core';

@Controller('features/:featureId/versions')
export class VersioningController {
  constructor(private readonly versioningService: VersioningService) {}

  @Get()
  async listVersions(
    @Param('featureId') featureId: string,
    @Query() query: VersionListQuery,
  ) {
    return this.versioningService.listVersions(featureId, query);
  }

  @Get(':versionNumber')
  async getVersion(
    @Param('featureId') featureId: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    return this.versioningService.getVersion(featureId, parseInt(versionNumber, 10));
  }

  @Get(':v1/diff/:v2')
  async diffVersions(
    @Param('featureId') featureId: string,
    @Param('v1') v1: string,
    @Param('v2') v2: string,
  ) {
    return this.versioningService.diffVersions(
      featureId,
      parseInt(v1, 10),
      parseInt(v2, 10),
    );
  }
}

@Controller('features/:featureId')
export class FeatureVersionController {
  constructor(private readonly versioningService: VersioningService) {}

  @Get('timeline')
  async getTimeline(
    @Param('featureId') featureId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: 'version' | 'hour' | 'day' = 'version',
  ) {
    return this.versioningService.getTimeline(featureId, from, to, granularity);
  }

  @Post('revert')
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.CREATED)
  async revert(
    @Param('featureId') featureId: string,
    @Body() dto: RevertDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.versioningService.revertToVersion(featureId, dto, user.userId);
  }
}
