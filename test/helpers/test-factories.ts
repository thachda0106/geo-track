import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════
// Test Factory Functions
//
// Create test entities with sensible defaults.
// Override any field via partial parameter.
// ═══════════════════════════════════════════════════════

/**
 * Create a test user data object.
 */
export function createTestUser(overrides?: Partial<{
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>) {
  const now = new Date();
  return {
    id: overrides?.id ?? uuidv4(),
    email: overrides?.email ?? `user-${Date.now()}@test.com`,
    passwordHash: overrides?.passwordHash ?? '$2b$12$mock.hash.value.for.testing.purposes',
    displayName: overrides?.displayName ?? 'Test User',
    role: overrides?.role ?? 'viewer',
    status: overrides?.status ?? 'active',
    lastLoginAt: overrides?.lastLoginAt ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

/**
 * Create a test feature data object (for Geometry module).
 */
export function createTestFeature(overrides?: Partial<{
  id: string;
  name: string;
  description: string | null;
  geometry_type: string;
  geometry: object;
  properties: object;
  tags: string[];
  current_version: number;
  created_by: string;
  updated_by: string;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}>) {
  const now = new Date();
  const id = overrides?.id ?? uuidv4();
  const userId = overrides?.created_by ?? uuidv4();
  return {
    id,
    name: overrides?.name ?? 'Test Feature',
    description: overrides?.description ?? 'A test geometry feature',
    geometry_type: overrides?.geometry_type ?? 'Point',
    geometry: overrides?.geometry ?? { type: 'Point', coordinates: [106.6297, 10.8231] },
    properties: overrides?.properties ?? { category: 'test' },
    tags: overrides?.tags ?? ['test'],
    current_version: overrides?.current_version ?? 1,
    created_by: userId,
    updated_by: overrides?.updated_by ?? userId,
    is_deleted: overrides?.is_deleted ?? false,
    created_at: overrides?.created_at ?? now,
    updated_at: overrides?.updated_at ?? now,
  };
}

/**
 * Create a test tracking session data object.
 */
export function createTestSession(overrides?: Partial<{
  id: string;
  deviceId: string;
  ownerId: string;
  status: string;
  minIntervalMs: number;
  maxSpeedKmh: number;
  accuracyThresholdM: number;
  trackingMode: string;
  totalPoints: bigint;
  totalDistanceM: number;
  lastLocationAt: Date | null;
  lastLat: number | null;
  lastLng: number | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>) {
  const now = new Date();
  return {
    id: overrides?.id ?? uuidv4(),
    deviceId: overrides?.deviceId ?? uuidv4(),
    ownerId: overrides?.ownerId ?? uuidv4(),
    status: overrides?.status ?? 'active',
    minIntervalMs: overrides?.minIntervalMs ?? 1000,
    maxSpeedKmh: overrides?.maxSpeedKmh ?? 200,
    accuracyThresholdM: overrides?.accuracyThresholdM ?? 50,
    trackingMode: overrides?.trackingMode ?? 'continuous',
    totalPoints: overrides?.totalPoints ?? BigInt(0),
    totalDistanceM: overrides?.totalDistanceM ?? 0,
    lastLocationAt: overrides?.lastLocationAt ?? null,
    lastLat: overrides?.lastLat ?? null,
    lastLng: overrides?.lastLng ?? null,
    startedAt: overrides?.startedAt ?? now,
    endedAt: overrides?.endedAt ?? null,
    createdAt: overrides?.createdAt ?? now,
    updatedAt: overrides?.updatedAt ?? now,
  };
}

/**
 * Create test GeoJSON geometries.
 */
export const TestGeometry = {
  point: (lng = 106.6297, lat = 10.8231) => ({
    type: 'Point' as const,
    coordinates: [lng, lat],
  }),

  lineString: (coords?: number[][]) => ({
    type: 'LineString' as const,
    coordinates: coords ?? [
      [106.6297, 10.8231],
      [106.6350, 10.8280],
      [106.6400, 10.8320],
    ],
  }),

  polygon: (coords?: number[][][]) => ({
    type: 'Polygon' as const,
    coordinates: coords ?? [
      [
        [106.6297, 10.8231],
        [106.6400, 10.8231],
        [106.6400, 10.8320],
        [106.6297, 10.8320],
        [106.6297, 10.8231],
      ],
    ],
  }),
};

/**
 * Create a test version data object (for Versioning module).
 */
export function createTestVersion(overrides?: Partial<{
  id: string;
  featureId: string;
  versionNumber: number;
  changeType: string;
  snapshotProperties: object;
  snapshotName: string;
  diff: object | null;
  authorId: string;
  message: string | null;
  parentVersionId: string | null;
  vertexCount: number | null;
  areaSqm: number | null;
  lengthM: number | null;
  createdAt: Date;
}>) {
  return {
    id: overrides?.id ?? uuidv4(),
    featureId: overrides?.featureId ?? uuidv4(),
    versionNumber: overrides?.versionNumber ?? 1,
    changeType: overrides?.changeType ?? 'created',
    snapshotProperties: overrides?.snapshotProperties ?? {},
    snapshotName: overrides?.snapshotName ?? 'Test Feature',
    diff: overrides?.diff ?? null,
    authorId: overrides?.authorId ?? uuidv4(),
    message: overrides?.message ?? 'Initial creation',
    parentVersionId: overrides?.parentVersionId ?? null,
    vertexCount: overrides?.vertexCount ?? null,
    areaSqm: overrides?.areaSqm ?? null,
    lengthM: overrides?.lengthM ?? null,
    createdAt: overrides?.createdAt ?? new Date(),
  };
}
