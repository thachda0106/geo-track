---
description: Refactor code for clarity and maintainability without changing behavior
agent: feature-builder
---

# Refactor Feature

Refactor the selected code for clarity and maintainability without changing behavior.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Analysis)

**No code changes in this phase. Analysis only.**

1. Read and comprehend current code
2. Find all references and dependencies of the code being refactored
3. Identify code smells and improvement areas:
   - Long functions (>80 lines)
   - Deep nesting (>3 levels)
   - Repeated code blocks
   - Magic numbers/strings
   - Complex boolean expressions
   - Large modules/classes (>500 lines)
   - API layer with business logic
   - Missing error handling
4. Read project context (`context/PROJECT.md`, `context/CONVENTIONS.md`, `context/BOUNDARIES.md`)
5. Write analysis into `SCRATCHPAD.md`

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Refactoring Strategy)

**Scratchpad must be APPROVED. No code changes in this phase.**

1. Define refactoring strategy based on approved analysis:
   - **Code Clarity** — Extract complex logic into named functions, use descriptive names
   - **DRY** — Extract repeated logic into utilities, create shared services
   - **Type Safety** — Strict typing, leverage inference, extract shared types
   - **Single Responsibility** — Each function/class does one thing
   - **Performance** — Optimize queries, avoid N+1, cache where appropriate
2. For each refactoring:
   - **What** — Describe what is being refactored
   - **Why** — Explain the problem or improvement
   - **How** — Show before/after approach
   - **Impact** — Performance or maintainability gains
3. Risk analysis — what could break?
4. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — TASKS (Refactoring Steps)

**Plan must be APPROVED. No code changes in this phase.**

1. Break the refactoring into ordered steps:
   - [ ] Step 1: Description + files to change
   - [ ] Step 2: Description + files to change
   - [ ] Step N: Update/add tests
2. For each step, specify:
   - What changes
   - Why
   - Expected behavior (must be unchanged)
3. Write into `TASKS.md`

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
Say: "Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin refactoring, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 4 — IMPLEMENTATION (Refactor)

**Tasks must be APPROVED before making any code changes.**

- Refactor step by step in the order defined in `TASKS.md`
- Ensure behavior is unchanged at each step
- Do not introduce scope creep

---

// turbo
## PHASE 5 — TESTING & VERIFICATION

After refactoring:
- Run tests to verify behavior unchanged
- Run type check and lint
- Verify no regressions
