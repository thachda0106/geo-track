import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: () => validateEnv(),
      expandVariables: true,
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
