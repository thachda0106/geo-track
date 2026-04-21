---
description: Generate comprehensive tests following project testing standards
agent: test-engineer
---

# Add Tests

Generate comprehensive tests for the selected code following project testing standards.

> [!CAUTION]
> This workflow requires human approval between every phase.
> Do NOT skip phases. Do NOT combine phases into a single response.

---

## PHASE 1 — SCRATCHPAD (Exploration)

**No code or plans in this phase. Analysis only.**

1. Ask user which test type to generate:
   - **Unit Test** — Isolated module testing with mocked dependencies (default)
   - **Integration Test** — Full flow with real dependencies
   - **E2E Test** — End-to-end API/UI testing
2. Read the code to be tested
3. Understand business logic and edge cases
4. Identify dependencies to mock
5. Find existing test patterns for consistency
6. Write analysis into `SCRATCHPAD.md`

**Output**: `SCRATCHPAD.md`

### 🛑 HARD STOP — APPROVAL GATE 1

```
Say: "Phase 1 (Scratchpad) complete. Please review SCRATCHPAD.md.
Reply APPROVE to continue to the planning phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 2 — PLAN (Test Strategy)

**Scratchpad must be APPROVED. No test code in this phase.**

1. Define test strategy based on approved scratchpad:
   - Coverage areas (service logic, error handling, data access, API, validation, edge cases)
   - Mocking strategy for dependencies
   - Test file naming and location per project conventions
   - Setup/teardown approach
2. Risk analysis — what's hard to test? What could be flaky?
3. Write into `PLAN.md`

**Output**: `PLAN.md`

### 🛑 HARD STOP — APPROVAL GATE 2

```
Say: "Phase 2 (Plan) complete. Please review PLAN.md.
Reply APPROVE to continue to the task breakdown phase, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 3 — TASKS (Test Cases)

**Plan must be APPROVED. No test code in this phase.**

1. List specific test cases to implement, organized by file:
   - [ ] Test file 1: `module.service.spec.ts` (or equivalent)
     - Case 1: Description
     - Case 2: Description
   - [ ] Test file 2: `module.controller.spec.ts` (or equivalent)
     - Case 1: Description
     - Case 2: Description
2. For each test case, specify:
   - What is being tested
   - Input / setup
   - Expected outcome
   - Dependencies to mock
3. Write into `TASKS.md`

**Output**: `TASKS.md`

### 🛑 HARD STOP — APPROVAL GATE 3

```
Say: "Phase 3 (Task Breakdown) complete. Please review TASKS.md.
Reply APPROVE to begin writing tests, or provide feedback."
WAIT for explicit approval.
```

---

## PHASE 4 — IMPLEMENTATION (Write Tests)

**Tasks must be APPROVED before writing any test code.**

Follow project conventions:
- Arrange-Act-Assert pattern
- Descriptive test names explaining the scenario
- Proper mock setup and cleanup
- One behavior per test case

---

// turbo
## PHASE 5 — VALIDATION

After tests are written:
- Run the generated tests and confirm they pass
- Verify coverage of success and failure paths
- Check for proper mock cleanup between tests

## Best Practices

- Mock external dependencies (database, HTTP clients, file system)
- Use descriptive test names that explain the scenario
- Test one behavior per test case
- Keep tests independent and isolated
- Use factories for creating test data
- Clean up state between tests
- Test both success and failure paths
