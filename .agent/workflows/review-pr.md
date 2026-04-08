---
description: Review code for quality, consistency, and architectural compliance
agent: code-reviewer
---

# Review PR / Code Review

Review code strictly against project architecture rules and coding conventions.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Scope & Context)

**No review output in this phase. Research only.**

1. Read project context (`context/PROJECT.md`, `context/CONVENTIONS.md`, `context/BOUNDARIES.md`)
2. Identify the PR or code changes to review
3. Understand the purpose and scope of the changes
4. Write into `SCRATCHPAD.md`:
   - Review scope (files, modules affected)
   - Change purpose
   - Areas of concern

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

1. Define the review focus areas:
   - Architecture compliance
   - Code quality
   - Framework best practices
   - Database / data layer
   - API design
   - Error handling
   - Testing
   - Security
2. Prioritize areas based on the change scope
3. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to begin the code review, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — REVIEW EXECUTION

**Plan must be APPROVED.**

Execute the review following the approved plan:

### 1. Architecture Compliance
- Module/component structure follows project patterns
- Import boundaries and dependency rules respected
- Path aliases used, no circular dependencies

### 2. Code Quality
- Import ordering, string quoting, consistent style
- Strict typing (no `any` without justification)
- Naming conventions followed, no magic numbers/strings

### 3. Framework Best Practices
- Proper decorators/patterns, correct DI
- Lifecycle hooks, exception/error handling

### 4. Database / Data Layer
- Entity/model definitions, repository pattern
- Relations, cascades, transactions, N+1 prevention

### 5. API Design
- RESTful naming, proper HTTP methods/status codes
- Input validation, response serialization

### 6. Error Handling
- Standard exception classes, consistent format
- No unhandled promise rejections

### 7. Testing
- Tests exist, cover success/failure, proper mocking

### 8. Security
- Input validation, no injection vulnerabilities
- No sensitive data exposure, no hardcoded secrets

### Output Format

Use the review template from `prompts/templates/review-output.md`:
- **🔴 Critical**: Security, breaking changes, major bugs
- **🟡 Warning**: Anti-patterns, performance issues, maintainability
- **🔵 Info**: Minor improvements, style suggestions

### Approval Status
- ✅ **Approved**: Ready to merge
- ⚠️ **Approved with Comments**: Minor issues, can merge with follow-up
- ❌ **Changes Requested**: Must address critical issues before merge
