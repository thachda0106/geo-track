# Architecture Overview

## Core Concept

This template separates **AI logic** from **AI tooling** using an adapter pattern:

```
.ai/ (canonical, tool-agnostic)  →  adapters/  →  tool-native output
         source of truth              thin         (.claude/, .agent/,
                                   translators     .cursorrules, etc.)
```

## Directory Map

| Directory | Purpose |
|-----------|---------|
| `.ai/context/` | Project-level instructions for AI (what to know) |
| `.ai/agents/` | AI persona definitions (who to be) |
| `.ai/workflows/` | Step-by-step task automation (what to do) |
| `.ai/skills/` | Atomic, reusable procedures (how to do it) |
| `.ai/prompts/` | Reusable prompt fragments and templates |
| `.ai/scripts/` | Automation scripts for install, validation, migration |
| `.ai/scripts/_lib.sh` | Shared shell utilities (colors, context merge, manifest updates) |
| `.ai/docs/` | Human documentation |
| `adapters/` | Tool-specific translation layers |

## Operating Model

Every non-trivial task follows the **5-phase lifecycle**:

```
Plan → Review (HARD STOP) → Execute → Verify → Reflect
```

1. The AI creates a **scratchpad** (Plan)
2. Stops for **human approval** (Review)
3. **Implements** the plan (Execute)
4. **Validates** with tests, lint, type checks (Verify)
5. **Reflects** on execution quality and captures learnings (Reflect)

> In workflows, these 5 phases expand into 6 detailed steps:
> **Scratchpad → Plan → Tasks → Execute → Verify → Reflect**,
> with approval gates between each phase.

## Module Relationships

```
┌──────────────────────────────────────────┐
│              .ai/ (canonical)            │
├──────────────────────────────────────────┤
│ context/   → Loaded first, every task    │
│ agents/    → Define behavior per task    │
│ workflows/ → Step-by-step automation     │
│ skills/    → Referenced by agents        │
│ prompts/   → Templates for output        │
│ scripts/   → _lib.sh shared utilities    │
└───────────────┬──────────────────────────┘
                │
      ┌─────────┴─────────┐
      │  adapters/ (thin)   │
      ├─────────────────────┤
      │ mapping.yaml  (spec)│
      │ install.sh (sources │
      │   _lib.sh)          │
      │ clean.sh  (cleanup) │
      └─────────────────────┘
                │
      ┌─────────┴─────────┐
      │ Tool-native output  │
      ├─────────────────────┤
      │ claude/  → .claude/ │
      │ antigravity → .agent│
      │ cursor/  → .cursor  │
      │ aider/   → .aider*  │
      └─────────────────────┘
```

## Shared Library (`_lib.sh`)

All adapter `install.sh` scripts and template scripts source `.ai/scripts/_lib.sh`, which provides:

| Function | Purpose |
|----------|---------|
| `merge_context_files()` | Merge context + system prompt into a single output file |
| `copy_skills()` | Copy skill directories preserving structure |
| `update_manifest_adapters()` | Write installed adapter list to `AI_MANIFEST.yaml` |
| `parse_flags()` | Parse common flags like `--dry-run` |
| Color constants | `GREEN`, `BLUE`, `YELLOW`, `RED`, `NC` |

This eliminates code duplication across adapters and ensures consistent behavior.

## Key Design Decisions

1. **`.ai/` is never modified by adapters** — adapters only read from it
2. **Skills use generic verbs** — "Search", "Read", "Edit" — not tool-specific names
3. **Workflows are adapter-compatible by default** — YAML frontmatter works in both Claude Code and Antigravity
4. **Context files split responsibilities** — PROJECT (what), CONVENTIONS (how), BOUNDARIES (don't)
5. **Shared shell library** — `_lib.sh` centralizes common logic, adapters stay thin
6. **Every adapter has `clean.sh`** — generated output can be removed cleanly
