---
description: Add integration with an external API or service
agent: feature-builder
---

# Add API Integration

Add integration with an external API or third-party service.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Exploration)

**No code in this phase. Research only.**

1. Gather requirements from the user:
   - What API/service to integrate?
   - Which endpoints/operations are needed?
   - Authentication method (API key, OAuth, token)?
   - Rate limiting considerations?
2. Analyze existing integrations:
   - Check for existing HTTP client setup
   - Find similar integrations for pattern consistency
   - Review error handling patterns for external calls
3. Read project context (`context/PROJECT.md`, `context/CONVENTIONS.md`, `context/BOUNDARIES.md`)
4. Write findings into `SCRATCHPAD.md`

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Integration Design)

**Scratchpad must be APPROVED. No code in this phase.**

1. Define integration architecture:
   - Service/client structure
   - Error handling and retry strategy
   - Request/response DTOs
   - Authentication handling
   - Timeout configuration
2. Risk analysis (rate limits, downtime, breaking changes)
3. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — TASKS (Breakdown)

**Plan must be APPROVED. No code in this phase.**

1. Break the integration into ordered steps:
   - [ ] Step 1: Create service/client for external API
   - [ ] Step 2: Implement authentication handling
   - [ ] Step 3: Add request/response DTOs
   - [ ] Step 4: Implement error handling and retries
   - [ ] Step 5: Add timeout configuration
   - [ ] Step 6: Write tests
2. Write into `TASKS.md`

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
Say: "Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin implementation, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 4 — IMPLEMENTATION

**Tasks must be APPROVED before writing any code.**

- Implement tasks sequentially per `TASKS.md`
- Never hardcode API keys or secrets
- Use environment variables for configuration
- Implement circuit breaker pattern for critical APIs
- Add structured logging for API calls
- Handle rate limiting gracefully

---

// turbo
## PHASE 5 — TESTING & VALIDATION

After implementation:
- Unit tests with mocked HTTP responses
- Test error scenarios (timeouts, 4xx, 5xx)
- Test retry logic if applicable
- Document the integration in project docs
