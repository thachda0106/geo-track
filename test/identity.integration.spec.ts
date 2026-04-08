import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaService,
  PrismaModule,
  ForbiddenError,
  DuplicateError,
} from '@app/core';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { RegisterUserUseCase } from '../src/modules/identity/application/use-cases/register-user.use-case';
import { LoginUserUseCase } from '../src/modules/identity/application/use-cases/login-user.use-case';
import { IdentityQueriesService } from '../src/modules/identity/application/use-cases/queries/identity-queries.service';

describe('Identity Integration (Integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let registerUseCase: RegisterUserUseCase;
  let loginUseCase: LoginUserUseCase;
  let queriesService: IdentityQueriesService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        IdentityModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    registerUseCase = moduleRef.get<RegisterUserUseCase>(RegisterUserUseCase);
    loginUseCase = moduleRef.get<LoginUserUseCase>(LoginUserUseCase);
    queriesService = moduleRef.get<IdentityQueriesService>(
      IdentityQueriesService,
    );

    // Clean up
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email LIKE '%test.integration%'`,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email LIKE '%test.integration%'`,
    );
    await moduleRef.close();
  });

  describe('Registration & Login', () => {
    it('should register a new user successfully', async () => {
      const email = 'new-user@test.integration.com';
      const result = await registerUseCase.execute({
        email,
        password: 'Password123!',
        displayName: 'Test Integration User',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe(email);
    });

    it('should throw DuplicateError upon registering existing user', async () => {
      const email = 'duplicate-user@test.integration.com';
      await registerUseCase.execute({
        email,
        password: 'Password123!',
        displayName: 'Original User',
      });

      await expect(
        registerUseCase.execute({
          email,
          password: 'Password123!',
          displayName: 'Duplicate User',
        }),
      ).rejects.toThrow(DuplicateError);
    });

    it('should login valid user', async () => {
      const email = 'login-user@test.integration.com';
      await registerUseCase.execute({
        email,
        password: 'ValidPassword123!',
        displayName: 'Login User',
      });

      const result = await loginUseCase.execute({
        email,
        password: 'ValidPassword123!',
      });
      expect(result.accessToken).toBeDefined();
    });

    it('should block incorrect login password', async () => {
      const email = 'bad-login-user@test.integration.com';
      await registerUseCase.execute({
        email,
        password: 'ValidPassword123!',
        displayName: 'Bad Login User',
      });

      await expect(
        loginUseCase.execute({
          email,
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('Profile Query', () => {
    it('should get correct profile via CQRS', async () => {
      const email = 'profile-user@test.integration.com';
      const result = await registerUseCase.execute({
        email,
        password: 'Password123!',
        displayName: 'Profile User',
      });

      const profile = await queriesService.getProfile(result.user.id);
      expect(profile.email).toBe(email);
      expect(profile.role).toBe('viewer');
    });
  });
});
