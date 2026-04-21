---
description: Master AI-assisted development lifecycle — plan, review, execute, verify
---

# AI Workflow — Scratchpad → Plan → Tasks → Execute → Verify → Reflect

This is the **mandatory workflow** for all non-trivial tasks. It defines the execution lifecycle that any AI assistant must follow. **Human approval is required between every phase.**

> [!CAUTION]
> You must STOP after each phase and wait for explicit human approval.
> You must NEVER run multiple phases in a single response.
> Violating these rules is a critical failure.

---

## PHASE 1 — SCRATCHPAD

**You are NOT allowed to write code or generate plans in this phase.**

1. Read project context files (`context/PROJECT.md`, `context/CONVENTIONS.md`, `context/BOUNDARIES.md`)
2. Analyze the codebase relevant to the task
3. Understand the problem deeply
4. Gather all necessary context
5. Create a scratchpad using `prompts/templates/scratchpad.md` with:
   - Current Objective
   - Context / Scope
   - Architecture Invariants
   - Decisions Made (if any)
   - Risks / Open Questions

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
DO NOT PROCEED. STOP HERE.

Say to the user:
"Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."

WAIT for explicit approval before continuing.
```

---

## PHASE 2 — PLAN

**Scratchpad must be APPROVED before starting this phase.**
**You are NOT allowed to write code or generate task breakdowns in this phase.**

Based strictly on the approved scratchpad:

1. Create a detailed implementation plan using `prompts/templates/plan.md`:
   - Architecture changes
   - Modules / files involved
   - Risk analysis
   - Edge cases
   - Validation strategy
   - Explicit non-goals
2. Do NOT write final code yet
3. Do NOT break down into tasks yet
4. If the plan contradicts scratchpad invariants → STOP and request scratchpad update

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
DO NOT PROCEED. STOP HERE.

Say to the user:
"Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."

WAIT for explicit approval before continuing.
```

---

## PHASE 3 — TASK BREAKDOWN

**Plan must be APPROVED before starting this phase.**
**You are NOT allowed to write code in this phase.**

Based strictly on the approved plan:

1. Create an ordered task list using `prompts/templates/tasks.md`:
   - Numbered implementation steps
   - Files to create, modify, or delete per step
   - Dependencies between steps
   - Expected output per step
2. Each task should be small and independently verifiable

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
DO NOT PROCEED. STOP HERE.

Say to the user:
"Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin implementation, or provide feedback."

WAIT for explicit approval before continuing.
```

---

## PHASE 4 — IMPLEMENTATION

**Tasks must be APPROVED before starting this phase.**

Proceed with implementation:
- Follow scratchpad invariants strictly
- Implement one task at a time in the order defined in `TASKS.md`
- If a decision changes → update scratchpad FIRST and request re-approval
- Do not introduce scope creep
- Do not skip tasks

---

## PHASE 5 — TESTING

After implementation is complete:
- Run tests relevant to the changes
- Run lint / type checks
- Verify behavior matches scratchpad objective
- Generate or update tests as needed

If something deviates:
- Explain why
- Propose scratchpad update
- Check logs / metrics (if applicable)

---

## PHASE 6 — FINAL REVIEW & REFLECT

After testing is complete:

1. **Review execution** — Did implementation match the plan? Note deviations.
2. **Assess quality** — Unexpected complexities? Could the approach be improved?
3. **Capture learnings** — Document insights using `prompts/templates/reflection.md`
4. **Suggest improvements** — If workflows, skills, or conventions could be refined, note suggestions for human review.

> This step is optional for trivial tasks but mandatory for multi-file changes and architectural decisions.

---

## Dev Checklist (Mental Model)

Before coding, ask:
- ❓ Do we have a scratchpad? Is it approved?
- ❓ Do we have a plan? Is it approved?
- ❓ Do we have tasks? Are they approved?
- ❓ Are invariants explicit? Is scope locked?

If any answer is NO → **STOP. Do not write any code.**

After coding, ask:
- ❓ Did we verify the changes?
- ❓ Did we reflect on what we learned?

> **GOLDEN RULE**: Scratchpad is the source of truth. Plans explain HOW. Tasks define WHAT. Code is the last step. Human approval gates are mandatory between each phase.
