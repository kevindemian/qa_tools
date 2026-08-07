# Codebase Exercise — Bugs & Improvement Findings

**Data:** 2026-08-07
**Branch:** `feature/associate-te-cli`
**Escopo:** Exercitação da codebase para encontrar bugs reais e oportunidades de melhoria
**Metodologia:** Testes agressivos sem mock theater — filesystem real, lógica real, side effects reais

---

## 1. Bugs Corrigidos

### BUG-1: EACCES `rmSync` em WSL9p/drvfs

| Campo | Valor |
|-------|-------|
| **Arquivo** | `shared/__tests__/pr-report.test.ts` |
| **Sintoma** | `rmSync` falha com `EACCES` em WSL9p (filesystem Windows via 9p) |
| **Causa raiz** | `TEST_CTRF_DIR = path.resolve('reports', 'shared-test')` — resolved para o filesystem Windows que não suporta `rmSync` recursivo |
| **Fix** | Trocado para `path.join(os.tmpdir(), 'pr-report-test-' + process.pid)` |
| **Evidência** | 25 testes de `pr-report.test.ts` passam em WSL9p |

### BUG-2: `sendToProvider` não strip markdown fences do LLM content

| Campo | Valor |
|-------|-------|
| **Arquivo** | `shared/llm/llm-fallback-http.ts:267` |
| **Sintoma** | LLM retorna `````json\n{...}\n```` — JSON parsing falha |
| **Causa raiz** | `extractContent()` retorna raw com fences; `JSON.parse` não aceita |
| **Fix** | `return stripMarkdownFence(extractContent(data, cfg.format))` |
| **Evidência** | `stripMarkdownFence` já existia e era usado em `parseRawOnce`/`parseJsonOnce`; faltava no path de retorno de `sendToProvider` |

---

## 2. Testes Adicionados (33 novos)

### Arquivo: `jira_management/commands/__tests__/case18-integration.test.ts`

| describe | it count | Cobertura |
|----------|----------|-----------|
| `serializeForImport` | 7 | Steps, Data, Expected Result, precondition, metadata, undefined desc |
| `convertTestCases` | 7 | Steps, preconditions (inline/reference), createdKeys, metadata, empty steps, multi-PC |
| `toGeneratedTestCases` | 3 | Format, preconditions, coverage/evidence |
| `resolvePreconditionMatches` | 5 | Empty, all-create, dedup, empty array, reference resolution |
| `writeTestOutput` | 5 | File creation, JSON roundtrip, preconditions, metadata, recursive dirs |
| `writeQualityArtifacts` | 3 | HTML report, coverage table, empty input |
| `computePromptVersion` | 1 | Stability, format |
| `buildCorrectionsBlock` | 2 | No failures, with failures |
| **Total** | **33** | |

---

## 3. Exportações Adicionadas em `case18.ts`

| Função | Antes | Depois | Motivo |
|--------|-------|--------|--------|
| `convertTestCases` | interna | `export` | Testabilidade — função pura, sem side effects |
| `writeTestOutput` | interna | `export` | Testabilidade — side effect controlado (filesystem) |
| `writeQualityArtifacts` | interna | `export` | Testabilidade — side effects controlados (filesystem) |
| `resolvePreconditionMatches` | interna | `export` | Testabilidade — função pura, sem side effects |

---

## 4. Oportunidades de Melhoria Identificadas

### OPP-1: Inconsistência de path resolution entre `writeTestOutput` e `writeQualityArtifacts`

| Campo | Valor |
|-------|-------|
| **Categoria** | Arquitetura |
| **Severidade** | Média |
| **Descrição** | `writeTestOutput` usa `path.join(process.cwd(), 'reports', ...)` (relativo ao cwd). `writeQualityArtifacts` usa `writeReport` → `reportsDir()` → `PROJECT_ROOT/reports` (absoluto). Dois comportamentos diferentes para o mesmo conceito "salvar reports". |
| **Impacto** | Confusão em testes e em ambientes onde cwd ≠ project root |
| **Sugestão** | Unificar em `reportsDir()` para ambos, ou documentar a distinção explicitamente |

### OPP-2: Funções internas sem testes dedicados

| Função | Status atual | Risco |
|--------|-------------|-------|
| `gatherInput` | Mockada no test existente | Input parsing inexplorado com dados reais |
| `fetchUserStoryFromJira` | Mockada | Edge cases de Jira response não testados |
| `createMissingPreconditions` | Mockada | Falha parcial (1 de N falha) não testada |
| `displayQualityScore` | Nunca testada | UI side effect — sem testes |
| `offerCreateAndLink` | Mockada | Fluxo interativo completo não exercitado |
| `_buildGenerationRecord` | Nunca testada | Construção do record não validada isoladamente |

### OPP-3: `matchPreconditionByDualThreshold` — lógica de matching sem testes dedicados

| Campo | Valor |
|-------|-------|
| **Categoria** | Cobertura |
| **Severidade** | Alta |
| **Descrição** | Função central do matching de preconditions, chamada por `resolvePreconditionMatches`. Não possui testes unitários dedicados — apenas exercitada indiretamente via handler mockado. |
| **Sugestão** | Criar testes de propriedade (property-based) para valid thresholds, edge cases (empty input, special chars, exact match vs fuzzy) |

### OPP-4: `parseStepString` — parsing de steps sem edge cases

| Campo | Valor |
|-------|-------|
| **Categoria** | Robustez |
| **Severidade** | Média |
| **Descrição** | Não identificada função `parseStepString` em case18.ts — steps são passados como strings diretas. Se houver parsing futuro, não há testes de edge case (steps vazios, steps com newline, steps com caracteres especiais). |
| **Sugestão** | Adicionar validação de steps no schema (min length, non-empty) |

### OPP-5: `writeReport` path traversal guard não testado

| Campo | Valor |
|-------|-------|
| **Categoria** | Segurança |
| **Severidade** | Média |
| **Descrição** | `writeReport` em `temp-dir.ts:79` tem `isPathWithinBase` guard contra path traversal. Este guard não possui testes dedicados. |
| **Sugestão** | Testar com paths como `../../../etc/passwd`, symlinks, encoded paths |

### OPP-6: `computePromptVersion` — fallback silencioso

| Campo | Valor |
|-------|-------|
| **Categoria** | Observabilidade |
| **Severidade** | Baixa |
| **Descrição** | Se `readFileSync` falhar em `computePromptVersion`, retorna `'unknown'` com warning log. Sem impacto funcional, mas versão `'unknown'` pode confundir em debugging. |
| **Sugestão** | Considerar thrown error ou返回 `null` para forçar tratamento |

---

## 5. Status

| Item | Status |
|------|--------|
| BUG-1 (EACCES) | ✅ Corrigido |
| BUG-2 (fences) | ✅ Corrigido |
| 33 testes integrados | ✅ Todos passando (147/147 no subset) |
| 4 exportações case18.ts | ✅ Aplicadas |
| OPP-1 a OPP-6 | 📋 Registrados — aguardando priorização |
