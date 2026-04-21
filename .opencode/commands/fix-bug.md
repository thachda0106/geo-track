---
description: Systematically diagnose and fix bugs in the codebase
agent: bug-hunter
---

# Fix Bug

Systematically diagnose and fix bugs following the Bug Hunter agent protocol.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Diagnosis)

**No code changes in this phase. Investigation only.**

1. Read the bug description/error message carefully
2. Identify affected functionality
3. Determine reproduction steps
4. Check if it's a regression (did it work before?)
5. Use error stack trace to find source
6. Search for relevant code patterns
7. Check related modules and layers
8. Review recent changes (`git blame`/`git log`)
9. Diagnose root cause — categorize the bug:
   - **Request Lifecycle**: Middleware, guard failures, interceptor problems
   - **Dependency Injection**: Missing providers, circular dependencies
   - **Database/ORM**: Query errors, mapping issues, migration problems
   - **Type Errors**: Type mismatches, null/undefined, incorrect assertions
   - **Async Issues**: Unhandled promises, race conditions
   - **Validation**: Incorrect validation, missing checks
   - **API/Data**: Wrong endpoint, incorrect format, missing error handling
10. Write all findings into `SCRATCHPAD.md` including:
    - **Symptom**: What's wrong
    - **Root Cause**: Why it's happening
    - **Impact**: What's affected

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Fix Strategy)

**Scratchpad must be APPROVED. No code changes in this phase.**

1. Based on the approved diagnosis, plan the fix:
   - Minimal change needed
   - Side effects and edge cases
   - Files to modify
   - Risk of breaking other features
   - Verification strategy
2. Document:
   - **Approach**: How to fix it
   - **Changes**: What code will change
   - **Trade-offs**: Any considerations
3. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — TASKS (Fix Steps)

**Plan must be APPROVED. No code changes in this phase.**

1. Break the fix into ordered steps:
   - [ ] Step 1: Description + files to change
   - [ ] Step 2: Description + files to change
   - [ ] Step N: Add regression test
2. For each step, specify:
   - What changes
   - Why
   - Expected result
3. Write into `TASKS.md`

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
Say: "Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin implementing the fix, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 4 — IMPLEMENTATION (Apply Fix)

**Tasks must be APPROVED before making any code changes.**

- Make targeted changes (avoid over-engineering)
- Add defensive checks if needed
- Update types if necessary
- Add comments for non-obvious fixes
- Implement in the order defined in `TASKS.md`

---

// turbo
## PHASE 5 — TESTING & VERIFICATION

After the fix is implemented:
- Test the specific bug scenario
- Test related functionality
- Run unit/integration tests
- Check for new type errors
- Verify no regressions

### Prevention
- Document how to avoid similar bugs in the future
