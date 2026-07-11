# Backlog

> ⚠️ Sprints anteriores a esta estão **concluídos**. Movidos para `BACKLOG-historico.md` (e o arquivo não-sanitizado `BACKLOG_sanitize.md`).
> Consulte os históricos para detalhes de sprints passados.

---

## 🚀 Sprint DataHub — FASE L4 (Camada 4 / Job Logs) + FASE 9 (Jul/2026)

**Data:** 2026-07-11
**Origem:** `shared/plans/data-hub-ssot-enforcement.md` — FASE L4 (G19) e FASE 9 (pipeline-cost / traceability / batch).
**Estratégia:** Camada 4 (log-parser) redefinida como **last-resort estruturado-first**; máximo valor de falha via parser version-aware; counts só por regex se nenhum artifact estruturado existir.

### Fase L4 — Robustez da Camada 4 (Job Logs)

> Papel: **último recurso** da cascata (após Camadas 1–6 estruturadas). Primário = detalhe de falha + cross-reference; last-resort = counts por regex só sem artifact.

| ID      | Item                                                                                                 | Arquivo(s)                                                                 | Status |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| CDH-L4a | 🔧 L4.0 Redefinir papel (estruturado-first; last-resort em counts)                                   | `shared/log-parser.ts`                                                     | 📋     |
| CDH-L4b | 🔧 L4.1 NaN-guard obrigatório; invariante total; `counts:null` em não-finito/ambíguo                 | `shared/log-parser.ts`                                                     | 📋     |
| CDH-L4c | 🔧 L4.2 Registry por framework/versão (vitest v1/v2/v3, jest, mocha, pytest, go, dotnet)             | `shared/data-hub/extractors/` (novo)                                       | 📋     |
| CDH-L4d | 🔧 L4.3 `stripAnsi` endurecido (CSI+OSC) + truncamento (cap + detecção)                              | `shared/log-parser.ts`                                                     | 📋     |
| CDH-L4e | 🔧 L4.4 Falhas multi-linha + stack traces (janela) + `confidence`/`evidence` + buckets de causa-raiz | `shared/log-parser.ts`, `shared/data-hub/extractors/`                      | 📋     |
| CDH-L4f | 🔧 L4.5 Localização best-effort (layout posicional)                                                  | `shared/data-hub/extractors/`                                              | 📋     |
| CDH-L4g | 🔧 L4.6 Consumidores absorvem `confidence`/`category`/`evidence`; abstêm em `null`                   | `shared/failure-classifier.ts`, `shared/data-hub/.../test-count-extractor` | 📋     |
| CDH-L4h | 📋 L4.7 Testes (Test-First): `log-parser.test.ts`, `log-parser.property.test.ts`, `extractors/`      | `shared/__tests__/`, `shared/data-hub/__tests__/extractors/`               | 📋     |

### Fase LA — Versionadores, extração máxima (GitHub + GitLab)

> Princípio: extrair a ÚLTIMA GOTA de cada ferramenta; quality-gate por provenance/confidence/validação; persistir (Fase STORE); baixa qualidade → rotulada, nunca dropada.

| ID      | Item                                                                                                                                                                                                                                | Arquivo(s)                                                                                                | Status |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| CDH-LA1 | 🔧 Camada 3: annotations → `FailureRecord` rico (file/line/col/stack, todos níveis)                                                                                                                                                 | `shared/data-hub/extractors/failure-classifier.ts`, `shared/types/ci-cd.ts`, `shared/github-check-run.ts` | 📋     |
| CDH-LA2 | 🔧 Camada 1: custo real (`usage`) + `attempts`→flaky/retry                                                                                                                                                                          | `shared/data-hub/providers/github-provider.ts`, `shared/data-hub/compute/*`                               | 📋     |
| CDH-LA3 | 🔧 Camada 6 (GitLab): `test_report_summary` + `stack_trace` + **DORA**                                                                                                                                                              | `shared/data-hub/providers/gitlab-provider.ts`, `shared/types/ci-cd.ts`                                   | 📋     |
| CDH-LA4 | 🔧 Camada 2: CTRF `flaky/retries/environment/tool`; Playwright `file/line`                                                                                                                                                          | `shared/data-hub/artifact-parser.ts`                                                                      | 📋     |
| CDH-LA5 | 🔧 Camada 5: reporter-prediction + **Segurança** (GitHub code-scanning/secret-scanning/Dependabot; GitLab SAST/dependency/container/secret) + **Performance** (queue/duration/runner) + **Deployments/Releases/DORA** + **PRs/MRs** | `shared/data-hub/providers/*`, `shared/github-pr-comment.ts`                                              | 📋     |

### Fase PM — Gerenciadores de Projeto

| ID      | Item                                                                                                           | Arquivo(s)                                                       | Status |
| ------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------ |
| CDH-PM0 | 🔧 Contrato `ProjectManagerProvider` (espelho de `DataProvider`)                                               | `shared/data-hub/providers/types.ts`, `shared/types/data-hub.ts` | 📋     |
| CDH-PM1 | 🔧 Jira (FECHA GAP profundidade): components/priority/sprint/links/epic/storyPoints/statusCategory + paginação | `shared/data-hub/providers/jira-provider.ts`                     | 📋     |
| CDH-PM2 | 🔧 GitHub Issues (token existente)                                                                             | `shared/data-hub/providers/github-issues-provider.ts` (novo)     | 📋     |
| CDH-PM3 | 🔧 GitLab Issues (token existente)                                                                             | `shared/data-hub/providers/gitlab-issues-provider.ts` (novo)     | 📋     |
| CDH-PM4 | 🔧 Composição PM + CI em `composite-provider.ts` (paralelo, merge c/ provenance)                               | `shared/data-hub/providers/composite-provider.ts`                | 📋     |

### Fase XR — Xray (test management, já integrado)

| ID      | Item                                                                      | Arquivo(s)                                                                         | Status |
| ------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| CDH-XR1 | 🔧 Extrair Test Plans/Executions/Runs + cobertura de requisitos + defects | `shared/xray-cloud-client.ts`, `shared/data-hub/providers/xray-provider.ts` (novo) | 📋     |
| CDH-XR2 | 🔧 Mapear → `RawData.xrayData` (com provenance/confidence)                | `shared/types/data-hub.ts`                                                         | 📋     |

### Fase COV — Coverage detalhado

| ID      | Item                                                                                   | Arquivo(s)                                                                     | Status |
| ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| CDH-COV | 🔧 Coverage por arquivo/branch/function (Istanbul/Cobertura/JaCoCo) → `coverage.files` | `shared/data-hub/extractors/coverage-extractor.ts`, `shared/types/coverage.ts` | 📋     |

### Fase STORE — Persistência quality-gated (fundação)

| ID      | Item                                                                                                                                                                                                        | Arquivo(s)                                                   | Status |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------ |
| CDH-ST1 | 🔧 Estender `RawData` + `DataHubPersistence` p/ todas as categorias (failureRecords, securityFindings, deployments, releases, doraMetrics, prs/mrs, pmIssues, xrayData, coverage.files, performanceMetrics) | `shared/types/data-hub.ts`, `shared/data-hub/persistence.ts` | 📋     |
| CDH-ST2 | 🔧 Camada de Qualidade `validateAndScore()`: schema validation + NaN/empty guards + confidence por fonte + dedup + provenance obrigatória; baixa qualidade → tag, não drop                                  | `shared/data-hub/quality.ts` (novo)                          | 📋     |
| CDH-ST3 | 🔧 Migração não-destrutiva do `MetricsStore` atual; novas categorias adicionadas; dados históricos preservados                                                                                              | `shared/data-hub/persistence.ts`                             | 📋     |

### Melhoria Posterior (Diferida da FASE L4)

| ID       | Item                                                                                                      | Arquivo(s)                                        | Status |
| -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------ |
| CDH-L4X1 | 📋 Enrichment de falhas: mapear frame superior do stack → `file:line` + trecho de código (source-context) | `shared/data-hub/extractors/enrichment.ts` (novo) | 📋     |

**Justificativa (origem da sugestão — pesquisa de padrão-ouro, 2026-07-11):**

- **testmcp** `enrichment/source-context`: parser de stack trace + trecho de código do repo.
- **failure-packager** (`michaelko`): trunca/deteca contexto de ambiente sanitizado (`--max-log-chars`).
- **Allure** `statusDetails`/`categories` (buckets de causa-raiz por `messageRegex`/`traceRegex`).

**Por que diferido (não silencioso):** manter `log-parser.ts` **desacoplado** — consome só `string` de log, sem acesso a FS do repo alvo. O contract `FailureRecord` (emitido em CDH-L4e) já prevê campos `file?`/`line?` (nullable) para o enrichment preencher depois. Backlog registrado com dono + rastro neste documento (regra AGENTS §15: deferral documentado, não omitido).

**Tipo para `backlog-health`:** registrar como **`Improvement`** (não `Bug`) para não disparar falso "bug sem teste" em `analyzeBugsWithoutTests`; vincular `enrichment.test.ts` quando implementado.

### Fase 9 — pipeline-cost / traceability / batch (já commitado em `4088e83a`)

| ID     | Item                        | Status |
| ------ | --------------------------- | ------ |
| CDH-9a | 🔧 pipeline-cost SSOT       | ✅     |
| CDH-9b | 🔧 traceability-matrix SSOT | ✅     |
| CDH-9c | 🔧 batch/aggregation SSOT   | ✅     |

### Checkpoints (FASE L4)

```bash
npx tsc --noEmit
npx vitest run shared/__tests__/log-parser.test.ts shared/__tests__/log-parser.property.test.ts shared/data-hub/__tests__/extractors/
rg "NaN" shared/log-parser.ts          # 0 (nenhum NaN propagado)
npm run lint                           # 0 errors
```

### Commit (FASE L4)

`refactor(data-hub): harden Layer 4 log parser — structured-first, NaN-safe, framework/version registry, CTRF/Allure-aligned failure records`
