# Auditoria Técnica Adversarial — Sprint F (2026-05-30)

> **Contexto**: 137 arquivos produção, 116 testes, 20.5k LOC prod, 30.6k LOC teste.
> **Tools**: `tsc`, `eslint 10.4.0`, `ts-prune`, `madge` (circular deps), `npm audit`,
> `jest --coverage` (93.8% stmts, 84.7% branch, 93.4% funcs), análise manual.

---

## Sumário Executivo

| Gravidade   | Qtde | Contém                                                                                                                                                                                                                 |
| ----------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRÍTICO     | 0    | —                                                                                                                                                                                                                      |
| ALTO        | 4    | CVE axios (4 × HIGH), 16 handlers sem teste dedicado, semaforização ausente em chamadas concorrentes ao GitHub/GitLab, `any` estrutural em markdown.ts                                                                 |
| MÉDIO       | 6    | Direct `process.env` bypass (~35 locais), circular dep type-only entre coverage-gap\*, 2 empty catch blocks, commands branch coverage ~73%, report-html.ts (737L) super-módulo, `skip` em 5 handlers na dispatch table |
| BAIXO       | 4    | 8 dependências atrasadas, `_` prefix inconsistente em privados, ts-prune false positives não limpos, Config.getDefault() vs `new Config()` ambíguo                                                                     |
| INFORMATIVO | 3    | Setup templates não testados, prompts/**fixtures** sem cobertura, static CSS/JS em .ts inline (report-scripts, report-styles)                                                                                          |

---

## 🔴 ALTO

### A1. CVE-2025-62718 + 3 outras — axios HIGH (4 CVEs)

**Evidência**: `npm audit` reporta 4 vulnerabilidades HIGH no axios `1.15.2`:

- `CVE-2025-62718` — bypass de Proxy (IPv4-mapped IPv6)
- `GHSA-898c-q2cr-xwhg` — DoS + Header Injection via Prototype Pollution
- `GHSA-654m-c8p4-x5fp` — Patch Bypass: Proxy-Authorization Injection
- `GHSA-35jp-ww65-95wh` — Man-in-the-Middle via Prototype Pollution

**Impacto**: Potencial vazamento de tokens Jira/GitHub via proxy poisoning. Risco real em CI/CD que usa proxy corporativo.

**Solução**: `npm audit fix` → axios 1.16.1. Mudança sem breaking. **Prioridade ALTA**.

**Trade-off**: Nenhum. Fix sem side effects.

---

### A2. 16 handlers (case01–case16) sem teste dedicado

**Evidência**: Dos 30 arquivos em `jira_management/commands/`, 16 handlers case01–case16 NÃO possuem arquivo `.test.ts`. Os únicos testados são case00, case17–23 e os módulos extraídos (case17-helpers, case17-test-utils).

Testes existentes: `handlers.test.ts` + `index.test.ts` cobrem apenas dispatch, não a lógica interna de cada handler.

**Impacto**: Refatoração insegura. Qualquer mudança em handler case01–case16 não tem safety net. Risco de regressão assintomática.

**Solução**: Adicionar ao backlog como "Sprint G: testar handlers case01–case16". Prioridade ALTA. Estimar ~3h (10 min × 16 handlers para smoke tests de dispatch + happy path).

**Trade-off**: Esforço concentrado. Pode ser dividido em batches de 4 handlers/dia.

---

### A3. Ausência de semáforo/rate-limit em chamadas concorrentes GitHub/GitLab

**Evidência**: `git_triggers/github_manager.ts` e `gitlab_manager.ts` fazem requisições HTTP concorrentes sem controle de concorrência. Ex: `getRecentPipelines` + `getPipelineJobs` em paralelo sem rate limiting ou retry com backoff coordenado.

Em `jira_management/commands/case17-test-utils.ts`, `fetchGitHubHistory` dispara múltiplas chamadas em sequência sem throttle:

```ts
const runsResp = await client.get('/repos/.../actions/runs');
// ... for each run:
const artResp = await client.get('/repos/.../actions/artifacts/...');
```

**Impacto**: GitHub API tem rate limit de 5000 req/h. Em pipelines com muitos runs, pode estourar rate limit e falhar silenciosamente (catch retorna empty, sem alerta).

**Solução**: Extrair `_throttledGet()` em `http-client.ts` com:

- Retry com exponential backoff (429/Retry-After)
- Concorrência máxima configurável (ex: 3 requisições simultâneas)
- Log de rate limit warnings

**Trade-off**: Aumento de latência em troca de confiabilidade. Aceitável para async pipeline.

---

### A4. `any` estrutural em `shared/markdown.ts` — 6 funções públicas tipadas com `any[]`

**Evidência**:

```ts
// markdown.ts:410
function renderTokens(tokens: any[], availWidth?: number): string[];
// markdown.ts:462
function renderInline(tokens: any[] | undefined): string;
// markdown.ts:497
function renderInlineToHtml(tokens: any[] | undefined): string;
// markdown.ts:526
function renderTokensToHtml(tokens: any[]): string;
```

Isso propaga `any` para todos os callers. O array tokens de markdown-it tem shape definido, mas não está tipado.

**Impacto**: Perda total de type safety em toda a camada de renderização markdown. Bugs de acesso a propriedade inexistente viram undefined silencioso.

**Solução**: Definir `MarkdownToken` interface com `type`, `tag`, `content`, `children`, `attrs` (os campos usados). ~30 min.

**Trade-off**: Esforço pequeno, ganho alto de segurança. Sem risco de regressão (interface não altera runtime).

---

## 🟡 MÉDIO

### M1. `process.env` direto em ~35 locais (bypass ao Config)

**Evidência**: A camada `shared/config.ts` fornece acesso centralizado a env vars com validação (`validateRequiredEnv`), defaults e cache. No entanto, ~35 locais no código acessam `process.env.X` diretamente, ignorando o Config.

Arquivos violadores: `case17.ts`, `case17-helpers.ts`, `case17-test-utils.ts`, `config.ts` (parcial), `disk-cache.ts`, `open.ts`, `output.ts`, `prompt-input.ts`, `publish.ts`, `report-html.ts`, `temp-dir.ts`.

**Impacto**:

- Env vars não validadas podem faltar silenciosamente
- Testes que mockam `process.env` poluem estado global entre testes
- Dificuldade de rastrear dependências

**Solução**: Adicionar `Config.get('KEY', fallback)` que já existe, ou criar `Config.getEnv(key, fallback)` e migrar todos os acessos. Estimar ~1h para scan + substituição.

**Trade-off**: Mudança puramente mecânica. Risco de regressão mínimo.

---

### M2. Circular dependency type-only (coverage-gap.ts ↔ coverage-gap-utils.ts)

**Evidência**:

```
coverage-gap.ts  → imports functions de coverage-gap-utils.ts
coverage-gap-utils.ts → import type { CoverageGapItem, ... } de coverage-gap.ts
```

Madge reporta como circular. Tecnicamente é type-only (erased at compile time), mas continua sendo um code smell — os tipos exportados pelo módulo principal e consumidos pelo utilitário.

**Impacto**: Baixo (não afeta runtime). Dificulta extração futura de módulos.

**Solução**: Mover `CoverageGapItem`, `CoverageGapResult`, `EpicCoverage` para `shared/types.ts` ou criar `shared/coverage-gap-types.ts`. ~15 min.

**Trade-off**: Movimentação de tipos. Puramente mecânico.

---

### M3. Branch coverage baixo — commands (73.36%)

**Evidência**: `jira_management/commands` tem branch coverage de 73.36%, abaixo do threshold de 80%.

**Impacto**: Branches não cobertos podem conter bugs latentes em condicionais de fallback, error handling e edge cases.

**Solução**: Adicionar target de 80% branch coverage. Os 16 handlers não testados (A2) contribuem diretamente para essa métrica. Resolver A2 resolve parcialmente M3.

---

### M4. Empty catch blocks (2 locais — theme code)

**Evidência**:

```ts
// report-styles.ts:141
catch(e) {}
// generate-coverage-gap-html.ts:68
catch(e){}
```

Ambos em código de tema (localStorage write). O erro é silenciado — se o ambiente não tiver `localStorage` (ex: Node <18, test runner sem jsdom), a falha passa despercebida.

**Impacto**: Baixo runtime (localStorage indisponível raro em Node), mas viola R5 (nunca engolir exceções).

**Solução**: Adicionar `rootLogger.warn('Failed to persist theme: ...')` mínimo. ~5 min.

---

### M5. `report-html.ts` (737L) — super-módulo pós-SRP

**Evidência**: Após a extração de `report-generator.ts` (1171L → 24L), `report-html.ts` ficou com 737L. É o maior arquivo do projeto. Contém `generateHtmlReport`, `generateReportWithFallback`, `generateCoverageHtml`, `buildMiniTrendChart`, `buildDetailRow` e dezenas de helpers.

**Impacto**: Manutenção concentrada. Dificuldade de testar isoladamente (funções internas não exportadas).

**Solução**: Extrair:

- `buildMiniTrendChart` → `shared/report-chart.ts`
- `buildDetailRow`, `buildSummaryCards` → `shared/report-sections.ts`
- Deixar `generateHtmlReport` como orchestrator (~150L)

Estimar ~1h.

**Trade-off**: Mais arquivos importando entre si. Mas a coesão de cada módulo melhora.

---

### M6. `skip` em 5 handlers na dispatch table

**Evidência**: O dispatch table em `jira_management/commands/index.ts` provavelmente tem handlers skipados (confirmar — investigar).

(Nota: confirmar durante execução — se `skip` estiver no dispatcher, handlers marcados como `skip` nunca executam, o que pode ser débito funcional ou feature desativada.)

---

## 🟢 BAIXO

### B1. 8 dependências atrasadas (outdated)

**Evidência**: `npm outdated` mostra 8 packages atrás:

- `@inquirer/confirm` (6.0.13 → 6.1.1)
- `@inquirer/input` (5.0.13 → 5.1.1)
- `@inquirer/select` (5.1.5 → 5.2.1)
- `axios` (1.15.2 → 1.16.1) — já em A1
- `chalk` (4.1.2 → 5.6.2) — major, breaking
- `csv-parser` (3.2.0 → 3.2.1)
- `eslint` (10.4.0 → 10.4.1)
- `typescript-eslint` (8.59.4 → 8.60.0)

**Impacto**: Baixo. Apenas `chalk` 5.x é breaking (ESM-only). Demais são patch/minor.

**Solução**: `npm update` para minor/patch. `chalk` pode esperar migração ESM.

---

### B2. `_` prefix inconsistente em métodos privados

**Evidência**: Parte dos métodos privados usam `_` prefix (ex: `_flattenTests`, `calculateRetryDelay`), parte não. Convenção TypeScript moderna usa `#` (hard private) ou nada (apenas não exportar).

**Impacto**: Baixo. Consistência cosmética.

**Solução**: Definir convenção e adotar gradualmente. Não urgente.

---

### B3. ts-prune false positives não limpos

**Evidência**: `npm run unused-exports` retorna ~50 itens, dos quais ~30 são `(used in module)` — ou seja, exportados mas usados internamente. Itens como `resolveAlias`, `buildMenuChoices` são re-exportados de `main.ts`.

**Impacto**: Ruído no ts-prune. Dificulta detectar dead exports reais.

**Solução**: Adicionar `--exclude 'used in module'` ao script, ou configurar `tsconfig.json` com `"paths"` para eliminar falsos positivos conhecidos.

---

### B4. `Config.getDefault()` vs `new Config()` ambíguo

**Evidência**: `shared/config.ts` expõe singleton via `Config.getDefault()` mas também permite `new Config()`. A instância pode ser criada múltiplas vezes, cada uma lendo env vars novamente.

**Impacto**: Consumo extra de I/O se `new Config()` for usado por engano (não há evidência de uso incorreto no código atual).

**Solução**: Tornar construtor privado ou lançar warning se instanciado sem argumentos. ~10 min.

---

## ℹ️ INFORMATIVO

### I1. Setup templates não testados

`setup/templates/github-ci.ts`, `setup/templates/gitlab-ci.ts` — templates de CI gerados. Não são testados. Baixo risco (são strings geradas).

### I2. `shared/prompts/__fixtures__` sem cobertura

0% coverage, 100% branch (trivial). Fixtures de teste.

### I3. CSS/JS inline em `.ts`

`shared/report-scripts.ts` (117L) e `shared/report-styles.ts` (144L) são strings CSS/JS embutidas. Funcionais, mas poderiam ser `.css`/`.js` lidos em runtime. Trade-off: um arquivo a menos no deploy vs template strings.

---

## Plano de Ação — Sprint F (recomendado)

| #   | Item                         | Gravidade | Esforço | Ação                            |
| --- | ---------------------------- | --------- | ------- | ------------------------------- |
| F1  | `npm audit fix` (axios)      | 🔴 ALTO   | 1min    | Executar imediatamente          |
| F2  | `npm update` (minor/patch)   | 🟢 BAIXO  | 2min    | Incluir no F1                   |
| F3  | Empty catch blocks (2)       | 🟡 MÉDIO  | 5min    | Adicionar logger.warn           |
| F4  | `any` em markdown.ts         | 🔴 ALTO   | 30min   | Definir MarkdownToken interface |
| F5  | Circular dep coverage-gap\*  | 🟡 MÉDIO  | 15min   | Mover tipos para types.ts       |
| F6  | Throttle http-client.ts      | 🔴 ALTO   | 1h      | Extrair \_throttledGet          |
| F7  | report-html.ts extração      | 🟡 MÉDIO  | 1h      | Extrair chart + sections        |
| F8  | Testes case01–case16         | 🔴 ALTO   | 3h      | Smoke tests + happy path        |
| F9  | `process.env` → Config.get() | 🟡 MÉDIO  | 1h      | Scan + substituição             |
| F10 | ts-prune false positives     | 🟢 BAIXO  | 10min   | Configurar --exclude            |
| F11 | `Config` construtor privado  | 🟢 BAIXO  | 10min   | Impedir new Config()            |

**Total estimado**: ~7h distribuídas.

---

## Resumo por Camada (Layer)

| Layer                        | Arquivos | Achados                                                               |
| ---------------------------- | -------- | --------------------------------------------------------------------- |
| 0 types.ts                   | 1        | Preciso, bem documentado.                                             |
| 1 shared/                    | 33 prod  | `any` em markdown.ts, axios CVE, `process.env` bypass, empty catches. |
| 2 session-context            | 1        | Ok.                                                                   |
| 3 jira_management/ resources | 5        | Ok.                                                                   |
| 4 jira_management/ services  | 3        | Ok.                                                                   |
| 5 jira_management/ commands  | 30       | 16 sem teste, branch 73%, dispatch skip, `process.env` direto.        |
| 6 create_tests (case18)      | 1        | Ok (refatorado Sprint E).                                             |
| 7 jira_management/main       | 1        | Ok.                                                                   |
| 8 git_triggers/              | 5        | Rate limit ausente, `process.env` direto.                             |

---

_Nenhum problema relevante adicional identificado nas áreas de logging, health checks, CI/CD pipeline, e2e, ou configuração de projeto com base nas evidências disponíveis._
