# Onboarding Guide — AI Development Template

## For New Projects

### 1. Copy the template

Copy the `.ai/` directory and `adapters/` directory into your project root.

### 2. Fill in context files

Edit these files with your project's details:

- **`.ai/context/PROJECT.md`** — Project name, tech stack, commands, architecture
- **`.ai/context/CONVENTIONS.md`** — Coding standards, naming rules
- **`.ai/context/BOUNDARIES.md`** — What the AI should never do

### 3. Choose your agents

Review `.ai/agents/` — keep what's relevant, remove what's not. The 6 canonical agents cover most projects.

### 4. Choose your workflows

Review `.ai/workflows/` — keep what's relevant. The core workflows (`ai-workflow.md`, `create-feature.md`, `fix-bug.md`) are recommended for all projects.

### 5. Install adapters

```bash
bash .ai/scripts/install-ai-template.sh
```

### 6. Validate

```bash
bash .ai/scripts/validate-template.sh
```

## For Existing Claude Code Projects

See [Migration Guide](MIGRATION_GUIDE.md).

## Adding Project-Specific Workflows

Create a new `.md` file in `.ai/workflows/` with YAML frontmatter:

```yaml
---
description: Short description of what this workflow does
agent: feature-builder
---

# Workflow Name

## Steps

1. Step one
2. Step two
```

## Adding Project-Specific Skills

Create a new directory in `.ai/skills/<skill-name>/` with a `SKILL.md`:

```yaml
---
name: skill-name
description: What this skill does
---

# Skill: skill-name

## When to Use
...

## Step-by-Step Procedure
...
```

## Quick Reference

| Task | Command |
|------|---------|
| Install adapters (auto-detect) | `bash .ai/scripts/install-ai-template.sh` |
| Install specific adapter | `bash adapters/<tool>/install.sh` |
| Remove adapter output | `bash adapters/<tool>/clean.sh` |
| Validate template | `bash .ai/scripts/validate-template.sh` |
| Migrate from Claude Code | `bash .ai/scripts/migrate-from-claude.sh` |
| Preview install (no changes) | `bash .ai/scripts/install-ai-template.sh --dry-run` |

## Troubleshooting

### "No AI tools detected automatically"
**Cause:** The install script auto-detects by looking for tool-specific directories or CLI commands.
**Fix:** Specify the tool explicitly:
```bash
bash .ai/scripts/install-ai-template.sh antigravity cursor
```

### "ERROR: .ai/ directory not found"
**Cause:** Script is not running from the project root, or `.ai/` was not copied.
**Fix:** Ensure `.ai/` exists at the project root and run from the project root.

### Validation errors after install
**Cause:** Context files may still have unresolved `{{placeholders}}`.
**Fix:** Edit `.ai/context/PROJECT.md`, `CONVENTIONS.md`, and `BOUNDARIES.md` and replace all `{{...}}` placeholders with your project's actual values.

### Adapter output conflicts in git
**Cause:** Generated files are being tracked.
**Fix:** Ensure `.gitignore` includes generated adapter output (see the template `.gitignore`).

