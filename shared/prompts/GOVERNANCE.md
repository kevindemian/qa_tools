# Prompt Governance — QA Tools

## 0. Purpose

This document defines the governance model for all LLM prompts in the QA Tools project.
It establishes authority sources, invariant requirements, and forbidden patterns for prompt design.

Unlike `AGENTS.md` (which governs opencode's behavior), this document governs prompts consumed
by the project's own LLM pipeline (`llm-client.ts` + validators), regardless of tooling context.

---

## 1. Scope

This governance applies to:

- All files in `shared/prompts/*.md`
- Inline system prompts in `shared/*.ts`, `git_triggers/*.ts`
- Prompt templates embedded in any module under `shared/`, `git_triggers/`, `jira_management/`
- Fixtures and test data for prompts (`shared/prompts/__fixtures__/`)

---

## 2. Authority Model

### Valid Authority

Sources that can justify prompt design decisions:

| Source                               | Type                       | Example                             |
| ------------------------------------ | -------------------------- | ----------------------------------- |
| ISO/IEC/IEEE 29119                   | Formal standard            | Test design techniques (Part 4)     |
| ISTQB Foundation/Advanced            | Official body of knowledge | EP, BVA, state transition           |
| IEEE 829                             | Formal standard            | Test documentation structure        |
| ISO/IEC 25010                        | Formal standard            | Software quality model              |
| Jira/Xray official API documentation | Official documentation     | Test case schema, field constraints |
| Explicit user requirements           | Domain requirement         | Project-specific rules              |
| GitLab/GitHub API documentation      | Official documentation     | CI/CD integration constraints       |

### Invalid Authority

Sources that **cannot** justify prompt design decisions:

- "Industry best practices" without a cited source
- Vague quality directives ("write good tests", "be thorough", "ensure quality")
- Implementation behavior of other tools
- Convenience, effort, or speed arguments
- Uncited blog posts or opinion articles

---

## 3. Priority Hierarchy

Strict order — lower levels MUST NOT justify violating higher levels:

1. **Domain correctness** — artifact must be valid for its consumer (Jira/Xray, pipeline, report)
2. **Explicit requirements** — user-provided story, criteria, or specification
3. **Formal standards** — ISO 29119, ISTQB, IEEE 829, ISO 25010
4. **This document** — governance rules defined herein
5. **Prompt conventions** — CONSTITUTION, adversarial audit, BAD EXAMPLES pattern

---

## 4. Minimum Requirements for ALL Prompts

Every prompt MUST include:

### 4.1 CONSTITUTION

Five invariant rules that cannot be removed or weakened:

```
Rule 1: Never hallucinate. If you don't know, say "Not specified".
Rule 2: Never omit relevant information from the provided context.
Rule 3: Never assume behavior not described in the input/requirements.
Rule 4: Every conclusion MUST cite specific evidence from the input.
Rule 5: Start from the premise that your output is WRONG.
        Verify each claim before finalizing.
```

### 4.2 BAD EXAMPLES

At least 3 anti-patterns showing what FAILS validation, with corrections.

### 4.3 Output Schema

Explicit specification of the expected output format (JSON schema or structure).

### 4.4 Adversarial Audit Checklist

A numbered checklist that the LLM executes mentally before responding.
Must include: evidence verification, coverage check, format compliance.

### 4.5 Evidence Requirement

Instruction to cite specific input text supporting each claim.

---

## 5. Forbidden Transformations

The following are INVALID in any prompt:

- Vague quality directives without source ("follow best practices", "ensure high quality")
- Instructions that contradict existing validators (I-01..I-05, T-01..T-12)
  Note: validators must be updated if prompt changes intentionally alter behavior
- Removal or weakening of the CONSTITUTION
- Removal of output schema specification
- Introduction of ambiguity in success/failure criteria

---

## 6. Change Process

Any modification to a prompt MUST:

1. Comply with Section 2 (Authority Model)
2. Preserve all Section 4 (Minimum Requirements)
3. Not introduce any Section 5 (Forbidden Transformations)
4. Be validated against the benchmark BEFORE and AFTER change:
    - Run `BENCHMARK=true npx tsx shared/llm-benchmark.ts` before (baseline)
    - Apply change
    - Run benchmark again (post-measurement)
    - Report delta in pass rate, coverage metrics, and token count
5. If pass rate drops >5%: revert the change and investigate root cause

---

## 7. Test Design Techniques (Standards Reference)

When prompts generate test cases, they MUST reference at least one of:

| Technique                     | Standard Source         | Description                                                            |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| Equivalence Partitioning (EP) | ISO 29119-4, ISTQB CTFL | Divide input domain into partitions; each partition must have ≥1 test  |
| Boundary Value Analysis (BVA) | ISO 29119-4, ISTQB CTFL | Test values at and adjacent to boundaries (min, max, min-1, max+1)     |
| State Transition Testing      | ISO 29119-4, ISTQB CTFL | Cover valid + invalid state transitions                                |
| Error Guessing                | ISTQB CTFL              | Include tests for common errors (null, empty, overflow, special chars) |

Prompts SHOULD explicitly name the technique being requested to provide audit traceability.

---

## 8. Enforcement

This governance document is enforced through:

- **Static analysis**: code review must check compliance before prompt changes are merged
- **Benchmark regression**: CI must warn if pass rate drops below baseline
- **Validator invariants**: T-11 (partition coverage), T-12 (boundary coverage), and T-13 (redundancy/coupling) in `test-case-validator.ts` provide programmatic enforcement
- **Audit trail**: all prompt changes must reference the relevant section of this document

---

## 9. Exceptions

Any exception to this governance requires:

1. Written justification citing source from Section 2 (Valid Authority)
2. Demonstrated equivalence proof (Section 6 of AGENTS.md applies by analogy)
3. Explicit approval documented in the PR description

No exception may weaken the CONSTITUTION or remove output schema specification.

---

## 10. Formal Definitions — Redundancy, Overlap, Coupling

These definitions apply to T-13 invariant enforcement and to prompt-level anti-pattern guidance.

### 10.1 Redundancy

Two tests are **redundant** when their execution behavior is structurally identical —
the same steps, with only cosmetic differences (data values that do not change the execution path).

**T-13 detection**: steps token overlap ≥ 80% AND title+expectedResult Levenshtein ≥ 85%.
**Enforcement**: `error` — merge into data-driven test or remove one.

**Valid exceptions**: EP/BVA variations where same-step structure tests different
partition boundaries (e.g., "Enter age 18" and "Enter age 65" are NOT redundant
because they cover different equivalence partitions).

### 10.2 Overlap

Two tests **overlap** when they cover the same acceptance criterion or criteria
via a shared subset of steps but differ in other aspects (preconditions, assertions).

**T-13 detection**: coverage criterionId Jaccard ≥ 75%.
**Enforcement**: `warning` — review whether tests test different behavior or just
repeat the same scenario with different data.

### 10.3 Coupling

Two tests are **coupled** when one test creates or modifies a resource (user, record,
session) that another test depends on — creating an implicit ordering dependency.

**T-13 detection**: test A steps contain a create/register/add keyword with a named
resource AND test B steps contain the same resource name.
**Enforcement**: `warning` — document the ordering dependency explicitly in
preConditions or decouple the tests.

### 10.4 Definitions — Prompt Applicability

The above definitions also govern the adversarial audit checklist in
`user-story-to-tests.md`. Prompt-level audit items MUST reference these definitions
by name ("redundancy", "overlap", "coupling") to maintain audit traceability.
