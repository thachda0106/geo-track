import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  ValidateNested,
  IsIn,
  IsNumber,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class SpatialQueryParamsDto {
  @ApiPropertyOptional({
    example: 1000,
    description: 'Distance in meters for within_distance operation',
  })
  @IsOptional()
  @IsNumber()
  distanceMeters?: number;

  @ApiPropertyOptional({ example: 'Polygon' })
  @IsOptional()
  @IsString()
  geometryType?: string;
}

export class SpatialQueryDto {
  @ApiProperty({
    example: 'intersects',
    enum: ['intersects', 'contains', 'within', 'within_distance'],
  })
  @IsIn(['intersects', 'contains', 'within', 'within_distance'])
  operation!: 'intersects' | 'contains' | 'within' | 'within_distance';

  @ApiProperty({
    example: { type: 'Point', coordinates: [100.0, 0.0] },
    description: 'The GeoJSON geometry to query against',
  })
  @IsObject()
  queryGeometry!: { type: string; coordinates: unknown };

  @ApiPropertyOptional({ type: SpatialQueryParamsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpatialQueryParamsDto)
  params?: SpatialQueryParamsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
