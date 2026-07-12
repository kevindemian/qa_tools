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

- **Data da avaliação original:** 2026-06-02
- **Medição original:** 613 erros em 87 arquivos
- **Cobertura existente:** `noUncheckedIndexedAccess` já ativo
- **Decisão original:** DEFERIDO — regra estilística, zero ganho de correção. Pareto: alto custo, zero benefício.
- **Reavaliação (2026-07-12):** A regra ESTÁ ATIVA em `tsconfig.json:17` (`"noPropertyAccessFromIndexSignature": true`) e o codebase compila limpo — `npx tsc --noEmit` = 0 erros. Os 613 erros originais foram eliminados (correção em curso ou mudança de estado posterior à avaliação de 2026-06-02). Portanto o custo caiu para 0 e a decisão "DEFERIDO / não reativar" está **obsoleta e contradiz o estado atual**.
- **Decisão vigente:** REGRA ATIVA E COMPLACENTE. Nenhuma ação necessária. O audit trail anterior é mantido acima apenas para histórico; a recomendação "não reativar" não se aplica pois a regra já está ativa.
- **Comentário:** não há explicação inline em `tsconfig.json` (linha 17 apenas habilita a flag).

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

\*\*Correct first. Speed follows. Never the opposite.

---

## 22. SOP PROTOCOL ENFORCEMENT

The following rules bind this agent and any subagent or assistant executing audit/functional/SOP.md.

### 22.1 Command Header Requirement

Before executing any phase prescribed by SOP, the agent MUST read the corresponding section from `audit/functional/SOP.md` (use line-range markers to read only the relevant section). Then execute the phase's commands, prefixing each with its SOP section reference:

```
[SOP §X.Y] <ação descritiva>
```

- O formato é livre — descreva a ação em linguagem natural
- Proibido pular fases ou comandos
- Se o comando exato do SOP falhar (ex: path mismatch), adapte e documente o desvio
- O output e status podem ser inline, sem template fixo

### 22.2 Sequential Phase Execution

- Within a Phase, parallel execution is allowed (independent commands may run concurrently).
- Between Phases, execution is **strictly sequential**.
- A Phase is not complete until its checkpoint (`<!-- CHECKPOINT: Phase N complete -->`) is written to `audit/functional/PROGRESS.md`.
- Cycle: Phase N → checkpoint N → Phase N+1 → checkpoint N+1
- If a checkpoint is missing → Phase is not considered complete. Resume from the last checkpoint.

### 22.3 Proportionality

Violations are graded by substance, not form:

| Category      | Examples                                                                                                                            | Action                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Substance** | Skipping a phase, not fixing high/medium gaps, weakening safety, ignoring quality gate, not reading the SOP section                 | Session invalid. STOP, report, await instruction.                   |
| **Form**      | Command adapted for path mismatch, output format differs from template, header format non-standard, checkpoint numbering off by one | Report the deviation, document it, continue execution. Do NOT stop. |

**Proibido:**

- Interromper sessão por violação de forma
- Justificar parada com "eficiência" quando for substância
- Reinterpretar violação de forma como violação de substância

**Protocolo de leitura:** antes de cada Phase, ler a seção correspondente do SOP (line-range markers). Entender o objetivo da fase. Executar os comandos necessários para atingir o checkpoint. Se um comando literal falhar (path mismatch, arquivo ausente), adapte e documente o desvio — não pare.

### 22.4 Violation = Session Invalid

Any violation of 22.1, 22.2, or 22.3 that is **substance** (per 22.3 table) renders the entire session invalid. The agent must:

1. STOP immediately
2. Report which violation occurred (substance category only)
3. Await explicit user instruction before resuming

No continuation, partial acceptance, or "let's proceed anyway" is permitted for substance violations.

**Form violations** (per 22.3 table): report in `audit/functional/PROGRESS.md`, document the deviation, continue execution. Do NOT stop.

### 22.5 Audit Trail in Output

Each Phase result must be recorded in `audit/functional/PROGRESS.md` before the next Phase begins. The agent's output must contain the Phase header, each command result, and the final status for each item, so the user can verify compliance without reading files.\*\*

---

## 23. PROTECTED CONTENT & MERGE-FIRST RULE

Before removing, deleting, replacing, or overwriting existing content, apply this rule.

### 23.1 Hierarchy (Conflict Resolution)

In case of conflict between this rule and others:

1. **Safety Mechanism Immutability** (Rule 5) — ALWAYS prevails
2. **Root Cause Invariant** (Rule 4) — ALWAYS prevails
3. **This rule** — applies when no conflict with 1 or 2

### 23.2 Tier Classification (Objective Criteria)

| Tier              | Criterion                                                                               | Action                                       |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| **1 — Free**      | Content I created in this session                                                       | Proceed freely                               |
| **2 — Fluid**     | Rename, move, extract (same functionality preserved)                                    | Proceed + annotate inline                    |
| **3 — Attention** | Removal of file/function with ≤2 consumers OR non-critical content                      | Quick confirmation                           |
| **4 — Critical**  | Removal of file/function with >2 consumers, OR validation/assertions/tests/types/config | STOP + analyze + propose merge if applicable |

### 23.3 Source Classification

| Source         | Example                                          | Confidence             |
| -------------- | ------------------------------------------------ | ---------------------- |
| **Requested**  | User said "remove X" in their message            | HIGH — user decided    |
| **Inferred**   | Agent deduced "X should be removed" from context | MEDIUM — agent decided |
| **Incidental** | Editing Y causes removal of X as side effect     | LOW — unintended       |

### 23.4 Decision Flow

**Tier 1-2: PROCEED**

- Brief inline annotation: `// removed: [reason]`
- Mention in summary if significant

**Tier 3 — Requested (quick confirmation):**

```
Agent: "You requested removal of A, B, C. Confirm?"
User: "yes"
Agent: executes
```

**Tier 3 — Inferred (explain + confirm):**

```
Agent: "I inferred need to remove A, B, C:
  - A: [why it exists, why it can be removed]
  - B: [same pattern]
  - C: [same pattern]

  Confirm?"
User: "yes"
Agent: executes
```

**Tier 4 — ALWAYS STOP:**

```
Agent: "STOP: I will remove [X]. This is Tier 4 because [reason].

  Option A: Remove (original intent)
  Option B: MERGE — combine [existing] + [new] → [result]

  B is superior because:
  ✓ Preserves [existing decision/functionality]
  ✓ Smaller diff ([N] vs [M] lines)
  ✓ No external behavior change
  ✓ Reversible"
User chooses
Agent executes
```

### 23.5 Batch Confirmation

For multiple removals in the same task, ask ONCE by highest tier in the batch:

```
"Removal of 5 files:
  - 3 Tier 2 (rename/move)
  - 2 Tier 4 (types with 8 consumers)

  The 2 Tier 4 require analysis. Proceed?"
```

### 23.6 MERGE Proposal (Tier 4 Only)

When removal is detected AND a merge option exists:

1. Show: what exists + what was going to be added
2. Propose: merged result combining both
3. Explain with OBJECTIVE criteria:
    - ✓ Preserves [specific decision/functionality]
    - ✓ Smaller diff ([N] lines vs [M] lines)
    - ✓ No external behavior change
    - ✓ Reversible
4. Let user choose: Original | Merge | Other

### 23.7 Exceptions (No Confirmation Needed)

- Removing my own edit from this session (reverting my mistake)
- User explicitly said "remove all" / "delete everything"
- Content is factually incorrect (clear evidence)
- Tier 1 (always free)
- Non-TTY mode: auto-confirm Tier 1-3; Tier 4 uses ON_ERROR config

### 23.8 Rule of Gold

> **Ask ONCE per task, not per file.**
> If user confirmed "remove A, B, C", do not ask again for D
> unless D is Tier 4 or different scope.

---

## 24. SAFEGUARD CLAUSES (NON-NEGOTIABLE)

### 24.1 Mandatory Safeguard Clauses

Every function that processes external input, numeric data, or API responses MUST include explicit safeguard clauses. These are NOT optional — their absence is a defect.

Required safeguards:

- **NaN/Infinity guards**: Every numeric comparison, scoring function, and threshold check MUST validate `Number.isFinite(value)` BEFORE comparison. NaN must NEVER silently pass a quality gate or scoring threshold.
- **Null/undefined guards**: Every property access on nullable types MUST be guarded. `?.` is insufficient when the absence of data changes business logic.
- **Empty collection guards**: Every function that operates on collections MUST handle empty arrays/maps explicitly. Empty MUST NOT be treated as equivalent to "no data available."
- **Boundary guards**: Every numeric threshold MUST be validated against the full domain (negative values, zero, NaN, Infinity, MAX_SAFE_INTEGER). Negative weights, negative scores, and negative thresholds MUST be caught and rejected.

### 24.2 Guard Pattern

Every guard MUST follow this pattern:

```typescript
// CORRECT: explicit guard
if (!Number.isFinite(value) || value < threshold) return 'fail';

// PROHIBITED: NaN passes silently
if (value < threshold) return 'fail'; // NaN < threshold → false → passes!
```

### 24.3 Guard Placement

Guards MUST be placed at the earliest point in the data flow where the invariant is violated. Guarding downstream is insufficient — the defect must be caught at origin.

---

## 25. ZERO SILENCING (NON-NEGOTIABLE)

### 25.1 Absolute Prohibition

The following are ABSOLUTELY PROHIBITED under any justification:

- Silent error swallowing (empty catch blocks, catch-and-ignore)
- Graceful degradation that hides failures from consumers
- Default values that mask missing data (returning 0 when data is actually missing)
- Fallback paths that circumvent validation
- "Best effort" patterns that suppress errors
- Logging errors without failing the operation
- Returning partial results when full results are expected
- Catching exceptions and returning success
- Using nullish coalescing or logical OR with zero when the fallback should be an error, not a default value
- Any pattern where a consumer CANNOT distinguish between "data is 0" and "data is missing"

### 25.2 Explicit vs Silent

Every error path MUST be explicit. A consumer receiving a result MUST be able to determine:

- Did this operation succeed or fail?
- Is the data complete or partial?
- Are there missing fields, and which ones?
- Were all validations performed?

### 25.3 Quality Gate Specific

Quality gates, health scores, and scoring functions are SAFETY MECHANISMS. They MUST:

- Fail explicitly on invalid input (NaN, null, undefined, empty)
- NEVER return "pass" when data is missing
- NEVER return a score when input is invalid
- ALWAYS report exactly which check failed and why
- NEVER suppress warnings about data quality issues

### 25.4 Testing Implications

Tests MUST:

- Verify that errors are NOT silenced (assert that errors are thrown/logged)
- Verify that missing data produces EXPLICIT failure, not silent defaults
- Verify that NaN/Infinity inputs produce EXPLICIT failure, not silent passes
- NEVER use try/catch to hide test failures
- NEVER assert that silent degradation is acceptable

---

## 26. MOCK INTEGRITY (NON-NEGOTIABLE)

### 26.1 Mock Shape Fidelity

Every mock MUST match the exact shape of the real implementation. Mocking a function that returns `{ overall: 'pass', checks: [], score: number }` with `{ passed: true }` is a defect — it creates a test that passes with an invalid implementation.

### 26.2 Mock Boundary

Mocks MUST be placed at the correct boundary:

- **Unit tests**: Mock external dependencies (HTTP, filesystem, APIs). Do NOT mock the code under test.
- **Integration tests**: Mock only external systems. Do NOT mock internal modules that are part of the integration.
- **Wiring tests**: Mock only external systems. Let internal modules execute their real logic.

### 26.3 Mock Verification

Every test that mocks a function MUST verify that the mock was called (or not called) as expected. Unverified mocks are untested code paths.

### 26.4 Prohibited Mock Patterns

- Mocking the function under test (hides defects in that function)
- Mocking to return hardcoded good results (verifies mock, not logic)
- Mocking to return null when the real function returns data (hides empty-store bugs)
- Partial mocks that omit fields present in the real return type

---

## 27. FINAL INVARIANT

No rule may be reinterpreted, weakened, bypassed or combined to violate another rule.

If ambiguity, uncertainty, contradiction or insufficient authority exists:

STOP.
