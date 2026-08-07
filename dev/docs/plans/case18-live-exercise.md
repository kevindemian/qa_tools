# Case18 Live Exercise — Plano Consolidado, Decisões e Registro de Melhorias

**Data:** 2026-08-07
**Branch:** `feature/associate-te-cli`
**Status:** PLANEJADO → EM IMPLEMENTAÇÃO
**Fonte da autoridade:** AGENTS.md §1 — requirements/specs/prompt/schema; NUNCA implementação
**Documento relacionado:** `dev/docs/plans/e2e-case18-suite-baseline.md` (run anterior do harness)

---

## 1. Objetivo da tarefa (confirmado com o usuário)

Rodar a criação de issues com assistência de LLM (case18) **e conjuntamente** a feature de
avaliação de qualidade da geração (evaluator determinístico). Objetivos:

1. Encontrar e corrigir problemas, falhas, atritos, confusão e bugs na codebase
2. Calibrar a infraestrutura da feature (prompts, schemas, evaluator) para máxima
   qualidade das issues geradas
3. Aumentar robustez e resiliência

**Regras vigentes (AGENTS.md):**
- Correção SEMPRE na codebase, nunca em scripts/testes (Regra 4, §19.11)
- Teste falhou → assumir bug no código-fonte; alterar teste só com prova (Regra 19.4)
- Anti-mock-theater: mocks só na fronteira externa de UI; lógica interna real (§26)
- Zero writes no Jira nesta rodada (decisão do usuário)
- Antes de rodar: conhecer o QUE É ESPERADO (modelo de correto) para reconhecer erro

---

## 2. Decisões autorizadas (esta sessão + anterior)

| ID | Decisão | Valor | Fonte |
|----|---------|-------|-------|
| D1 | User story input | ECSPOL-960 (story + 14 ACs em `case18-benchmarks.ts`) | sessão anterior |
| D2 | Jira writes | **NONE** — geração + avaliação locais | sessão anterior |
| D3 | Modelo LLM | `LLM_PROVIDER=groq`, `LLM_MODEL=llama-3.1-8b-instant` (`.env.local`) | sessão anterior |
| D4 | LLM judge | Dormante, fora de escopo | sessão anterior |
| D5 | Modalidade | **Caminho real do usuário** — menu interativo case18 (não harness) | sessão anterior (D9) |
| D6 | Documento de melhorias | **Este documento** — tabela de achados UX/QA | sessão anterior (D6) |
| D7 | Gate de escrita | **`reject`** — zero escrita no Jira | esta sessão (boundary confirmado) |
| D8 | Veículo de execução | **Teste vitest permanente** `case18.live.test.ts` | esta sessão |
| D9 | Modelo de teste | Padrão case1: mock só `prompt.js` + contexto real | esta sessão |
| D10 | Executor | Agent roda via `npx vitest` (captura logs/stacks/sinais; usuário não roda manual) | esta sessão |
| D11 | Isolamento | `XDG_STATE_HOME` em tmpdir (não poluir estado real) | esta sessão |
| D12 | Gating CI | `describe.skipIf(!process.env.CASE18_LIVE)` — não roda em CI normal | esta sessão |

---

## 3. MODELO DE "CORRETO" — O QUE É ESPERADO (base para reconhecer erro)

### 3.1 Fluxo do handler (`jira_management/commands/case18.ts:109-218`)

```
gatherInput → listPreconditions (Jira REAL) → llmPrompt (LLM REAL, TestCaseArraySchema)
→ resolvePreconditionMatches (dual-threshold) → toGeneratedTestCases
→ evaluateCase18 (floor 7 métricas) → displayQualityScore → gate (showSelect)
→ [reject: recordAttempt + pushHistory error + return]
→ [create: createMissingPreconditions (WRITE) → convertTestCases → writeTestOutput
   → writeQualityArtifacts → offerCreateAndLink (WRITE opcional)]
```

### 3.2 Contrato do prompt (`shared/prompts/user-story-to-tests.md`)

- Output: JSON array (nunca markdown fence); campos em INGLÊS
- Cada test case: `title` (≥5), `steps[]` (≥1, imperativos), `expectedResult` (≥10),
  `preConditions[]` (com `summary` específico), `coverage[]` (`criterionText` EXATO das ACs),
  `evidence[]` opcional, campos batch opcionais (`environment`/`components`/`priority`) só se no input
- Regras: never hallucinate; citar evidência; EP/BVA/State/Error-guessing; sem redundância (Jaccard<80%)
- **Tensão prompt×schema (ATRITO, N1):** prompt exige "Each test case MUST have at least one
  preConditions entry" (linha 119) MAS `TestCaseDataSchema` marca `preConditions` como
  **opcional** (`case18.schema.ts:33`) → LLM pode gerar 0 preconditions sem falhar schema

### 3.3 Contrato do schema (`jira_management/commands/case18.schema.ts`)

- `PreConditionInputSchema`: aceita `summary` E `description`, normaliza → `summary` (fix BUG-4)
- `TestCaseDataSchema`: `title≥5`, `steps.min(1)`, `expectedResult≥10`, coverage com
  `criterionId/criterionText ≥1`, `preConditions` opcional
- `TestCaseArraySchema`: `min(1)` — rejeita array vazio

### 3.4 Evaluator determinístico (`shared/quality/case18-deterministic.ts`)

| Métrica | Peso | Passa | Falha |
|---|---|---|---|
| coverage | 25% | todas ACs citadas (exact criterionText ou ≥50% keywords por conteúdo) | ACs descobertas |
| stepConcreteness | 20% | verbos concretos (click/enter/...) sem vague-verbos | passivo/vago |
| preconditionSpecificity | 15% | summary não genérico (não em GENERIC_PRECONDITIONS) | genérico |
| bvaApplication | 15% | boundaries min-1/min/max/max+1 cobertos | sem nºs de boundary |
| epApplication | 10% | campos restritos têm teste de partição inválida | falta |
| evidenceCitations | 10% | `evidence[]` não vazio | sem evidência |
| redundancy | 5% | sem pares Jaccard≥80% | pares redundantes |

Grades: A≥90, B≥75, C≥60, D≥40, F<40.
**Guard de integridade:** soma dos pesos ≠1.0 → throw (já validado).
**Caveat (N4):** BVA e EP retornam **100 "grátis"** quando não há ranges/campos restritos no input
→ métricas podem inflar score de inputs não-numéricos (a calibração deve considerar).

### 3.5 Baseline humano (ECSPOL-960)

- **98/A** (critério limpo via `extractCriteria`): coverage 14/14, stepConcreteness 91 (30/33),
  evidenceCitations 100 (14/14), redundancy 90 (1 par redundante), BVA/EP 100 (não aplicável)
- Referência de comparação para qualquer run live

### 3.6 Resolução de preconditions (VERIFICADO nesta sessão)

Fluxo: `case18.ts:115` listPreconditions (Jira REAL, JQL `project=X+AND+issuetype="Pre-condition"`,
maxResults=200) → LLM sugere `preConditions[]` → `case18.ts:334` chama
`matchPreconditionByDualThreshold(summary, allPCs)` por summary único (dedupe) →
`precondition-matcher.ts:165`.

| Condição (precondition-matcher.ts) | matchType | Resultado |
|---|---|---|
| query vazia / 0 candidatos | `create` | cria |
| igualdade exata (case-insensitive) | `exact` | reference |
| contenção (A⊂B ou B⊂A) | `containment` | reference |
| Jaccard ≥ 0.7 | `overlap` | reference |
| Jaccard [0.5,0.7) + ambos têm tokens únicos | `create` | cria |
| Jaccard [0.5,0.7) + um é subconjunto (stopwords) | `overlap` | reference |
| Jaccard < 0.5 | `create` | cria |

Montagem (`case18.ts:343-357`): matched → `{type:'reference', key}`; unmatched →
`{type:'create', summary}`. Gate `reject` → **nada criado**. `toGeneratedTestCases`:
reference → `description:'PC-xxx'`, create → `description:<summary>` para o evaluator.

**Ponto de atenção (OPP):** matcher compara a summary EXATA do LLM contra summaries reais do
Jira. LLM tende a gerar summaries específicos/diferentes → alta taxa `create`. Isso é esperado,
mas significa que o matching real raramente aproveita as >100 pre-conditions do ECSPOL.

### 3.7 Estado do ambiente

- `.env.local`: JIRA_MODE=cloud, JIRA_PROJECT=ECSPOL, LLM_PROVIDER=groq,
  LLM_MODEL=llama-3.1-8b-instant, LLM_BASE_URL=https://api.groq.com/openai/v1
- Config mapping verificado: `jiraBaseUrl`←`JIRA_BASE_URL`, `jiraPersonalToken`←`JIRA_PERSONAL_TOKEN`,
  `jiraMode`←`JIRA_MODE` (case-sensitive, `shared/config-schema.ts`)
- **ECSPOL tem >100 pre-conditions** (confirmado pelo usuário) — live test deve ver count >100

---

## 4. Estado da codebase (verificado nesta sessão)

### 4.1 Bugs corrigidos (commit d9004825)

| ID | Bug | Fix | Status |
|----|-----|-----|--------|
| BUG-1 | EACCES `rmSync` WSL9p | `pr-report.test.ts` → `os.tmpdir()` + pid | ✅ commitado |
| BUG-2 | `sendToProvider` não strip fences | `stripMarkdownFence()` em `parseRawOnce`/`parseJsonOnce`/`sendToProvider` | ✅ no working tree, **NÃO commitado** |
| BUG-4 | Prompt `description` × schema `summary` → preconditions perdidas | prompt→`summary`; schema transform; `case18.ts` lê `summary\|\|description` | ✅ commitado |
| BUG-5 | Harness reimplementava lógica interna | harness reescrito como thin wrapper | ✅ commitado |
| BUG-6 | Harness retornava `[]` hardcoded | harness usa `JiraLinkManager` real | ✅ commitado |

### 4.2 ARQUIVOS NÃO COMMITADOS (fixes QA5/QA6/QA7 — PENDENTES, agora em commit)

| Arquivo | Mudança |
|---------|---------|
| `shared/llm/llm-fallback-http.ts` | `stripMarkdownFence` + `parseJsonOnce` schema-agnóstico (QA5/QA6) |
| `shared/llm/llm-cache.ts` | usa `parseJsonOnce` (suporta array) |
| `shared/quality/case18-benchmarks.ts` | `extractCriteria()` extraído (QA7) |
| `scripts/benchmark-case18.ts` | usa `extractCriteria` (98/A consistente) |
| `shared/__tests__/llm-cache.test.ts` | +4 testes fences/array |
| `shared/__tests__/case18-evaluator.test.ts` | +2 testes QA7 (extractCriteria, baseline 98/A) |

**Status atual:** todos estes fixes + os itens de Fase 1 desta sessão (N1 3 camadas, QA1,
QA2, OPP-3/4/5/6, UX3, DW-1) estão **no working tree, sem commit** — commit único pendente
(Fase 6).

### 4.3 Bugs pendentes

| ID | Bug | Local | Status |
|----|-----|-------|--------|
| BUG-3 | Acceptance criteria vazia sem validação | `case18.ts:243` | ✅ resolvido (gatherInput aborta) |

**Nota:** erros de tipo do baseline (preconditions com `description`) foram corrigidos na origem nesta sessão (interface `TestCasePreCondition` + `as const` no teste).

---

## 5. Achados e melhorias (sessão anterior — revisar/validar na live)

### UX — Experiência de uso

| ID | Sugestão | Categoria | Status |
|----|----------|-----------|--------|
| UX1 | case18 sem caminho "salvar local sem criar" — gate só create/regenerate/reject | UX/Arq | Pendente |
| UX2 | `fetchUserStoryFromJira` busca só description/summary — ACs sempre manuais | UX | Pendente |
| UX3 | Falha de infra de provider emudrece — sem mensagem acionável nem sugestão de modelo alternativo | UX | ✅ resolvido |

### QA — Qualidade do artefato/pipeline

| ID | Sugestão | Categoria | Status |
|----|----------|-----------|--------|
| QA1 | `convertTestCases` descarta `Data`/`Expected Result`/`expectedResult` na criação | Dados | Pendente |
| QA2 | coverage/evidence consumidos na avaliação mas descartados em `convertTestCases` | Dados | Pendente |
| QA3 | coverage match-exato de `criterionText` pode subcontar citações válidas | Avaliação | Pendente |
| QA4 | baseline 98/A é gold standard (só 1 par redundante) | Avaliação | Registrado |
| QA5 | `parseRawOnce` forçava objeto → array nunca validava → retry infinito | Pipeline | ✅ (em commit) |
| QA6 | Fence markdown ` ```json ` quebrava JSON.parse | Pipeline | ✅ (em commit) |
| QA7 | Baseline 96 vs 98 — critério fantasma `Acceptance Criteria:` | Avaliação | ✅ (em commit) |

### OPP — Oportunidades

| ID | Oportunidade | Categoria | Status |
|----|-------------|-----------|--------|
| OPP-1 | Inconsistência path resolution writeTestOutput vs writeQualityArtifacts | Arquitetura | Registrado |
| OPP-2 | Funções internas sem testes dedicados | Cobertura | Registrado |
| OPP-3 | `matchPreconditionByDualThreshold` sem testes de propriedade | Cobertura | ✅ resolvido (10 PBT) |
| OPP-4 | Steps sem validação de edge case | Robustez | ✅ resolvido (refine vazio/whitespace/max) |
| OPP-5 | `writeReport` path traversal guard sem testes | Segurança | ✅ resolvido (guard + 5 testes + PBT) |
| OPP-6 | `computePromptVersion` fallback silencioso | Observabilidade | ✅ resolvido (throw + resolvePromptVersion) |

---

## 6. Novos achados desta sessão (atritos/fricções/confusão de UX)

| ID | Achado | Onde | Tipo | Status |
|----|--------|------|------|--------|
| N1 | **Tensão prompt×schema**: prompt exige ≥1 preConditions por test case; schema permite 0 | prompt:119 × schema:33 | Atrito de contrato | ✅ resolvido (3 camadas) |
| N2 | **Gate `create` escreve preconditions sem confirmação** e `dryRun` não cobre (já era UX1); o único caminho seguro local é `reject`, que **não salva artefatos** (sem `writeTestOutput`) | case18.ts:203 | Confusão UX | 📋 |
| N3 | **`toGeneratedTestCases` corrompe reference**: `description: entry?.value ?? pc.summary ?? pc.type` — reference sem key cai em `'inline'`/`pc.type` | case18.ts:707-709 | Dados | ✅ resolvido |
| N4 | **BVA/EP retornam 100 "grátis"** sem ranges/campos restritos → score inflado em stories não-numéricas (ECSPOL-960 é caso) | case18-deterministic.ts:350,417 | Calibração | 📋 |
| N5 | **Matcher dual-threshold não usa stopwords no Jaccard≥0.7** (só no ramo [0.5,0.7)) — short-query vs long-summary pode falsamente matchar | precondition-matcher.ts:183-199 | Robustez | 📋 calibração (decisão adiada) |
| N6 | **Prompt pede `coverage.criterionText` EXATO** mas `evaluateCoverage` só pontua content-match como warning (QA3) — LLM que segue prompt recebe score correto; LLM que parafraseia é penalizado | prompt:124 × deterministic:262 | Consistência | 📋 |
| N7 | **6 arquivos de fix sem commit** — live test depende de fixes não persistidos (QA5/QA6/QA7) | working tree | Risco de processo | ✅ em commit |
| N8 | `.env.local` LLM_PROVIDER=groq + llama-3.1-8b-instant tem histórico de 429 TPM (limite 6000) — live test deve prever retry/circuit-breaker | run anterior | Resiliência | 📋 |
| N1-1 | **Baseline perdeu preconditions na conversão** — mapping original (`.json`/`.md`) tem preconditions em 100% dos 14 casos (ECSPOL-812/813/1124/1125/1202/1603/1604/1606); baseline TS não tinha | case18-benchmarks.ts | Dados | ✅ resolvido |
| N1-2 | **Evaluator dava 100 "grátis"** para suíte sem preconditions (`total===0` → score 100) | case18-deterministic.ts:331 | Avaliação | ✅ resolvido |
| N1-3 | **Prompt não exigia preconditions** (atrito N1); agora "MUST have at least one preConditions" + exceção rara | prompt:119 | Contrato | ✅ resolvido |
| N9 | **QA2 round-trip lossless**: coverage/evidence descartados em `convertTestCases`/`serializeForImport` (já QA2) | case18.ts + schema | Dados | ✅ resolvido (contrato autorizado) |

---

## 7. Plano de execução live

### Fase 0 — Pré-requisitos (bloqueantes)
1. `git status` → limpar (commit dos 6 arquivos de fix QA5/QA6/QA7)
2. `npx vitest run` → verde
3. `npm run typecheck` → verde

### Fase 1 — Sanitização da codebase (correção em lote, test-first §19.11)
- N3: `toGeneratedTestCases` reference corruption
- BUG-3: acceptance criteria vazia sem validação
- N1: tensão prompt×schema (preConditions)
- N5: matcher dual-threshold stopwords
- QA1/QA2: `convertTestCases` round-trip de Data/Expected Result/coverage/evidence
- OPP-6: `computePromptVersion` fallback silencioso
- OPP-3/OPP-4/OPP-5: testes (propriedade matcher, steps edge, writeReport guard)
- UX3: mensagem acionável em falha de infra de provider
- N4/N6: análise de calibração (registrar; ajuste só com dados)

### Fase 2 — Criar `jira_management/commands/__tests__/case18.live.test.ts`
1. `vi.mock('../../../shared/ui/prompt.js')` com pass-through real de warn/info/title/divider/printError
2. Auto-respostas: `showSelect`→'jira', `ask`→'ECSPOL-960', `askConfirm`→true,
   `askMultiline`→critérios, `showSelect`(gate)→'reject'
3. Contexto real: `JiraResource(token,baseUrl,mode)` + `JiraLinkManager` + `CsvResource`;
   `ctx.project_name='ECSPOL'`; `XDG_STATE_HOME` em tmpdir
4. `describe.skipIf(!process.env.CASE18_LIVE)` + `it(..., 300_000)`
5. Asserts do modelo de correto (§3):
   - `listPreconditions` chamado com 'ECSPOL'; count registrado (esperado >100)
   - `createPrecondition` **nunca** chamado (zero write)
   - `pushHistory('ai-generate-tests', ..., 'error')` contendo 'rejeitado'
   - `getAiFeedbackSummary` → +1 record `gateAction='rejected'`

### Fase 3 — Stress test (S1–S18 do doc relacionado)
- S1 (criteria vazia), S2 (story >10k), S3 (JSON malformado), S4–S10 (schema edge cases),
  S11 (Jira indisponível), S12 (template ausente), S13–S14 (inputs vazios),
  S15–S16 (loop de retry), S17 (timeout/rate limit), S18 (token limit)
- Cada falha = teste vermelho primeiro (§19.11) → correção na codebase → verde

### Fase 4 — Calibração (dados)
- Rodar Fase 2 múltiplas vezes; coletar score/grade/7 métricas/variância/latência/tentativas
- Comparar vs baseline 98/A
- Decisões de calibração só com dados (pesos, thresholds schema, prompt, retry policy)

### Fase 5 — Correção e revalidação
- Bug → RED test → fix na codebase → GREEN → revalidar mesmo cenário
- Atualizar este documento a cada achado

### Fase 6 — Commit
- Suíte 100% verde + typecheck antes; push via `gh` com timeout ≥300s (diretriz do usuário)

---

## 8. Registro de melhorias (a preencher durante a execução)

| ID | Achado/Sugestão | Categoria | Onde apareceu | Status |
|----|-----------------|-----------|---------------|--------|
| N1-1 | Baseline perdeu preconditions na conversão do mapping original | Dados | case18-benchmarks.ts | ✅ baseline com preconditions reais (14/14) |
| N1-2 | Evaluator dava 100 "grátis" para suíte sem preconditions | Avaliação | case18-deterministic.ts:331 | ✅ total===0 → score 0 + failed + warning |
| N1-3 | Prompt não exigia preconditions | Contrato | user-story-to-tests.md:119 | ✅ "MUST have at least one preConditions" + exceção rara |
| QA1 | `convertTestCases` descartava `expectedResult` | Dados | case18.ts convertTestCases | ✅ mapeado ao último step 'Expected Result' |
| QA2 | coverage/evidence descartados no round-trip | Dados | case18.ts + schema | ✅ contrato autorizado: TestCase/ImportJsonItemSchema + propagação |
| OPP-6 | `computePromptVersion` retornava `'unknown'` silencioso | Observabilidade | case18.ts | ✅ throw explícito + resolvePromptVersion (recuperação, sem hard fail) |
| OPP-3 | Matcher sem testes de propriedade | Cobertura | precondition-matcher.ts | ✅ 10 PBT (exact/empty/create-null-key/reference-real-key/determinismo/subsumption/disjoint) |
| OPP-4 | Steps aceitavam vazio/whitespace/sem limite | Robustez | case18.schema.ts | ✅ refine non-empty + max 1000 chars (3 testes) |
| OPP-5 | Guard de path traversal de writeReport sem testes | Segurança | shared/infra/temp-dir.ts | ✅ assertSafeFilename + 5 testes + PBT "never writes outside base" |
| UX3 | Falha de provider sem mensagem acionável | UX | case18.ts | ✅ describeLlmFailure (rate-limit/auth/timeout/provider/unknown) + hint de recuperação |
| DW-1 | PBT em jira_management importava fast-check direto | Arquitetura | precondition-matcher.property.test.ts | ✅ DepWall → import via shared/deps.js |
| N5 | Stopwords não aplicadas no ramo Jaccard≥0.7 | Robustez | precondition-matcher.ts:183 | 📋 decisão de calibração adiada (testes existentes fixam comportamento) |

---

## 9. Riscos e limites

- Variância de output LLM → até 3 tentativas (loop com feedback)
- 429 TPM da Groq (limite ~6000) → retry/circuit-breaker no llm-fallback-http
- Live test depende de rede (Jira leitura + LLM real) — não roda em CI sem `CASE18_LIVE=1`
- Gate `reject` NÃO exercita `convertTestCases`→`writeTestOutput` (caminho já coberto por
  `case18-integration.test.ts` + harness E2E)
- Custo: 1 story, tentativas limitadas
