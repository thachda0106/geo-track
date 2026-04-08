import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  ValidateNested,
  IsIn,
  IsArray,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SessionConfigDto {
  @ApiPropertyOptional({
    example: 1000,
    description: 'Minimum interval between location updates in ms',
  })
  @IsOptional()
  @IsNumber()
  minIntervalMs?: number;

  @ApiPropertyOptional({
    example: 200,
    description: 'Maximum expected speed in km/h',
  })
  @IsOptional()
  @IsNumber()
  maxSpeedKmh?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Accuracy threshold in meters (drop points worse than this)',
  })
  @IsOptional()
  @IsNumber()
  accuracyThresholdM?: number;

  @ApiPropertyOptional({
    example: 'continuous',
    enum: ['continuous', 'on_move'],
  })
  @IsOptional()
  @IsIn(['continuous', 'on_move'])
  trackingMode?: 'continuous' | 'on_move';
}

export class CreateSessionDto {
  @ApiProperty({
    example: 'device-1234',
    description: 'Unique device identifier',
  })
  @IsString()
  deviceId!: string;

  @ApiPropertyOptional({ type: SessionConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionConfigDto)
  config?: SessionConfigDto;
}

export class LocationPointDto {
  @ApiProperty({ example: 10.762622 })
  @IsNumber()
  lat!: number;

  @ApiProperty({ example: 106.660172 })
  @IsNumber()
  lng!: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  altitude?: number;

  @ApiPropertyOptional({ example: 45.2 })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ example: 180.0 })
  @IsOptional()
  @IsNumber()
  bearing?: number;

  @ApiPropertyOptional({ example: 5.0, description: 'GPS accuracy in meters' })
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @ApiProperty({ example: '2026-04-08T10:00:00Z' })
  @IsDateString()
  timestamp!: string;
}

export class IngestLocationDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000000',
    description: 'Tracking Session ID',
  })
  @IsString()
  sessionId!: string;

  @ApiProperty({ type: [LocationPointDto], description: 'Array of GPS points' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  points!: LocationPointDto[];
}

export class LocationQuery {
  @ApiPropertyOptional({ example: '2026-04-08T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-04-08T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 'raw', enum: ['raw', '5min', '1hr'] })
  @IsOptional()
  @IsIn(['raw', '5min', '1hr'])
  resolution?: 'raw' | '5min' | '1hr';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

export interface LocationRow {
  timestamp: Date;
  lat: number;
  lng: number;
  altitude?: number;
  speed?: number;
  bearing?: number;
  accuracy?: number;
  point_count?: number;
}

export interface TrailResultRow {
  geometry: Record<string, unknown>;
  point_count: number | bigint;
  distance_m: number;
  start_time: Date;
  end_time: Date;
  avg_speed: number | null;
}
