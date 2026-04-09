import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IngestLocationDto } from '../application/dtos/tracking.dto';
import { Public, UseApiKey } from '@app/core';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';

import { IngestLocationsUseCase } from '../application/use-cases/ingest-locations.use-case';

@ApiTags('Tracking Ingest')
@Controller('tracking')
export class TrackingIngestController {
  constructor(
    private readonly ingestLocationsUseCase: IngestLocationsUseCase,
  ) {}

  @Post('ingest')
  @Public() // Bypass JWT — IoT devices don't use user tokens
  @UseApiKey() // Require X-API-Key header instead
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Ingest location points (High throughput)',
    description:
      'Expects an array of GPS points. Validates API Key in production.',
  })
  @ApiBody({ type: IngestLocationDto })
  @ApiResponse({ status: 202, description: 'Payload accepted for processing' })
  @ApiResponse({
    status: 400,
    description: 'Session is not active or invalid payload',
  })
  async ingest(@Body() dto: IngestLocationDto) {
    return this.ingestLocationsUseCase.execute(dto);
  }
}
