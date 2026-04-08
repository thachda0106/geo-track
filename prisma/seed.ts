import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ═══════════════════════════════════════════════════════
// GeoTrack — Seed Data Script
//
// Creates sample data for local development:
// - 3 users (viewer, editor, admin)
// - Sample features will be created via raw SQL (PostGIS)
//
// Run: npx ts-node prisma/seed.ts
// ═══════════════════════════════════════════════════════

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding GeoTrack database...\n');

  // ─── 1. Create Users ──────────────────────────────────
  const password = await bcrypt.hash('Password123!', 12);

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@geotrack.dev' },
    update: {},
    create: {
      email: 'viewer@geotrack.dev',
      passwordHash: password,
      displayName: 'Demo Viewer',
      role: 'viewer',
      status: 'active',
    },
  });
  console.log(`  ✅ User: ${viewer.email} (${viewer.role})`);

  const editor = await prisma.user.upsert({
    where: { email: 'editor@geotrack.dev' },
    update: {},
    create: {
      email: 'editor@geotrack.dev',
      passwordHash: password,
      displayName: 'Demo Editor',
      role: 'editor',
      status: 'active',
    },
  });
  console.log(`  ✅ User: ${editor.email} (${editor.role})`);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@geotrack.dev' },
    update: {},
    create: {
      email: 'admin@geotrack.dev',
      passwordHash: password,
      displayName: 'Demo Admin',
      role: 'admin',
      status: 'active',
    },
  });
  console.log(`  ✅ User: ${admin.email} (${admin.role})`);

  // ─── 2. Create Sample Features (PostGIS) ──────────────
  // Using raw SQL because Prisma doesn't support PostGIS geometry natively

  const features = [
    {
      name: 'Ho Chi Minh City Center',
      description: 'Central business district marker',
      geometryType: 'Point',
      geoJson: '{"type":"Point","coordinates":[106.6297,10.8231]}',
      tags: ['city', 'marker'],
    },
    {
      name: 'Saigon River Route',
      description: 'River navigation route through the city',
      geometryType: 'LineString',
      geoJson: '{"type":"LineString","coordinates":[[106.6297,10.8231],[106.6450,10.8350],[106.6600,10.8480],[106.6750,10.8600]]}',
      tags: ['route', 'river'],
    },
    {
      name: 'District 1 Boundary',
      description: 'Approximate boundary of District 1',
      geometryType: 'Polygon',
      geoJson: '{"type":"Polygon","coordinates":[[[106.6900,10.7700],[106.7100,10.7700],[106.7100,10.7900],[106.6900,10.7900],[106.6900,10.7700]]]}',
      tags: ['boundary', 'district'],
    },
  ];

  for (const f of features) {
    try {
      await prisma.$queryRawUnsafe(
        `INSERT INTO geometry.features
          (id, name, description, geometry_type, geometry, properties, tags, current_version, created_by, updated_by)
        VALUES
          (gen_random_uuid(), $1, $2, $3,
           ST_SetSRID(ST_GeomFromGeoJSON($4), 4326),
           '{}'::jsonb, $5::text[], 1, $6::uuid, $6::uuid)
        ON CONFLICT DO NOTHING`,
        f.name,
        f.description,
        f.geometryType,
        f.geoJson,
        f.tags,
        editor.id,
      );
      console.log(`  ✅ Feature: ${f.name} (${f.geometryType})`);
    } catch (error) {
      console.log(`  ⚠️  Feature: ${f.name} — skipped (may already exist or PostGIS not ready)`);
    }
  }

  // ─── 3. Create Sample Tracking Session ────────────────

  const session = await prisma.trackingSession.create({
    data: {
      deviceId: '00000000-0000-4000-b000-000000000001',
      ownerId: editor.id,
      status: 'active',
      trackingMode: 'continuous',
      minIntervalMs: 1000,
      maxSpeedKmh: 120,
      accuracyThresholdM: 30,
    },
  });
  console.log(`  ✅ Tracking Session: ${session.id} (${session.status})`);

  console.log('\n🎉 Seed complete!\n');
  console.log('Login credentials for all demo users:');
  console.log('  Email: viewer@geotrack.dev / editor@geotrack.dev / admin@geotrack.dev');
  console.log('  Password: Password123!\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
