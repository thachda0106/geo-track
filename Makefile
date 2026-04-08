# ═══════════════════════════════════════════════════════
# GeoTrack — Developer Makefile
#
# Convenience wrapper for common commands.
# Run `make help` to see all available targets.
# ═══════════════════════════════════════════════════════

.PHONY: help dev build test test-cov test-integration test-e2e lint \
        docker-build docker-up docker-down db-migrate db-seed db-studio \
        clean

# Default target
.DEFAULT_GOAL := help

# ─── Development ──────────────────────────────────────

dev: ## Start development server (hot reload)
	npm run start:dev

build: ## Build for production
	npm run build

clean: ## Remove build artifacts
	rm -rf dist coverage tmp

# ─── Testing ─────────────────────────────────────────

test: ## Run unit tests
	npm run test

test-cov: ## Run tests with coverage report
	npm run test:cov

test-integration: ## Run integration tests
	npm run test:integration

test-e2e: ## Run end-to-end tests
	npm run test:e2e

test-all: test test-integration ## Run all test suites

# ─── Code Quality ────────────────────────────────────

lint: ## Lint and auto-fix
	npm run lint

typecheck: ## TypeScript type checking (no emit)
	npx tsc --noEmit

check: lint typecheck test ## Run all checks (lint + typecheck + test)

# ─── Docker ──────────────────────────────────────────

docker-build: ## Build Docker image locally
	docker build -t geotrack:local .

docker-up: ## Start infrastructure (PostgreSQL, Redis, Redpanda)
	npm run docker:up

docker-down: ## Stop infrastructure
	npm run docker:down

docker-logs: ## Follow infrastructure logs
	docker-compose logs -f

# ─── Database ────────────────────────────────────────

db-generate: ## Generate Prisma client
	npm run db:generate

db-migrate: ## Run database migrations
	npm run db:migrate

db-seed: ## Seed sample data
	npm run db:seed

db-studio: ## Open Prisma Studio
	npm run db:studio

db-reset: ## Reset database (DROP + recreate + migrate + seed)
	npx prisma migrate reset --force

# ─── CI/CD ───────────────────────────────────────────

ci: ## Simulate CI pipeline locally
	@echo "═══ Lint & Type Check ═══"
	$(MAKE) lint
	$(MAKE) typecheck
	@echo "═══ Tests ═══"
	$(MAKE) test
	@echo "═══ Build ═══"
	$(MAKE) build
	@echo "═══ Docker Build ═══"
	$(MAKE) docker-build
	@echo "✅ CI simulation passed"

audit: ## Run security audit
	npm audit --audit-level=high

# ─── Help ────────────────────────────────────────────

help: ## Show this help
	@echo "GeoTrack — Available Commands"
	@echo "═══════════════════════════════════════════"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
