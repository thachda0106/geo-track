# ADR-003: Starting Architecture — Modular Monolith

**Status**: Accepted  
**Date**: 2026-04-07  
**Deciders**: Architecture Team  

## Context

4 bounded contexts identified. Full microservices = 6-8 separate services, each with its own database and deployment pipeline. Solo developer / small team cannot effectively operate this.

## Decision

**Modular Monolith** with separate processes for:
1. Tracking Ingestion (different scaling: 50K writes/sec)
2. Realtime Gateway (WebSocket connections — different resource profile)

## Rules

1. Each module has its own database schema (no cross-schema queries)
2. Modules communicate via defined service interfaces
3. Cross-module events go through an internal event bus
4. Each module can be extracted by replacing function calls with HTTP/gRPC

## Consequences

- ✅ 3 deployable units instead of 6-8
- ✅ Simple local development
- ✅ Shared connection pool and auth middleware
- ⚠️ Must enforce module boundaries through discipline

## Extraction Triggers

- Tracking ingestion > 10K/sec → extract Tracking Service
- WebSocket connections > 5K → extract Realtime Gateway
- Team > 3 developers → service per team
