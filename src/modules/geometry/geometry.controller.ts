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
  Inject,
} from '@nestjs/common';
import {
  CreateFeatureDto,
  UpdateFeatureDto,
  FeatureListQuery,
} from './application/dtos/geometry.dto';
import { CreateFeatureUseCase } from './application/use-cases/create-feature.use-case';
import { UpdateFeatureUseCase } from './application/use-cases/update-feature.use-case';
import { DeleteFeatureUseCase } from './application/use-cases/delete-feature.use-case';
import {
  FEATURE_QUERIES,
  SPATIAL_QUERIES,
  IFeatureQueries,
  ISpatialQueries,
} from './application/use-cases/queries/geometry-queries.interface';
import { Roles, CurrentUser, AuthenticatedUser } from '@app/core';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Features')
@ApiBearerAuth('JWT')
@Controller('features')
export class GeometryController {
  constructor(
    private readonly createFeatureUseCase: CreateFeatureUseCase,
    private readonly updateFeatureUseCase: UpdateFeatureUseCase,
    private readonly deleteFeatureUseCase: DeleteFeatureUseCase,
    @Inject(FEATURE_QUERIES)
    private readonly featureQueries: IFeatureQueries,
    @Inject(SPATIAL_QUERIES)
    private readonly spatialQueries: ISpatialQueries,
  ) {}

  @Post()
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new geometric feature' })
  @ApiBody({ type: CreateFeatureDto })
  @ApiResponse({
    status: 201,
    description: 'The feature has been successfully created.',
  })
  @ApiResponse({ status: 400, description: 'Invalid geometry payload.' })
  async create(
    @Body() dto: CreateFeatureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.createFeatureUseCase.execute(dto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List features with spatial bounds filters' })
  @ApiResponse({
    status: 200,
    description: 'Returns a paginated list of features',
  })
  async list(@Query() query: FeatureListQuery) {
    return this.featureQueries.listFeatures(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single feature by ID' })
  @ApiParam({ name: 'id', description: 'Feature ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Feature found' })
  @ApiResponse({ status: 404, description: 'Feature not found' })
  async findOne(@Param('id') id: string) {
    return this.featureQueries.getFeature(id);
  }

  @Put(':id')
  @Roles('editor', 'admin')
  @ApiOperation({
    summary: 'Update a geometric feature',
    description: 'Requires expectedVersion for optimistic locking',
  })
  @ApiParam({ name: 'id', description: 'Feature ID (UUID)' })
  @ApiBody({ type: UpdateFeatureDto })
  @ApiResponse({ status: 200, description: 'Feature successfully updated' })
  @ApiResponse({ status: 409, description: 'Conflict: version mismatch' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFeatureDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.updateFeatureUseCase.execute(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a feature' })
  @ApiParam({ name: 'id', description: 'Feature ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { expectedVersion: { type: 'integer' } },
    },
  })
  @ApiResponse({ status: 204, description: 'Successfully deleted' })
  @ApiResponse({ status: 409, description: 'Conflict: version mismatch' })
  async remove(
    @Param('id') id: string,
    @Body('expectedVersion') expectedVersion: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.deleteFeatureUseCase.execute(id, expectedVersion, user.userId);
  }

  @Post(':id/buffer')
  @ApiOperation({ summary: 'Calculate buffer polygon for feature' })
  @ApiParam({ name: 'id', description: 'Feature ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { distanceMeters: { type: 'number' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Buffer calculated' })
  async buffer(
    @Param('id') id: string,
    @Body('distanceMeters') distanceMeters: number,
  ) {
    return this.spatialQueries.bufferFeature(id, distanceMeters);
  }
}
