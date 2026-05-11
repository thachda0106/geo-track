-- ============================================================
-- GeoTrack Database Initialization
-- Runs on first container startup (via docker-entrypoint-initdb.d)
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create schemas (one per bounded context)
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS geometry;
CREATE SCHEMA IF NOT EXISTS versioning;
CREATE SCHEMA IF NOT EXISTS tracking;
CREATE SCHEMA IF NOT EXISTS catalog;

-- Grant usage
GRANT USAGE ON SCHEMA identity TO geotrack;
GRANT USAGE ON SCHEMA geometry TO geotrack;
GRANT USAGE ON SCHEMA versioning TO geotrack;
GRANT USAGE ON SCHEMA tracking TO geotrack;
GRANT USAGE ON SCHEMA catalog TO geotrack;

-- Grant all privileges on tables in schemas
ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA geometry GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA versioning GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracking GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog GRANT ALL ON TABLES TO geotrack;

-- Verify extensions
SELECT PostGIS_Version();
SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';
