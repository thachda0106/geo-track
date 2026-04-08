-- ============================================================
-- Continuous Aggregates: 5-minute and 1-hour downsampled views
--
-- These materialized views auto-refresh from the hypertable,
-- providing instant queries for dashboards and trail previews
-- without scanning millions of raw points.
--
-- Query pattern examples:
--   SELECT * FROM tracking.location_5min WHERE session_id = $1
--   SELECT * FROM tracking.location_1hr  WHERE device_id  = $1
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Five-minute aggregate
-- ──────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS tracking.location_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', time) AS bucket,
  session_id,
  device_id,
  AVG(lat)     AS avg_lat,
  AVG(lng)     AS avg_lng,
  AVG(speed)   AS avg_speed,
  MAX(speed)   AS max_speed,
  AVG(bearing) AS avg_bearing,
  COUNT(*)     AS point_count,
  MAX(accuracy) AS worst_accuracy,
  MIN(time)    AS first_time,
  MAX(time)    AS last_time
FROM tracking.location_points
WHERE is_filtered = FALSE
GROUP BY bucket, session_id, device_id
WITH NO DATA;

-- Refresh policy: fills in data every 5 minutes
-- start_offset: re-process last 1 hour (handles late-arriving data)
-- end_offset: don't aggregate the most recent 5 minutes (still receiving data)
SELECT add_continuous_aggregate_policy('tracking.location_5min',
  start_offset   => INTERVAL '1 hour',
  end_offset     => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists  => TRUE
);

-- Index for session lookup on the aggregate
CREATE INDEX IF NOT EXISTS idx_loc_5min_session
  ON tracking.location_5min (session_id, bucket DESC);

-- ──────────────────────────────────────────────────────────────
-- 2. One-hour aggregate
-- ──────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS tracking.location_1hr
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  session_id,
  device_id,
  AVG(lat)     AS avg_lat,
  AVG(lng)     AS avg_lng,
  AVG(speed)   AS avg_speed,
  MAX(speed)   AS max_speed,
  COUNT(*)     AS point_count,
  MIN(time)    AS first_time,
  MAX(time)    AS last_time
FROM tracking.location_points
WHERE is_filtered = FALSE
GROUP BY bucket, session_id, device_id
WITH NO DATA;

-- Refresh policy: fills in data every hour
-- start_offset: re-process last 1 day (handles late-arriving data)
-- end_offset: don't aggregate the most recent 1 hour
SELECT add_continuous_aggregate_policy('tracking.location_1hr',
  start_offset   => INTERVAL '1 day',
  end_offset     => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists  => TRUE
);

-- Index for session lookup on the aggregate
CREATE INDEX IF NOT EXISTS idx_loc_1hr_session
  ON tracking.location_1hr (session_id, bucket DESC);

-- Index for device lookup (cross-session queries)
CREATE INDEX IF NOT EXISTS idx_loc_1hr_device
  ON tracking.location_1hr (device_id, bucket DESC);
