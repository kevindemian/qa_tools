# Plano de Implementação — Sprint Auditoria Sistêmica

> **Objetivo:** Verificação completa de 13 features em 4-5 dimensões, com varredura automatizada prévia.
> **Regra absoluta:** uma feature por vez, registrar todo achado, corrigir antes de avançar.
> **Validação final:** `tsc --noEmit` (0 erros), `vitest run` (100% pass), `npm run lint` (0 erros).

---

## Pré-requisitos

| Item | Comando | Critério |
| ---- | ------- | -------- |
| Branch limpa | `git status` | Sem alterações pendentes |
| Testes passando | `npx vitest run` | 100% pass |
| TypeScript OK | `npx tsc --noEmit` | 0 erros |
| Lint OK | `npm run lint` | 0 erros |

---

## Fase 1 — Varredura Automatizada de Isolamento

### SA-1a: Buscar operações fs em testes

**O que:** Rodar `rg` (ripgrep) para encontrar todas as ocorrências de `fs.rmSync`, `fs.unlinkSync`, `fs.writeFileSync` em arquivos `.test.ts`.

**Comando:**
```bash
rg -n 'fs\.(rmSync|unlinkSync|writeFileSync)' --include='*.test.ts' /home/kdemian/PROJETOS/qa_tools/qa_tools
```

**Arquivos a ler (resultado):** Cada arquivo `.test.ts` que aparecer no resultado.

**Saída esperada:** Lista de arquivos com linhas específicas onde operações fs ocorrem.

**Verificação:** Comparar com a lista de features para identificar quais testes possivelmente afetam o filesystem real.

---

### SA-1b: Classificar cada ocorrência

**O que:** Para cada arquivo encontrado em SA-1a, classificar:

| Classificação | Critério | Ação |
| ------------- | -------- | ---- |
| tmp dir ✅ | Usa `os.tmpdir()` ou `/tmp` como base | Sem problema |
| project root ❌ | Usa `process.cwd()` ou caminho relativo sem `/tmp` | Problema de isolamento |
| mock ✅ | Operação está dentro de `vi.mock()` ou `vi.spyOn()` | Mock — sem problema real |
| cleanup ✅ | Operação está em `afterEach`/`afterAll` para limpeza | Aceitável se base é tmp |

**Arquivos a ler:** Cada `.test.ts` identificado em SA-1a, lendo contexto ao redor de cada operação fs.

**Saída esperada:** Tabela com classificação por arquivo.

---

### SA-1c: Registrar resultado em backlog

**O que:** Adicionar tabela consolidada ao `BACKLOG.md` na seção "Fase 1 — Varredura Automatizada".

**Arquivo a modificar:** `BACKLOG.md`

**Formato esperado:**
```markdown
### Resultado da Varredura — SA-1a/1b

| Arquivo Teste | Operação fs | Classificação | Issue? |
| ------------- | ----------- | ------------- | ------ |
| shared/quarantine.test.ts:37 | `pipelineFilePath()` → `process.cwd()` | project root ❌ | SIM |
| shared/__tests__/pr-report-core.test.ts | — | mock ✅ | NÃO |
| ... | ... | ... | ... |
```

**Verificação:** Todos os 13 features mapeados na tabela. Issues identificadas marcadas.

---

## Fase 2 — Auditoria Manual por Feature

### Ordem de Execução

**Prioridade:** Features com issues conhecidas primeiro, depois métricas (4 dimensões + corretude), depois demais.

| Ordem | Feature | ID | Razão |
| ----- | ------- | -- | ----- |
| 1 | quarantine | SA-2e | ISSUE conhecida: writes to `process.cwd()` |
| 2 | pr-report-core | SA-2k | ISSUE conhecida: fs NOT mocked |
| 3 | metrics | SA-2b | Métricas — corretude (SA-2m) |
| 4 | quality-gate | SA-2c | Métricas — corretude (SA-2m) |
| 5 | health-score | SA-2d | Métricas — corretude (SA-2m) |
| 6 | feature-config | SA-2a | ✅ Já auditado |
| 7 | store | SA-2f | Referência de bom isolamento |
| 8 | state | SA-2g | Referência de bom isolamento |
| 9 | config-writer | SA-2h | Referência de bom isolamento |
| 10 | batch-mode | SA-2i | Referência de bom isolamento |
| 11 | interactive-mode | SA-2j | Maior arquivo (925L) |
| 12 | setup-main | SA-2l | Referência de bom isolamento |
| 13 | report-html | SA-2m | Pure string generation |

---

### Template de Auditoria por Feature

Para cada feature, executar os seguintes passos:

#### Passo 1: Ler código fonte
```
Ler: <arquivo_fonte>.ts (completo)
Ler: <arquivo_teste>.test.ts (completo)
```

#### Passo 2: Aplicar 4 dimensões

**Dimensão 1 — Isolamento de Testes:**
- [ ] Testes criam/deletam arquivos reais?
- [ ] Usam tmp dir (`os.tmpdir()`)?
- [ ] Limpo após execução (`afterEach`/`afterAll`)?
- [ ] `process.cwd()` é mockado quando necessário?
- [ ] Nenhum arquivo em `config/`, `data/`, `reports/` é afetado?

**Dimensão 2 — Robustez:**
- [ ] Contratos tipados (interfaces exportadas)?
- [ ] Edge cases testados (vazio, null, undefined, boundary)?
- [ ] Error handling (try/catch, validação)?
- [ ] Validação de entrada (Zod schemas, type guards)?

**Dimensão 3 — Boas Práticas:**
- [ ] Padrão Wizard→Config→Runtime (se aplicável)?
- [ ] SRP (Single Responsibility)?
- [ ] DIP (Dependency Injection Principle)?
- [ ] Dependency Wall (sem imports circulares)?
- [ ] Sem workarounds, shims, ou fallbacks?

**Dimensão 4 — Implementação Ótima:**
- [ ] Poderia ser mais simples?
- [ ] Duplicação de código?
- [ ] Acoplamento desnecessário?
- [ ] Padrão correto para o contexto?

**Dimensão 5 — Corretude Métricas (apenas features 2, 3, 4, 11):**
- [ ] SA-2m-1: Denominador pass rate consistente (display = health score)?
- [ ] SA-2m-2: Flaky rate unificado (uma única implementação)?
- [ ] SA-2m-3: Quality gate único (sem funções duplicadas)?
- [ ] SA-2m-4: Coverage history preservado?
- [ ] SA-2m-5: Suite speed threshold coerente?
- [ ] SA-2m-6: Error handling (sem blocos catch vazios)?

#### Passo 3: Registrar achados

**Formato de registro (para cada feature):**
```markdown
### SA-2[x] — [Feature Name]

**Arquivos auditados:**
- Fonte: `path/to/source.ts` (N linhas)
- Teste: `path/to/test.ts` (N linhas)

**Dimensão 1 — Isolamento:** [✅ OK / ❌ ISSUE]
- Detalhe: ...

**Dimensão 2 — Robustez:** [✅ OK / ⚠️ MELHORIA]
- Detalhe: ...

**Dimensão 3 — Boas Práticas:** [✅ OK / ⚠️ MELHORIA]
- Detalhe: ...

**Dimensão 4 — Implementação:** [✅ OK / ⚠️ MELHORIA]
- Detalhe: ...

**Dimensão 5 — Corretude Métricas:** [✅ OK / ❌ ISSUE / N/A]
- Detalhe: ...

**Achados:** [nenhum / lista de achados]
**Correção necessária:** [não / descrição]
```

#### Passo 4: Atualizar BACKLOG.md

Adicionar resultado da feature na tabela de status e no corpo da seção.

---

### Auditoria Detalhada por Feature

#### Feature 1: feature-config (SA-2a) — ✅ JÁ AUDITADO

**Status:** Concluído no Sprint PR Report Fix.
**Arquivos:** `shared/feature-config.ts`, `shared/__tests__/feature-config.test.ts`
**Resultado:** Isolamento OK (usa tmp dir + afterEach cleanup).

---

#### Feature 2: metrics (SA-2b)

**Arquivos a ler:**
- `shared/metrics.ts` (256 linhas)
- `shared/__tests__/metrics.test.ts` (279 linhas)

**Checklist específico:**
- Dimensão 1: Testes usam dados inline (MetricsStore mockado), sem fs → ✅ esperado
- Dimensão 5: Verificar SA-2m-1 (pass rate denominator), SA-2m-2 (flaky rate unification)
- Verificar: `calculateFlakyRate` é a implementação unificada?
- Verificar: `calculateFlakiness` e `getTrends` são coesos?

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 3: quality-gate (SA-2c)

**Arquivos a ler:**
- `shared/quality-gate.ts` (173 linhas)
- `shared/__tests__/quality-gate.test.ts` (119 linhas)

**Checklist específico:**
- Dimensão 1: Testes chamam `calculateHealthScore` diretamente, sem fs → ✅ esperado
- Dimensão 5: Verificar SA-2m-3 (quality gate único), SA-2m-5 (suite speed threshold)
- Verificar: `runQualityGate()` é a única função de gate?
- Verificar: Thresholds são fixos (`as const`)?

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 4: health-score (SA-2d)

**Arquivos a ler:**
- `shared/health-score.ts` (345 linhas)
- `shared/__tests__/health-score.test.ts` (137 linhas)

**Checklist específico:**
- Dimensão 1: Testes usam MetricsStore mockado, sem fs → ✅ esperado
- Dimensão 5: Verificar SA-2m-1 (pass rate), SA-2m-4 (coverage history), SA-2m-5 (suite speed)
- Verificar: `evaluateQualityGate()` foi removida? (deveria ter sido removida no Sprint Correção de Métricas)
- Verificar: `coverageSource` é rastreado?
- Verificar: `maxSuiteSpeedGate` é 3000ms?

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 5: quarantine (SA-2e) — ⚠️ ISSUE CONHECIDA

**Arquivos a ler:**
- `shared/quarantine.ts` (260 linhas)
- `shared/quarantine.test.ts` (207 linhas)

**Checklist específico:**
- Dimensão 1: ❌ ISSUE — `pipelineFilePath()` retorna `process.cwd() + '/qa-quarantine.json'`
  - `quarantine.test.ts:37`: `function pipelineFilePath(): string { return path.join(process.cwd(), 'qa-quarantine.json'); }`
  - `quarantine.test.ts:46`: `fs.unlinkSync(pipelineFilePath())` — deleta arquivo real se não mockado
  - `quarantine.ts:76`: `pipelinePath()` retorna `path.join(process.cwd(), PIPELINE_FILE)`
  - **CORREÇÃO NECESSÁRIA:** Mockar `process.cwd()` OU usar tmp dir para pipeline file
- Dimensão 2: Verificar contratos tipados (interfaces QuarantineEntry, etc.)
- Dimensão 3: Verificar SRP (quarantine CRUD + expiry + pipeline generation)

**Achado registrado:** quarantine.test.ts opera em project root para pipeline file.
**Correção:** Mockar `process.cwd()` ou usar `os.tmpdir()` para pipeline file nos testes.

**Saída:** Tabela de auditoria preenchida + item de correção registrado.

---

#### Feature 6: store (SA-2f)

**Arquivos a ler:**
- `shared/store.ts` (109 linhas)
- `shared/store.test.ts` (196 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Usa `FsStoreBackend` com `/tmp` temp dir
- Dimensão 2: Contratos tipados (ReportMeta, BranchEntry)
- Dimensão 3: SRP claro (store CRUD)

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 7: state (SA-2g)

**Arquivos a ler:**
- `shared/state.ts` (155 linhas)
- `shared/state.test.ts` (267 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Mocka todos os fs operations (`vi.spyOn(fs, ...)`)
- Dimensão 2: Error handling com recovery from backup
- Dimensão 3: SRP (state persistence)

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 8: config-writer (SA-2h)

**Arquivos a ler:**
- `setup/config-writer.ts` (150 linhas)
- `setup/config-writer.test.ts` (202 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Mocka `fs` inteiro (`vi.mock('fs')`)
- Dimensão 2: Tratamento de JSON parse errors
- Dimensão 3: Padrão Writer pattern

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 9: batch-mode (SA-2i)

**Arquivos a ler:**
- `git_triggers/batch-mode.ts` (407 linhas)
- `git_triggers/batch-mode.test.ts` (278 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Mocka todas as dependências (prompt, manager, config, pipeline-handler)
- Dimensão 2: Edge cases de pipeline polling
- Dimensão 3: SRP (batch orchestration)

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 10: interactive-mode (SA-2j)

**Arquivos a ler:**
- `git_triggers/interactive-mode.ts` (925 linhas)
- `git_triggers/interactive-mode.test.ts` (1019 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Mocka todas as dependências
- Dimensão 2: Maior arquivo do projeto — verificar SRP
- Dimensão 3: Possível necessidade de split (925L é muito)
- Dimensão 4: Verificar se há duplicação com batch-mode

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 11: pr-report-core (SA-2k) — ⚠️ ISSUE CONHECIDA

**Arquivos a ler:**
- `shared/pr-report-core.ts` (677 linhas)
- `shared/__tests__/pr-report-core.test.ts` (390 linhas)

**Checklist específico:**
- Dimensão 1: ⚠️ Verificar — teste mocka dependências mas pr-report-core.ts pode escrever em `reports/`
  - Verificar se `main()` em pr-report-core.ts escreve diretamente no filesystem
  - Verificar se há `fs.mkdirSync` ou `fs.writeFileSync` no código fonte
  - **Se ISSUE confirmada:** Mockar fs no teste OU usar tmp dir
- Dimensão 5: Verificar SA-2m-1 (pass rate), SA-2m-6 (error handling / empty catch)
- Verificar: `buildFlakySection` tem catch vazio?

**Achado registrado:** pr-report-core.ts pode escrever reports/ no project root.
**Correção:** Verificar e corrigir isolamento se necessário.

**Saída:** Tabela de auditoria preenchida + item de correção registrado.

---

#### Feature 12: setup-main (SA-2l)

**Arquivos a ler:**
- `setup/main.ts` (293 linhas)
- `setup/main.test.ts` (290 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Mocka `fs`, `detector`, `config-writer`, templates
- Dimensão 2: Validação de inputs do wizard
- Dimensão 3: Padrão Wizard pattern

**Saída:** Tabela de auditoria preenchida.

---

#### Feature 13: report-html (SA-2m)

**Arquivos a ler:**
- `shared/report-html.ts` (205 linhas)
- `shared/report-html.test.ts` (210 linhas)

**Checklist específico:**
- Dimensão 1: ✅ Pure string generation, sem fs
- Dimensão 2: Edge cases de HTML generation
- Dimensão 3: SRP (HTML assembly)

**Saída:** Tabela de auditoria preenchida.

---

### Itens de Corretude de Métricas (SA-2m-1 a SA-2m-6)

Estes itens são auditados durante as features 2, 3, 4, 11.

| ID | Item | Feature(s) | Verificação |
| ---- | ---- | ---------- | ----------- |
| SA-2m-1 | Pass rate denominator consistente | metrics, health-score, pr-report-core | `passed/(passed+failed)` em todas as implementações |
| SA-2m-2 | Flaky rate unificado | metrics, quality-gate, health-score | Uma única `calculateFlakyRate()` em metrics.ts |
| SA-2m-3 | Quality gate único | quality-gate, health-score | `runQualityGate()` é a única função de gate |
| SA-2m-4 | Coverage history preservado | health-score | `coverageSource` rastreado, último valor preservado |
| SA-2m-5 | Suite speed threshold coerente | health-score, quality-gate | `maxSuiteSpeedGate: 3000` em health-score |
| SA-2m-6 | Error handling | pr-report-core | Sem blocos catch vazios |

**Comando de verificação para SA-2m-2:**
```bash
rg 'calculateFlakyRate|_computeFlakyRate|_flakyCheck' --include='*.ts' /home/kdemian/PROJETOS/qa_tools/qa_tools/shared
```
Esperado: apenas `metrics.ts` define, demais importam.

**Comando de verificação para SA-2m-3:**
```bash
rg 'evaluateQualityGate|runQualityGate' --include='*.ts' /home/kdemian/PROJETOS/qa_tools/qa_tools/shared
```
Esperado: apenas `quality-gate.ts` define `runQualityGate`, `health-score.ts` importa.

**Comando de verificação para SA-2m-6:**
```bash
rg 'catch\s*\(' --include='*.ts' -A2 /home/kdemian/PROJETOS/qa_tools/qa_tools/shared/pr-report-core.ts
```
Esperado: nenhum catch com bloco vazio `{}`.

---

## Fase 3 — Correção

### Processo por Achado

Para cada achado da Fase 2:

1. **Criar item de correção no BACKLOG.md** (ID: SA-3x)
2. **Implementar correção** (seguindo AGENTS.md — root cause, sem workarounds)
3. **Criar/atualizar testes** (100% cobertura para código modificado)
4. **Rodar validações:**
   ```bash
   npx tsc --noEmit      # 0 erros
   npx vitest run         # 100% pass
   npm run lint           # 0 erros
   ```
5. **Registrar conclusão no BACKLOG.md**

### Correções Esperadas (baseado no exploration)

#### SA-3a: Quarantine test isolation (Feature 5)

**Problema:** `quarantine.test.ts` usa `process.cwd()` para pipeline file.
**Correção:**
- Mockar `process.cwd()` para tmp dir
- OU: Mockar `fs` para interceptar `unlinkSync`/`writeFileSync`
- Adicionar `afterEach` cleanup

**Arquivos a modificar:**
- `shared/quarantine.test.ts`
- Possivelmente `shared/quarantine.ts` (se pipelinePath() precisar de refactoring)

**Testes a criar/atualizar:**
- Teste que verifica que nenhum arquivo em project root é afetado
- Teste de cleanup após cada teste

---

#### SA-3b: pr-report-core isolation (Feature 11)

**Problema:** Verificar se `pr-report-core.ts` escreve no filesystem do projeto.
**Correção (se confirmada):**
- Mockar `fs` no teste
- OU: Usar tmp dir para reports/

**Arquivos a modificar:**
- `shared/__tests__/pr-report-core.test.ts` (se necessário)
- `shared/pr-report-core.ts` (se necessário)

---

### Validação Final

Após todas as correções:

| Comando | Critério | Status |
| ------- | -------- | ------ |
| `npx tsc --noEmit` | 0 erros | 🔜 |
| `npx vitest run` | 100% pass | 🔜 |
| `npm run lint` | 0 erros | 🔜 |

---

## Atualização do BACKLOG.md

### Seções a atualizar:

1. **Status dos itens SA-1a, SA-1b, SA-1c:** 🔜 → ✅ (após Fase 1)
2. **Status dos itens SA-2a a SA-2n:** 🔜 → ✅ (após cada feature auditada)
3. **Itens de correção SA-3x:** Adicionar conforme achados
4. **Tabela de métricas alvo:** Atualizar resultados

### Formato de atualização:

```markdown
### Resultado da Varredura — SA-1a/1b/1c ✅

| Arquivo Teste | Operação fs | Classificação | Issue? |
| ------------- | ----------- | ------------- | ------ |
| ... | ... | ... | ... |

### SA-2b — metrics ✅
[resultado da auditoria]

### SA-3a — Quarantine test isolation ✅
[correção implementada]
```

---

## Resumo de Executeção

| Fase | Itens | Esforço Estimado | Dependências |
| ---- | ----- | ---------------- | ------------ |
| 1 | SA-1a, SA-1b, SA-1c | ~30 min | Nenhuma |
| 2 (features com issue) | SA-2e, SA-2k | ~1h cada | Fase 1 |
| 2 (métricas) | SA-2b, SA-2c, SA-2d + SA-2m-* | ~2h total | Fase 1 |
| 2 (demais) | SA-2f a SA-2j, SA-2l, SA-2m | ~30 min cada | Nenhuma |
| 3 | SA-3x (conforme achados) | Variável | Fase 2 |
| Validação final | tsc + vitest + lint | ~5 min | Fase 3 |

**Total estimado:** ~8-12h distribuídas.

---

## Ordens de Execução Recomendadas

### Opção A: Por criticidade (recomendada)

```
1. Fase 1 completa (varredura automatizada)
2. Feature 5: quarantine (issue conhecida)
3. Feature 11: pr-report-core (issue conhecida)
4. Features 2,3,4: metrics/quality-gate/health-score (corretude)
5. Features 6-13: demais (referências de bom isolamento)
6. Fase 3: correções
7. Validação final
```

### Opção B: Por dependência de métricas

```
1. Fase 1 completa
2. Feature 2: metrics (base para tudo)
3. Feature 3: quality-gate (usa metrics)
4. Feature 4: health-score (usa metrics + quality-gate)
5. Feature 11: pr-report-core (usa todas)
6. Features 5-13: demais
7. Fase 3 + validação
```

---

_Planed em 2026-06-14. Baseado na exploração completa do codebase e BACKLOG.md._
