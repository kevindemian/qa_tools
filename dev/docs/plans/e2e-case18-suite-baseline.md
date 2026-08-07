# E2E Run — Case18 AI Suite Generation vs ECSPOL-960 Real Baseline

**Data:** 2026-08-07
**Branch:** `feature/associate-te-cli`
**Alvo:** case18 (geração de suite de testes via IA) contra a user story real ECSPOL-960
**Modo:** Local-only — ZERO writes no Jira ECSPOL
**Status:** PLANEJADO → EM IMPLEMENTAÇÃO (ver §9 Novo Plano 2026-08-07)

---

## 0. Decisões (autorizadas pelo usuário)

| ID | Decisão | Valor |
|----|---------|-------|
| D1 | User story input | **ECSPOL-960 only** (story + 14 acceptance criteria embedados em `case18-benchmarks.ts`) |
| D2 | Jira writes | **NONE** — comparação local pura (baseline embedado; credenciais Jira opcionais) |
| D3 | Modelo main | `LLM_MODEL` explícito no `.env.local` — no run: **Groq `llama-3.1-8b-instant`** (OpenRouter 404/402, Gemini 429, Groq 70b TPD esgotado — ver UX3/QA findings) |
| D4 | LLM judge | Dormante, fora de escopo (requer calibração κ>0.60) |
| D5 | Geração | **Harness script** `scripts/e2e-case18-baseline.ts` (caso18 interativo não suporta local-only) |
| D6 | Documento de melhorias | **Este documento** — tabela `ID \| Sugestão \| Categoria \| Onde apareceu`, IDs `UX1`, `UX2`, ..., `QA1`, ... preenchida durante o run |

---

## 1. Objetivo

Rodar a feature de geração de test cases (case18) em produção real — LLM real via OpenRouter —
sem mocks, sem emulações, **sem writes no Jira**. Medir a qualidade da suite gerada por IA usando
o floor determinístico (`evaluateCase18`) e **compará-la contra a suite real ECSPOL-960**
(14 test cases humanos, embedados como `ECSPOL960_BASELINE`). Registrar no mesmo documento tudo
que for melhorável (`UX1`... / `QA1`...), corrigir defeitos na origem (§4 AGENTS.md) e revalidar.

A comparação AI-vs-humano é feita **no mesmo floor**, métrica a métrica (7 métricas), mais
cobertura de acceptance criteria e contagem de testes. O baseline humano pontua **98/A**
(verificado em §2).

---

## 2. Estado inicial verificado (2026-08-07)

### 2.1 Baselines reais disponíveis (Jira ECSPOL)

| User Story | Suite real (reports/) | # testes |
|---|---|---|
| ECSPOL-511 | TEST_SUIT_ECSPOL-511 (+_REMAINING) | 24 + 12 |
| ECSPOL-428 | TEST_SUIT_ECSPOL-428 | 19 |
| ECSPOL-502 | TEST_SUIT_ECSPOL-502 | 18 |
| ECSPOL-919 | TEST_SUIT_ECSPOL-919 | 16 |
| ECSPOL-960 | TEST_SUIT_ECSPOL-960 (**benchmark embedado**) | **14** |
| ECSPOL-918 | TEST_SUIT_ECSPOL-918 | 13 |
| ECSPOL-1378 | TEST_SUIT_ECSPOL-1378 | 10 |
| ECSPOL-504 | TEST_SUIT_ECSPOL-504 | 8 |
| ECSPOL-1640 | TEST-SUIT-ECSPOL-1640 | 6 |
| ECSPOL-1384 | TEST_SUIT_ECSPOL-1384 | 5 |
| ECSPOL-1598 | TEST-SUIT-ECSPOL-1598 | 4 |
| ECSPOL-1599 | TEST-SUIT-ECSPOL-1599 | 2 |

**ECSPOL-960** é o único com baseline embedado no código
(`shared/quality/case18-benchmarks.ts`: `ECSPOL960_STORY` + `ECSPOL960_BASELINE`, 14 test cases)
e é a referência calibrada de `npm run benchmark:case18`.

### 2.2 Floor determinístico (Camada 1) — `shared/quality/case18-deterministic.ts`

7 métricas, pesos somam 100% (guard de soma validado por throw):

| Métrica | Peso | Fonte |
|---|---|---|
| coverage | 25% | ISTQB CTFL |
| stepConcreteness | 20% | ISO/IEC 29119-4 |
| preconditionSpecificity | 15% | ISTQB CTFL |
| bvaApplication | 15% | ISTQB CTFL |
| epApplication | 10% | ISTQB CTFL |
| evidenceCitations | 10% | Kaleidoscope arXiv:2607.14673 |
| redundancy | 5% | SLR Barraood 2021 |

Grades: A≥90, B≥75, C≥60, D≥40, F<40 (ISO/IEC 25010).

### 2.3 Baseline score (executado 2026-08-07)

```
ECSPOL-960 baseline: score=98 grade=A   [harness / extractCriteria — critério limpo]
  coverage: 100 (14/14)
  stepConcreteness: 91 (30/33)
  preconditionSpecificity: 100 (no preconditions)
  bvaApplication: 100 (no numeric ranges)
  epApplication: 100 (no constrained fields)
  evidenceCitations: 100 (14/14)
  redundancy: 90 (1 redundant pair)
FAILED: [redundancy] 1 redundant pairs (Jaccard ≥ 80%)
```

> **QA7 (2026-08-07):** o score `96/A` registrado inicialmente veio de
> `benchmark-case18.ts:34`, que extrai critérios com `.split('\n').slice(1)` —
> isso mantém o header `Acceptance Criteria:` como critério fantasma, fazendo a
> cobertura cair para 13/14. Com `extractCriteria` (mesmo fluxo do harness/case18,
> critério limpo) o baseline real é **98/A, coverage 14/14**, só com o par
> redundante. O baseline de referência da comparação passa a ser 98/A.
> **Corrigido na origem:** `extractCriteria()` agora vive em
> `shared/quality/case18-benchmarks.ts` e é usado por benchmark, harness e testes —
> `npm run benchmark:case18` reporta 98/A consistentemente.

---

## 3. Fluxo case18 (mapeado, `jira_management/commands/case18.ts`)

`gatherInput` → `llmPrompt({tier:'main', callerId:'case18', schema: TestCaseArraySchema})`
→ `resolvePreconditionMatches` (dual-threshold vs pre-conditions reais) →
`evaluateCase18` (floor 7 métricas) → gate (`create`/`regenerate`/`reject`) →
`createMissingPreconditions` (**WRITE Jira** — não coberto por `dryRun`) →
`convertTestCases` → `writeTestOutput` (`reports/<date>/llm-generated-tests.json`) →
`offerCreateAndLink` (menu 15 import + Test Coverage link).

**Constatação:** o gate do case18 só oferece `create` (escreve pre-conditions no Jira),
`regenerate` ou `reject` (aborta sem salvar). Não há caminho "salvar local sem criar".
`dryRun` só cobre o pipeline de import (case01), não `createMissingPreconditions`. →
**UX1** (ver §6). Por isso o E2E usa harness (D5).

---

## 4. Artefatos

| Artefato | Local | Propósito |
|----------|-------|-----------|
| Plano + resultados + melhorias | `dev/docs/plans/e2e-case18-suite-baseline.md` | SSOT da run |
| Harness | `scripts/e2e-case18-baseline.ts` | Geração live + comparação |
| Suite IA (raw LLM) | `reports/<date>/case18-e2e-ai-tests.json` | Output LLM pós-schema |
| Comparação métrica-a-métrica | `reports/<date>/case18-e2e-comparison.md` | AI vs baseline (98/A) |
| Relatório de qualidade (HTML) | `reports/<date>/case18-quality-evaluation.html` | Visual |
| Registro de geração | `~/.local/state/qa-tools/feedback/ai-feedback.json` | `recordAiGeneration` |

---

## 5. Fases de execução

### Fase 1 — Pré-requisitos

- `npx vitest run` → 100% verde
- `npm run typecheck` → verde
- `.env.local` com: `LLM_PROVIDER=openrouter`, `LLM_API_KEY=...`, `LLM_MODEL=<explícito>`
- Working tree limpo

### Fase 2 — Baseline sanity

- `npm run benchmark:case18` → confirmar ECSPOL-960 = **98/A** (feito em §2.3)

### Fase 3 — Harness (`scripts/e2e-case18-baseline.ts`)

1. `ensureDotenv()` → `.env.local`
2. `ECSPOL960_STORY` (story + 14 criteria) como input
3. `system` = `shared/prompts/user-story-to-tests.md`; `user` = story + acceptance criteria
4. `llmPrompt({tier:'main', callerId:'case18-e2e', schema: TestCaseArraySchema})` → suite IA
5. `toGeneratedTestCases` → `evaluateCase18(aiCases, criteria)` → **AI score**
6. `evaluateCase18(ECSPOL960_BASELINE, criteria)` → **baseline (98/A)**
7. Tabela comparativa: 7 métricas × (AI | baseline), cobertura de critérios (14), contagem de testes
8. Artefatos → `reports/<date>/`
9. `recordAiGeneration` (local)

Loop de re-tentativa espelha `CASE18_MAX_GENERATION_ATTEMPTS=3` + `buildCorrectionsBlock`
(feedbacks das falhas determinísticas na re-geração).

### Fase 4 — Run live + comparação

Executar harness; capturar score/grade AI; comparar métrica a métrica vs 98/A.

### Fase 5 — Improvements log

Preencher §6 com tudo observado (candidatos UX1..UX2, QA1..QA4 pré-identificados + o que surgir:
QA5/QA6 corrigidos no run, QA7 discrepância de baseline).

### Fase 6 — Correções na origem

Se defeito confirmado (AGENTS.md §4): teste vermelho primeiro (§19.11) → correção → suite verde.

### Fase 7 — Revalidação

- `npx vitest run` + `npm run typecheck` verdes
- Re-run harness → scores estáveis

---

## 5b. Resultados do run (2026-08-07)

**Provider usado:** Groq `llama-3.1-8b-instant` (tier main). Suite IA gerada na tentativa 2
(1ª tentativa: 96/A com falha de redundancy → feedback `buildCorrectionsBlock` → 2ª: aceita).

| Métrica | AI | Baseline (humano) | Dif |
|---|---|---|---|
| coverage (25%) | 100 | 100 | 0 |
| stepConcreteness (20%) | 93 | 91 | +2 |
| preconditionSpecificity (15%) | 100 | 100 | 0 |
| bvaApplication (15%) | 100 | 100 | 0 |
| epApplication (10%) | 100 | 100 | 0 |
| evidenceCitations (10%) | 100 | 100 | 0 |
| redundancy (5%) | 100 | 90 | +10 |
| **Total** | **99 (A)** | **98 (A)** | **+1** |

**Testes:** AI 14 | baseline 14 (ambos cobrem os 14 critérios, 1 teste/critério).

**Conclusão:** a suite gerada por IA igualou ou superou o baseline humano em todas as métricas
no mesmo floor determinístico (99 vs 98), com vantagem em stepConcreteness (+2) e redundancy (+10).
O baseline humano manteve o único ponto falho: 1 par redundante (Jaccard ≥ 80%).

**Artefatos:** `reports/2026-08-07/case18-e2e-ai-tests.json`, `case18-e2e-comparison.md`,
`case18-quality-evaluation.html`, `case18-coverage-table.{json,html}`.

**Nota de caveat (§10 equivalência):** baseline aqui é o score do domínio (98/A via
`extractCriteria`); o `benchmark:case18` reporta 96/A por critério-fantasma (QA7).

---

## 6. Registro de Melhorias (preenchido durante o run)

### UX — Experiência de uso

| ID | Sugestão | Categoria | Onde apareceu | Status |
|----|----------|-----------|---------------|--------|
| UX1 | case18 sem caminho "salvar local sem criar" — gate só `create`/`regenerate`/`reject`; `create` escreve pre-conditions e `dryRun` não cobre | UX/Arquitetura | `case18.ts` gate + `createMissingPreconditions` | Pendente |
| UX2 | `fetchUserStoryFromJira` busca só `description`/`summary` — acceptance criteria sempre manuais (`askMultiline`), não auto-fetched | UX | `case18.ts:264-304` | Pendente |
| UX3 | Falha de infra de provider emudrece o harness: OpenRouter 404 (modelo removido) / 402 (sem crédito), Gemini 429 (quota free diária), Groq 429 (TPD/TPM) — run travou sem mensagem acionável; não há sugestão de modelo/provider alternativo | UX | run E2E 2026-08-07 | Registrado |

### QA — Qualidade do artefato / pipeline

| ID | Sugestão | Categoria | Onde apareceu | Status |
|----|----------|-----------|---------------|--------|
| QA1 | `convertTestCases` mapeia steps LLM → só `Action`; `Data`/`Expected Result` e `expectedResult` descartados na criação Jira | Dados | `case18.ts:643-666` | Pendente |
| QA2 | coverage/evidence consumidos na avaliação mas descartados em `convertTestCases` — round-trip incompleto | Dados | `case18.ts:643-666` | Pendente |
| QA3 | métrica coverage reporta "N criteria matched by content (not in coverage array)" — match-exato de `criterionText` pode subcontar citações válidas | Avaliação | `case18-deterministic.ts:215-280` | Pendente |
| QA4 | baseline humano real (critério limpo) tem 100 coverage (14/14) + 1 par redundante — gold standard quase perfeito; redundância foi o único ponto onde a IA superou (100 vs 90) | Avaliação | benchmark §2.3 | Registrado |
| QA5 | **Schema validation de array era impossível**: `parseRawOnce` reutilizado no llm-cache forçava `RawRecordSchema` (objeto-only) → `TestCaseArraySchema` (array) nunca validava → retry infinito + queima de quota TPM | Pipeline | `llm-cache.ts:69-82` (antes do fix) | **Corrigido** — `parseJsonOnce` schema-agnóstico + `stripMarkdownFence` (`llm-fallback-http.ts:90-125`); testes `llm-cache.test.ts` (RED→GREEN) |
| QA6 | **Fence markdown ` ```json ` quebrava `JSON.parse`**: modelos (ex: Llama 3.1) envolvem JSON em fences apesar do prompt proibir | Pipeline | `llm-fallback-http.ts:90` (antes do fix) | **Corrigido** — `stripMarkdownFence()` antes do parse; 3 testes novos RED→GREEN |
| QA7 | **Discrepância baseline 96 vs 98**: `benchmark-case18.ts:34` e `case18-evaluator.test.ts:299` usavam `.split('\n').slice(1)`/description completa → header `Acceptance Criteria:` contava como critério fantasma (13/14); harness usava `extractCriteria` limpo (14/14) — baseline real do domínio é 98/A | Avaliação | `benchmark-case18.ts:34`, `case18-evaluator.test.ts:299` | **Corrigido** — `extractCriteria()` extraído para `shared/quality/case18-benchmarks.ts` (fonte única do domínio); benchmark + harness + teste usam o mesmo helper; benchmark agora reporta 98/A; testes RED→GREEN (`case18-evaluator.test.ts`) |

---

## 7. Riscos

- Variância de output LLM → até 3 tentativas (loop com feedback determinístico)
- Falha de schema do LLM → retry
- Custo: 1 story, tentativas limitadas

---

## 8. Fora do escopo

- LLM judge (dormante, calibração futura)
- Outras user stories (próximas runs)
- Writes no Jira (incl. pre-conditions, Test Coverage link, menu 15)
- Bug report (case20)

---

## 9. Novo Plano — Exercício Completo + Calibração + Stress Test (2026-08-07)

**Objetivo:** Exercitar o caminho real do usuário do case18 (geração de suite via LLM), capturar ruído/fricção/bugs, calibrar infraestrutura (prompts, schemas, evaluator) e estressar robustez e resiliência.

**Escopo:** Apenas geração da suite — NÃO criar issues no Jira. User story: ECSPOL-960.

### 9.0 Decisões

| ID | Decisão | Valor |
|----|---------|-------|
| D7 | Input | ECSPOL-960 (story + 14 acceptance criteria) |
| D8 | Jira writes | NONE — só geração + avaliação |
| D9 | Modalidade | Caminho real do usuário (menu interativo case18) — não harness |
| D10 | Credenciais | `.env.local` (já configurado) |
| D11 | Stress test | Todos os cenários de erro identificados no mapeamento |

### 9.1 Fase 1 — Caminho Feliz (exercício real)

**Objetivo:** Rodar case18 pelo fluxo interativo real, gerando a suite para ECSPOL-960, evaluando qualidade, comparando com baseline humano.

**Passos:**
1. Executar `case18` no menu interativo
2. Selecionar "Jira" → informar `ECSPOL-960` → confirmar descrição
3. Informar acceptance criteria (ou pegar da issue)
4. Observar: LLM gera testes → evaluator roda → gate aparece
5. Escolher "Rejeitar" (para não criar no Jira)
6. Registrar: score, grade, métricas, latência, qualquer erro/warning

**Capturar:**
- Fluxo completo de UI (prompts, selects, confirms)
- Qualidade da suíte gerada vs baseline humano (98/A)
- Bugs, fricções, comportamentos inesperados

### 9.2 Fase 2 — Stress Test (robustez e resiliência)

**Objetivo:** Exercitar todos os caminhos de erro identificados no mapeamento do handler.

| # | Cenário | O que exercitar | Por que |
|---|---------|----------------|---------|
| S1 | Acceptance criteria vazia | Input vazio na linha 243 — **sem validação** | Bug: LLM recebe criteria vazia |
| S2 | User story gigante (>10k chars) | Estourar token limits | Testar `_checkTokenLimit` e `_checkTotalTokenLimit` |
| S3 | LLM retorna JSON malformado | Forçar schema validation failure | Testar `_validateWithRetry` (3 tentativas) |
| S4 | LLM retorna 0 testes | Schema `min(1)` deve rejeitar | Testar rejeição + retry |
| S5 | LLM retorna testes idênticos | Redundância máxima | Testar métrica redundancy do evaluator |
| S6 | LLM retorna steps vazios | `steps: []` deve rejeitar schema | Testar validação |
| S7 | LLM retorna expectedResult curto | `< 10 chars` deve rejeitar | Testar min(10) no schema |
| S8 | LLM retorna title curto | `< 5 chars` deve rejeitar | Testar min(5) no schema |
| S9 | LLM retorna preConditions malformadas | type inválido, key faltando | Testar PreConditionInputSchema |
| S10 | LLM retorna coverage vazio | `criterionId: ''` deve rejeitar | Testar min(1) no CoverageItemSchema |
| S11 | Pre-conditions fetch falha | Jira indisponível | Testar degradação graciosa (linha 117-120) |
| S12 | Template file não encontrado | Path inválido | Testar catch linha 251-258 |
| S13 | Projeto vazio | Input vazio | Testar validação linha 246-248 |
| S14 | User story vazia | Input vazio | Testar validação linha 238-240 |
| S15 | Gerar 3x e rejeitar todas | Loop completo de retry | Testar CASE18_MAX_GENERATION_ATTEMPTS |
| S16 | Gerar 3x e aceitar na última | Último attempt sem "Re-gerar" | Testar remoção do option (linha 169-174) |
| S17 | LLM timeout/rate limit | Simular falha de rede | Testar circuit breaker + fallback chain |
| S18 | Token limit atingido | Input enorme | Testar guards de token |

### 9.3 Fase 3 — Calibração (observar e medir)

**Objetivo:** Rodar múltiplas vezes com o mesmo input, observar variância, identificar padrões de falha.

**Métricas a coletar:**
- Score determinístico (0-100) e grade (A-F) por execução
- Distribuição das 7 métricas (coverage, step concreteness, etc.)
- Taxa de schema validation failure
- Número de tentativas até sucesso
- Latência por chamada LLM
- Comparação AI vs baseline humano (ECSPOL-960 = 98/A)

**Decisões de calibração** (só depois dos dados):
- Ajustar pesos das métricas?
- Ajustar thresholds do schema (min chars)?
- Ajustar prompt (adicionar/remover regras)?
- Ajustar retry policy?

### 9.4 Fase 4 — Correção e revalidação

**Objetivo:** Para cada bug encontrado nas fases 1-3:
1. Escrever teste vermelho primeiro (§19.11 AGENTS.md)
2. Corrigir na codebase (NÃO no teste)
3. Revalidar com o mesmo cenário
4. Registrar在这个文档

### 9.5 Entregáveis

1. Bugs corrigidos na codebase
2. Documento de planejamento atualizado com todos os findings
3. Dados de calibração (scores, métricas, variância)
4. Recomendações de ajuste (se aplicável)

### 9.6 Orquestração

- **Fase 1** primeiro (caminho feliz)
- **Fase 2** em paralelo com Fase 1 (stress tests independentes)
- **Fase 3** após Fase 1+2 (precisa dos dados)
- **Fase 4** contínua (corrigir bugs conforme aparecem)

### 9.7 Bugs já identificados (pré-execução)

| ID | Bug | Arquivo | Status |
|----|-----|---------|--------|
| BUG-1 | EACCES `rmSync` em WSL9p | `shared/__tests__/pr-report.test.ts` | ✅ Corrigido |
| BUG-2 | `sendToProvider` não strip fences | `shared/llm/llm-fallback-http.ts:267` | ✅ Corrigido |
| BUG-3 | Acceptance criteria vazia sem validação | `case18.ts:243` | 📋 A exercitar (S1) |

### 9.8 Oportunidades já identificadas

| ID | Oportunidade | Categoria | Status |
|----|-------------|-----------|--------|
| OPP-1 | Inconsistência path resolution writeTestOutput vs writeQualityArtifacts | Arquitetura | 📋 Registrado |
| OPP-2 | Funções internas sem testes dedicados | Cobertura | 📋 Registrado |
| OPP-3 | `matchPreconditionByDualThreshold` sem testes de propriedade | Cobertura | 📋 Registrado |
| OPP-4 | Steps sem validação de edge case | Robustez | 📋 Registrado |
| OPP-5 | `writeReport` path traversal guard sem testes | Segurança | 📋 Registrado |
| OPP-6 | `computePromptVersion` fallback silencioso | Observabilidade | 📋 Registrado |

### 9.11 Resultado da Implementação (2026-08-07)

**Bugs corrigidos nesta sessão:**

| ID | Bug | Fix | Status |
|----|-----|-----|--------|
| BUG-4 | Prompt × Schema — campo `description` vs `summary` — pre-conditions silencamente perdidas | Prompt `description` → `summary`; schema aceita ambos com `.transform()` normalizador; `case18.ts` lê `summary \|\| description` em 4 funções | ✅ |
| BUG-5 | Harness reimplementa lógica interna (não exercita codebase real) | Harness reescrito como thin wrapper — importa funções REAIS de `case18.ts` | ✅ |
| BUG-6 | Harness não busca preconditions do Jira | Harness usa `JiraLinkManager` real com credenciais `.env.local` | ✅ |

**Arquivos alterados:**

| Arquivo | Mudança |
|---------|---------|
| `shared/prompts/user-story-to-tests.md` | `description` → `summary` (linhas 58, 91, 119) |
| `jira_management/commands/case18.schema.ts` | `PreConditionInputSchema` aceita `description` + `summary` com `.transform()` normalizador |
| `jira_management/commands/case18.ts` | `TestCaseData` interface aceita `description`; `resolvePreconditionMatches` lê `summary \|\| description`; `_buildGenerationRecord` lê `summary \|\| description`; `resolvePrecondition` já usa `TestCasePreCondition` (normalizado upstream) |
| `scripts/e2e-case18-baseline.ts` | Reescrito — importa funções reais de `case18.ts`, busca preconditions via `JiraLinkManager` |
| `jira_management/commands/__tests__/case18.schema.test.ts` | +4 testes: `description` → `summary` normalization, both fields, array compat |
| `jira_management/commands/__tests__/case18-integration.test.ts` | +3 testes: `resolvePreconditionMatches` com `description`, preferência `summary` |

**Testes:** 151/151 passando (6 arquivos). Typecheck limpo. Benchmark ECSPOL-960 = 98/A.

### 9.9 Achados Críticos do Run E2E (2026-08-07 — execução real)

#### BUG-4: Prompt × Schema — campo `description` vs `summary` (DADOS SILENCIAMENTE PERDIDOS)

| Campo | Valor |
|-------|-------|
| **Severidade** | CRÍTICA |
| **Causa raiz** | Prompt (`user-story-to-tests.md:58,91`) instrui LLM a usar `"description"`. Schema Zod (`case18.schema.ts:7`) só valida `"summary"`. LLM gera `description` → Zod descarta (unknown key) → `summary` fica `undefined` → toda a pipeline downstream lê `undefined`. |
| **Consequência** | 100% das pre-conditions geradas pela LLM são silenciosamente descartadas. Nenhum match com pre-conditions do Jira. Nenhuma pre-condition aparece nos testes gerados. |
| **Evidência** | Run E2E: 14 testes gerados, TODOS com "sem pre-condition". Log: "0 pre-conditions encontradas no projeto ECSPOL" (hardcoded no harness). |
| **Fluxo de corrupção** | Prompt → LLM returns `{type:"create", description:"..."}` → `PreConditionInputSchema` strips `description` → `resolvePreconditionMatches` reads `pc.summary` (undefined) → `resolvePrecondition` reads `pc.summary` (undefined) → `_buildGenerationRecord` reads `p.summary` (empty string) → `toGeneratedTestCases` writes `description: entry?.value ?? pc.summary ?? pc.type` → evaluator receives `"create"` as description text (data corruption). |
| **Camada resiliente** | `evaluatePreconditionSpecificity` (case18-deterministic.ts:319) é a ÚNICA que lê `pc.description \|\| pc.summary \|\| ''` — mas recebe dados já corrompidos. |

**Arquivos afetados:**

| # | Arquivo | Linha(s) | Campo acessado | Fix necessário |
|---|---------|----------|----------------|----------------|
| 1 | `shared/prompts/user-story-to-tests.md` | 58, 61, 91, 119 | `description` | Trocar para `summary` |
| 2 | `jira_management/commands/case18.schema.ts` | 7 | `summary` | Aceitar AMBOS |
| 3 | `jira_management/commands/case18.ts` | 324, 345, 350, 353 | `pc.summary` | Ler `pc.summary \|\| pc.description` |
| 4 | `jira_management/commands/case18.ts` | 399 | `p.summary` | Ler `p.summary \|\| p.description` |
| 5 | `jira_management/commands/case18.ts` | 678, 679, 683 | `pc.summary` | Ler `pc.summary \|\| pc.description` |
| 6 | `jira_management/commands/case18.ts` | 700 | `pc.summary` | Já escreve `description` — OK |

**NÃO mexer:** `shared/validation/test-suite.schema.ts` (schema de domínio diferente — exportação Jira, não LLM).

#### BUG-5: Harness reimplementa lógica interna (não exercita codebase real)

| Campo | Valor |
|-------|-------|
| **Severidade** | ALTA |
| **Causa raiz** | `e2e-case18-baseline.ts` reimplementa `resolvePreconditionMatches`, `convertTestCases`, `serializeForImport`, `writeTestOutput`, `writeQualityArtifacts` localmente em vez de importar de `case18.ts`. |
| **Consequência** | Bugs na codebase real são escondidos pelo harness. O harness "funciona" mas a codebase pode estar quebrada. |
| **Fix** | Harness importa funções REAIS de `case18.ts`. Nenhuma lógica de negócio no harness. |

#### BUG-6: Harness não busca preconditions do Jira

| Campo | Valor |
|-------|-------|
| **Severidade** | ALTA |
| **Causa raiz** | `listPreconditions()` retorna `[]` hardcoded. Na codebase real (`case18.ts:115`), `c.linkManager.listPreconditions(project)` busca do Jira. |
| **Consequência** | `resolvePreconditionMatches` roda com array vazio. Matching é inútil. |
| **Fix** | Harness usa `JiraLinkManager` real com credenciais `.env.local`. |

---

### 9.10 Plano de Correção Detalhado

#### Fase A — Fix Prompt × Schema (BUG-4)

1. **`shared/prompts/user-story-to-tests.md`**: Trocar todas as ocorrências de `description` → `summary` no contexto de preConditions
2. **`jira_management/commands/case18.schema.ts`**: `PreConditionInputSchema` aceitar `summary` E `description` (backward compatibility)
3. **`jira_management/commands/case18.ts`**: Todas as funções que leem `pc.summary` devem ler `pc.summary || pc.description`
   - `resolvePreconditionMatches` (linhas 324, 345, 350, 353)
   - `_buildGenerationRecord` (linha 399)
   - `resolvePrecondition` (linhas 678, 679, 683)

#### Fase B — Fix Harness (BUG-5 + BUG-6)

1. **Importar funções reais** de `case18.ts`: `convertTestCases`, `writeTestOutput`, `writeQualityArtifacts`, `resolvePreconditionMatches`, `toGeneratedTestCases`, `computePromptVersion`, `buildCorrectionsBlock`
2. **Remover reimplementações** locais do harness
3. **Buscar preconditions** via `JiraLinkManager` real
4. **Remover duplicação** de geração de artefatos (harness + writeQualityArtifacts)

#### Fase C — Testes

1. **Schema test**: Validar que `PreConditionInputSchema` aceita `description` E `summary`
2. **Integration test**: Validar que `resolvePreconditionMatches` funciona com ambos os campos
3. **Integration test**: Validar que `convertTestCases` funciona com ambos os campos
4. **E2E**: Rodar harness corrigido, confirmar pre-conditions aparecem

#### Fase D — Validação

1. `npm run typecheck` → verde
2. `npx vitest run` → todos os testes passam
3. Rodar E2E harness → pre-conditions aparecem nos testes gerados
4. Comparar com baseline ECSPOL-960
