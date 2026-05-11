# ADR-006: Folder Hierarchy Model

**Status**: Accepted  
**Date**: 2026-05-11  
**Feature**: File & Folder Management

## Context

Need to store hierarchical folder relationships with support for subtree queries (get all descendants), move operations, depth limiting, and breadcrumb generation.

## Options

1. **Adjacency List** — Each folder has `parentId` pointing to parent
2. **Materialized Path** — Store full path string: `root/uuid1/uuid2/uuid3`
3. **Nested Sets** — Left/right values for subtree queries
4. **Hybrid** — Adjacency list + materialized path (store both)

## Decision

**Hybrid — Adjacency list (`parentId`) + Materialized Path (`path` column)**

## Rationale

- Adjacency list is best for move operations (just update parentId + recalculate path for subtree)
- Materialized path enables fast breadcrumb (`path` split → human-readable names via join)
- Materialized path enables fast "all descendants" queries (`path LIKE 'root/uuid1/%'`)
- Nested sets are expensive to maintain on move operations (reindex entire tree)
- PostgreSQL can index the path column with a GIN or B-tree index

## Consequences

- Move operation requires updating path for entire subtree — acceptable for typical depth (max 10)
- Path length is bounded at ~330 chars (36 chars × 10 levels + separators)
- Need to maintain path consistency — handled at application level in `updateSubtreePaths()`
