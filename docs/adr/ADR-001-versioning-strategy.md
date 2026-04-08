# ADR-001: Versioning Strategy — Snapshot + Diff Hybrid

**Status**: Accepted  
**Date**: 2026-04-07  
**Deciders**: Architecture Team  

## Context

Geometries need full version history with the ability to view any past state, compute diffs between versions, and revert to previous versions.

## Decision

**Hybrid approach** — store full GeoJSON snapshot per version + pre-computed diff from previous version.

## Consequences

- ✅ O(1) read for any version (no event replay)
- ✅ Pre-computed diffs for fast comparison UI
- ✅ Simple revert: copy snapshot → new version
- ⚠️ Higher storage cost (~30KB per version vs ~5KB for events-only)
- 📊 50GB/year for versions — within budget

## Alternatives Rejected

1. **Pure Event Sourcing**: Too complex for GeoJSON; reconstructing geometry from vertex-move events is impractical
2. **Snapshot-Only (no diff)**: Diffs must be computed on every read — expensive for large geometries
