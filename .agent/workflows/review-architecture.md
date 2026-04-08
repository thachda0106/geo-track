---
description: Review code strictly against project architecture rules and call out violations
agent: code-reviewer
---

# Review Architecture

Review the codebase against the project's architecture rules as defined in `context/PROJECT.md` and `context/CONVENTIONS.md`.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Scope & Context)

**No review output in this phase. Research only.**

1. Read project context (`context/PROJECT.md`, `context/CONVENTIONS.md`, `context/BOUNDARIES.md`)
2. Identify what to review:
   - Which modules/components to check
   - What rules apply (directory structure, imports, naming, layers)
3. Catalog the architecture rules to validate against
4. Write into `SCRATCHPAD.md`:
   - Review scope
   - Architecture rules to check
   - Files/modules to examine

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the review phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Review Strategy)

**Scratchpad must be APPROVED. No review output in this phase.**

1. Define the review strategy:
   - Order of checks (directory → imports → naming → layers → DI)
   - Priority areas (known problem spots vs. full scan)
2. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to begin the architecture review, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — REVIEW EXECUTION

**Plan must be APPROVED.**

Execute the review following the approved plan:

### What to Check

- **Directory Structure**: Files in correct locations, module boundaries respected, naming patterns match
- **Import Boundaries**: No cross-boundary imports, path aliases used, no circular dependencies
- **Module Structure**: Separation of concerns (controller → service → repository), business logic in correct layer
- **Dependency Injection**: Constructor injection, no circular dependencies, providers registered correctly
- **Naming Conventions**: Files, classes, and variables follow project patterns

### Validation Checklist

- [ ] Import from wrong level
- [ ] Missing path aliases (deep relative imports)
- [ ] Wrong directory structure
- [ ] Incorrect naming
- [ ] Circular dependencies
- [ ] Business logic in API layer
- [ ] Missing input validation
- [ ] Test files in wrong location
- [ ] Hardcoded values

### Output Format

For each violation:
- **File**: Path to file
- **Line**: Line number(s)
- **Rule**: Which architecture rule is violated
- **Impact**: Why this matters
- **Fix**: How to resolve

### Architecture Score

Rate compliance: **Pass** | **Minor Issues** | **Major Violations**
