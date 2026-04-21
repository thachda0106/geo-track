---
name: diagnose-bug-root-cause
description: Identify why a bug occurs through systematic analysis.
category: debug
inputs:
  - bug_description
  - error_message
  - reproduction_steps
outputs:
  - root_cause_statement
  - evidence
  - suggested_fix_approach
---

# Skill: diagnose-bug-root-cause

## When to Use

Use when a bug has been reported but the cause is unknown. This skill systematically narrows down the root cause before any fix is attempted.

## Step-by-Step Procedure

1. **Understand the Symptom**: Read the error message, stack trace, or bug description. Identify what is expected vs. what actually happens.

2. **Reproduce Mentally**: Trace the expected execution path based on the symptom. Identify where the deviation occurs.

3. **Narrow the Search**: Use binary search strategy — test assumptions at the midpoint of the suspected call chain to cut the search space in half.

4. **Examine the Suspect Code**: Read the code at the identified location. Check for common bug patterns: null/undefined, off-by-one, race conditions, incorrect type handling.

5. **State the Root Cause**: Write a clear statement: "The bug occurs because X at Y causes Z."

## Decision Rules

- **If** stack trace available → start from the error location and trace backwards
- **If** no stack trace → start from the entry point and trace forwards
- **If** intermittent → suspect race conditions, caching, or state management
- **If** regression → check recent changes with version control

## Outputs

- Clear root cause statement with file and line references
- Evidence supporting the diagnosis
- Suggested fix approach (but NOT the fix itself)

## Non-Goals

- Fixing the bug (that is `apply-targeted-fix`)
- Running the code
- Proposing architectural changes
