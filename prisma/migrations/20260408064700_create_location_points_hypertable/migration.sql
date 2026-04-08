-- ============================================================
-- TimescaleDB Hypertable: tracking.location_points
--
-- This migration creates the core time-series table for GPS
-- tracking data and converts it to a TimescaleDB hypertable.
--
-- Prerequisites: TimescaleDB extension enabled via init-db.sql
-- ============================================================

-- 1. Enable TimescaleDB (idempotent)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Create location_points table
CREATE TABLE IF NOT EXISTS tracking.location_points (
  time        TIMESTAMPTZ       NOT NULL,
  session_id  UUID              NOT NULL,
  device_id   UUID              NOT NULL,
  lat         DOUBLE PRECISION  NOT NULL,
  lng         DOUBLE PRECISION  NOT NULL,
  altitude    DOUBLE PRECISION,
  speed       DOUBLE PRECISION,
  bearing     DOUBLE PRECISION,
  accuracy    DOUBLE PRECISION,
  is_filtered BOOLEAN           NOT NULL DEFAULT FALSE
);

-- 3. Convert to hypertable (partition by time, 1-day chunks)
-- chunk_time_interval = 1 day optimized for typical tracking queries (last 24h)
SELECT create_hypertable(
  'tracking.location_points',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- 4. Create indexes optimized for TimescaleDB chunk pruning
-- Session lookup: get all points for a specific session in time order
CREATE INDEX IF NOT EXISTS idx_loc_session_time
  ON tracking.location_points (session_id, time DESC);

-- Device lookup: get recent points across sessions for a device
CREATE INDEX IF NOT EXISTS idx_loc_device_time
  ON tracking.location_points (device_id, time DESC);

-- Filter index: skip filtered outlier points in queries
CREATE INDEX IF NOT EXISTS idx_loc_not_filtered
  ON tracking.location_points (session_id, time DESC)
  WHERE is_filtered = FALSE;

-- 5. Add PostGIS geometry column (generated from lat/lng)
-- Uses a plain geometry column instead of GENERATED ALWAYS AS for
-- broader compatibility with TimescaleDB continuous aggregates
ALTER TABLE tracking.location_points
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- Trigger to auto-populate geom from lat/lng
CREATE OR REPLACE FUNCTION tracking.set_location_geom()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_location_geom ON tracking.location_points;
CREATE TRIGGER trg_set_location_geom
  BEFORE INSERT ON tracking.location_points
  FOR EACH ROW
  EXECUTE FUNCTION tracking.set_location_geom();

-- Spatial index on generated geometry
CREATE INDEX IF NOT EXISTS idx_loc_geom
  ON tracking.location_points USING GIST (geom);

-- 6. Enable compression (after 7 days)
-- Segment by session_id so each session's data compresses together
ALTER TABLE tracking.location_points
  SET (timescaledb.compress,
       timescaledb.compress_segmentby = 'session_id',
       timescaledb.compress_orderby = 'time DESC');

SELECT add_compression_policy(
  'tracking.location_points',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- 7. Retention policy (drop chunks older than 1 year)
SELECT add_retention_policy(
  'tracking.location_points',
  INTERVAL '1 year',
  if_not_exists => TRUE
);
