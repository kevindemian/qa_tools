# Case18 Quality Evaluator — Feature Permanente (Score em Camadas) — v2

**Status:** APROVADO — iniciando implementação (T4.0)
**Autor:** OpenCode Agent
**Data:** 2026-08-04
**Branch:** `feature/associate-te-cli`
**Última revisão:** 2026-08-04 (v2 — judge compartilhado + bug report + round-trip)

---

## 0. Como usar este documento

Este plano é auto-suficiente. Um agente que NÃO participou do planejamento deve:

1. Ler este documento do início ao fim.
2. Ler os mecanismos de segurança (AGENTS.md raiz, `dev/docs/internal/ARCHITECTURE-CONTRACT.md`).
3. Executar as tarefas na ordem (T4.0 → T4.A → T4.1 → T4.2 → T4.3 → T4.4 → T4.B → T4.5 → T4.6 → T4.7).
4. Rodar o gate de verificação (T4.7) ANTES de qualquer commit.
5. Registrar progresso em `audit/functional/PROGRESS.md` se aplicável ao SOP.

---

## 1. Objetivo

Tornar permanente a avaliação de qualidade das gerações de issues por IA, usando essa
avaliação como **instrumento de refino** do prompt e das estruturas internas de geração.
O escopo cobre **dois** fluxos de geração LLM:

- **case18** — geração de suíte de test cases a partir de user story.
- **case17/case20 / bug-report** — geração de bug report a partir de descrição livre.

A herança deixada ao projeto é um **score de qualidade em camadas** com
**floor determinístico (âncora e gate) + aceitação humana real (ground truth) +
LLM-judge compartilhado (código pronto, DORME, nunca isolado)**.

Não é objetivo colocar modelo probabilístico no caminho de decisão de entrada.

---

## 2. Estado atual (verificado em 2026-08-04)

### 2.1 Features de geração LLM e avaliação existente

| Feature | Gera | Avaliação atual | Robustez |
|---|---|---|---|
| **case18** | `TestCase[]` via `llmPrompt` | (a) `case18-evaluator.ts` determinístico — **QUEBRADO**; (b) `requirement-score.ts` calibração humana | Floor quebrado; calibração humana robusta |
| **bug-report** (case17/20) | `BugReport` via `llmPrompt` | Só schema (`AiBugReportSchema`); `confidence:0.5` hardcoded; SEM promptVersion, SEM feedback, SEM provenance | **FRACA** — valida forma, não qualidade |
| **failure-analysis** (helper) | root cause + confidence | Guardas de qualidade; SEM ciclo de melhoria | Média |
| **run-comparison** | comparação LLM entre runs | Nenhuma | Fraca (ferramenta interna) |
| **targeted-retry** | retry de parse com hint | `recordRetry` (uso) | Instrumentação |
| **requirement-score** | — (avalia registros) | `source`+`standard`, pesos=1.0, grades ISO 25010 | **Robusta — REFERÊNCIA** |

### 2.2 Defeitos no case18 (código morto, 0 consumidores)

1. **Pesos somam 90%, não 100%** — falta `evaluateEP` (peso 10%). `case18-deterministic.ts`.
2. **Pipeline de dados quebrado** — `coverage` (25%) + `evidence` (10%) = 35% são
   **stripados pelo zod** (`TestCaseDataSchema` não os declara). Resultado: evaluator vê 0/35%.
3. **Não integrado** — `evaluateCase18` não é chamado em nenhum fluxo.
4. **Round-trip quebrado** — case18 grava steps com wrapper `fields` e `precondition`
   como objeto; `ImportJsonItemSchema` espera steps planos `{Action}` e `precondition`
   `string|string[]`. O import (menu 15) rejeitaria/desarraigaria o JSON.
5. **`promptVersion` hardcoded `'v2'`** em `case18.ts:255` — mudanças de prompt não rastreadas.

---

## 3. Decisões (todas autorizadas explicitamente)

| Decisão | Valor | Autorizado em |
|---|---|---|
| Modelo de score | **Camadas com papéis distintos** — NÃO 60/30/10 somado | Pergunta 1 |
| Ativação floor | **AGORA** no case18 | Pergunta 2 |
| Versionamento de prompt | **Hash sha256 do conteúdo** do arquivo de prompt | Pergunta refino |
| Benchmark de prompt | **Script dedicado** `npm run benchmark:case18` (ECSPOL-960 + sintéticos) | Pergunta refino |
| Herança | **TOTAL**: floor + cobertura + calibração + histórico de evolução + judge | Pergunta refino |
| LLM-judge | Código+testes AGORA, **DORME**; **infraestrutura compartilhada para TODAS as features LLM** | User mensagem |
| Posição do judge | **Aditivo às features determinísticas, NUNCA isolado** | User mensagem |
| Floor no judge | Floor entra como **contexto ancorado** (`floor: FloorInput` obrigatório). `combineScore` âncora número, faixa limite. | Pergunta "papel do floor" |
| Score final | `combineScore(floor, judgeEval)` = floor ± ajuste em faixa (≤10 pontos) quando calibrado | Pergunta "somada" |
| Provenance | `source`+`standard` por métrica (padrão `requirement-score.ts`/`REQUIREMENT_SCORE_PROVENANCE`) | Fixo |
| Critérios semânticos (correctness/consistency/self-containedness) | Fora do floor; rubricas do judge | Fixo |
| Tabela de cobertura | JSON+HTML em `reports/` + flag opcional na description da issue | Pergunta |

---

## 4. Arquitetura

```
CAMADA 1 — Determinística (FLOOR, obrigatória, ATIVADA)
  Pesos 100% (+EP). Schema coverage/evidence preservados. Provenance source+standard.
  Score 0-100 reproduzível. Feedback ao usuário no case18.

CAMADA 2 — Aceitação humana real (GROUND TRUTH, calibração contínua)
  ai-feedback.json (aceito/modificado/deletado) + dimensão bug. Correlaciona com score.
  NÃO é gate de decisão; recalibra thresholds. Reutiliza/estende requirement-score.

CAMADA 3 — LLM-as-judge (CEILING, código pronto, DORME) — COMPARTILHADO
  Núcleo genérico em shared/quality/llm-judge.ts
  - Contrato: evaluateWithLlmJudge(input, criteria, { calibrationSet, floor })
      → Promise<LlmJudgeResult | null>   (null sem calibragem κ>0.60, degradação explícita)
  - floor é influxo obrigatório (contexto ancorado) — judge nunca computa sem floor.
  - Catálogo de rubricas por feature em llm-judge.criteria.ts:
      case18: correctness, consistency, self-containedness (G-Eval CoT)
      bug-report: reproducibility, severity accuracy, evidence grounding
      failure-analysis: classification plausibility, confidence calibration
  - combineScore(floor, judgeEval): âncora num floor, ajusta em faixa (≤10).
      Judge nunca isolado: sem floor determinístico → resultado não é reportado.
  - Modelo de família diferente do gerador (G-Eval bias). Nenhum consumer importa até ativação.

ARTEFATO — Tabela de cobertura (critério × test case × status)
  JSON (SSOT) + HTML. Footer com standards (source+standard). Opcional: seção na issue.
```

---

## 5. Tarefas (ordem obrigatória)

### T4.0 — Corrigir round-trip case18→import [PRÉ-REQUISITO]

**Por quê:** destrava T4.2 (coverage/evidence viajando até a issue) e T4.4 (tabela de cobertura anexada). Sem isso a feature não opera de ponta a ponta.

**O que fazer:**
- Unificar o formato do JSON que o case18 grava (`reports/<date>/llm-generated-tests.json`)
  ao que `parseJsonFile` (`jira_management/import-prep-parsers.ts:278`) valida
  (`ImportJsonItemSchema`, `csv-import-schema.ts`).
- `steps`: devem ser serializadas sem wrapper `fields` — formato `{Action, Data, 'Expected Result'}`.
  Converter de `TestStep` (`shared/types/xray.ts:7`, wrapper `fields`) para shape plano.
- `precondition`: `string | string[]` (não `{type:'inline', value}`).
- NORMALIZAÇÃO pode ser feita em `parseJsonFile` (aceita ambos) OU na serialização do case18.
  **Decisão:** normalizar **na serialização do case18** (origem), conforme regra de root-cause (§4).
- Adicionar **teste de round-trip** (red→green, §19.11): caso case18-converted →
  `parseJsonFile` → `TestCase[]` com steps/preconditions íntegros.
  Sem mock-teatro: usar fixtures reais.

### T4.A — Auditoria de avaliações existentes

**Resultado da auditoria (já feita nesta sessão):**
- `requirement-score.ts`: **robusta** — vira referência canônica (source+standard, peso=1.0, grades).
- `case18-evaluator.ts`: **quebrada** → corrigida em T4.1.
- `bug-report`: **lacuna** → tratada em T4.B.
- `failure-analysis`/`run-comparison`: média/fraca → documentadas; herdam judge (T4.5).

**O que fazer:** gravar este resultado como referência no código/README do módulo (não criar
documento novo não solicitado — anotar inline via provenance).

### T4.1 — Corrigir Camada 1 (floor) do case18

**Arquivos:** `shared/quality/case18-deterministic.ts`, `shared/quality/case18-types.ts`,
testes.

**O que fazer:**
- Implementar `evaluateEP`: partições válidas/inválidas por campo com constraints. Peso 10%.
- Rebalancear pesos: coverage 25, stepConcreteness 20, precondition 15, BVA 15, EP 10,
  evidence 10, redundancy 5 = **100%**.
- Adicionar `epApplication` a `DeterministicResult['metrics']` em `case18-types.ts`.
- Ajustar testes existentes SE o score total mudar — correção de expectation errada (bug de peso),
  NÃO relaxamento (§19.5).
- **SAFEGUARD CLAUSES (§24):** cada métrica valida `Number.isFinite` antes de comparar;
  pesos validados somam 1.0 (throw se não).

### T4.2 — Fechar pipeline de dados (case18)

**Arquivos:** `jira_management/commands/case18.schema.ts`, `jira_management/commands/case18.ts`.

**O que fazer:**
- `TestCaseDataSchema`: adicionar `coverage: {criterionId, criterionText}[]` e `evidence: string[]`.
- `TestCaseData` (interface, `case18.ts` ~290): declarar `coverage`/`evidence`.
- Preservar em `convertTestCases`.
- Prompts `shared/prompts/user-story-to-tests.md` (linhas 23, 52) já instruem a gerar;
  manter.
- Novo conversor `TestCaseData → GeneratedTestCase` (shape do evaluator).

### T4.3 — Integrar floor no case18.handler

**Arquivo:** `jira_management/commands/case18.ts`.

**O que fazer:**
- Após `llmPrompt`: montar `GeneratedTestCase[]`, chamar `evaluateCase18`.
- Exibir score, grade, métricas com `failed` (top problemáticas).
- Persistir score/grade em `AiGenerationRecord` (extender tipo em `shared/types/llm.ts` +
  `shared/quality/ai-feedback.ts`).
- Salvar relatório JSON em `reports/<date>/` via `writeReport`.

### T4.4 — Tabela de cobertura + provenance

**Arquivo novo:** `shared/quality/case18-coverage-table.ts`.

**O que fazer:**
- Tabela critério × test case × status (coberto/não coberto).
- Seção de standards com `source`+`standard` (ISTQB CTFL, ISO/IEC 29119-4, ISO/IEC 25010:2023,
  ISO/IEC 25023:2016, Kaleidoscope arXiv:2607.14673, G-Eval EMNLP 2023, SLR Barraood 2021).
- JSON (SSOT) + HTML (visual), via `writeReport`.
- **Opcional** (config/flag): anexar seção da tabela à description da issue.
  Default de importação inalterado.

### T4.B — Herança ao bug report

**Arquivo:** `shared/report/bug-report.ts`, `shared/quality/ai-feedback.ts`.

**O que fazer:**
- `promptVersion` por **hash sha256** do conteúdo de `bug-report-from-description.md`
  (hoje ausente) — mesmo mecanismo da T4.6.
- **Feedback de aceitação** do bug (criado/descartado) → `ai-feedback` →
  `requirement-score`/`ai-effectiveness` ganham dimensão bug.
- Tabela de cobertura reutilizada para schema de bug (`evidence` já existe).
- **NÃO** criar score determinístico próprio de bug agora (escopo mínimo; postergado).

### T4.5 — LLM-judge genérico (DORME, não ativado)

**Arquivos novos:** `shared/quality/llm-judge.ts`, `shared/quality/llm-judge.criteria.ts`,
`shared/quality/llm-judge.schema.ts`, `shared/quality/llm-judge-calibration.ts` (cohenKappa).

**O que fazer:**
- `cohenKappa` puro (fixtures testáveis).
- Núcleo: `evaluateWithLlmJudge(input, criteria, { calibrationSet?, floor })`
  → `Promise<LlmJudgeResult | null>`.
- `floor` é influxo obrigatório (contexto ancorado). Judge nunca computa sem floor.
- `combineScore(floor, judgeEval)`: âncora no floor, ajusta em faixa (≤10).
- G-Eval (CoT por métrica + scoring por probabilidade).
- Reliability-gate: without `calibrationSet` or κ ≤ 0.60 → **null explícito** (§25).
- Modelo de família diferente do gerador.
- **Não importado por `case18.ts`/`bug-report.ts`** — chamado só por testes e futura ativação.

### T4.6 — Testes (contém T4.0-T4.5 + T4.B)

**Arquivos:** novos junto a cada módulo.

| Alvo | Casos |
|---|---|
| T4.0 round-trip | case18-converted → parseJsonFile → TestCase com steps/precondition íntegros |
| T4.1 | EP unit (partições), pesos somam 1.0 |
| T4.2 | schema valida coverage/evidence; conversor preserva; red→green (não vê mais 0/35%) |
| T4.4 | tabela cobertura (coberto/não), standards presentes |
| T4.5 | cohenKappa (1.0/0/intermediário); gate κ; judge com llmPrompt mockado (padrão llm-review.test.ts); null sem calibragem; **anti-eco** (judge ≠ replicação linear do floor); combinacao faixa ±10 |
| T4.3 | handler com llmPrompt mock → recordAiGeneration recebe score |
| T4.B | hash muda com conteúdo; feedback de bug para ai-feedback |

**Sem mock-teatro (§26):** mockar SOMENTE fronteiras externas (HTTP/llmPrompt/infra). Lógica
local roda de verdade. Se teste falha → bug está no código-fonte, não no assert.

### T4.7 — Verificação (GATE PRÉ-COMMIT)

- `npm run build` / `npx tsc --noEmit` verde.
- Suíte case18 + suíte `shared/__tests__` + novos testes 100% verde.
- Benchmark manual: `npm run benchmark:case18` registra score correto.
- Ajustes de peso podem afetar testes pré-existentes do evaluator — corrigir no CÓDIGO.

---

## 6. Fora de escopo (declarado)

- Ativação da Camada 3 (judge) no fluxo de produção — dorme até calibração real com labels.
- Camada 2 (aceitação humana) como gate de decisão — só calibração/relatório.
- Score determinístico próprio do bug report — postergado por decisão do usuário.
- Criação de documentos de memória/documentação não solicitados.

---

## 7. Riscos e limitações

- κ testado só com fixtures sintéticas — validade empírica vs humanos não verificada até labels
  reais (limitação documentada, não defeito).
- **Eco judge→floor** (anchoring bias reverso): mitigado por rubricas semânticas em eixos que o
  floor NÃO mede + teste anti-eco.
- **Propagação de erro**: floor quebrado contamina judge → T4.1/T4.2 PRECEDEM T4.5.
- Corrigir pesos pode mudar scores de testes — esperado (correção de bug, não relaxamento).
- Custo Camada 3 só ao ativar (fora do caminho bloqueante por contrato).

---

## 8. Mecanismos de segurança a respeitar (resumo)

- **§24 Safeguard clauses:** NaN/Infinity guards ANTES de comparar; null/undefined guards;
  coleções vazias explícitas; limites (negativos/zero/NaN/MAX_SAFE_INTEGER).
- **§25 Zero silenciamento:** nenhum catch vazio; erros logados e explícitos; fallback = erro,
  não default mascarado; consumidor DISTINGUE "0" de "ausente".
- **§26 Mock integrity:** mocks só em fronteiras externas; shape fiel; verificar chamadas.
- **§19 Testes:** testes = contrato; teste falha → bug no código; nunca mudar expectation.
- **§18 Bypass:** qualquer bypass de segurança exige autorização explícita do usuário.
- **ARCHITECTURE-CONTRACT:** `shared/` não importa `git_triggers/` (G3); CI 100% gerado (G2);
  PR entry point único (G1).

---

## 9. Referências

1. Kaleidoscope — arXiv:2607.14673 (GovTech Singapore, Jul/2026) — verificado real.
2. G-Eval — Liu et al., EMNLP 2023 (Spearman 0.514 vs humanos; self-preference bias).
3. Startdebugging 2026 — LLM-as-judge vs rule-based: floor/ceiling, keep model out of blocking path.
4. ISTQB CTFL — técnicas de design (EP, BVA, state transition, error guessing).
5. ISO/IEC 29119-4, ISO/IEC 25010:2023, ISO/IEC 25023:2016.
6. SLR Test Case Quality — Barraood et al. 2021 (7 fatores/32 critérios).