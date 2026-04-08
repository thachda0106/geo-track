import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@app/core';
import {
  NotFoundError,
  DuplicateError,
  ForbiddenError,
} from '@app/core';
import { AuthenticatedUser } from '@app/core';

// ─── DTOs ─────────────────────────────────────────────────────
export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

// ─── Service ──────────────────────────────────────────────────

@Injectable()
export class IdentityService {
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user.
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new DuplicateError('User', 'email', dto.email);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: 'viewer',
        status: 'active',
      },
    });

    // Generate JWT
    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  /**
   * Authenticate user with email/password.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // Timing-safe: still hash to prevent timing attacks
      await bcrypt.hash('dummy', this.BCRYPT_ROUNDS);
      throw new ForbiddenError('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new ForbiddenError('Account is suspended');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new ForbiddenError('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.generateAccessToken(user);

    return {
      accessToken,
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m',
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }

  /**
   * Get current user profile.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return user;
  }

  private generateAccessToken(user: { id: string; email: string; role: string }): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }
}
