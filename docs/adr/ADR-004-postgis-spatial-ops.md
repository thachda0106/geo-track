# ADR-004: Spatial Operations — PostGIS Server-Side

**Status**: Accepted  
**Date**: 2026-04-07  
**Deciders**: Architecture Team  

## Context

Spatial operations (buffer, intersect, contains, distance) can be performed in the database (PostGIS), on the server (Turf.js/JTS), or in the client browser (Turf.js).

## Decision

**PostGIS for all authoritative spatial operations.** Turf.js in the client for display-only previews (e.g., buffer preview ring while drawing).

## Rationale

PostGIS GiST indexes turn O(n) spatial scans into O(log n). For 100K features: 50ms (indexed) vs 5000ms (full scan). PostGIS also handles geodetic projections correctly, unlike Turf.js which approximates on a sphere.

## Consequences

- ✅ Indexed spatial queries — fast at scale
- ✅ Correct geodetic calculations
- ✅ Single source of truth for spatial logic
- ⚠️ Tight coupling to PostgreSQL — acceptable for a spatial system

## Alternatives Rejected

1. **Server-side Turf.js**: Must load all geometries into memory — doesn't scale
2. **Client-side Turf.js only**: Impossible for large datasets, no indexing
