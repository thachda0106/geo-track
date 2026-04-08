import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class VersionListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    example: '2026-04-01T00:00:00Z',
    description: 'ISO 8601',
  })
  @IsOptional()
  @IsDateString()
  from?: string; // ISO 8601

  @ApiPropertyOptional({
    example: '2026-04-30T23:59:59Z',
    description: 'ISO 8601',
  })
  @IsOptional()
  @IsDateString()
  to?: string; // ISO 8601
}

export class RevertDto {
  @ApiProperty({
    example: 3,
    description: 'Target stable version to revert to',
  })
  @IsNumber()
  @Type(() => Number)
  toVersion!: number;

  @ApiPropertyOptional({
    example: 'Reverting due to incorrect boundaries',
    description: 'Reason for reverting',
  })
  @IsOptional()
  @IsString()
  message?: string;
}

export interface VersionTimelineRow {
  id: string;
  version_number: number;
  change_type: string;
  author_id: string;
  message: string;
  vertex_count: number;
  area_sqm: number;
  length_m: number;
  created_at: Date;
  author_name: string;
}

export interface VersionSnapshotRow extends VersionTimelineRow {
  feature_id: string;
  snapshot_geometry: Record<string, unknown>;
  snapshot_properties: Record<string, unknown>;
  snapshot_name: string;
  diff: Record<string, unknown>;
}

export interface TimelineEntryRow {
  version_number: number;
  change_type: string;
  geometry: Record<string, unknown>;
  author_id: string;
  timestamp: Date;
}
