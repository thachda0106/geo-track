-- ============================================================
-- Restore PostGIS geometry columns
--
-- Migration 20260408031817_y incorrectly dropped the geometry
-- columns that were manually added in the init migration.
-- This migration restores them with proper GiST indexes.
-- ============================================================

-- Restore geometry column on features (if dropped)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'geometry'
      AND table_name = 'features'
      AND column_name = 'geometry'
  ) THEN
    ALTER TABLE geometry.features
      ADD COLUMN geometry GEOMETRY(Geometry, 4326);
    CREATE INDEX features_geometry_idx
      ON geometry.features USING GIST (geometry);
  END IF;
END $$;

-- Restore snapshot_geometry column on versions (if dropped)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'versioning'
      AND table_name = 'versions'
      AND column_name = 'snapshot_geometry'
  ) THEN
    ALTER TABLE versioning.versions
      ADD COLUMN snapshot_geometry GEOMETRY(Geometry, 4326);
    CREATE INDEX versions_snapshot_geometry_idx
      ON versioning.versions USING GIST (snapshot_geometry);
  END IF;
END $$;
