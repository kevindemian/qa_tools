# Case18 Quality Evaluator — Plano de Implementação

**Data**: 2026-07-23
**Branch**: `feature/associate-te-cli`
**Status**: Em implementação

---

## Objetivo

Avaliar quality do output do case18 (AI Test Generation) de forma determinística (60%) + LLM-as-judge (30%) + calibração humana (10%), baseado na pesquisa:

- **Project Kaleidoscope** (GovTech Singapore, arXiv:2607.14673, Jul 2026)
- **OpenAI Evals Framework** (model-graded eval templates)
- **ISTQB CTFL** (test design techniques: EP, BVA, State Transition, Error Guessing)

---

## Arquitetura: 3 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 1: Deterministic Checks (100% rule-based)           │
│  Peso: 60%                                                  │
│  - Coverage: criteria citadas / total                       │
│  - Structural: step count, precondition count               │
│  - Redundancy: Jaccard similarity ≥ 80%                     │
│  - Pattern: vague verbs, generic preconditions              │
│  - BVA: regex detect ranges + boundary tests                │
│  - Evidence: non-empty evidence array                       │
│  Score: 0-100                                               │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 2: LLM-as-Judge (semantic, reliability-gated)      │
│  Peso: 30%                                                  │
│  - ONE judge per metric (Kaleidoscope finding)              │
│  - 3 candidate judges per metric                            │
│  - Gate: Cohen's κ > 0.60 vs calibration set                │
│  - Majority vote only when gate passes                      │
│  - Metrics: step concreteness, precondition specificity,    │
│             expected result verifiability                    │
│  Score: 0-100                                               │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 3: Human Calibration (optional, startup)            │
│  Peso: 10%                                                  │
│  - Baseline: 14 ECSPOL-960 tests (human-validated)          │
│  - Calibrate thresholds against baseline                    │
│  - Grade boundaries: A≥90, B≥75, C≥60, D≥40, F<40          │
│  - Re-calibrate when prompt changes                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Decisões Técnicas

| Questão | Solução | Justificativa |
|---------|---------|---------------|
| Camada 2 timing | Layer 1 primeiro → validar → Layer 2 | Red-green-refactor; isola defeitos |
| Baseline | ECSPOL-960 real + sintético para BVA/EP | Gold standard real + cobertura de técnicas |
| Threshold | Cohen's κ > 0.60 + fallback humano | Padrão literatura (Landis & Koch, 1977) |
| Output | JSON (SSOT) + HTML (humano) + ai-feedback | Programático + visual + histórico |

---

## Métricas Camada 1 (Deterministic)

### 1.1 Coverage Completeness
- **Critério**: Todas acceptance criteria cobertas?
- **Fórmula**: `citedCriteria / totalCriteria × 100`
- **Peso**: 25%

### 1.2 Step Concreteness
- **Critério**: Steps são imperativos, não vagos?
- **Detect**: verbs como "validate", "ensure", "check", "verify" = vago
- **Fórmula**: `concreteSteps / totalSteps × 100`
- **Peso**: 20%

### 1.3 Precondition Specificity
- **Critério**: Preconditions são específicas?
- **Detect**: "Login setup", "User is logged in", "Setup" = genérico
- **Fórmula**: `specificPreconditions / totalPreconditions × 100`
- **Peso**: 15%

### 1.4 BVA Application
- **Critério**: Para ranges numéricos, testa boundaries?
- **Detect**: regex `(\d+)\s*[-–]\s*(\d+)` no criteria
- **Check**: tests existem nos boundaries (min-1, min, max, max+1)
- **Peso**: 15%

### 1.5 EP Application
- **Critério**: Partições válidas/inválidas cobertas?
- **Detect**: input fields com constraints
- **Check**: tests com empty/null/special chars
- **Peso**: 10%

### 1.6 Evidence Citations
- **Critério**: Cita evidências do input?
- **Check**: `evidence` array não vazio
- **Peso**: 10%

### 1.7 Redundancy
- **Critério**: Tests duplicados?
- **Check**: Jaccard similarity ≥ 80% entre steps
- **Penalty**: -10 por duplicata
- **Peso**: 5%

---

## Benchmarks

### Baseline Primário: ECSPOL-960
- 14 test cases reais
- 8 acceptance criteria
- Criados por humanos, importados no Jira
- Validados via `reports/TEST_SUIT_ECSPOL-960-jira-mapping.json`

### Benchmarks Sintéticos
- **BVA**: range 18-65, expect tests at 17,18,65,66
- **EP**: valid/invalid partitions
- **State Transition**: valid/invalid transitions
- **Error Guessing**: null, empty, special chars

---

## Arquivos

```
shared/quality/
├── case18-evaluator.ts          # Engine principal
├── case18-deterministic.ts      # Camada 1 (rule-based)
├── case18-llm-judge.ts          # Camada 2 (LLM-as-judge) — FUTURE
├── case18-calibration.ts        # Camada 3 (baseline comparison) — FUTURE
└── case18-benchmarks.ts         # Dados de calibração (ECSPOL-960)

shared/__tests__/
└── case18-evaluator.test.ts     # Unit tests

dev/docs/internal/
└── CASE18-QUALITY-EVALUATOR-PLAN.md  # Este documento
```

---

## Fluxo de Execução

```typescript
async function evaluateCase18Output(
  testCases: TestCase[],
  acceptanceCriteria: string,
  options: { useLLMJudge?: boolean; calibrationSet?: TestCase[] }
): Promise<EvaluationResult> {
  // Layer 1: Deterministic (always runs)
  const deterministic = evaluateDeterministic(testCases, acceptanceCriteria);
  
  // Layer 2: LLM Judge (optional, reliability-gated)
  let llmJudge = null;
  if (options.useLLMJudge) {
    llmJudge = await evaluateWithLLMJudge(testCases, acceptanceCriteria);
  }
  
  // Layer 3: Calibration (if baseline provided)
  let calibration = null;
  if (options.calibrationSet) {
    calibration = calibrateAgainstBaseline(deterministic, options.calibrationSet);
  }
  
  return combineScores(deterministic, llmJudge, calibration);
}
```

---

## Grade Boundaries

| Grade | Score | Significado |
|-------|-------|-------------|
| A | ≥ 90 | Excelente — pronto para importação |
| B | ≥ 75 | Bom — menor revisão necessária |
| C | ≥ 60 | Aceitável — revisão moderada |
| D | ≥ 40 | Fraco — revisão significativa |
| F | < 40 | Insuficiente — rejeitar |

---

## Referências

1. **Project Kaleidoscope** (arXiv:2607.14673) — Contextual, Human-Aligned Evaluation
2. **OpenAI Evals** — model-graded eval templates
3. **ISTQB CTFL** — test design techniques (EP, BVA, State Transition, Error Guessing)
4. **Landis & Koch (1977)** — Cohen's κ interpretation thresholds
