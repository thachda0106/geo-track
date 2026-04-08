---
name: validate-architecture
description: Check code against project architecture rules and conventions.
category: quality
inputs:
  - target_files_or_directories
  - architecture_rules (from context/CONVENTIONS.md)
outputs:
  - violations_list
  - compliance_score
---

# Skill: validate-architecture

## When to Use

Use during code review, pre-commit checks, or when verifying that code changes adhere to the project's architectural rules.

## Step-by-Step Procedure

1. **Load Architecture Rules**: Read `context/CONVENTIONS.md` and `context/PROJECT.md` for project-specific rules (import boundaries, naming conventions, directory structure).

2. **Check Import Boundaries**: Verify that imports follow the declared dependency rules. No cross-boundary imports that violate architecture.

3. **Check Naming Conventions**: Verify file names, class names, variable names follow project conventions.

4. **Check Directory Structure**: Verify files are in correct locations per project patterns.

5. **Check Module Organization**: Verify separation of concerns (API layer thin, business logic in service layer, data access isolated).

6. **Report Violations**: List each violation with file, line, rule violated, and suggested fix.

## Decision Rules

- **If** architecture rules are not documented → infer from existing patterns
- **If** a violation is found → report it, do not fix it (that is another agent's job)
- **If** rules are ambiguous → note as "potential violation, needs human review"

## Non-Goals

- Fixing violations (read-only skill)
- Performance analysis
- Security auditing
- Code style formatting (that's a linter's job)
