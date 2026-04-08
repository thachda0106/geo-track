import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  TrackingService,
  CreateSessionDto,
  IngestLocationDto,
  LocationQuery,
} from './tracking.service';
import { Roles, CurrentUser, Public, AuthenticatedUser } from '@app/core';

@Controller('tracking-sessions')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post()
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.trackingService.createSession(dto, user.userId);
  }

  @Get()
  async listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.trackingService.listSessions(user.userId, status);
  }

  @Get(':id')
  async getSession(@Param('id') id: string) {
    return this.trackingService.getSession(id);
  }

  @Patch(':id/end')
  async endSession(@Param('id') id: string) {
    return this.trackingService.endSession(id);
  }

  @Get(':id/locations')
  async getLocations(
    @Param('id') id: string,
    @Query() query: LocationQuery,
  ) {
    return this.trackingService.getLocations(id, query);
  }

  @Get(':id/trail')
  async getTrail(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.trackingService.getTrail(id, from, to);
  }
}

@Controller('tracking')
export class TrackingIngestController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * High-throughput ingestion endpoint.
   * In production, this would be a separate service pushing to Kafka.
   * For MVP, direct DB insert.
   */
  @Post('ingest')
  @Public() // Auth via API key (not JWT) — handled in middleware for production
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Body() dto: IngestLocationDto) {
    return this.trackingService.ingestLocations(dto);
  }
}
