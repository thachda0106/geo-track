-- Create catalog schema
CREATE SCHEMA IF NOT EXISTS catalog;

-- Enable pg_trgm for GIN index on folder path
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Folders ──────────────────────────────────────────────────

CREATE TABLE catalog.folders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    parent_id       UUID REFERENCES catalog.folders(id) ON DELETE SET NULL,
    owner_id        UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    description     TEXT,
    path            TEXT NOT NULL,
    level           INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    version         INTEGER NOT NULL DEFAULT 1,
    feature_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT folders_max_depth CHECK (level <= 10),
    CONSTRAINT folders_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 255)
);

CREATE INDEX idx_folders_parent ON catalog.folders (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_folders_owner ON catalog.folders (owner_id);
CREATE INDEX idx_folders_path ON catalog.folders USING gin (path gin_trgm_ops);
CREATE INDEX idx_folders_level ON catalog.folders (level);
CREATE INDEX idx_folders_sort ON catalog.folders (parent_id, sort_order);
CREATE UNIQUE INDEX idx_folders_unique_name_per_parent ON catalog.folders (parent_id, name)
    WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX idx_folders_unique_name_root ON catalog.folders (owner_id, name)
    WHERE parent_id IS NULL;

-- ─── Import Jobs ──────────────────────────────────────────────

CREATE TABLE catalog.import_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id       UUID NOT NULL REFERENCES catalog.folders(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES identity.users(id),
    file_name       VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    file_format     VARCHAR(20) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'processing',
    features_total  INTEGER NOT NULL DEFAULT 0,
    features_created INTEGER NOT NULL DEFAULT 0,
    features_failed  INTEGER NOT NULL DEFAULT 0,
    errors          JSONB,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT import_jobs_format_check CHECK (file_format IN ('geojson', 'csv')),
    CONSTRAINT import_jobs_status_check CHECK (status IN ('processing', 'completed', 'failed', 'partial'))
);

CREATE INDEX idx_import_jobs_folder ON catalog.import_jobs (folder_id);
CREATE INDEX idx_import_jobs_owner ON catalog.import_jobs (owner_id);
CREATE INDEX idx_import_jobs_status ON catalog.import_jobs (status);

-- ─── Export Jobs ──────────────────────────────────────────────

CREATE TABLE catalog.export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id       UUID NOT NULL REFERENCES catalog.folders(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES identity.users(id),
    file_format     VARCHAR(20) NOT NULL DEFAULT 'geojson',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    feature_count   INTEGER NOT NULL DEFAULT 0,
    file_size_bytes INTEGER,
    errors          JSONB,
    download_url    TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT export_jobs_format_check CHECK (file_format IN ('geojson')),
    CONSTRAINT export_jobs_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_export_jobs_folder ON catalog.export_jobs (folder_id);
CREATE INDEX idx_export_jobs_owner ON catalog.export_jobs (owner_id);
CREATE INDEX idx_export_jobs_status ON catalog.export_jobs (status);

-- ─── Geometry Schema Extension ───────────────────────────────

ALTER TABLE geometry.features
    ADD COLUMN folder_id UUID REFERENCES catalog.folders(id) ON DELETE SET NULL;

CREATE INDEX idx_features_folder ON geometry.features (folder_id)
    WHERE folder_id IS NOT NULL;
