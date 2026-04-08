-- ============================================================
-- GeoTrack Database Initialization
-- Runs on first container startup
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create schemas (one per bounded context)
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS geometry;
CREATE SCHEMA IF NOT EXISTS versioning;
CREATE SCHEMA IF NOT EXISTS tracking;

-- Grant usage
GRANT USAGE ON SCHEMA identity TO geotrack;
GRANT USAGE ON SCHEMA geometry TO geotrack;
GRANT USAGE ON SCHEMA versioning TO geotrack;
GRANT USAGE ON SCHEMA tracking TO geotrack;

-- Grant all privileges on tables in schemas
ALTER DEFAULT PRIVILEGES IN SCHEMA identity GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA geometry GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA versioning GRANT ALL ON TABLES TO geotrack;
ALTER DEFAULT PRIVILEGES IN SCHEMA tracking GRANT ALL ON TABLES TO geotrack;

-- Verify PostGIS
SELECT PostGIS_Version();
