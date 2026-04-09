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
  CreateSessionDto,
  LocationQuery,
} from '../application/dtos/tracking.dto';
import {
  Roles,
  CurrentUser,
  AuthenticatedUser,
  NotFoundError,
} from '@app/core';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

import { StartSessionUseCase } from '../application/use-cases/start-session.use-case';
import { EndSessionUseCase } from '../application/use-cases/end-session.use-case';
import { TrackingQueriesService } from '../application/use-cases/queries/tracking-queries.service';

@ApiTags('Tracking Sessions')
@ApiBearerAuth('JWT')
@Controller('tracking-sessions')
export class TrackingController {
  constructor(
    private readonly startSessionUseCase: StartSessionUseCase,
    private readonly endSessionUseCase: EndSessionUseCase,
    private readonly queriesService: TrackingQueriesService,
  ) {}

  @Post()
  @Roles('editor', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new tracking session for a device' })
  @ApiBody({ type: CreateSessionDto })
  @ApiResponse({ status: 201, description: 'Tracking session created' })
  @ApiResponse({
    status: 409,
    description: 'Device already has an active session',
  })
  async createSession(
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.startSessionUseCase.execute(dto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'List tracking sessions for current user' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by session status (e.g. active, ended)',
  })
  @ApiResponse({ status: 200, description: 'List of tracking sessions' })
  async listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.queriesService.listSessions(user.userId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific tracking session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session found' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSession(@Param('id') id: string) {
    const session = await this.queriesService.getSessionOverview(id);
    if (!session) {
      throw new NotFoundError('TrackingSession', id);
    }
    return session;
  }

  @Patch(':id/end')
  @ApiOperation({ summary: 'End an active tracking session' })
  @ApiParam({ name: 'id', description: 'Session ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Session ended' })
  @ApiResponse({ status: 400, description: 'Session is already ended' })
  async endSession(@Param('id') id: string) {
    return this.endSessionUseCase.execute(id);
  }

  @Get(':id/locations')
  @ApiOperation({ summary: 'Query location history of a session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns a paginated list of locations based on resolution',
  })
  async getLocations(@Param('id') id: string, @Query() query: LocationQuery) {
    return this.queriesService.getLocations(id, query);
  }

  @Get(':id/trail')
  @ApiOperation({ summary: 'Get session trail as a GeoJSON LineString' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Returns a GeoJSON Feature with LineString geometry',
  })
  async getTrail(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.queriesService.getTrail(id, from, to);
  }
}
