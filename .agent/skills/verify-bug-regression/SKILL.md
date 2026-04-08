---
name: verify-bug-regression
description: Run tests and checks to confirm fixes and detect regressions.
category: debug
inputs:
  - fix_description
  - affected_files
  - test_commands
outputs:
  - test_results
  - regression_status
---

# Skill: verify-bug-regression

## When to Use

Use after applying a fix (via `apply-targeted-fix`) to verify the fix works and no regressions were introduced.

## Step-by-Step Procedure

1. **Run Targeted Tests**: Execute tests specifically related to the fixed area.

2. **Run Full Test Suite**: Execute the project's complete test suite to detect regressions.

3. **Type Check**: Run the project's type checker to verify no type errors introduced.

4. **Lint**: Run the project's linter to verify code style compliance.

5. **Build Verification**: Attempt a production build to ensure no compile errors.

6. **Report Results**: Summarize pass/fail status for each check.

## Decision Rules

- **If** targeted tests pass but full suite fails → investigate if the fix caused a regression
- **If** tests pass but types fail → fix type errors before declaring success
- **If** lint fails → run auto-fix if available, otherwise fix manually
- **If** no tests exist for the fixed area → recommend adding tests before declaring done

## Outputs

- Test results (pass/fail counts)
- Type check results
- Lint results
- Build status
- Regression assessment: **No Regression** | **Regression Detected**

## Non-Goals

- Writing new tests (that is `test-engineer` agent's job)
- Refactoring code
- Performance benchmarking
