# QA Tools

## 0. SYSTEM MODEL

This document defines invariants, not guidelines.

Rules are:

- absolute
- non-overridable
- non-reinterpretable
- non-weakenable

If any ambiguity, contradiction, missing authority, unresolved dependency or rule conflict exists:

STOP.

No execution, assumption, inference, approximation or continuation is permitted.

---

## 1. AUTHORITY MODEL

Valid authority only:

- explicit requirements
- formal specifications
- explicit domain definitions
- official documentation
- explicit user instructions

Invalid authority:

- implementation behavior
- runtime behavior
- current usage
- historical usage
- tests
- compiler output
- build success
- consumer count
- frequency of occurrence
- convenience
- effort
- speed
- diff size

Absence of evidence is not evidence.

No inference from invalid authority is permitted.

---

## 2. PRIORITY HIERARCHY

Strict order:

1. Domain correctness
2. Explicit requirements
3. Explicit specifications
4. This document
5. Architecture
6. Implementation

Lower levels MUST NEVER justify violating higher levels.

---

## 3. FORBIDDEN TRANSFORMATIONS

Invalid by definition:

- workaround
- temporary fix
- partial fix
- compensating logic
- compatibility shim
- fallback path
- transitional path
- parallel implementation
- duplicated logic
- architectural bypass
- type-system bypass
- error suppression
- defect relocation
- local fix leaving equivalent flows inconsistent
- contract modification without authority
- validation weakening
- safety-mechanism weakening

Presence of any item above invalidates the solution.

---

## 4. ROOT CAUSE INVARIANT

Every defect MUST be corrected at origin.

Allowed:

- correct producer
- correct implementation
- correct contract (only when authorized by rule 6)

Forbidden:

- symptom correction
- abstraction masking
- defect shifting
- compensating behavior
- bypassing failure

A defect remains unresolved until root cause is corrected.

---

## 5. SAFETY MECHANISM IMMUTABILITY

Safety mechanisms include:

- tests
- assertions
- validations
- guards
- invariants
- schemas
- CI rules
- quality gates
- static analysis
- type checks

Forbidden:

- weaken
- remove
- bypass
- suppress
- relax
- adapt to fit implementation

If a safety mechanism fails:

1. assume defect
2. identify root cause
3. correct implementation
4. preserve or strengthen safety mechanism

Safety mechanisms MUST NOT be changed merely to make code pass.

---

## 6. CONTRACT IMMUTABILITY

Contracts include:

- types
- interfaces
- schemas
- APIs
- validations
- domain rules
- domain models

Contracts are immutable unless ALL are proven:

- producers identified
- consumers identified
- intended behavior explicitly evidenced
- domain validity explicitly evidenced
- existing guarantees preserved
- explicit authorization exists

If any condition is missing:

CONTRACT CHANGE IS INVALID.

Compiler errors, failing tests, existing callers and current behavior are not evidence.

---

## 7. SYSTEM CONSISTENCY

Accepted changes MUST update:

- all producers
- all consumers
- all contracts
- all interfaces
- all validations
- all tests

Equivalent flows MUST remain equivalent.

Partial, mixed-version or transitional states are invalid.

Local correctness without system correctness is invalid.

---

## 8. TEST NON-AUTHORITY

Tests are:

- validation mechanisms
- regression detectors

Tests are NOT:

- specifications
- domain authority
- contract authority

Incorrect tests must be corrected.

Implementation must NOT be altered to satisfy invalid tests.

---

## 9. IMPLEMENTATION NON-AUTHORITY

Implementation is:

- evidence of existence

Implementation is NOT:

- specification
- contract
- domain authority

Backward compatibility is forbidden unless explicitly required.

---

## 10. EQUIVALENCE PROOF

Two solutions are NOT equivalent unless proven.

Proof requires:

- identical specified behavior
- identical guarantees
- identical contract constraints
- no new valid states
- no newly representable invalid states
- no invariant regression

Without proof:

assume NOT equivalent.

---

## 11. MULTI-AGENT INVARIANT

Agent boundaries are irrelevant.

Each agent is responsible for:

- full dependency graph
- all producers
- all consumers
- all contracts
- all validations
- all tests
- all side effects

Distributed execution never justifies local fixes.

---

## 12. VALIDATION GATE

A solution is invalid if ANY of the following exist:

- invariant violation
- contract inconsistency
- unresolved ambiguity
- unresolved dependency impact
- safety-mechanism bypass
- weakened validation
- weakened test protection

Invalid state:

STOP → root-cause correction → full-system revalidation.

---

## 13. FAILURE MODEL

On failure:

STOP → isolate root cause → correct at origin → revalidate entire system

Forbidden:

- patch forward
- partial acceptance
- suppression
- compensating logic
- validation bypass

---

## 14. COMMUNICATION

Output must be:

- factual
- explicit
- non-speculative
- non-persuasive

Always declare:

- evidence
- assumptions
- risks
- limitations
- unknowns

Never justify decisions using:

- effort
- speed
- convenience
- simplicity
- implementation cost
- change size

---

## 15. AUDIT TRAIL — Flags tsconfig AVALIADOS E DEFERIDOS

### `noPropertyAccessFromIndexSignature`

- **Data da avaliação:** 2026-06-02
- **Medição:** 613 erros em 87 arquivos
- **Cobertura existente:** `noUncheckedIndexedAccess` já ativo
- **Decisão:** DEFERIDO — regra estilística, zero ganho de correção. Pareto: alto custo, zero benefício.
- **Comentário:** `tsconfig.json` contém explicação inline

---

## 16. FINAL INVARIANT

No rule may be reinterpreted, weakened, bypassed or combined to violate another rule.

If ambiguity, uncertainty, contradiction or insufficient authority exists:

STOP.

---

## 17. PROTECTED PATHS — ZERO ACCESS (ABSOLUTE)

The following files are ABSOLUTELY OFF-LIMITS:

- `~/.config/opencode/validation_hook.ts`
- `~/.config/opencode/AGENTS.md`
- `~/.config/opencode/opencode.jsonc`

RULES:

- No read, write, stat, import, grep, diff, execute, or reference of any kind
- No suggestion, proposal, or plan involving these files
- No "just checking if they exist"
- No "root cause analysis" that requires reading them

If a task cannot be completed without accessing these files:
→ The agent MUST IMMEDIATELY STOP and report:
"TASK REJECTED: involves protected config file(s): <paths>. No action taken."

VIOLATION: Any access = critical failure. Session terminates immediately.
This rule may only be modified by explicit user command, never by agent initiative.

---

## 18. SAFETY BYPASS NOTIFICATION

Any bypass of a safety mechanism requires **explicit user authorization** before execution.

Safety mechanisms include, but are not limited to:

- `--no-verify` / `--no-verify` (git commit/push hooks)
- `[skip ci]` / `[ci skip]` in commit messages
- `# noqa`, `// NOLINT`, `@SuppressWarnings`, `eslint-disable`
- `as any` / `!` (non-null assertion) / `@ts-ignore` / `@ts-expect-error`
- Disabling, weakening, or removing tests
- `describe.skip` / `it.skip` / `test.skip`
- Any form of error suppression
- Any form of compiler/linter warning suppression
- Any form of validation bypass

Protocol:

1. Agent identifies that task requires bypassing a safety mechanism
2. Agent must **STOP** and explicitly report to the user:
    - Which safety mechanism needs bypassing
    - Why the root cause cannot be corrected instead
    - The exact command or action required
3. Only after receiving **explicit user authorization** may the agent execute the bypass
4. The bypass must be logged in the project's audit trail
5. A root-cause issue must be created/updated to track the permanent fix

**TEMPORARY BYPASS IS PERMANENT DAMAGE.** Any bypass without explicit user authorization is a violation of this rule.

---

## 19. TESTING DISCIPLINE (NON-NEGOTIABLE)

**GOLDEN RULE: Tests are the source of truth. Code must obey tests, never the opposite.**

### 19.1 The Goal of Testing

**THE GOAL IS NOT TO PASS TESTS. THE GOAL IS TO FIND AND CORRECT PROBLEMS IN THE CODE.**

- Passing tests are not victory — they are the MINIMUM acceptable
- Failing tests are OPPORTUNITIES to find real bugs
- If all tests pass but behavior is wrong, the tests are BAD

### 19.2 Mock Discipline: Strict, Not Lenient

- **Create strict mocks**: Mock must return ONLY the data needed for the test case
- **No "happy path by default"**: If a mock returns `{}` or `null` when real data is expected, THAT'S A BUG
- **Mock shape MUST match real shape**: If real function returns `{ id, name, status }`, mock must return EXACT same shape
- **Reject partial mocks**: Missing fields in mocks hide real implementation bugs

### 19.3 Never Trust Current Output (The Oracle Problem)

- **NEVER base expected values on current code output**
- Expected values come from: business requirements, domain logic, specifications, user expectations
- **NEVER**: Run code → copy output → paste as test expectation (this codifies bugs as features)
- **ALWAYS**: Define expected behavior from requirements → write test → run → fix code to match test
- **Red-Green-Refactor order is MANDATORY**

### 19.4 When Test Fails: ALWAYS Blame the Code, NEVER the Test

- **Presumption**: The test is correct, the code has a bug
- **Forbidden actions**:
    - Changing expected values to make test pass
    - Relaxing assertions
    - Commenting out failing assertions
    - Adding try/catch to swallow failures
    - Changing test input data to avoid the failure
- **Allowed actions**:
    - Fix the implementation code to match the test's expectation
    - If test is GENUINELY wrong (rare), document WHY requirement changed
    - Add more assertions to catch related bugs
- **Rule**: "If test fails → find bug in code → fix code. Test is your contract enforcer."

### 19.5 Never Modify Existing Test Expectations (Immutable Contracts)

- **You are expressly PROHIBITED from altering expected values in existing tests**
- `expect(value).toBe(42)` → You CANNOT change `42` to `43` to make test pass
- `expect(result).toEqual(expectedObject)` → You CANNOT change `expectedObject`
- **Exceptions (requires explicit approval)**:
    - Business requirement changed (documented)
    - Test was demonstrably testing the wrong thing (prove with requirements doc)
    - Expected value was actually a bug in test (e.g., wrong type, off-by-one in test logic)
- **When you see a test with wrong expectation**: Fix the CODE, not the test. If test is truly broken, create NEW test with correct expectation and deprecate old one.

### 19.6 Property-Based Testing (Required for Critical Logic)

- **When to use**: Validation rules, parsers, transformers, algorithms with mathematical properties, state machines
- **What to test**: Invariants that must hold for ALL inputs, not just examples
- **Invariants > Examples**: One property-based test replaces 100+ example-based tests
- **Required for**: Any function with numeric bounds, state transitions, or validation rules

### 19.7 Testing Logic, Not Implementation

- **Test behavior**: "When user provides invalid Jira key, error is shown"
- **NOT implementation**: "The validateJiraKey function was called with argument X"
- **Why**: Refactoring should NOT break tests if behavior is preserved
- **When to mock implementation details**: Only for unit testing pure logic in isolation

### 19.8 What To Test vs What NOT To Test

| Test THIS                                             | Do NOT test this                       |
| :---------------------------------------------------- | :------------------------------------- |
| Business logic & transformations                      | Logger internal formatting             |
| Validation rules & edge cases                         | Console output (except CLI end-to-end) |
| Error handling paths                                  | getter/setter boilerplate              |
| State transitions                                     | Third-party library internals          |
| Integration boundaries (HTTP, fs)                     | Type definitions (TypeScript tests)    |
| Security properties (no injection, no path traversal) | Simple arithmetic (e.g., `a + b`)      |

### 19.9 Red-Green-Refactor Workflow (ENFORCED)

1. RED: Write test that fails

    Test MUST be correct according to requirements

    Test MUST NOT pass with current implementation

2. GREEN: Write MINIMAL code to pass test

    No extra features

    No "while we're at it" refactoring

3. REFACTOR: Improve code while keeping tests green

    Extract functions, rename variables, remove duplication

    Run tests after EACH refactoring step

NEVER skip RED phase. NEVER write code before test (except exploratory).

### 19.10 Code Coverage Is a Floor, Not a Ceiling

- Coverage thresholds are MINIMUMS
- High coverage with bad tests is WORSE than low coverage
- **Bad test**: `expect(handler()).toBeDefined()` (just checks no crash)
- **Good test**: `expect(handler(input)).toEqual({ success: true, data: expectedOutput })`
- Coverage without assertion quality is COVERAGE THEATER — prohibited

### 19.11 When You Find a Bug: Process

1. Write a test that REPRODUCES the bug (must fail with current code)
2. Commit the failing test (RED)
3. Fix the implementation code
4. Verify test now passes (GREEN)
5. The test becomes PERMANENT regression prevention
6. **NEVER** fix bug without a test that would have caught it

### 19.12 Pre-Commit Self-Checklist (Code Author)

- [ ] New tests use STRICT mocks (exact shapes, no partial objects)
- [ ] Expected values come from requirements, not current code output
- [ ] If test fails, I will fix CODE, not change expectation
- [ ] Property-based testing considered for numeric/validation logic
- [ ] Each test tests ONE behavior (not multiple unrelated asserts)
- [ ] Test name describes behavior: `"returns 400 when Jira key is invalid"` not `"handles error"`
- [ ] No test commented with `.skip` or `.todo` in commits (except documented tech debt)

### 19.13 Test-First Enforcement

**No implementation code may be written without a corresponding failing test.**

Exceptions (require explicit approval):

- Exploratory/prototype code (must be deleted after learning)
- Configuration/infrastructure code (not business logic)
- Test utilities/mock helpers

If you are about to write code without a test: STOP. Write the test first.

---

## 20. TESTING AUTHORITY CLARIFICATION

To resolve any conflict with Rule 8 (Test Non-Authority):

- Tests define **correctness of implementation** relative to requirements
- Tests do NOT define **requirements, contracts, or domain rules**
- When a test fails, the implementation is wrong (Rule 19.4)
- When a test's expected value contradicts requirements, the test is wrong and must be corrected

**Hierarchy for test disputes:**

1. Explicit requirements (highest authority)
2. Formal specifications
3. Domain definitions
4. This document
5. The test's expected value (lowest authority)

If a test expects X but requirements specify Y:
→ The test is wrong. Correct the test to expect Y. Do NOT change implementation.

If requirements are ambiguous:
→ STOP. Seek clarification. Do not guess.

## 21. SPEED IS NOT AUTHORITY

Speed is never a justification.

Arguments invalid by definition:

- "it's faster this way"
- "we need to move quickly"
- "we will patch it post-release"
- "this is good enough for now"

Unacceptable trade-offs:

- correctness sacrificed for speed
- safety sacrificed for speed
- completeness sacrificed for speed
- auditability sacrificed for speed

The fastest solution is the one that needs no correction.

Every defect caused by speed requires:

1. detection
2. investigation
3. correction
4. revalidation
5. redeployment

Cost: always greater than doing it right once.

**Correct first. Speed follows. Never the opposite.**
