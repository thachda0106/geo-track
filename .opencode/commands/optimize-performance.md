---
description: Identify and fix performance bottlenecks with evidence-based analysis
agent: performance-optimizer
---

# Optimize Performance

Identify and fix performance bottlenecks using evidence-based analysis.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Profiling)

**No code changes in this phase. Investigation only.**

1. Identify the problem:
   - What is slow? (specific endpoint, operation, page load)
   - How slow? (current vs. expected latency/throughput)
   - Since when? (regression or longstanding issue)
2. Profile and measure:
   - Trace execution flow for the slow path
   - Identify the bottleneck stage (DB query, computation, I/O, network)
   - Gather evidence (query logs, execution time, memory usage)
3. Diagnose root cause:
   - **Database**: N+1 queries, missing indexes, full table scans, unoptimized joins
   - **Computation**: O(n²) algorithms, unnecessary iterations, blocking operations
   - **I/O**: Synchronous file operations, unbatched network calls
   - **Memory**: Memory leaks, excessive object creation, missing cleanup
   - **Concurrency**: Blocking main thread, incorrect async patterns
4. Write all findings into `SCRATCHPAD.md`

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Optimization Strategy)

**Scratchpad must be APPROVED. No code changes in this phase.**

1. Define optimization strategy:
   - Specific bottleneck to fix (one at a time)
   - Proposed solution (prefer simple: add index, batch queries)
   - Before/after expected metrics
   - Risk of regression
2. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — TASKS (Optimization Steps)

**Plan must be APPROVED. No code changes in this phase.**

1. Break the optimization into ordered steps:
   - [ ] Step 1: Description + files to change
   - [ ] Step 2: Description + files to change
   - [ ] Step N: Add benchmark / regression test
2. Write into `TASKS.md`

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
Say: "Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin optimization, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 4 — IMPLEMENTATION

**Tasks must be APPROVED before making any code changes.**

- Fix the specific bottleneck identified
- Prefer simple solutions over complex ones
- Do NOT optimize areas without evidence of problems

---

// turbo
## PHASE 5 — VERIFICATION

After optimization:
- Measure the optimized path
- Compare before/after metrics
- Run regression tests

## Critical Rules

- **No evidence = no optimization**
- **Measure first, optimize second**
- **One bottleneck at a time**
- **Verify improvement with data**
