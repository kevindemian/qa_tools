# Backlog

> ⚠️ Sprints anteriores a esta estão **concluídos**. Movidos para `BACKLOG-historico.md` (e o arquivo não-sanitizado `BACKLOG_sanitize.md`).
> Consulte os históricos para detalhes de sprints passados.

---

## 📋 Decisões de Arquitetura (EXPAND — 2026-07-12)

Resoluções técnicas para a retomada do EXPAND, validadas entre agente e usuário:

| #   | Questão               | Decisão                                                                                        | Justificativa (evidência)                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **L4X1 (enrichment)** | **ENTRA no escopo do L4**                                                                      | `log-parser.ts` emite `FailureRecord` com `file?`/`line?` nullable; enrichment é etapa posterior (pós-parser) que preenche os campos. Acoplamento zero (parser consome `string`, enrichment consome `FailureRecord` + `repoPath`).                                                                                                                        |
| 2   | **LA-5 subdivisão**   | **Subdividir em LA-5a..5e**                                                                    | 5 domínios independentes (Security, Performance, Deployments, PRs/MRs, Reporter-Prediction); APIs, tipos e providers diferentes. Reduz risco e permite commit granular.                                                                                                                                                                                   |
| 3   | **PM-0 contract**     | **Estender `source` union** (`'github-issues' \| 'gitlab-issues'`), **NÃO** interface separada | `ProjectManagerProvider` seria 100% idêntica a `DataProvider` (mesma assinatura, mesmo retorno `RawData`) — duplicação sem ganho de type safety (TS é estrutural). Colisão real: `GitHubDataProvider` já usa `source='github'`; issues provider precisa de source distinto. `JiraDataProvider` já é `DataProvider` com `source='jira'` — padrão a seguir. |
| 4   | **Xray API**          | **Cloud v2 (GraphQL)**                                                                         | Implementação atual é production-grade (retry/throttle/TLS, extração defensiva). Cloud v2 é plataforma ativa da Atlassian com GraphQL rico; Server usa REST legado.                                                                                                                                                                                       |
| 5   | **COV strategy**      | **Estender** `readCoverage()` (~20 linhas), **NÃO** reescrever                                 | Provider tem 78 linhas (adaptador fino). Pipeline `CoverageFile` já existe completo (type, Zod schema, persistence, merge, gate). Gap = mapear `IstanbulFileEntry → CoverageFile` (branches/functions presentes no source, descartados no mapeamento). Rewrite quebra contrato `RawCoverage` (12+ consumers) sem ganho arquitetural.                      |

**Ordem de execução (do plano Cap 6):** `ST (feito) → L4 → LA-1 → LA-2 → LA-3 → LA-4 → LA-5a..5e → PM-0..4 → XR-1/2 → COV`

---

## 🚀 Sprint DataHub — FASE L4 (Camada 4 / Job Logs) + FASE 9 (Jul/2026)

**Data:** 2026-07-11
**Origem:** `shared/plans/data-hub-ssot-enforcement.md` — FASE L4 (G19) e FASE 9 (pipeline-cost / traceability / batch).
**Estratégia:** Camada 4 (log-parser) redefinida como **last-resort estruturado-first**; máximo valor de falha via parser version-aware; counts só por regex se nenhum artifact estruturado existir.

### Fase L4 — Robustez da Camada 4 (Job Logs)

> Papel: **último recurso** da cascata (após Camadas 1–6 estruturadas). Primário = detalhe de falha + cross-reference; last-resort = counts por regex só sem artifact.

| ID      | Item                                                                                                                       | Arquivo(s)                                                                                                  | Status |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| CDH-L4a | 🔧 L4.0 Redefinir papel (estruturado-first; last-resort em counts)                                                         | `shared/log-parser.ts`                                                                                      | ✅     |
| CDH-L4b | 🔧 L4.1 NaN-guard obrigatório; invariante total; `counts:null` em não-finito/ambíguo                                       | `shared/log-parser.ts`                                                                                      | ✅     |
| CDH-L4c | 🔧 L4.2 Registry por framework/versão (vitest/jest/mocha/pytest/go/dotnet) via `detectFrameworkVersion`                    | `shared/log-parser.ts`                                                                                      | ✅     |
| CDH-L4d | 🔧 L4.3 `stripAnsi` endurecido (CSI+OSC, idempotente, sem throw em truncamento)                                            | `shared/log-parser.ts` (skipOsc/skipCsi)                                                                    | ✅     |
| CDH-L4e | 🔧 L4.4 Falhas multi-linha + stack traces (janela) + `confidence`/`evidence` + buckets de causa-raiz (`categorizeFailure`) | `shared/log-parser.ts` (`parseFailureRecordsFromLogs`, `extractFailureBlocks`)                              | ✅     |
| CDH-L4f | 🔧 L4.5 Localização best-effort (file/line a partir do trace) via `detectFileLine`                                         | `shared/log-parser.ts`                                                                                      | ✅     |
| CDH-L4g | ✅ L4.6 Consumidores absorvem `confidence`/`category`/`source`; abstêm em `null` (ver nota de resolução)                   | `shared/data-hub/extractors/failure-classifier.ts`, `shared/data-hub/providers/{github,gitlab}-provider.ts` | ✅     |
| CDH-L4h | 📋 L4.7 Testes (Test-First): `log-parser.test.ts` (28), `log-parser.property.test.ts` (6 PBT), existente                   | `shared/__tests__/`                                                                                         | ✅     |

**Resolução CDH-L4g (2026-07-12):** O alvo original citava `shared/data-hub/.../test-count-extractor` (inexistente) e o campo `evidence` (ausente em `FailureRecord` — só `category`/`confidence`/`source`). O defeito real era: `github/gitlab-provider.ts` colapsavam `FailureEntry` → `string[]` (`failureReasons`), dropando `category`/`confidence`/`source`/`file`/`line` (silence drop, AGENTS §25). Corrigido em:

- `failure-classifier.ts`: `FailureEntry` ganha `category`/`confidence`/`source` (via `categorizeFailure` + constantes 0.8 estruturado / 0.6 log, espelhando `annotations-extractor`/`log-parser`); novo `failureEntryToRecord()` mapeia para `FailureRecord` canônico (warning→`broken`).
- `github/gitlab-provider.ts`: `fetchFailureReasons` agora also popula `rawData.failureRecords: FailureRecord[]` a partir de `classified` (absorvendo os campos). `failureReasons` (mapa legado) mantido p/ `calcTopFailureReasons` (compatibilidade, sem break de contrato).
- Testes: `failure-classifier.test.ts` (r7/r8), `github/gitlab-provider.test.ts` (assert `failureRecords` com category/confidence/source). `tsc` + `npm run lint` + data-hub (545) verdes.

### Fase LA — Versionadores, extração máxima (GitHub + GitLab)

> Princípio: extrair a ÚLTIMA GOTA de cada ferramenta; quality-gate por provenance/confidence/validação; persistir (Fase STORE); baixa qualidade → rotulada, nunca dropada.

| ID      | Item                                                                                                                                                                                                                                | Arquivo(s)                                                                                                  | Status |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| CDH-LA1 | 🔧 Camada 3: annotations → `FailureRecord` rico (file/line/col/stack, todos níveis)                                                                                                                                                 | `shared/data-hub/extractors/annotations-extractor.ts` (novo); consome `CheckRunAnnotation`/`GitLabTestCase` | ✅     |
| CDH-LA2 | 🔧 Camada 1: custo real (`usage`) + `attempts`→flaky/retry                                                                                                                                                                          | `shared/data-hub/providers/github-provider.ts`, `shared/data-hub/compute/*`                                 | ✅     |
| CDH-LA3 | 🔧 Camada 6 (GitLab): `test_report_summary` + `stack_trace` + **DORA**                                                                                                                                                              | `shared/data-hub/providers/gitlab-provider.ts`, `shared/types/ci-cd.ts`                                     | 📋     |
| CDH-LA4 | 🔧 Camada 2: CTRF `flaky/retries/environment/tool`; Playwright `file/line`                                                                                                                                                          | `shared/data-hub/artifact-parser.ts`                                                                        | 📋     |
| CDH-LA5 | 🔧 Camada 5: reporter-prediction + **Segurança** (GitHub code-scanning/secret-scanning/Dependabot; GitLab SAST/dependency/container/secret) + **Performance** (queue/duration/runner) + **Deployments/Releases/DORA** + **PRs/MRs** | `shared/data-hub/providers/*`, `shared/github-pr-comment.ts`                                                | 📋     |

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
| CDH-ST1 | 🔧 Estender `RawData` + `DataHubPersistence` p/ todas as categorias (failureRecords, securityFindings, deployments, releases, doraMetrics, prs/mrs, pmIssues, xrayData, coverage.files, performanceMetrics) | `shared/types/data-hub.ts`, `shared/data-hub/persistence.ts` | ✅     |
| CDH-ST2 | 🔧 Camada de Qualidade `validateAndScore()`: schema validation + NaN/empty guards + confidence por fonte + dedup + provenance obrigatória; baixa qualidade → tag, não drop                                  | `shared/data-hub/quality.ts` (novo)                          | ✅     |
| CDH-ST3 | 🔧 Migração não-destrutiva do `MetricsStore` atual; novas categorias adicionadas; dados históricos preservados                                                                                              | `shared/data-hub/persistence.ts`                             | ✅     |

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

---

## 🔌 Sprint Jira Cloud — Conectividade + Xray (2026-07-13)

**Origem:** verificação pós-merge de `origin/main` (update Jira Cloud gateway + Bearer + proxy). Objetivo: confirmar que a ferramenta conecta e faz CRUD real em Jira Cloud atrás do proxy Zscaler.

| ID  | Item                                                                                                                                                                                                                                                                                                                                                                                     | Arquivo(s)                      | Status                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------- |
| JC0 | 🔧 TLS Zscaler (intercept): `shared/tls.ts` carrega `shared_docker/zscaler.crt` e anexa a `tls.rootCertificates`; sem isso → `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` ao usar o proxy                                                                                                                                                                                                         | `shared/tls.ts`                 | ✅                        |
| JC1 | 🔧 Root cause do 401 original: email errado no `.env.local` (`kevin.borges.contractor@euronext.com` → `kborges@euronext.com`). Token era válido; Basic `kborges:token` → 200                                                                                                                                                                                                             | `.env.local`                    | ✅                        |
| JC2 | ⚠️ Gateway `api.atlassian.com/ex/jira/<cloudId>` **NÃO aceita API token** (401 "Client must be authenticated"); exige **OAuth 2.0 (3LO)**. Header `Authorization` é preservado pelo proxy (testado via echo) → 401 é rejeição real do Atlassian, não do proxy                                                                                                                            | `jira-client.ts` (gateway path) | ⚠️ limitação              |
| JC3 | 📋 `jira.corp.cloud.int` **inacessível** via proxy Zscaler (HTTP 000). Use `euronext.atlassian.net` (Cloud direto)                                                                                                                                                                                                                                                                       | `.env.local`                    | ✅                        |
| JC4 | ✅ CRUD via Cloud Basic (`euronext.atlassian.net` + `kborges@euronext.com:token`): CREATE/READ/UPDATE OK (ECSPOL-1513). DELETE → 403 (conta contractor sem "Delete Issues" — permissão, não bug). Priority: schema custom do projeto (IDs 10000–10007); `priority:{name:'Medium'}` → 400, usar `{id:'10002'}`                                                                            | `jira-client.ts`                | ✅                        |
| JC5 | ⚠️ Xray em `ECSPOL` é **Cloud** (raven 404 em euronext). Steps Cloud usam GraphQL (`xray.cloud.getxray.app`), não `/rest/raven`. Exigem `XRAY_CLIENT_ID`+`XRAY_CLIENT_SECRET` (Xray Cloud API Keys). Jira cred (email+token) NÃO autentica Xray (401 testado). `.env.local` tinha `XRAY_MODE=server` (→cloud) e `XRAY_CLOUD_URL=jira.corp.cloud.int` (→`https://xray.cloud.getxray.app`) | `.env.local`, `xray-client.ts`  | ⚠️ bloqueado (credencial) |
| JC6 | ✅ `XrayCloudClient` plugado (TLS+proxy+GraphQL `addTestStep`); só falta credencial Xray Cloud. `ECSPOL-1255` é Test issue (candidato a steps)                                                                                                                                                                                                                                           | `xray-cloud-client.ts`          | ✅                        |
| JC7 | 🔒 `jira_xray_config_backup.md` tinha segredos reais no working tree (JIRA_PERSONAL_TOKEN/GITHUB_TOKEN/JIRA_USER_EMAIL) → redactado (placeholders). **Segredos AINDA no git HISTORY (commit `04c1c771`)** → requer rotacionar tokens + `git filter-repo` + force push (ação destrutiva, pendente de aprovação)                                                                           | `jira_xray_config_backup.md`    | 🔒                        |
| JC8 | 📋 Config validada (`.env.local`): `JIRA_BASE_URL=https://euronext.atlassian.net`, `JIRA_USER_EMAIL=kborges@euronext.com`, `JIRA_MODE=cloud`, `XRAY_MODE=cloud`, `XRAY_CLOUD_URL=https://xray.cloud.getxray.app`, `HTTPS_PROXY=http://127.0.0.1:9000` (Windows loopback — WSL não alcança)                                                                                               | `.env.local`                    | ✅                        |
| JC9 | 🔧 Teste gated `e2e/live-jira-cloud.test.ts` corrigido: Test 1 aceita gateway OU `*.atlassian.net`; Test 2 valida Cloud Basic via proxy (nome anterior dizia "gateway Bearer", inexato)                                                                                                                                                                                                  | `e2e/live-jira-cloud.test.ts`   | ✅                        |

### Como rodar os testes live (Windows, atrás do Zscaler)

```powershell
$env:HTTPS_PROXY='http://127.0.0.1:9000'
$env:JIRA_LIVE_TEST='1'
npx vitest run e2e/live-jira-cloud --no-coverage
```

O `shared/tls.ts` já anexa `shared_docker/zscaler.crt`; `NODE_EXTRA_CA_CERTS` não é necessário. O proxy só é alcançável a partir do Windows (loopback `127.0.0.1:9000`), por isso os testes live rodam via `powershell.exe`, não via WSL.

### Follow-up obrigatório (JC7)

- Rotacionar `JIRA_PERSONAL_TOKEN` (Atlassian) e `GITHUB_TOKEN` (já expostos em `04c1c771`).
- `git filter-repo` para remover os segredos do history + force push (requer aprovação explícita — ação destrutiva).
- `.env` contém chaves LLM reais (OpenRouter/Groq/Gemini/NVIDIA) — está gitignored, mas o env-loader recomenda mover para `.env.local`.
