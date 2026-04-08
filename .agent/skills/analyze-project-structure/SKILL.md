---
name: analyze-project-structure
description: Map dependencies, architecture, and module layout of a codebase.
category: core
inputs:
  - root_directory
  - focus_areas (optional)
outputs:
  - project_structure_map
  - architectural_style
  - tech_stack_summary
---

# Skill: analyze-project-structure

## When to Use

Use when onboarding to a new codebase, starting a significant refactor, or when you need to understand the high-level organization of modules, dependencies, and architectural patterns.

## Step-by-Step Procedure

1. **Map Directory Layout**: List top-level directories and key files (e.g., package manifests, README, config files). Identify standard convention folders.

2. **Identify Key Artifacts**: Locate configuration files that define build systems, linting rules, and dependencies.

3. **Trace Dependency Graph**: Examine import statements in key entry points. Determine the direction of dependencies between modules.

4. **Determine Architectural Pattern**: Infer the architecture (e.g., MVC, Clean Architecture, Feature-based) based on folder naming and dependency flow.

5. **Document Findings**: Summarize the structure, key technologies, and apparent design rules.

## Decision Rules

- **If** a README exists → read it first for stated architecture
- **If** the project uses a framework → assume standard framework patterns unless observed otherwise
- **If** folder structure is flat/unorganized → note as a potential refactoring opportunity

## Outputs

- Hierarchical map of the project structure
- Identification of major modules and their responsibilities
- Summary of architectural style and technologies used

## Execution Rules

- **Lazy Loading**: Do NOT read full source files unless necessary
- Focus on: directory hierarchy, configuration files, entry points, package dependencies
- Do NOT: perform deep debugging, read implementation details, execute the project, propose architecture changes

## Non-Goals

- Reading every single file
- Debugging specific errors
- Executing the code
- Performance profiling
- Security auditing
