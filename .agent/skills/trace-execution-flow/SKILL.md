---
name: trace-execution-flow
description: Follow data and logic paths through the system using static analysis.
category: core
inputs:
  - entry_point
  - goal
outputs:
  - ordered_call_chain
  - data_mutations
  - flow_description
---

# Skill: trace-execution-flow

## When to Use

Use when trying to understand how data moves through the system, the sequence of operations for a specific feature, or the lifecycle of a request using static analysis.

## Step-by-Step Procedure

1. **Locate Entry Point**: Find the function or handler corresponding to the input trigger (e.g., API route, button handler, CLI command).

2. **Follow Call Chain**:
   - Read the entry function
   - Identify functions called within it
   - Navigate to those function definitions
   - Continue until reaching the output or side effect

3. **Track Data Transformation**: Note how arguments are passed and modified at each step.

4. **Identify Branching**: Document logic conditions (if/else, switch) that alter the flow.

5. **Map External Interactions**: Note where the code interacts with databases, APIs, file system, or external services.

6. **Construct Flow**: Create an ordered description: A → B → C.

## Decision Rules

- **If** using an interface/dependency injection → look for the implementation binding to follow the concrete path
- **If** the chain splits into async tasks → trace the primary success path first, then error paths
- **If** recursion or complex loops found → summarize the logic rather than stepping through every iteration

## Execution Rules

- Do NOT load full file contents unless required to understand specific logic
- Focus on the call chain, not implementation details
- Do NOT attempt to simulate runtime behavior
- Trace the primary success path first, then branches if requested

## Non-Goals

- Running a debugger (this is static analysis)
- Performance profiling
- Fixing bugs (only identifying the path)
- Proposing architectural changes
