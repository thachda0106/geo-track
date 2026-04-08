import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  GeometryService,
  CreateFeatureDto,
  UpdateFeatureDto,
  FeatureListQuery,
} from './geometry.service';
import { SpatialQueryService, SpatialQueryDto } from './spatial-query.service';
import { Roles, CurrentUser, AuthenticatedUser } from '@app/core';

@Controller('features')
export class GeometryController {
  constructor(
    private readonly geometryService: GeometryService,
    private readonly spatialQueryService: SpatialQueryService,
  ) {}

  @Post()
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateFeatureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.geometryService.createFeature(dto, user.userId);
  }

  @Get()
  async list(@Query() query: FeatureListQuery) {
    return this.geometryService.listFeatures(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.geometryService.getFeature(id);
  }

  @Put(':id')
  @Roles('editor', 'admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFeatureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.geometryService.updateFeature(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @Body('expectedVersion') expectedVersion: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.geometryService.deleteFeature(id, expectedVersion, user.userId);
  }

  @Post(':id/buffer')
  async buffer(
    @Param('id') id: string,
    @Body('distanceMeters') distanceMeters: number,
  ) {
    return this.spatialQueryService.bufferFeature(id, distanceMeters);
  }
}

// Separate controller for spatial queries (different path)
@Controller('spatial')
export class SpatialController {
  constructor(private readonly spatialQueryService: SpatialQueryService) {}

  @Post('query')
  async query(@Body() dto: SpatialQueryDto) {
    return this.spatialQueryService.executeSpatialQuery(dto);
  }
}
