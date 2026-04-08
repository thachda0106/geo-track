import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RedpandaContainer,
  StartedRedpandaContainer,
} from '@testcontainers/redpanda';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

export class IntegrationTestEnv {
  static pg: StartedPostgreSqlContainer;
  static redpanda: StartedRedpandaContainer;

  static async start() {
    // Spin up TimescaleDB with PostGIS included
    this.pg = await new PostgreSqlContainer(
      'timescale/timescaledb-postgis:latest-pg15',
    )
      .withDatabase('geo_tracking_test')
      .withUser('test_usr')
      .withPassword('test_pass')
      .withExposedPorts(5432)
      .start();

    // Redpanda is significantly faster to boot than Kafka for testing
    this.redpanda = await new RedpandaContainer(
      'docker.redpanda.com/redpandadata/redpanda:latest',
    ).start();

    // Dynamically inject connection strings into the running node environment
    process.env.DATABASE_URL = this.pg.getConnectionUri();
    process.env.KAFKA_BROKERS = this.redpanda.getBootstrapServers();

    // Execute schema pushes synchronously before NestJS boot
    execSync('npx prisma migrate reset --force --skip-seed', {
      stdio: 'inherit',
    });
  }

  static async stop() {
    await this.pg?.stop();
    await this.redpanda?.stop();
  }

  static async purgeData(prismaClient: PrismaClient) {
    // High-speed state destruction between tests. DO NOT restart containers!
    await prismaClient.$executeRawUnsafe(`
      TRUNCATE TABLE current_location, location_history RESTART IDENTITY CASCADE;
    `);
  }
}
