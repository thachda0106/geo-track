import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RegisterDto, LoginDto } from './application/dtos/identity.dto';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUserUseCase } from './application/use-cases/login-user.use-case';
import { IdentityQueriesService } from './application/use-cases/queries/identity-queries.service';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Roles, CurrentUser, AuthenticatedUser, Public } from '@app/core';

@ApiTags('Identity (Auth)')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUserUseCase,
    private readonly queriesService: IdentityQueriesService,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.registerUseCase.execute(dto);
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({
    status: 403,
    description: 'Invalid credentials or suspended account',
  })
  async login(@Body() dto: LoginDto) {
    return this.loginUseCase.execute(dto);
  }

  @Get('profile')
  @ApiBearerAuth('JWT')
  @Roles('viewer', 'editor', 'admin') // Require any valid role
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  @ApiResponse({ status: 200, description: 'Returns user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.queriesService.getProfile(user.userId);
  }
}
