# ADR-008: File Upload Strategy (Transient)

**Status**: Accepted  
**Date**: 2026-05-11  
**Feature**: File & Folder Management

## Context

How to handle uploaded GIS files — store them persistently or process and discard?

## Options

1. **Transient** — Parse file, create features, discard raw file
2. **Persistent** — Store raw file in S3/blob storage, then parse

## Decision

**Transient (v1)**

## Rationale

- MVP scope explicitly excludes raw file storage (OUT for v2+)
- Significantly simpler architecture: no S3 dependency, no file cleanup jobs, no versioning of files
- The features created from the file preserve all the information — GeoJSON round-trip via export
- Storage costs avoided (550 GB projection at 3 years)

## Consequences

- Cannot regenerate original file from stored data (export generates new GeoJSON, which may differ in property order, formatting)
- No audit trail of "what file was uploaded at byte level" — only the resulting features
- If v2 adds persistent storage, need a separate `assets` table and S3 integration
- File import uses a transaction: if it fails mid-way, the entire batch is rolled back
