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

## 15. FINAL INVARIANT

No rule may be reinterpreted, weakened, bypassed or combined to violate another rule.

If ambiguity, uncertainty, contradiction or insufficient authority exists:

STOP.
