# ADR-002: Tracking Data Storage — TimescaleDB

**Status**: Accepted  
**Date**: 2026-04-07  
**Deciders**: Architecture Team  

## Context

Tracking data is time-series: 10K-50K location points/sec, queried by time range, append-only, with retention requirements.

## Decision

**TimescaleDB** (PostgreSQL extension) for tracking data storage.

## Consequences

- ✅ Auto-partitioning by time (daily chunks)
- ✅ 10-20x compression on time-series data
- ✅ Continuous aggregates for analytics
- ✅ Same SQL interface as PostgreSQL
- ⚠️ Additional extension dependency

## Alternatives Rejected

1. **Plain PostgreSQL**: No auto-partitioning, manual retention management
2. **InfluxDB**: No SQL, no PostGIS, separate infrastructure
3. **Cassandra**: Massive operational complexity for small team
