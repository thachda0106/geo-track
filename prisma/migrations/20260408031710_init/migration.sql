-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "geometry";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "tracking";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "versioning";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'viewer',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."audit_log" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geometry"."features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "geometry_type" VARCHAR(20) NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geometry"."outbox" (
    "id" BIGSERIAL NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(50) NOT NULL DEFAULT 'Feature',
    "payload" JSONB NOT NULL,
    "correlation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versioning"."versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "feature_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "change_type" VARCHAR(20) NOT NULL,
    "snapshot_properties" JSONB NOT NULL DEFAULT '{}',
    "snapshot_name" VARCHAR(255) NOT NULL,
    "diff" JSONB,
    "author_id" UUID NOT NULL,
    "message" TEXT,
    "parent_version_id" UUID,
    "vertex_count" INTEGER,
    "area_sqm" DOUBLE PRECISION,
    "length_m" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versioning"."changesets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "version_ids" UUID[],
    "feature_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "changesets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versioning"."inbox" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "tracking"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "min_interval_ms" INTEGER NOT NULL DEFAULT 1000,
    "max_speed_kmh" REAL NOT NULL DEFAULT 200,
    "accuracy_threshold_m" REAL NOT NULL DEFAULT 50,
    "tracking_mode" VARCHAR(20) NOT NULL DEFAULT 'continuous',
    "total_points" BIGINT NOT NULL DEFAULT 0,
    "total_distance_m" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_location_at" TIMESTAMPTZ,
    "last_lat" DOUBLE PRECISION,
    "last_lng" DOUBLE PRECISION,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking"."tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "segment_index" INTEGER NOT NULL DEFAULT 0,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ,
    "point_count" BIGINT NOT NULL DEFAULT 0,
    "distance_m" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "identity"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "identity"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "identity"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_created_at_idx" ON "identity"."audit_log"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "features_geometry_type_idx" ON "geometry"."features"("geometry_type");

-- CreateIndex
CREATE INDEX "features_created_by_idx" ON "geometry"."features"("created_by");

-- CreateIndex
CREATE INDEX "features_updated_at_idx" ON "geometry"."features"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "outbox_created_at_idx" ON "geometry"."outbox"("created_at");

-- CreateIndex
CREATE INDEX "versions_feature_id_version_number_idx" ON "versioning"."versions"("feature_id", "version_number" DESC);

-- CreateIndex
CREATE INDEX "versions_author_id_created_at_idx" ON "versioning"."versions"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "versions_created_at_idx" ON "versioning"."versions"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "versions_feature_id_version_number_key" ON "versioning"."versions"("feature_id", "version_number");

-- CreateIndex
CREATE INDEX "changesets_author_id_created_at_idx" ON "versioning"."changesets"("author_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "inbox_processed_at_idx" ON "versioning"."inbox"("processed_at");

-- CreateIndex
CREATE INDEX "sessions_device_id_status_idx" ON "tracking"."sessions"("device_id", "status");

-- CreateIndex
CREATE INDEX "sessions_owner_id_created_at_idx" ON "tracking"."sessions"("owner_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "tracks_session_id_segment_index_idx" ON "tracking"."tracks"("session_id", "segment_index");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_session_id_segment_index_key" ON "tracking"."tracks"("session_id", "segment_index");

-- AddForeignKey
ALTER TABLE "identity"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versioning"."versions" ADD CONSTRAINT "versions_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "versioning"."versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking"."tracks" ADD CONSTRAINT "tracks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tracking"."sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add PostGIS Geometry columns natively since Prisma cannot
ALTER TABLE "geometry"."features" ADD COLUMN "geometry" GEOMETRY(Geometry, 4326);
ALTER TABLE "versioning"."versions" ADD COLUMN "snapshot_geometry" GEOMETRY(Geometry, 4326);

-- Create PostGIS indexes
CREATE INDEX "features_geometry_idx" ON "geometry"."features" USING GIST ("geometry");
CREATE INDEX "versions_snapshot_geometry_idx" ON "versioning"."versions" USING GIST ("snapshot_geometry");
