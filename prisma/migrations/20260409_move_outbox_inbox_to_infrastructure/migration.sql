-- Create shared infrastructure schema
CREATE SCHEMA IF NOT EXISTS "infrastructure";

-- Move outbox and inbox tables to infrastructure schema
ALTER TABLE "geometry"."outbox" SET SCHEMA "infrastructure";
ALTER TABLE "geometry"."outbox_dlq" SET SCHEMA "infrastructure";
ALTER TABLE "versioning"."inbox" SET SCHEMA "infrastructure";
