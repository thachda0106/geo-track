# AI Template Skills

This directory contains **atomic, reusable procedures** (Skills) available to agents.

## Canonical Skills

| Category | Skill | Description |
|----------|-------|-------------|
| **Core** | `locate-code-patterns` | Find syntax, variable usage, or patterns |
| **Core** | `analyze-project-structure` | Map dependencies and architecture |
| **Core** | `trace-execution-flow` | Follow data and logic paths |
| **Debug** | `diagnose-bug-root-cause` | Identify why a bug occurs |
| **Debug** | `apply-targeted-fix` | Modify, create, or delete code files |
| **Debug** | `verify-bug-regression` | Run tests to confirm fixes |
| **Quality** | `validate-architecture` | Check architecture rule compliance |

## Skill Structure

Each skill directory contains:
- **`SKILL.md`** — The procedure definition (source of truth)
- `references/` — Documentation or cheatsheets (optional)
- `scripts/` — Automation scripts (optional)
- `assets/` — Prompts or templates (optional)

## Adding New Skills

> **Do not invent new skills lightly.**
> Most "new" capabilities are refinements of existing canonical skills.

- Creating files? → Refine `apply-targeted-fix`
- Running benchmarks? → Refine `verify-bug-regression`
- Analyzing schemas? → Refine `analyze-project-structure`
