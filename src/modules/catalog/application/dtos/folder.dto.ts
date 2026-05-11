import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFolderDto {
  @ApiProperty({ example: 'Field Survey May 2026' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateFolderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  version!: number;
}

export class AssignFeaturesDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  featureIds!: string[];
}

export class FolderListQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: ['name', 'createdAt', 'updatedAt'] })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'createdAt', 'updatedAt'])
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class ImportFileDto {
  file!: Express.Multer.File;
}

export class ImportResponseDto {
  @ApiProperty()
  jobId!: string;

  @ApiProperty({ enum: ['completed', 'partial', 'failed'] })
  status!: string;

  @ApiProperty()
  featuresCreated!: number;

  @ApiProperty()
  featuresFailed!: number;

  @ApiPropertyOptional()
  errors?: Array<{ row: number; message: string }>;
}

export class ExportJobResponseDto {
  @ApiProperty()
  jobId!: string;

  @ApiProperty({ enum: ['pending', 'processing', 'completed', 'failed'] })
  status!: string;

  @ApiProperty()
  featureCount!: number;

  @ApiPropertyOptional()
  downloadUrl?: string;
}

export class FolderResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  parentId!: string | null;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  path!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  version!: number;

  @ApiProperty()
  featureCount!: number;

  @ApiPropertyOptional({ type: [Object] })
  children?: FolderSummaryDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class FolderSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  level!: number;

  @ApiProperty()
  featureCount!: number;

  @ApiProperty()
  hasChildren!: boolean;
}
