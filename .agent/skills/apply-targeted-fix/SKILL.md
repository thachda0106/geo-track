---
name: apply-targeted-fix
description: Modify, create, or delete code files with minimal, surgical changes.
category: debug
inputs:
  - root_cause_analysis
  - plan
  - target_files
outputs:
  - modified_source_files
  - confirmation_of_changes
---

# Skill: apply-targeted-fix

## When to Use

Use after the root cause of a bug or a feature requirement has been clearly identified and located. This skill focuses on code modification.

## Step-by-Step Procedure

1. **Review Target Context**: Read the file content surrounding the area to be changed to ensure surrounding logic is understood.

2. **Apply Edits**:
   - Create NEW files with full content
   - For existing files, replace only the targeted content
   - For scattered edits in one file, edit multiple locations in a single operation
   - Delete obsolete files if needed
   - Ensure syntax correctness

3. **Local Check**: Verify the code change visually looks correct and adheres to existing style.

4. **Update Related Code**: If function signatures changed, update all callers.

## Decision Rules

- **If** creating a file → ensure parent directory exists
- **If** the fix is complex (>20 lines) → break into smaller named steps
- **If** the file is huge → only read relevant chunks
- **If** fix requires a new dependency → check existing alternatives first

## Execution Rules — SURGICAL FIX ONLY

### ALLOWED
- Fix the specific bug or implement the specific feature identified
- Update function signatures and their direct callers
- Ensure syntax correctness

### FORBIDDEN
- **NO Architecture Changes** — do not restructure modules
- **NO Refactoring** — do not clean up code outside fix scope
- **NO New Dependencies** — use existing libraries unless explicitly required
- **NO Performance Optimizations** — unless that is the specific bug
- **NO Code Style Changes** — match existing style
- **NO "While I'm Here" Changes** — fix only what was diagnosed

### Scope Lock Rules
- If fix requires changing > 3 files → question if scope is too broad
- If adding new patterns not used elsewhere → question if it fits the codebase
- If tempted to refactor → STOP, that's out of scope

## Non-Goals

- Designing the architecture
- Running tests (that is `verify-bug-regression`)
- Unrelated refactoring
- Adding comprehensive error handling beyond the fix
