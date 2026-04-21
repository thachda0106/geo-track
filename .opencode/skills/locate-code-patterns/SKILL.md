---
name: locate-code-patterns
description: Find syntax patterns, variable usage, or code conventions across the codebase.
category: core
inputs:
  - pattern_description
  - search_scope (optional)
outputs:
  - matching_locations
  - usage_patterns
---

# Skill: locate-code-patterns

## When to Use

Use when you need to find specific code patterns, variable usage, function calls, or convention adherence across the codebase.

## Step-by-Step Procedure

1. **Define Pattern**: Clarify what pattern you're searching for — exact string, regex, structural pattern, or convention.

2. **Choose Search Strategy**:
   - For exact text/strings → use text search
   - For file paths/names → use file search
   - For symbol references → use code analysis tools if available
   - For structural patterns → combine text search with file reading

3. **Execute Search**: Run the search with appropriate scope (full project, specific directory, file type filter).

4. **Analyze Results**: Review matches, filter false positives, group by location or pattern.

5. **Report Findings**: List all locations with file paths and line numbers.

## Decision Rules

- **If** searching for exact strings → use literal text search
- **If** searching for patterns/regex → use regex search
- **If** searching for symbol references → use code intelligence tools
- **If** too many results → narrow scope with file type or directory filters

## Non-Goals

- Modifying found code (that is `apply-targeted-fix`)
- Deep analysis of found patterns (that is `analyze-project-structure`)
