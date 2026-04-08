# Adapter Authoring Guide

## What Is an Adapter?

An adapter is a thin translation layer that reads the canonical `.ai/` directory and generates configuration files for a specific AI tool.

## Creating a New Adapter

### 1. Create the adapter directory

```
adapters/<tool-name>/
├── mapping.yaml      # Required: path and format mappings
├── install.sh        # Required: installation script (sources _lib.sh)
├── clean.sh          # Required: cleanup script to remove generated output
└── templates/        # Optional: template files for generation
```

### 2. Define `mapping.yaml`

```yaml
adapter: "<tool-name>"
version: "1.0.0"
target_dirs:
  - "<output-directory>"

mappings:
  context:
    ".ai/context/PROJECT.md":
      target: "<tool-specific-path>"
      transform: "merge_context_files"
```

### 3. Implement `install.sh`

Your script must:
- Source shared library: `source "$PROJECT_ROOT/.ai/scripts/_lib.sh"`
- Read `.ai/` as input (never modify it)
- Use `merge_context_files()` from `_lib.sh` for context merging
- Create tool-native directories
- Copy/transform files per mapping
- Be idempotent (safe to re-run)
- Print what it creates
- Exit 0 on success, non-zero on failure

### 4. Test

```bash
bash adapters/<tool-name>/install.sh
bash .ai/scripts/validate-template.sh
```

## Adapter Capabilities

Not all tools support all features. Use `null` target for unsupported features:

| Feature | Claude Code | Antigravity | Cursor | Aider |
|---------|:-----------:|:-----------:|:------:|:-----:|
| Context files | ✅ CLAUDE.md | ✅ STYLE.md | ✅ .cursorrules | ✅ CONVENTIONS.md |
| Agent definitions | ✅ | ❌ (docs) | ❌ (embedded) | ❌ |
| Workflows | ✅ commands/ | ✅ workflows/ | ❌ | ❌ |
| Skills | ✅ | ✅ | ❌ | ❌ |
| Scripts | ✅ | ✅ | ❌ | ❌ |
| Clean/uninstall | ✅ | ✅ | ✅ | ✅ |

> **Note:** Scripts (install, validate, migrate) remain in `.ai/scripts/` and are run directly from there. They are not duplicated into adapter output directories.

## See Also

- [ADAPTER_SPEC.md](../../adapters/ADAPTER_SPEC.md) — Formal adapter contract
