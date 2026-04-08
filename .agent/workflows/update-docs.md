---
description: Update project documentation to match current codebase state
agent: doc-keeper
---

# Update Documentation

Update project documentation to match the current codebase state.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Audit)

**No documentation changes in this phase. Audit only.**

1. Identify documentation scope:
   - API documentation
   - Architecture diagrams
   - README / onboarding guides
   - Code comments
   - Configuration docs
2. Read current code structure and patterns
3. Compare with existing documentation
4. Identify gaps, inaccuracies, or outdated sections
5. Write findings into `SCRATCHPAD.md`:
   - Docs that need updating
   - Gaps found
   - Inaccuracies found

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Update Strategy)

**Scratchpad must be APPROVED. No documentation changes in this phase.**

1. Define what to update and in what order:
   - Files to modify
   - Sections to add, update, or remove
   - Priority (critical inaccuracies first)
2. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — TASKS (Update Steps)

**Plan must be APPROVED. No documentation changes in this phase.**

1. Break updates into ordered steps:
   - [ ] Step 1: Fix inaccurate descriptions in [file]
   - [ ] Step 2: Add missing section to [file]
   - [ ] Step 3: Remove references to deleted features
   - [ ] Step 4: Update code examples
   - [ ] Step 5: Verify all file paths referenced exist
2. Write into `TASKS.md`

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
Say: "Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin updating documentation, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 4 — IMPLEMENTATION

**Tasks must be APPROVED before making any changes.**

- Update documentation per `TASKS.md`
- Do NOT modify production code — documentation only
- If code needs fixing, escalate to Bug Hunter or Feature Builder
- Keep documentation concise and actionable
- Use consistent formatting throughout

---

## PHASE 5 — VERIFICATION

After updates:
- Cross-check with actual code
- Verify all code examples work
- Ensure all file paths referenced exist
