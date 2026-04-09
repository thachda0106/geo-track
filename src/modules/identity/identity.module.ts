import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';

import { IdentityController } from './presentation/identity.controller';
import { JwtStrategy } from '@app/core';

// Use Cases & Queries
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { LoginUserUseCase } from './application/use-cases/login-user.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { PurgeExpiredTokensUseCase } from './application/use-cases/purge-expired-tokens.use-case';
import { IdentityQueriesService } from './application/use-cases/queries/identity-queries.service';

// Repository Ports
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';
import { REFRESH_TOKEN_REPOSITORY } from './domain/repositories/refresh-token.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/persistence/prisma-refresh-token.repository';

// Security Ports
import { PASSWORD_SERVICE } from './application/security/password.service';
import { TOKEN_SERVICE } from './application/security/token.service';
import { BcryptPasswordService } from './infrastructure/security/bcrypt-password.service';
import { NestJwtTokenService } from './infrastructure/security/nest-jwt-token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow('JWT_ACCESS_EXPIRATION'),
          algorithm: 'HS256' as const,
        },
      }),
    }),
  ],
  controllers: [IdentityController],
  providers: [
    // Application
    RegisterUserUseCase,
    LoginUserUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    PurgeExpiredTokensUseCase,
    IdentityQueriesService,

    // Infrastructure Adapters
    {
      provide: USER_REPOSITORY,
      useClass: PrismaUserRepository,
    },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    {
      provide: PASSWORD_SERVICE,
      useClass: BcryptPasswordService,
    },
    {
      provide: TOKEN_SERVICE,
      useClass: NestJwtTokenService,
    },
    JwtStrategy,
  ],
  exports: [JwtModule],
})
export class IdentityModule {}
