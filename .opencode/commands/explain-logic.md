---
description: Trace and explain the execution flow of a specific code path
---

# Explain Logic

Trace and explain how a specific code path works, from entry point to final output.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Exploration)

**No output or explanation in this phase. Research only.**

1. Identify the entry point:
   - API endpoint / route handler
   - Function / method call
   - Event handler / message consumer
   - CLI command
2. Read all related source files
3. Map the call chain from entry point through all layers
4. Identify external interactions (DB, APIs, file system)
5. Write initial findings into `SCRATCHPAD.md`:
   - Entry point location
   - Files involved
   - Key dependencies
   - Complexity assessment

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Trace Strategy)

**Scratchpad must be APPROVED. No final explanation in this phase.**

1. Define the trace strategy:
   - Execution flow order (A → B → C)
   - Data mutations to track at each step
   - Key decision points (branching logic)
   - Error handling paths to document
2. Decide output format (sequence diagram, step-by-step, or both)
3. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the detailed explanation, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — DETAILED EXPLANATION

**Plan must be APPROVED.**

Produce the full execution trace following the approved plan:

### Execution Flow
```
Entry Point → Step 1 → Step 2 → ... → Output
```

### Detailed Explanation
For each step:
- **What**: What happens at this step
- **Where**: File and function name
- **Data**: What data flows in and out
- **Decisions**: Any branching logic
