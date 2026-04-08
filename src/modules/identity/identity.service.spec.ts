import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { IdentityService } from './identity.service';
import { PrismaService } from '@app/core';
import { DuplicateError, ForbiddenError, NotFoundError } from '@app/core';
import { createMockPrismaService } from '../../../test/helpers/test-setup.module';
import { createTestUser } from '../../../test/helpers/test-factories';

// ═══════════════════════════════════════════════════════
// Identity Service Unit Tests
// ═══════════════════════════════════════════════════════

describe('IdentityService', () => {
  let service: IdentityService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.jwt.token'),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_ACCESS_EXPIRATION: '15m',
                JWT_SECRET: 'test-secret-32-chars-minimum-here!!',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);
  });

  // ─── Register ────────────────────────────────────────

  describe('register', () => {
    it('should create a new user and return access token', async () => {
      const user = createTestUser({
        email: 'new@test.com',
        displayName: 'New User',
      });
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user!.create as jest.Mock).mockResolvedValue(user);

      const result = await service.register({
        email: 'new@test.com',
        password: 'password123',
        displayName: 'New User',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.expiresIn).toBe('15m');
      expect(result.user.email).toBe('new@test.com');
      expect(result.user.displayName).toBe('New User');
      expect(prisma.user!.create).toHaveBeenCalledTimes(1);
    });

    it('should throw DuplicateError when email already exists', async () => {
      const existingUser = createTestUser({ email: 'existing@test.com' });
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(existingUser);

      await expect(
        service.register({
          email: 'existing@test.com',
          password: 'password123',
          displayName: 'Test',
        }),
      ).rejects.toThrow(DuplicateError);

      expect(prisma.user!.create).not.toHaveBeenCalled();
    });

    it('should hash the password with bcrypt', async () => {
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user!.create as jest.Mock).mockImplementation(({ data }) => ({
        ...createTestUser(),
        ...data,
      }));

      await service.register({
        email: 'new@test.com',
        password: 'myPassword123',
        displayName: 'Test',
      });

      const createCall = (prisma.user!.create as jest.Mock).mock.calls[0][0];
      const savedHash = createCall.data.passwordHash as string;

      // Verify it's a bcrypt hash
      expect(savedHash).toMatch(/^\$2[ab]\$\d{2}\$/);
      // Verify it matches the original password
      expect(await bcrypt.compare('myPassword123', savedHash)).toBe(true);
    });
  });

  // ─── Login ───────────────────────────────────────────

  describe('login', () => {
    it('should return access token for valid credentials', async () => {
      const passwordHash = await bcrypt.hash('correctPassword', 12);
      const user = createTestUser({ email: 'login@test.com', passwordHash });
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(user);
      (prisma.user!.update as jest.Mock).mockResolvedValue(user);

      const result = await service.login({
        email: 'login@test.com',
        password: 'correctPassword',
      });

      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.email).toBe('login@test.com');
    });

    it('should throw ForbiddenError for non-existent email', async () => {
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@test.com', password: 'pass' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError for wrong password', async () => {
      const passwordHash = await bcrypt.hash('correctPassword', 12);
      const user = createTestUser({ passwordHash });
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'wrongPassword' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError for suspended account', async () => {
      const passwordHash = await bcrypt.hash('password', 12);
      const user = createTestUser({ passwordHash, status: 'suspended' });
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(user);

      await expect(
        service.login({ email: user.email, password: 'password' }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('should update lastLoginAt on successful login', async () => {
      const passwordHash = await bcrypt.hash('password', 12);
      const user = createTestUser({ passwordHash });
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(user);
      (prisma.user!.update as jest.Mock).mockResolvedValue(user);

      await service.login({ email: user.email, password: 'password' });

      expect(prisma.user!.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  // ─── Get Profile ─────────────────────────────────────

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = createTestUser();
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        lastLoginAt: null,
        createdAt: user.createdAt,
      });

      const result = await service.getProfile(user.id);

      expect(result.email).toBe(user.email);
      expect(result.displayName).toBe(user.displayName);
    });

    it('should throw NotFoundError for non-existent user', async () => {
      (prisma.user!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});
