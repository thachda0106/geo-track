---
description: Create a new feature module following project architecture and conventions
agent: feature-builder
---

# Create Feature

Create a new module/component following the project's architecture and conventions.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Exploration)

**No code or plans in this phase. Exploration only.**

1. Gather requirements from the user:
   - Module/component name
   - Entity/model fields and types
   - API endpoints or interface (if applicable)
   - Relations with other modules (if any)
2. Use the `analyze-project-structure` skill to understand:
   - Current module layout and patterns
   - Naming conventions in use
   - Existing similar modules to follow as reference
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

## PHASE 2 — PLAN (Architecture)

**Scratchpad must be APPROVED. No code or task lists in this phase.**

1. Define the module structure based on approved scratchpad:
   - Model/entity definition
   - Data access layer (repository/DAO)
   - Business logic layer (service)
   - API layer (controller/handler)
   - Data transfer objects (DTOs/schemas)
   - Tests
2. Define database migration strategy (if applicable)
3. Risk analysis and edge cases
4. Write into `PLAN.md`

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

1. Break the plan into ordered implementation steps:
   - [ ] Task 1: Create model/entity with proper annotations
   - [ ] Task 2: Define DTOs with validation
   - [ ] Task 3: Implement repository/data access layer
   - [ ] Task 4: Create service with business logic
   - [ ] Task 5: Build controller/handler with endpoints
   - [ ] Task 6: Configure module with dependencies
   - [ ] Task 7: Register module in root configuration
   - [ ] Task 8: Create database migration
2. For each task, specify files to create/modify
3. List dependencies between tasks
4. Write into `TASKS.md`

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

- Implement tasks sequentially in the order defined in `TASKS.md`
- Follow existing naming conventions exactly
- Use project path aliases for imports
- Use validation decorators/schemas in DTOs
- Use framework-standard exception/error types
- Use feature/use-case classes for complex operations

---

// turbo
## PHASE 5 — TESTING & VALIDATION

After implementation:
- Write unit tests for service
- Write unit tests for controller
- Run project lint, type check, and full test suite
- Verify the module integrates correctly
