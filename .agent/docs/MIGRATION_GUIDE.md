# Migration Guide — Claude Code → Universal Template

## Overview

This guide explains how to migrate an existing Claude Code project (`.claude/` + `CLAUDE.md`) into the universal `.ai/` template format.

## Automated Migration

```bash
bash .ai/scripts/migrate-from-claude.sh
```

This script automatically migrates:

| Source | Destination |
|--------|------------|
| `CLAUDE.md` | `.ai/context/PROJECT.md` |
| `.claude/agents/*.md` | `.ai/agents/*.agent.md` |
| `.claude/commands/*.md` | `.ai/workflows/*.md` |
| `.claude/skills/*/SKILL.md` | `.ai/skills/*/SKILL.md` |
| `.claude/prompts/*.md` | `.ai/prompts/templates/*.md` |
| `.claude/scripts/*` | `.ai/scripts/*` |
| `.claude/hooks/*` | `.ai/scripts/*` |
| `.claude/docs/*` | `.ai/docs/*` |

## Post-Migration Steps

### 1. Split PROJECT.md

The migration copies your entire `CLAUDE.md` into `context/PROJECT.md`. You should split it:

- **PROJECT.md** — Project overview, tech stack, commands, architecture
- **CONVENTIONS.md** — Coding standards, naming conventions, import rules
- **BOUNDARIES.md** — Forbidden actions, scope rules, safety constraints

### 2. Remove Tool-Specific References

Search for and replace tool-specific tool names:

| Claude Code Tool | Generic Action |
|-----------------|----------------|
| `Grep`, `mcp__serena__find_symbol` | Search for patterns |
| `Read`, `view_code_item` | Read code/files |
| `Write`, `Edit` | Edit files |
| `Bash` | Execute commands |

### 3. Add YAML Frontmatter

Ensure all agents and workflows have proper frontmatter:

```yaml
---
name: agent-name
description: What this agent does
---
```

### 4. Validate

```bash
bash .ai/scripts/validate-template.sh
```

### 5. Install Adapters

```bash
bash .ai/scripts/install-ai-template.sh
```

## Keeping Both Systems

You can keep `.claude/` and `.ai/` in parallel during transition. Just add this to `.gitignore`:

```
# Tool-specific output (generated from .ai/ by adapters)
.claude/
.agent/
.gemini/
.cursorrules
.aider.conf.yml
```
