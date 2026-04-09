import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsNumber,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GeoJsonGeometry {
  @ApiProperty({ example: 'Polygon', description: 'GeoJSON geometry type' })
  @IsString()
  type!: string;

  @ApiProperty({
    example: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
    description: 'GeoJSON coordinates array',
  })
  @IsArray()
  coordinates!: unknown;
}

export class CreateFeatureDto {
  @ApiProperty({
    example: 'Central Park',
    description: 'Name of the geographic feature',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    example: 'Large public park in NYC',
    description: 'Optional description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: 'Polygon',
    enum: ['Point', 'LineString', 'Polygon'],
    description: 'Type of geometry',
  })
  @IsIn(['Point', 'LineString', 'Polygon'])
  geometryType!: 'Point' | 'LineString' | 'Polygon';

  @ApiProperty({
    type: GeoJsonGeometry,
    description: 'The GeoJSON structure representing the shape',
  })
  @ValidateNested()
  @Type(() => GeoJsonGeometry)
  geometry!: GeoJsonGeometry;

  @ApiPropertyOptional({
    example: { fill: 'green' },
    description: 'Arbitrary JSON key-value properties',
  })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @ApiPropertyOptional({ example: ['park', 'public'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateFeatureDto {
  @ApiPropertyOptional({ example: 'Central Park (Updated)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: GeoJsonGeometry })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonGeometry)
  geometry?: GeoJsonGeometry;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiProperty({
    example: 1,
    description:
      'Expected version for optimistic locking to prevent overwrites',
  })
  @IsNumber()
  expectedVersion!: number; // optimistic locking
}

export class FeatureListQuery {
  @ApiPropertyOptional({
    example: '-74.0,40.7,-73.9,40.8',
    description: 'Bounding box (minLng,minLat,maxLng,maxLat)',
  })
  @IsOptional()
  @IsString()
  bbox?: string;

  @ApiPropertyOptional({ example: 'Polygon' })
  @IsOptional()
  @IsString()
  geometryType?: string;

  @ApiPropertyOptional({ example: 'park' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Filter by creator UUID' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 50, description: 'Max results limit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional({
    example: 'created_at',
    enum: ['updated_at', 'created_at', 'name'],
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ example: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export interface FeatureDto {
  id: string;
  name: string;
  description: string | null;
  geometryType: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
  tags: string[];
  currentVersion: number;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
