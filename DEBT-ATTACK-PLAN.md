# Plano de Ataque — Débitos da Auditoria Senior

> **Propósito:** Atacar TODOS os 45 findings da auditoria, sem exceção.
> **Classificação:** QUICKWIN (minutos), MÉDIO (horas), ESTRUTURAL (dias)
> **Ordem:** Prioridade do auditor (P0→P5) → agrupado por arquivo para eficiência

---

## Lote 1 — SEGURANÇA 🔴 (P0, ~15min)

### C13-1: Shell injection em `shared/open.ts`

| ID  | Arquivo          | Linha | Problema                               | Correção                                                                                                             |
| --- | ---------------- | ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| F1  | `shared/open.ts` | 53    | `execSync(\`wslpath -w "${target}"\`)` | Trocar para `execSync(\`wslpath -w \` + path.resolve(target))`ou usar array`['wslpath', '-w', target]`com`spawnSync` |
| F2  | `shared/open.ts` | 68    | `execSync(\`wslpath -w "${dest}"\`)`   | Idem                                                                                                                 |
| F3  | `shared/open.ts` | 31    | `execSync('cmd.exe /c echo %TEMP%')`   | Comando fixo — LOW, mas documentar por que não há risco                                                              |

**Risco:** RCE via pathnames como `"test; rm -rf /; #"`.  
**Correção:** Usar `path.resolve()` + `spawnSync` com argument array.

---

## Lote 2 — NULL SAFETY 🟠 (P1, ~45min)

### C3-1: Massa crítica em `shared/markdown.ts`

| ID  | Arquivo              | Ocorrências | Problema                                   | Correção                                                           |
| --- | -------------------- | ----------- | ------------------------------------------ | ------------------------------------------------------------------ |
| F4  | `shared/markdown.ts` | 25+         | `lines[i]!` — crash se markdown malformado | Substituir por `lines[i]?.trim()` ou função `safeAccess(lines, i)` |

### C3-2 a C3-7: Non-null assertions isolados

| ID  | Arquivo                        | Linha | Código                         | Correção                                          |
| --- | ------------------------------ | ----- | ------------------------------ | ------------------------------------------------- |
| F5  | `shared/coverage-gap.ts`       | 80    | `linkMap.get(key)!`            | `linkMap.get(key) ?? fallback` ou check explícito |
| F6  | `shared/coverage-gap.ts`       | 152   | `epicChildMap.get(key)!`       | `epicChildMap.get(key) ?? fallback`               |
| F7  | `shared/flaky-auto-actions.ts` | 92    | `issues[0]!`                   | `issues[0] ?? null` com guard                     |
| F8  | `shared/host-semaphore.ts`     | 33    | `queues.get(host)!`            | `queues.get(host) ?? new Queue()`                 |
| F9  | `shared/host-semaphore.ts`     | 43    | `releaseTimestamps.get(host)!` | `releaseTimestamps.get(host) ?? []`               |
| F10 | `shared/prompt-input.ts`       | 391   | `flatChoices[num-1]!`          | `flatChoices[num-1] ?? null` com fallback         |

### C3-8 a C3-11: Non-null assertions baixo risco

| ID  | Arquivo                           | Linha | Código         | Correção              |
| --- | --------------------------------- | ----- | -------------- | --------------------- |
| F11 | `shared/report-sections.ts`       | 21    | `runs[i]!`     | `runs[i] ?? null`     |
| F12 | `git_triggers/github_manager.ts`  | 169   | `existing[0]!` | `existing[0] ?? null` |
| F13 | `git_triggers/gitlab_manager.ts`  | 112   | `existing[0]!` | `existing[0] ?? null` |
| F14 | `git_triggers/pipeline-health.ts` | 54    | `match[1]!`    | `match[1] ?? ''`      |

---

## Lote 3 — CÓDIGO MORTO 🧹 (P2, ~30min)

### C1-1 a C1-5: Exports mortos identificados por ts-prune

| ID  | Arquivo                            | Símbolo                   | Ação                                          |
| --- | ---------------------------------- | ------------------------- | --------------------------------------------- |
| F15 | `shared/types.ts:589`              | `XrayGetTestRunsResponse` | Verificar se é usado em prod; se não, remover |
| F16 | `shared/report-generator.ts:22-24` | 4 exports                 | Remover exports não utilizados                |
| F17 | `shared/report-styles.ts:140`      | `buildThemeScript`        | Remover                                       |
| F18 | `shared/llm-metrics.ts:123`        | Snapshot function         | Verificar se morto ou usado; remover se morto |
| F19 | `shared/llm-metrics.ts:159,165`    | History functions         | Idem                                          |

**Nota:** Antes de remover, validar com `grep -rn "SymbolName" . --include="*.ts"` para confirmar que não há consumidor.

---

## Lote 4 — TESTES 📋 (P3, ~4h)

### C22-1: Missing test file

| ID  | Arquivo                 | Problema          | Correção                                                                                           |
| --- | ----------------------- | ----------------- | -------------------------------------------------------------------------------------------------- |
| F20 | `shared/jira-client.ts` | ❌ Sem `.test.ts` | Criar testes para todos os métodos públicos (JiraClient.get, post, put, delete, getFromOriginPath) |

### C7: Test fragility — verificar `setTimeout`/`setInterval`

| ID  | Arquivo     | Ocorrências | Ação                                                                                             |
| --- | ----------- | ----------- | ------------------------------------------------------------------------------------------------ |
| F21 | `*.test.ts` | 3           | Verificar cada um; se intencional e justificado, adicionar comentário; se desnecessário, remover |

### C17-1: Mock divergence

| ID  | Arquivo                      | Problema                  | Correção                                                                                  |
| --- | ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| F22 | `shared/__mocks__/logger.ts` | `maskDeep` mock simplista | Atualizar mock para implementação real OU adicionar comentário justificando simplificação |

---

## Lote 5 — IDEMPOTÊNCIA 🔁 (P3, ~2h)

### C19-1, C19-2: Create operations sem existence check

| ID  | Arquivo                                     | Linha | Operação                                     | Correção                                                             |
| --- | ------------------------------------------- | ----- | -------------------------------------------- | -------------------------------------------------------------------- |
| F23 | `jira_management/test-execution-creator.ts` | 140   | `createIssueLink` sem verificar duplicata    | Adicionar `searchExistingLink()` antes de criar                      |
| F24 | `jira_management/import-loop.ts`            | 243   | `createIssueForTest` sem verificar duplicata | Adicionar `searchExistingIssue()` com JQL por summary antes de criar |

---

## Lote 6 — CLI UX 🖥️ (P3, ~1h)

### C18-1: `process.exit()` inconsistente

| ID  | Arquivo                   | Linha | Padrão atual                                                | Padrão desejado                         |
| --- | ------------------------- | ----- | ----------------------------------------------------------- | --------------------------------------- |
| F25 | `shared/cli_base.ts`      | 95    | `setTimeout(() => process.exit(OK), EXIT_DELAY_MS).unref()` | Manter (graceful shutdown)              |
| F26 | `shared/entry-menu.ts`    | 72    | `process.exit(ERROR)` imediato                              | Trocar para graceful shutdown com delay |
| F27 | `shared/llm-benchmark.ts` | 219   | `process.exit(ERROR)` imediato                              | Trocar para graceful shutdown com delay |

**Decisão:** Padronizar para graceful shutdown com `EXIT_DELAY_MS` (como `cli_base.ts` já faz).

---

## Lote 7 — SEGURANÇA ADICIONAL 🛡️ (P3, ~1h)

### C13-2: Shell commands com path

| ID  | Arquivo                 | Linha | Problema                  | Correção                                           |
| --- | ----------------------- | ----- | ------------------------- | -------------------------------------------------- |
| F28 | `shared/publish.ts`     | 39    | `cp` com path concatenado | Usar `fs.cpSync()` em vez de `execSync('cp ...')`  |
| F29 | `shared/publish.ts`     | 40    | `git` com path            | Usar `execSync` com argument array                 |
| F30 | `shared/test-impact.ts` | 45    | `git diff` com refs       | Usar `execSync` com argument array ou validar refs |

---

## Lote 8 — DEPENDÊNCIAS 📦 (P4, ~1h)

### C15-1, C15-2: Packages major atrasados

| ID  | Pacote        | Versão atual | Latest | Ação                                                           |
| --- | ------------- | ------------ | ------ | -------------------------------------------------------------- |
| F31 | `chalk`       | 4.1.2        | 5.6.2  | Atualizar (⚠️ ESM breaking change — verificar compatibilidade) |
| F32 | `glob`        | 10.5.0       | 13.6.0 | Atualizar (⚠️ minors primeiro)                                 |
| F33 | `lint-staged` | 17.0.5       | 17.0.7 | Atualizar minor                                                |
| F34 | `tsx`         | 4.22.3       | 4.22.4 | Atualizar patch                                                |

---

## Lote 9 — ESTRUTURAL — SRP 🏗️ (P4-P5, 3-5 dias)

### C4-1: `shared/llm-client.ts` — 691 linhas

| ID  | Arquivo                | Linhas | Responsabilidades atuais                                               | Proposta de split                                                                           |
| --- | ---------------------- | ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F35 | `shared/llm-client.ts` | 691    | LLM client + cache + rate limit + circuit breaker + fallback + metrics | Extrair: `llm-cache.ts`, `llm-circuit-breaker.ts`, `llm-rate-limiter.ts`, `llm-fallback.ts` |

### C21-1: `git_triggers/github_manager.ts` — 385 linhas

| ID  | Arquivo                          | Linhas | Responsabilidades atuais                                      | Proposta de split                                                                     |
| --- | -------------------------------- | ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| F36 | `git_triggers/github_manager.ts` | 385    | GitHub API (18 métodos: PR, workflow, issues, branches, etc.) | Extrair: `github-pr.ts`, `github-workflow.ts`, `github-issues.ts`, `github-branch.ts` |

### C21-2: `git_triggers/gitlab_manager.ts` — ~385 linhas

| ID  | Arquivo                          | Problema                    | Ação                |
| --- | -------------------------------- | --------------------------- | ------------------- |
| F37 | `git_triggers/gitlab_manager.ts` | Mesmo SRP do github_manager | Aplicar mesmo split |

### C21-3: `git_triggers/pipeline-handler.ts` — 349 linhas

| ID  | Arquivo                            | Responsabilidades                      | Proposta                                             |
| --- | ---------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| F38 | `git_triggers/pipeline-handler.ts` | Pipeline + tests + Jira + bug creation | Extrair: `pipeline-collector.ts`, `pipeline-jira.ts` |

### C21-4: `jira_management/precondition-handler.ts` — 321 linhas

| ID  | Arquivo                                   | Responsabilidades           | Proposta                                                       |
| --- | ----------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| F39 | `jira_management/precondition-handler.ts` | Matching + linking + import | Extrair: `precondition-matcher.ts`, `precondition-importer.ts` |

### C4 adicionais: Demais arquivos >300 linhas

| ID  | Arquivo                          | Linhas | Prioridade | Ação                                    |
| --- | -------------------------------- | ------ | ---------- | --------------------------------------- |
| F40 | `shared/prompt-ui.ts`            | 494    | P5         | Avaliar extração de formatos de saída   |
| F41 | `shared/config.ts`               | 441    | P5         | Separar env loading de config overrides |
| F42 | `shared/prompt-input.ts`         | 394    | P5         | Separar input handling de validação     |
| F43 | `shared/llm-review.ts`           | 347    | P5         | Separar review de analysis              |
| F44 | `shared/result_parser.ts`        | 312    | P5         | Separar parsing por formato             |
| F45 | `jira_management/import-prep.ts` | 407    | P5         | Separar CSV/JSON de checkpoint          |

---

## Ordem de execução recomendada

```
┌──────────────────────────────────────────────────────────────┐
│  DIA 1 (~2h)                                                 │
├── Lote 1: Segurança (F1-F3)         15min  ← P0              │
├── Lote 2: Null safety (F4-F14)      45min  ← P1              │
├── Lote 3: Código morto (F15-F19)    30min  ← P2              │
└── Lote 6: CLI UX (F25-F27)          30min  ← P3              │
┌──────────────────────────────────────────────────────────────┐
│  DIA 2 (~4h)                                                 │
├── Lote 7: Segurança extra (F28-F30) 1h     ← P3              │
├── Lote 5: Idempotência (F23-F24)    2h     ← P3              │
├── Lote 4: Testes (F20-F22)          1h     ← P3              │
└── Lote 8: Dependências (F31-F34)    1h     ← P4              │
┌──────────────────────────────────────────────────────────────┐
│  SEMANA 2+ (~5 dias)                                         │
├── Lote 9: SRP llm-client (F35)      2d     ← P4              │
├── Lote 9: SRP managers (F36-F37)    2d     ← P4              │
├── Lote 9: SRP handlers (F38-F39)    1d     ← P5              │
└── Lote 9: SRP demais (F40-F45)      adiar  ← P5 (nice-to-have)│
└──────────────────────────────────────────────────────────────┘
```

### Total de findings por lote

| Lote                      | Findings | Esforço      | Prioridade |
| ------------------------- | -------- | ------------ | ---------- |
| Lote 1 — Segurança        | 3        | 15min        | P0 🔴      |
| Lote 2 — Null safety      | 11       | 45min        | P1 🟠      |
| Lote 3 — Código morto     | 5        | 30min        | P2 🟡      |
| Lote 4 — Testes           | 3        | ~1h          | P3 🟡      |
| Lote 5 — Idempotência     | 2        | ~2h          | P3 🟡      |
| Lote 6 — CLI UX           | 3        | ~30min       | P3 🟡      |
| Lote 7 — Segurança extra  | 3        | ~1h          | P3 🟡      |
| Lote 8 — Dependências     | 4        | ~1h          | P4 🟢      |
| Lote 9 — SRP (estrutural) | 11       | ~5d          | P4-P5      |
| **Total**                 | **45**   | **~7h + 5d** |            |

---

## Verificação pós-ataque

Após cada lote, executar:

```bash
# R6 completo
npx tsc --noEmit
npx jest --no-coverage
grep -rn "throw '" shared/ jira_management/ git_triggers/   # zero
grep -rn ".only(" **/*.test.*                                # zero
```

Cada lote = um commit atômico. Rollback = `git revert HEAD`.

---

_Plano gerado em 2026-05-31. Baseado no relatório `.audit/senior-audit-2026-05-59.md` com 45 findings distribuídos em 24 categorias._
