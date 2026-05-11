# ADR-007: Catalog Schema Placement

**Status**: Accepted  
**Date**: 2026-05-11  
**Feature**: File & Folder Management

## Context

Where should the Folder entity and its related tables live relative to the existing Geometry module?

## Options

1. **Existing `geometry` schema** — Add folders table alongside features
2. **New `catalog` schema** — Separate schema for organizational concerns

## Decision

**New `catalog` schema**

## Rationale

- Folders are an organizational axis, not a spatial one
- Separation of concerns: geometry module should not own folder logic
- Future growth: catalog can own additional features (tag taxonomies, saved searches, user collections)
- The existing `geometry` schema already has `features`, `outbox`, `outbox_dlq` — adding folders would blur its responsibility

## Consequences

- Need to add `catalog` to the `schemas` array in Prisma schema
- Need to grant appropriate permissions for the new schema in `scripts/init-db.sql`
- Cross-schema FK from `geometry.features.folder_id` → `catalog.folders.id`
