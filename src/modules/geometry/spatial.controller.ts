import { Controller, Post, Body, Inject } from '@nestjs/common';
import { SpatialQueryDto } from './application/dtos/spatial-query.dto';
import {
  SPATIAL_QUERIES,
  ISpatialQueries,
} from './application/use-cases/queries/geometry-queries.interface';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Spatial')
@ApiBearerAuth('JWT')
@Controller('spatial')
export class SpatialController {
  constructor(
    @Inject(SPATIAL_QUERIES)
    private readonly spatialQueries: ISpatialQueries,
  ) {}

  @Post('query')
  @ApiOperation({ summary: 'Execute raw spatial query (PostGIS)' })
  @ApiBody({ type: SpatialQueryDto })
  @ApiResponse({ status: 201, description: 'Query results returned' })
  async query(@Body() dto: SpatialQueryDto) {
    return this.spatialQueries.executeSpatialQuery(dto);
  }
}
