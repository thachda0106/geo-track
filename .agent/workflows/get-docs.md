---
description: Fetch latest documentation for a library using available documentation tools
---

# Get Documentation

Fetch the latest documentation for a library or framework.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Research)

**No summary or output in this phase. Research only.**

1. Resolve the library identifier (e.g., `@nestjs/common`, `typeorm`, `react`)
2. Identify the best documentation source:
   - MCP documentation servers (if available)
   - Official documentation sites
   - Web search
3. Assess what aspects of the library are relevant to this project's tech stack
4. Write findings into `SCRATCHPAD.md`:
   - Library name and version
   - Documentation source
   - Relevant areas to summarize (API, configuration, integration)

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to fetching documentation, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — FETCH & SUMMARIZE

**Scratchpad must be APPROVED.**

1. Fetch the latest documentation from the identified source
2. Extract and summarize:
   - Installation and setup
   - Configuration options
   - Key API details
   - Usage patterns relevant to this project
   - Integration patterns with the project's stack
3. Present the summary in a clear, actionable format

## Notes

- Use documentation retrieval tools if available (e.g., MCP documentation servers)
- If no documentation tool is available, use web search or official documentation sites
- Summarize for the project's specific tech stack and patterns
- Focus on API details, configuration, and integration patterns
