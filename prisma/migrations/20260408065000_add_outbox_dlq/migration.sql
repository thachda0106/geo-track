-- ============================================================
-- Outbox Reliability: retry tracking + Dead Letter Queue
--
-- Adds retry tracking columns to the outbox table and creates
-- a DLQ table for events that have exhausted all retries.
-- This is infrastructure for Phase 7 reliability patterns.
-- ============================================================

-- 1. Add retry tracking columns to outbox
ALTER TABLE geometry.outbox
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Index for fetching events that need retry (exclude exhausted events)
CREATE INDEX IF NOT EXISTS idx_outbox_retry_pending
  ON geometry.outbox (created_at ASC)
  WHERE published_at IS NULL AND retry_count < 5;

-- 2. Dead Letter Queue table
CREATE TABLE IF NOT EXISTS geometry.outbox_dlq (
  id             BIGSERIAL     PRIMARY KEY,
  original_id    BIGINT        NOT NULL,
  event_type     VARCHAR(100)  NOT NULL,
  aggregate_id   UUID          NOT NULL,
  aggregate_type VARCHAR(50)   NOT NULL DEFAULT 'Unknown',
  payload        JSONB         NOT NULL,
  correlation_id UUID          NOT NULL,
  error_message  TEXT          NOT NULL,
  retry_count    INTEGER       NOT NULL,
  original_created_at TIMESTAMPTZ NOT NULL,
  moved_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for DLQ monitoring and replay
CREATE INDEX IF NOT EXISTS idx_outbox_dlq_moved
  ON geometry.outbox_dlq (moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_dlq_event_type
  ON geometry.outbox_dlq (event_type, moved_at DESC);
