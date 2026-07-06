# Data Hub Layered Architecture — Multi-Source Data Extraction

## Overview

**O QUE**: Extensão do DataHub para extrair dados ricos de testes/CI de múltiplas fontes, sem exigir integração de framework nos projetos monitorados. O qa_tools (serviço centralizado) gerencia múltiplos projetos via APIs de CI.

**POR QUE**: O qa_tools analisa projetos EXTERNOS. Não pode instalar nada neles nem controlar seu CI. Precisa extrair tudo que é possível via APIs do GitHub/GitLab, com fallback para input manual quando as fontes automáticas não são suficientes.

**COMO**: Arquitetura de 7 camadas com cascata de fallback. Cada tipo de dado (coverage, test counts, failure classification, etc.) tem sua própria cascata de extração, priorizando fontes de alta confiabilidade e descendo para fontes de menor confiabilidade até o fallback manual.

**Aligned with**: GHAminer (SANER 2025), gh-ci-artifacts, Allure Report (two-phase), ReportPortal (agent architecture).

**Business Rules**:

- **Padrão**: Fetch via REST API (sempre)
- **Plus**: Webhook (opcional, se projeto corporativo permitir — muitas corporações bloqueiam)
- **Billable minutes / cost**: Fora de escopo (não importante para este projeto)

**Key Data Sources**:

- GitHub Actions REST API (pipelines, jobs, artifacts, check runs)
- GitLab REST API (pipelines, jobs, test reports)
- Artifact download + ZIP extraction (CTRF, JUnit XML, Mochawesome)
- Check Runs API (publish-test-results integration)
- Job logs (regex-based test summary extraction)
- Contents API (framework detection from package.json, config files)
- CSV import/export (baseline histórico, cruzamento de dados)
- **User Fallback** (arquivo local ou path de repositório — última instância)

**Fallback Chain**: CI API → Artifacts → Check Runs → Job Logs → Contents API → GitLab Test Reports → **User Input**

---

## Executive Summary — Resumo para Retomada de Tarefa

> **Este bloco existe para que um assistente futuro compreenda integralmente o contexto.**

### O que já existe no código

| Componente                               | Status         | Local                                             |
| ---------------------------------------- | -------------- | ------------------------------------------------- |
| `GitProvider.listPipelineArtifacts()`    | ✅ Existe      | `shared/types/ci-cd.ts:164`                       |
| `GitProvider.downloadArtifact()`         | ✅ Existe      | `shared/types/ci-cd.ts:165`                       |
| `GitHubArtifact` type                    | ✅ Existe      | `shared/types/ci-cd.ts:200-205`                   |
| DataHub chama `listPipelineArtifacts()`  | ✅ Existe      | `shared/data-hub/providers/github-provider.ts:38` |
| DataHub NUNCA chama `downloadArtifact()` | ❌ GAP CRÍTICO | Conteúdo de artifacts nunca é baixado             |

### O que falta implementar

1. **DataHub precisa baixar artifacts** — Chamar `downloadArtifact()` existente, extrair ZIP com AdmZip, parsear CTRF/JUnit/Mochawesome
2. **Extractors** — Módulos de cascata para coverage, test counts, failure classification, framework detection
3. **Metrics** — Módulo de métricas derivadas de raw data (duration, queue, success rate, etc.)
4. **CSV** — Export/import para baseline histórico e cruzamento de dados
5. **User Fallback** — Camada 7: input interativo quando todas as camadas automáticas falham
6. **Integração** — Conectar todos os módulos no `hub.ts` e nos consumers

### Cenários reais de cobertura

| Cenário                                        | Cobertura | Fontes de dados                           |
| ---------------------------------------------- | --------- | ----------------------------------------- |
| GitHub com publish-test-results + artifacts    | ~95%      | Tudo                                      |
| GitHub com artifacts, sem publish-test-results | ~80%      | Sem check runs ricos                      |
| GitHub sem artifacts                           | ~75%      | Check Runs + job logs + CSV + annotations |
| GitLab                                         | ~95%      | Coverage nativo + test reports            |

### Limitações documentadas (NÃO implementar soluções)

| Limitação                                              | Motivo                             |
| ------------------------------------------------------ | ---------------------------------- |
| GitHub não expõe coverage via API                      | Calculamos via CTRF → Regex → User |
| Performance/usage metrics são UI-only                  | Calculamos ourselves via raw data  |
| Billable minutes / cost                                | Fora de escopo                     |
| Artifacts expiram em 90 dias                           | CSV baseline como alternativa      |
| Timing endpoint sendо descontinuado                    | Duration como alternativa          |
| ~60% dos projetos GitHub não usam publish-test-results | Fallback para artifacts/logs       |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 1: CI API (sempre disponível)                           │
│  - Pipeline runs (status, conclusion, branch, timestamps)       │
│  - Jobs (status, conclusion, steps com name/status)             │
│  - Timing (billable minutes, run duration)                      │
│  - Artifacts metadata (id, name, size, expired)                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 2: Artefatos (quando existirem)                         │
│  - Download via downloadArtifact() existente                    │
│  - ZIP extraction com AdmZip                                    │
│  - CTRF JSON (vitest)                                           │
│  - JUnit XML (pytest, jest, mocha, java, .net)                  │
│  - Mochawesome JSON (mocha)                                     │
│  - Playwright JSON                                              │
│  - Allure JSON                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 3: Check Runs (GitHub, quando disponível)               │
│  - publish-test-results output (summary, text, annotations)     │
│  - Check Run annotations (file/line/message)                    │
│  - PR comments com resumo de testes                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 4: Job Logs (fallback universal)                        │
│  - Test summary lines (regex parse)                             │
│  - Failure messages (regex extract)                             │
│  - Framework detection via output                               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 5: Contents API (framework detection)                   │
│  - package.json (dependencies)                                  │
│  - CI workflow (test commands)                                   │
│  - Config files (vitest.config.ts, jest.config.js)              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 6: GitLab Native (pipeline API + test reports)          │
│  - Coverage via pipeline.coverage (sem arquivo local)           │
│  - JUnit XML via job.artifacts[].file_type: "junit"            │
│  - Test report via GET /pipelines/:id/test_report               │
│  - failure_reason + runner_manager (diagnóstico)                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 7: User Fallback (última instância)                      │
│  - askFilePath() — tab completion, validação de formato         │
│  - CTRF JSON / JUnit XML / Mochawesome — auto-detecção         │
│  - Repository path — GitHub owner/repo ou GitLab project ID    │
│  - Retry loop — [R]etry / [S]kip / [A]bort / [D]etails        │
│  - Feedback — success/error boxes com exemplos e dicas          │
│  - Só executa em TTY (CI sempre pula)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Fallback chain**: CI API → Artifacts → Check Runs → Job Logs → Contents API → GitLab Test Reports → **User Input**

---

## Data Availability Matrix — Dados Disponíveis por Fonte

### GitHub

| Dado                                         | Fonte        | Confiabilidade | Disponibilidade  | Limitação    |
| -------------------------------------------- | ------------ | -------------- | ---------------- | ------------ |
| Pipeline status, branch, timestamps          | CI API       | ✅ 100%        | Sempre           | —            |
| Job status, conclusion, steps[]              | CI API       | ✅ 100%        | Sempre           | —            |
| Job duration, queue time                     | CI API       | ✅ 100%        | Sempre           | —            |
| Artifacts metadata (id, name, size, expired) | CI API       | ✅ 100%        | Sempre           | —            |
| Artifacts content (CTRF/JUnit)               | Download     | ⚠️ 60-80%      | 90 dias          | Expira       |
| Check Runs status                            | CI API       | ✅ 100%        | Sempre           | —            |
| Check Runs summary (publish-test-results)    | Check Runs   | ⚠️ 40%         | Se action ativa  | ~60% não usa |
| Check Runs annotations (file/line/message)   | Check Runs   | ⚠️ 30%         | Se action ativa  | Raro         |
| Test counts via regex no job log             | Job Logs     | ⚠️ 60-70%      | Sempre           | Impreciso    |
| Framework detection                          | Contents API | ✅ 90%         | Se config existe | Limite 1MB   |
| Code churn (additions/deletions)             | Commits      | ✅ 100%        | Sempre           | —            |

### GitLab

| Dado                                        | Fonte        | Confiabilidade | Disponibilidade   | Limitação |
| ------------------------------------------- | ------------ | -------------- | ----------------- | --------- |
| Pipeline status, coverage, duration, source | CI API       | ✅ 100%        | Sempre            | —         |
| Job status, failure_reason, runner_manager  | CI API       | ✅ 100%        | Sempre            | —         |
| Artifacts (file_type: "junit" nativo)       | CI API       | ✅ 100%        | Sempre            | —         |
| Artifacts content                           | Download     | ✅ 95%         | Não expira        | —         |
| Test report (passed/failed/skipped)         | API          | ✅ 95%         | Sempre            | —         |
| Job logs (trace completo)                   | API          | ✅ 100%        | Sempre            | —         |
| Framework detection                         | Contents API | ✅ 90%         | Se arquivo existe | —         |

### Cenários Reais

| Cenário                                            | Cobertura | Dados disponíveis                         |
| -------------------------------------------------- | --------- | ----------------------------------------- |
| **GitHub com publish-test-results + artifacts**    | ~95%      | Tudo exceto coverage nativo               |
| **GitHub com artifacts, sem publish-test-results** | ~80%      | Sem check runs ricos                      |
| **GitHub sem artifacts**                           | ~75%      | Check Runs + job logs + CSV + annotations |
| **GitLab**                                         | ~95%      | Coverage nativo + test reports            |

> **IMPORTANTE**: "GitHub sem artifacts" NÃO significa ~50% de cobertura. Mesmo sem artifacts, temos CI API completa, Check Runs (se publish-test-results ativo), job logs, Contents API, e CSV baseline. A ausência de artifacts afeta a **granularidade** dos dados de teste, não a **disponibilidade** de dados de pipeline/job/framework.

---

## Extractor Cascades — Cascata de Extração por Tipo de Dado

Cada tipo de dado tem sua própria cascata de extração, priorizando fontes de alta confiabilidade.

### Coverage

| Prioridade | Método                     | Confiabilidade | Fonte              | Módulo               |
| ---------- | -------------------------- | -------------- | ------------------ | -------------------- |
| 1          | GitLab `pipeline.coverage` | ✅ 100%        | Pipeline API       | coverage-extractor   |
| 2          | CTRF JSON `coverage` field | ✅ 100%        | Artifact content   | coverage-extractor   |
| 3          | Regex no job log           | ⚠️ 70%         | Job logs           | coverage-extractor   |
| 4          | CSV baseline (import)      | ✅ 100%        | csv-importer       | csv-importer         |
| 5          | **Fallback manual**        | ✅ 100%        | User provides file | test-source-fallback |

### Test Counts (passed/failed/skipped)

| Prioridade | Método                             | Confiabilidade | Fonte              | Módulo               |
| ---------- | ---------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | CTRF JSON `results.summary`        | ✅ 100%        | Artifact content   | test-count-extractor |
| 2          | JUnit XML `<testsuite>` attributes | ✅ 100%        | Artifact content   | test-count-extractor |
| 3          | Check Runs `output.summary`        | ✅ 90%         | Check Runs API     | test-count-extractor |
| 4          | Check Runs annotations count       | ⚠️ 80%         | Check Runs API     | test-count-extractor |
| 5          | Regex no job log                   | ⚠️ 60%         | Job logs           | test-count-extractor |
| 6          | **Fallback manual**                | ✅ 100%        | User provides file | test-source-fallback |

### Test Status por Arquivo (annotations)

| Prioridade | Método                            | Confiabilidade | Fonte              | Módulo               |
| ---------- | --------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | Check Runs annotations[]          | ✅ 90%         | Check Runs API     | test-count-extractor |
| 2          | CTRF JSON `tests[].filePath`      | ✅ 100%        | Artifact content   | test-count-extractor |
| 3          | JUnit XML `<testcase>` attributes | ✅ 100%        | Artifact content   | test-count-extractor |
| 4          | **Fallback manual**               | ✅ 100%        | User provides file | test-source-fallback |

### Failure Classification

| Prioridade | Método                                     | Confiabilidade | Fonte              | Módulo               |
| ---------- | ------------------------------------------ | -------------- | ------------------ | -------------------- |
| 1          | GitLab `job.failure_reason`                | ✅ 100%        | Jobs API           | failure-classifier   |
| 2          | GitHub `job.steps[].conclusion`            | ✅ 90%         | Jobs API           | failure-classifier   |
| 3          | Check Runs annotations (file/line/message) | ✅ 90%         | Check Runs API     | failure-classifier   |
| 4          | Regex failure messages no job log          | ⚠️ 70%         | Job logs           | failure-classifier   |
| 5          | **Fallback manual**                        | ✅ 100%        | User provides file | test-source-fallback |

### Framework Detection

| Prioridade | Método                          | Confiabilidade | Fonte              | Módulo               |
| ---------- | ------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | Contents API: `package.json`    | ✅ 90%         | Contents API       | framework-detector   |
| 2          | Contents API: config files      | ✅ 90%         | Contents API       | framework-detector   |
| 3          | Contents API: CI workflow files | ✅ 80%         | Contents API       | framework-detector   |
| 4          | Job log output (framework name) | ⚠️ 60%         | Job logs           | framework-detector   |
| 5          | **Fallback manual**             | ✅ 100%        | User provides path | test-source-fallback |

### Success/Failure Rate

| Prioridade | Método                           | Confiabilidade | Fonte          | Módulo             |
| ---------- | -------------------------------- | -------------- | -------------- | ------------------ |
| 1          | Pipeline `status` / `conclusion` | ✅ 100%        | Pipeline API   | metrics-calculator |
| 2          | Job `conclusion`                 | ✅ 100%        | Jobs API       | metrics-calculator |
| 3          | Check Runs `conclusion`          | ✅ 100%        | Check Runs API | metrics-calculator |

### Historical Data (tendências)

| Prioridade | Método                             | Confiabilidade | Fonte              | Módulo               |
| ---------- | ---------------------------------- | -------------- | ------------------ | -------------------- |
| 1          | CSV import (baseline)              | ✅ 100%        | csv-importer       | csv-importer         |
| 2          | Pipeline history (últimos 90 dias) | ✅ 100%        | Pipeline API       | metrics-calculator   |
| 3          | Artifacts (últimos 90 dias)        | ⚠️ 60%         | Download + parse   | metrics-calculator   |
| 4          | **Fallback manual**                | ✅ 100%        | User provides file | test-source-fallback |

---

## Derived Metrics — Métricas Calculadas de Raw Data

Métricas derivadas de dados brutos já obtidos. Cálculos matemáticos com confiabilidade 100% sobre os dados de entrada.

| Métrica              | Cálculo                             | Confiabilidade | Fonte          |
| -------------------- | ----------------------------------- | -------------- | -------------- |
| Duração pipeline     | `pipeline.duration`                 | ✅ 100%        | Pipeline API   |
| Duração job          | `job.completed_at - job.started_at` | ✅ 100%        | Jobs API       |
| Queue time           | `job.started_at - job.created_at`   | ✅ 100%        | Jobs API       |
| Success rate         | `count(success) / total * 100`      | ✅ 100%        | Pipelines      |
| Failure rate por job | `count(failure) / total * 100`      | ✅ 100%        | Jobs           |
| Avg duration         | `avg(durations)`                    | ✅ 100%        | Jobs           |
| Avg queue time       | `avg(queue times)`                  | ✅ 100%        | Jobs           |
| Test pass rate       | `passed / total * 100`              | ⚠️ 70%         | Artifacts/Logs |
| Coverage (GitLab)    | `pipeline.coverage`                 | ✅ 100%        | Pipeline API   |
| Coverage (GitHub)    | CTRF → Regex → User                 | ⚠️ 70%         | Cascata        |

**NÃO calculamos**: Billable minutes, cost estimate (fora de escopo — decisão confirmada pelo usuário).

---

## Cross-Cutting Modules — Módulos Independentes

Módulos que não pertencem a uma fase específica. São consumidos por múltiplas fases.

### Visão Geral

```
shared/data-hub/
├── hub.ts                          ← ORQUESTRA (chama todos os módulos)
├── providers/
│   ├── github-provider.ts          ← Dados brutos GitHub
│   └── gitlab-provider.ts          ← Dados brutos GitLab
├── test-source-fallback.ts         ← CAMADA 7: User Fallback
├── extractors/
│   ├── coverage-extractor.ts       ← Cascata de coverage
│   ├── test-count-extractor.ts     ← Cascata de test counts
│   ├── failure-classifier.ts       ← Cascata de failure classification
│   └── framework-detector.ts       ← Cascata de framework detection
└── metrics/
    ├── metrics-types.ts            ← Interfaces de métricas
    ├── metrics-calculator.ts       ← Métricas derivadas
    ├── csv-exporter.ts             ← Export CSV
    └── csv-importer.ts             ← Import CSV baseline
```

### Módulo 1: User Fallback (Camada 7)

**Arquivo**: `shared/data-hub/test-source-fallback.ts`
**Quando usar**: Quando TODAS as camadas 1-6 falham
**Confiabilidade**: ✅ 100% (dados fornecidos pelo usuário)

| Componente                 | Descrição                                       |
| -------------------------- | ----------------------------------------------- |
| `askTestSource()`          | Flow interativo: arquivo ou path de repositório |
| `validateTestFile()`       | Valida formato (CTRF, JUnit, Mochawesome)       |
| `formatValidationResult()` | Feedback visual (success/error boxes)           |
| `DATAHUB_ERRORS`           | Erros conhecidos com hints                      |

**Fluxo**: Detectar TTY → Mostrar contexto → Mostrar exemplos → Pedir input → Validar → Aceitar ou Retry

### Módulo 2: Coverage Extractor

**Arquivo**: `shared/data-hub/extractors/coverage-extractor.ts`
**Cascata**: GitLab API → CTRF JSON → Job Log Regex → CSV Import → User Fallback

### Módulo 3: Test Count Extractor

**Arquivo**: `shared/data-hub/extractors/test-count-extractor.ts`
**Cascata**: CTRF → JUnit → Check Runs Summary → Job Log Regex → User Fallback

### Módulo 4: Failure Classifier

**Arquivo**: `shared/data-hub/extractors/failure-classifier.ts`
**Cascata**: GitLab failure_reason → GitHub steps[] → Check Runs → Job Log Regex → User Fallback

### Módulo 5: Framework Detector

**Arquivo**: `shared/data-hub/extractors/framework-detector.ts`
**Cascata**: package.json → Config files → CI workflow → Job Log → User Fallback

### Módulo 6: Metrics Calculator

**Arquivo**: `shared/data-hub/metrics/metrics-calculator.ts`
**Confiabilidade**: ✅ 100% (cálculos sobre dados já obtidos)

| Componente                   | Descrição                    |
| ---------------------------- | ---------------------------- |
| `calculatePipelineMetrics()` | Duração, queue, success rate |
| `calculateJobMetrics()`      | Duração, queue, failure rate |
| `calculateTrendMetrics()`    | Médias diárias/semanais      |

### Módulo 7: CSV Exporter

**Arquivo**: `shared/data-hub/metrics/csv-exporter.ts`

**Formato CSV**:

```csv
pipeline_id,project,provider,duration_s,queue_s,success,test_count,fail_count,pass_rate,coverage,branch,timestamp
```

### Módulo 8: CSV Importer

**Arquivo**: `shared/data-hub/metrics/csv-importer.ts`

**Formato CSV baseline**:

```csv
job_name,avg_duration_s,p95_duration_s,success_rate
build,120,180,99.5
test,180,300,97.0
deploy,60,90,99.9
```

---

## Business Rules — Regras de Negócio

| Regra                      | Definição                             | Decisão                              |
| -------------------------- | ------------------------------------- | ------------------------------------ |
| **Fonte primária**         | Sempre REST API (GitHub/GitLab)       | Padrão                               |
| **Webhook**                | Opcional ("plus") se projeto permitir | Corporações frequentemente bloqueiam |
| **Billable minutes**       | Fora de escopo                        | Não implementar                      |
| **Cost estimate**          | Fora de escopo                        | Não implementar                      |
| **Performance UI metrics** | UI-only, sem REST API                 | Calculamos ourselves via raw data    |
| **Coverage GitHub**        | API não expõe                         | CTRF → Regex → User                  |
| **Artifacts expiração**    | 90 dias no GitHub                     | CSV baseline como alternativa        |
| **Timing endpoint**        | Sendо descontinuado                   | Duration como alternativa            |

---

> **HISTÓRICO**: Tasks 1-10 abaixo foram consolidadas nas Fases 15-26 (ver seções abaixo). Mantidas para referência de design original.

## Task 1: Extend PipelineJob with Step Conclusions

**Goal**: Populate `stepConclusions` field in `PipelineJob` from GitHub API.

### Files Affected

| File                                      | Action        | Description                                                 |
| ----------------------------------------- | ------------- | ----------------------------------------------------------- |
| `git_triggers/github-workflow.ts:114-133` | **Edit**      | Map `steps[]` from GitHub API response to `stepConclusions` |
| `shared/types/ci-cd.ts:58-75`             | **No change** | `stepConclusions` field already defined (line 74)           |

### GitHub API Endpoint

```
GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs
```

**Response schema** (relevant fields):

```json
{
    "jobs": [
        {
            "id": 85262379771,
            "name": "Quality",
            "status": "completed",
            "conclusion": "failure",
            "steps": [
                {
                    "name": "Run npm run lint",
                    "status": "completed",
                    "conclusion": "failure",
                    "number": 7,
                    "started_at": "2026-07-05T21:37:34Z",
                    "completed_at": "2026-07-05T21:39:13Z"
                }
            ]
        }
    ]
}
```

### Changes to `github-workflow.ts`

```typescript
// BEFORE (line 120-132):
const data = await apiGet<{
    jobs: Array<{ id: number; name: string; runner_group_name?: string; conclusion?: string; status?: string }>;
}>(client, '/repos/' + owner + '/' + repo + '/actions/runs/' + pipelineId + '/jobs', { ... });
const jobs = data?.jobs || [];
return jobs.map((j) => ({
    id: j.id,
    name: j.name,
    stage: j.runner_group_name || '',
    status: j.conclusion || j.status || '',
}));

// AFTER:
const data = await apiGet<{
    jobs: Array<{
        id: number;
        name: string;
        runner_group_name?: string;
        conclusion?: string;
        status?: string;
        started_at?: string;
        finished_at?: string;
        steps?: Array<{
            name: string;
            status: string;
            conclusion?: string;
            number: number;
            started_at?: string;
            completed_at?: string;
        }>;
    }>;
}>(client, '/repos/' + owner + '/' + repo + '/actions/runs/' + pipelineId + '/jobs', { ... });
const jobs = data?.jobs || [];
return jobs.map((j) => ({
    id: j.id,
    name: j.name,
    stage: j.runner_group_name || '',
    status: j.conclusion || j.status || '',
    started_at: j.started_at,
    finished_at: j.finished_at,
    stepConclusions: j.steps?.map((s) => ({
        name: s.name,
        conclusion: s.conclusion || s.status || '',
        number: s.number,
    })),
}));
```

### Tests

- `git_triggers/__tests__/github-workflow.test.ts` — verify `stepConclusions` is populated
- Property test: `stepConclusions` length matches `steps` length from API

---

## Task 2: Extend PipelineJob with Timestamps (GitHub)

**Goal**: Populate `started_at`, `finished_at`, `duration` for GitHub jobs.

### Files Affected

| File                                      | Action   | Description                              |
| ----------------------------------------- | -------- | ---------------------------------------- |
| `git_triggers/github-workflow.ts:114-133` | **Edit** | Map `started_at`, `finished_at` from API |

### Changes

Already included in Task 1 (same function). Add `started_at` and `finished_at` mapping.

### Compute Impact

- `shared/data-hub/compute/avg-duration.ts` — Currently returns 0 for GitHub. Will return real values.
- `shared/data-hub/compute/suite-speed.ts` — Currently returns 0 for GitHub. Will return real values.

### Tests

- Verify `duration` is computed from `started_at`/`finished_at` when not provided by API

---

## Task 3: Extend ArtifactInfo with Size

**Goal**: Capture `size_in_bytes` and `created_at` from artifacts.

### Files Affected

| File                                      | Action   | Description                                   |
| ----------------------------------------- | -------- | --------------------------------------------- |
| `shared/types/ci-cd.ts:96-101`            | **Edit** | Add `size_in_bytes?` and `created_at?` fields |
| `git_triggers/github-workflow.ts:135-151` | **Edit** | Map `size_in_bytes`, `created_at` from API    |
| `git_triggers/gitlab-workflow.ts:104-119` | **Edit** | Map `size` from API                           |

### GitHub API Endpoint

```
GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts
```

**Response schema**:

```json
{
    "artifacts": [
        {
            "id": 12345,
            "name": "ctrf-report",
            "size_in_bytes": 1024,
            "created_at": "2026-07-05T21:39:42Z"
        }
    ]
}
```

### GitLab API Endpoint

```
GET /projects/:id/pipelines/:pipeline_id/jobs
```

**Response schema** (artifacts field):

```json
{
    "artifacts_file": {
        "filename": "artifacts.zip",
        "size": 1024
    }
}
```

### Tests

- Verify `size_in_bytes` is populated from both providers
- Verify `created_at` is populated

---

## Task 4: JUnit XML Parser

**Goal**: Parse JUnit XML test reports (universal format used by pytest, jest, mocha, java, .net).

### Files Affected

| File                              | Action   | Description                          |
| --------------------------------- | -------- | ------------------------------------ |
| `shared/junit-xml-parser.ts`      | **New**  | JUnit XML parser                     |
| `shared/junit-xml-parser.test.ts` | **New**  | Tests for parser                     |
| `shared/result_parser.ts:341-347` | **Edit** | Add JUnit XML detection and dispatch |

### JUnit XML Schema

```xml
<testsuites name="..." tests="10" failures="1" errors="0" time="1.5">
  <testsuite name="suite1" tests="5" failures="1" errors="0" time="0.8">
    <testcase name="test1" classname="Tests.Class1" time="0.1">
    </testcase>
    <testcase name="test2" classname="Tests.Class1" time="0.2">
      <failure message="Expected 1 to equal 2" type="AssertionError">
        Stack trace here...
      </failure>
    </testcase>
    <testcase name="test3" classname="Tests.Class1" time="0.1">
      <skipped message="Not implemented"/>
    </testcase>
  </testsuite>
</testsuites>
```

### Parser Implementation

```typescript
// shared/junit-xml-parser.ts
import { parseString } from 'xml2js'; // or fast-xml-parser

interface JUnitTestCase {
    name: string;
    classname?: string;
    time?: number;
    failure?: { message?: string; type?: string; _: string };
    error?: { message?: string; type?: string; _: string };
    skipped?: { message?: string };
}

interface JUnitTestSuite {
    name: string;
    tests: number;
    failures: number;
    errors: number;
    time: number;
    testcase: JUnitTestCase[];
}

interface JUnitTestSuites {
    name?: string;
    tests: number;
    failures: number;
    errors: number;
    time: number;
    testsuite: JUnitTestSuite[];
}

export function parseJUnitXml(xmlString: string): ParseResult {
    // Parse XML to JSON
    // Map to FlatTest[] and stats
    // Return ParseResult
}
```

### npm Dependencies

- `fast-xml-parser` (preferred, maintained, no dependencies)
- Already in ecosystem: `xml2js` (used by some tools)

### Tests

- Parse valid JUnit XML → correct `FlatTest[]` and `stats`
- Parse XML with failures → failure messages captured
- Parse XML with skipped tests → skipped count correct
- Parse malformed XML → returns `EMPTY_PARSE_RESULT`
- Parse empty XML → returns `EMPTY_PARSE_RESULT`

---

## Task 5: Log Parser for Test Summary

**Goal**: Extract test counts and failure messages from job logs when no structured artifact exists.

### Files Affected

| File                        | Action  | Description           |
| --------------------------- | ------- | --------------------- |
| `shared/log-parser.ts`      | **New** | Log parsing functions |
| `shared/log-parser.test.ts` | **New** | Tests for parser      |

### Framework Patterns

```typescript
const TEST_SUMMARY_PATTERNS: Record<string, RegExp> = {
    vitest: /Tests\s+(\d+)\s+passed.*?(\d+)\s+skipped\s*\((\d+)\)/,
    jest: /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/,
    mocha: /(\d+)\s+passing.*?(\d+)\s+failing/,
    pytest: /={2,}\s+(\d+) passed.*?(\d+) failed/,
    goTest: /^(ok|FAIL)\t(.+)\t(\d+\.\d+)s$/m,
};

const FAILURE_PATTERNS: RegExp[] = [
    /Error[:\s]+(.{10,100})/gi,
    /Failure[:\s]+(.{10,100})/gi,
    /AssertionError[:\s]+(.{10,100})/gi,
    /Timeout[:\s]+(.{10,100})/gi,
    /FATAL[:\s]+(.{10,100})/gi,
];

interface LogParseResult {
    testCounts?: { passed: number; failed: number; skipped: number; total: number };
    failures: string[];
    framework?: string;
}
```

### Implementation

```typescript
export function parseTestSummaryFromLogs(logText: string): LogParseResult {
    // 1. Try each framework pattern
    // 2. Extract counts
    // 3. Extract failure messages
    // 4. Detect framework from output
    return { testCounts, failures, framework };
}
```

### Tests

- Parse vitest output → correct counts
- Parse jest output → correct counts
- Parse pytest output → correct counts
- Parse mocha output → correct counts
- Parse output with failures → failure messages extracted
- Parse empty log → empty result
- Parse log without test output → empty result

---

## Task 6: GitHub Check Run Annotations

**Goal**: Fetch and parse annotations from GitHub Check Runs API.

### Files Affected

| File                              | Action   | Description                               |
| --------------------------------- | -------- | ----------------------------------------- |
| `git_triggers/github-workflow.ts` | **Edit** | Add `wfGetCheckRunAnnotations()` function |
| `shared/types/ci-cd.ts`           | **Edit** | Add `CheckRunAnnotation` interface        |
| `shared/types/data-hub.ts`        | **Edit** | Add `annotations` to `RawData`            |

### GitHub API Endpoints

```
GET /repos/{owner}/{repo}/commits/{sha}/check-runs
GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations
```

**Check Runs Response schema**:

```json
{
    "check_runs": [
        {
            "id": 85262379771,
            "name": "Quality",
            "status": "completed",
            "conclusion": "failure",
            "output": {
                "title": "Lint failed",
                "summary": "2 errors, 5 warnings",
                "annotations_count": 7
            },
            "check_suite_id": 77712684991
        }
    ]
}
```

**Annotations Response schema**:

```json
{
    "annotations": [
        {
            "path": "src/foo.ts",
            "start_line": 42,
            "end_line": 42,
            "annotation_level": "failure",
            "title": "Lint error",
            "message": "Unexpected any",
            "raw_details": "eslint@typescript-eslint/no-explicit-any"
        }
    ]
}
```

### New Types

```typescript
// shared/types/ci-cd.ts
export interface CheckRunAnnotation {
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: 'notice' | 'warning' | 'failure';
    title?: string;
    message?: string;
    raw_details?: string;
}

// shared/types/data-hub.ts
export interface RawData {
    // ... existing fields
    annotations?: Map<number, CheckRunAnnotation[]>; // keyed by check_run_id
}
```

### Tests

- Fetch annotations for a check run
- Parse annotation into structured data
- Handle empty annotations
- Handle API errors gracefully

---

## Task 7: Framework Detection via Contents API

**Goal**: Detect test framework from monitored project's `package.json` and CI workflow.

### Files Affected

| File                                 | Action   | Description                           |
| ------------------------------------ | -------- | ------------------------------------- |
| `shared/framework-detection.ts`      | **New**  | Framework detection via API           |
| `shared/framework-detection.test.ts` | **New**  | Tests                                 |
| `shared/types/data-hub.ts`           | **Edit** | Add `framework?: string` to `RawData` |

### API Endpoints

**GitHub**:

```
GET /repos/{owner}/{repo}/contents/package.json?ref={sha}
GET /repos/{owner}/{repo}/contents/.github/workflows/ci.yml?ref={sha}
```

**GitLab**:

```
GET /projects/:id/repository/files/package.json/raw?ref={sha}
GET /projects/:id/repository/files/.gitlab-ci.yml/raw?ref={sha}
```

### Detection Logic

```typescript
const FRAMEWORK_SIGNATURES: Record<string, { dependencies: string[]; configFiles: string[]; cliPatterns: string[] }> = {
    vitest: {
        dependencies: ['vitest'],
        configFiles: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'],
        cliPatterns: ['vitest run', 'vitest --run'],
    },
    jest: {
        dependencies: ['jest', 'ts-jest', '@jest/core'],
        configFiles: ['jest.config.ts', 'jest.config.js', 'jest.config.mjs'],
        cliPatterns: ['jest', 'npx jest'],
    },
    playwright: {
        dependencies: ['@playwright/test'],
        configFiles: ['playwright.config.ts', 'playwright.config.js'],
        cliPatterns: ['playwright test', 'npx playwright test'],
    },
    cypress: {
        dependencies: ['cypress'],
        configFiles: ['cypress.config.ts', 'cypress.config.js'],
        cliPatterns: ['cypress run', 'npx cypress run'],
    },
    mocha: {
        dependencies: ['mocha'],
        configFiles: ['.mocharc.yml', '.mocharc.json', '.mocharc.js'],
        cliPatterns: ['mocha', 'npx mocha'],
    },
    pytest: {
        dependencies: ['pytest'],
        configFiles: ['pytest.ini', 'pyproject.toml', 'conftest.py'],
        cliPatterns: ['pytest', 'python -m pytest'],
    },
};

export async function detectFrameworkFromAPI(
    gitProvider: GitProvider,
    owner: string,
    repo: string,
    sha: string,
): Promise<{ framework: string; confidence: number }> {
    // 1. Fetch package.json via Contents API
    // 2. Check dependencies
    // 3. Fetch CI workflow
    // 4. Check test commands
    // 5. Return framework with confidence score
}
```

### Tests

- Detect vitest from package.json
- Detect jest from config file
- Detect pytest from pyproject.toml
- No framework detected → return 'unknown'
- API error → graceful fallback

---

## Task 8: GitLab Test Reports API Integration

**Goal**: Fetch test reports directly from GitLab's native Test Reports API.

### Files Affected

| File                                           | Action   | Description                              |
| ---------------------------------------------- | -------- | ---------------------------------------- |
| `git_triggers/gitlab-workflow.ts`              | **Edit** | Add `glGetPipelineTestReport()` function |
| `shared/types/ci-cd.ts`                        | **Edit** | Add `GitLabTestReport` interface         |
| `shared/data-hub/providers/gitlab-provider.ts` | **Edit** | Fetch test reports                       |

### GitLab API Endpoint

```
GET /projects/:id/pipelines/:pipeline_id/test_report
```

**Response schema**:

```json
{
    "test_suites": [
        {
            "name": "unit tests",
            "test_cases": [
                {
                    "status": "success",
                    "name": "test_addition",
                    "classname": "tests.test_math",
                    "file_name": "tests/test_math.py",
                    "execution_time": 0.123
                },
                {
                    "status": "failed",
                    "name": "test_subtraction",
                    "classname": "tests.test_math",
                    "file_name": "tests/test_math.py",
                    "execution_time": 0.045,
                    "failure": {
                        "message": "AssertionError: 2 != 3",
                        "backtrace": "..."
                    }
                }
            ]
        }
    ]
}
```

### New Types

```typescript
// shared/types/ci-cd.ts
export interface GitLabTestReport {
    test_suites: Array<{
        name: string;
        test_cases: Array<{
            status: 'success' | 'failed' | 'skipped' | 'error';
            name: string;
            classname?: string;
            file_name?: string;
            execution_time?: number;
            failure?: {
                message?: string;
                backtrace?: string;
            };
        }>;
    }>;
}
```

### Implementation

```typescript
export async function glGetPipelineTestReport(
    client: AxiosInstance,
    projectId: string,
    pipelineId: string | number,
): Promise<GitLabTestReport | null> {
    const data = await apiGet<GitLabTestReport>(client, `/projects/${projectId}/pipelines/${pipelineId}/test_report`, {
        operation: 'buscar test report',
        returnNull: true,
    });
    return data;
}
```

### Tests

- Fetch test report from GitLab API
- Parse test cases into `FlatTest[]`
- Handle empty test report
- Handle API errors

---

## Task 9: Enrich DataHub with Multi-Source Data

**Goal**: Integrate all new data sources into the DataHub compute layer.

### Files Affected

| File                                                 | Action   | Description                 |
| ---------------------------------------------------- | -------- | --------------------------- |
| `shared/types/data-hub.ts:11-19`                     | **Edit** | Add new fields to `RawData` |
| `shared/data-hub/hub.ts:142-177`                     | **Edit** | Compute new metrics         |
| `shared/data-hub/providers/github-provider.ts:18-51` | **Edit** | Fetch new data              |
| `shared/data-hub/providers/gitlab-provider.ts:18-51` | **Edit** | Fetch new data              |

### RawData Extensions

```typescript
export interface RawData {
    // ... existing fields
    /** GitHub check run annotations */
    annotations?: Map<number, CheckRunAnnotation[]>;
    /** Detected test framework */
    framework?: string;
    /** GitLab test report */
    gitlabTestReport?: GitLabTestReport;
    /** Parsed test counts from logs (fallback) */
    logTestCounts?: { passed: number; failed: number; skipped: number; total: number };
}
```

### ComputedMetrics Extensions

```typescript
export interface ComputedMetrics {
    // ... existing fields
    /** Test pass rate (from artifacts/logs/GitLab) */
    testPassRate?: number;
    /** Test counts */
    testCounts?: { passed: number; failed: number; skipped: number; total: number };
    /** Detected framework */
    framework?: string;
}
```

### Tests

- DataHub correctly merges multi-source data
- Fallback chain: artifacts → GitLab test report → logs → CI API
- Metrics are computed correctly with new data

---

## Task 10: Unify CI Data Systems

**Goal**: Migrate `git-artifact-downloader.ts` to use DataHub, removing duplicate code.

### Files Affected

| File                                | Action        | Description                               |
| ----------------------------------- | ------------- | ----------------------------------------- |
| `shared/git-artifact-downloader.ts` | **Deprecate** | Replace with DataHub-based implementation |
| `shared/data-hub/hub.ts`            | **Edit**      | Add `fetchLatestTestRun()` method         |

### Deprecation Plan

1. Mark `fetchGitHistory()` and `fetchLatestTestRun()` as `@deprecated`
2. Create new implementations using DataHub
3. Update callers to use DataHub
4. Remove old implementation in next major version

### Tests

- Verify new implementation produces same results as old
- Verify backward compatibility during deprecation period

---

## Files Deprecated

| File                                | Status         | Replacement                      |
| ----------------------------------- | -------------- | -------------------------------- |
| `shared/git-artifact-downloader.ts` | **Deprecated** | `shared/data-hub/hub.ts` methods |

## Files Deferred

| File                                      | Status       | Reason                                                                |
| ----------------------------------------- | ------------ | --------------------------------------------------------------------- |
| `shared/data-hub/compute/security.ts`     | **Deferred** | `SecurityResult` type exists but no compute function. Add in Phase 2. |
| `shared/data-hub/compute/dora-metrics.ts` | **Deferred** | Deployment frequency, lead time, MTTR. Add in Phase 2.                |

## Files Created

| File                                 | Description                   |
| ------------------------------------ | ----------------------------- |
| `shared/junit-xml-parser.ts`         | JUnit XML parser              |
| `shared/junit-xml-parser.test.ts`    | Tests for JUnit XML parser    |
| `shared/log-parser.ts`               | Log parsing for test summary  |
| `shared/log-parser.test.ts`          | Tests for log parser          |
| `shared/framework-detection.ts`      | Framework detection via API   |
| `shared/framework-detection.test.ts` | Tests for framework detection |

## Files Modified

| File                                           | Changes                                                                                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/types/ci-cd.ts`                        | Extend `ArtifactInfo` with `size_in_bytes`, `created_at`, `expired`, `archive_download_url`, `digest`; add `CheckRunAnnotation`; add `GitLabTestReport`                 |
| `shared/types/data-hub.ts`                     | Add `annotations`, `framework`, `gitlabTestReport`, `logTestCounts`, `parsedArtifacts` to `RawData`; add `testPassRate`, `testCounts`, `framework` to `ComputedMetrics` |
| `git_triggers/github-workflow.ts`              | Map `steps[]`, `started_at`, `finished_at`, `size_in_bytes`; add `wfGetCheckRunAnnotations()`; implement `downloadArtifact()` with 302 redirect handling                |
| `git_triggers/gitlab-workflow.ts`              | Map `size` from artifacts; add `glGetPipelineTestReport()`                                                                                                              |
| `shared/data-hub/hub.ts`                       | Integrate new data sources, artifact download, fallback chain, compute new metrics                                                                                      |
| `shared/data-hub/providers/github-provider.ts` | Download artifacts via `downloadArtifact()`, parse ZIP contents, fetch annotations, framework detection                                                                 |
| `shared/data-hub/providers/gitlab-provider.ts` | Fetch test reports, framework detection                                                                                                                                 |
| `shared/data-hub/compute/index.ts`             | Export new compute functions                                                                                                                                            |
| `shared/result_parser.ts`                      | Add JUnit XML detection and dispatch                                                                                                                                    |

---

## API Endpoints Reference

### GitHub

| Endpoint                                                          | Method | Description                                  | Response                                |
| ----------------------------------------------------------------- | ------ | -------------------------------------------- | --------------------------------------- |
| `GET /repos/{owner}/{repo}/actions/runs`                          | GET    | List workflow runs                           | `GitHubWorkflowRunsResponse`            |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`            | GET    | List jobs with steps                         | Jobs with `steps[]` array               |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts`       | GET    | List artifacts for run                       | `GitHubArtifactsResponse`               |
| `GET /repos/{owner}/{repo}/actions/artifacts`                     | GET    | List all repo artifacts (filterable by name) | `GitHubArtifactsResponse`               |
| `GET /repos/{owner}/{repo}/actions/artifacts/{id}`                | GET    | Get artifact metadata                        | Full artifact with `size_in_bytes`, etc |
| `GET /repos/{owner}/{repo}/actions/artifacts/{id}/zip`            | GET    | Download artifact (302 redirect, 1min exp)   | ZIP archive via `Location` header       |
| `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs`            | GET    | Get job logs                                 | Plain text log                          |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}/timing`          | GET    | Get timing data                              | Billable minutes                        |
| `GET /repos/{owner}/{repo}/commits/{sha}/check-runs`              | GET    | List check runs                              | Check runs with `output` object         |
| `GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations` | GET    | List annotations                             | `CheckRunAnnotation[]`                  |
| `GET /repos/{owner}/{repo}/contents/{path}`                       | GET    | Get file contents (base64)                   | File content                            |

**Artifact download behavior:**

- Returns `302 Found` with `Location` header containing temporary URL
- URL expires after **1 minute**
- `archive_format` must be `zip`
- Returns `410 Gone` if artifact expired/deleted

**Artifact metadata fields:**

- `id`, `name`, `size_in_bytes`, `url`, `archive_download_url`
- `expired` (boolean), `created_at`, `expires_at`, `updated_at`
- `digest` (hash), `workflow_run` (id, head_branch, head_sha)

### GitLab

| Endpoint                                               | Method | Description       | Response                               |
| ------------------------------------------------------ | ------ | ----------------- | -------------------------------------- |
| `GET /projects/:id/pipelines`                          | GET    | List pipelines    | Pipeline array (with `coverage` field) |
| `GET /projects/:id/pipelines/:pipeline_id/jobs`        | GET    | List jobs         | Job array with `artifacts[]`           |
| `GET /jobs/:job_id/trace`                              | GET    | Get job log       | Plain text log                         |
| `GET /projects/:id/pipelines/:pipeline_id/test_report` | GET    | Get test report   | `GitLabTestReport`                     |
| `GET /projects/:id/repository/files/{file_path}/raw`   | GET    | Get file contents | Raw file content                       |

**GitLab pipeline fields (no extra API call needed):**

- `coverage` (number|null) — last coverage value
- `detailed_status` — `{ text, label, group }` (e.g., "passed", "failed")
- `source` — trigger type: `push`, `web`, `schedule`, `api`, `external`, `pipeline`, `webide`
- `duration` (number|null) — total pipeline duration in seconds

**GitLab job.artifacts[] typed fields:**

- `file_type`: `"archive"` | `"junit"` | `"trace"` — native JUnit detection
- `size` (number) — artifact size in bytes
- `download_path` (string) — download endpoint

**GitLab failure diagnostics:**

- `failure_reason`: `"unknown_failure"` | `"script_failure"` | `"stuck_or_timeout_failure"` etc.
- `runner_manager`: `{ version, revision, platform }` — runner version for diagnosis

---

## Implementation Order

1. **Task 1-2**: Extend `github-workflow.ts` with steps and timestamps
2. **Task 3**: Extend `ArtifactInfo` with size
3. **Task 4**: JUnit XML parser
4. **Task 5**: Log parser
5. **Task 6**: GitHub Check Run annotations
6. **Task 7**: Framework detection via Contents API
7. **Task 8**: GitLab Test Reports API
8. **Task 9**: Enrich DataHub with multi-source data
9. **Task 10**: Unify CI data systems (deprecate old code)

---

## Testing Strategy

### Unit Tests

- Each new parser has dedicated test file
- Mock API responses for provider tests
- Property-based tests for parsers

### Integration Tests

- End-to-end flow: fetch → parse → compute → report
- Fallback chain verification

### Pre-Commit

- `npx vitest run` — all tests pass
- `npm run lint` — no violations
- `npx tsc --noEmit` — no type errors

---

## Success Criteria

| Criteria                             | Target            |
| ------------------------------------ | ----------------- |
| Pipeline pass/fail from CI API       | 100%              |
| Job pass/fail from CI API            | 100%              |
| Step pass/fail from CI API           | 100%              |
| Test counts from artifacts           | 95%               |
| Test counts from GitLab test reports | 100%              |
| Test counts from logs (fallback)     | 85%               |
| Framework detection                  | 90%               |
| Failure location via annotations     | 90% (GitHub only) |
| All existing tests pass              | 100%              |
| Type safety (no `as any`, `!`)       | 100%              |
| Silent failures (0 ocorrências)      | 0                 |
| Edge cases documentados              | 100%              |
| Contratos verificados                | 100%              |
| Performance < 1s por operação        | 100%              |
| Auditoria completa                   | 14/14 dimensões   |

---

## Progress

- [ ] Phase 15 — Critical Pipeline Fixes
- [ ] Phase 16 — Error Handling Fixes
- [ ] Phase 17 — Summary & Report Fixes
- [ ] Phase 18 — Data Extraction (Tasks 1-10)
- [ ] Phase 19 — Auditoria Completa de Qualidade

---

## Vision

qa_tools is a centralized service that connects to CI via APIs. It cannot install anything in monitored projects or control their CI workflow. The DataHub layer must extract all data from CI APIs (GitHub REST, GitLab REST), artifacts, and job logs. All consumers (PR reports, quality gates, dashboards, reports, alerts) must use DataHub as the single source of truth.

---

## Context

- qa_tools is NOT installed inside monitored projects
- It connects via GitHub REST API and GitLab REST API
- Cannot force monitored projects to emit specific test reports
- Cannot control CI workflow (no `--outputFile`, no `upload-artifact` steps)
- Must work with whatever data is available in CI APIs

---

## Target Architecture

> **Nota**: Este diagrama é idêntico ao "Architecture" acima. Mantido para referência dentro do contexto das fases.

```
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 1: CI API (sempre disponível)                           │
│  - Pipeline runs (status, conclusion, branch, timestamps)       │
│  - Jobs (status, conclusion, steps com name/status)             │
│  - Timing (billable minutes, run duration)                      │
│  - Artifacts metadata (id, name, size, expired)                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 2: Artefatos (quando existirem)                         │
│  - Download via downloadArtifact() existente                    │
│  - ZIP extraction com AdmZip                                    │
│  - CTRF JSON (vitest)                                           │
│  - JUnit XML (pytest, jest, mocha, java, .net)                  │
│  - Mochawesome JSON (mocha)                                     │
│  - Playwright JSON                                              │
│  - Allure JSON                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 3: Check Runs (GitHub, quando disponível)               │
│  - publish-test-results output (summary, text, annotations)     │
│  - Check Run annotations (file/line/message)                    │
│  - PR comments com resumo de testes                             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 4: Job Logs (fallback universal)                        │
│  - Test summary lines (regex parse)                             │
│  - Failure messages (regex extract)                             │
│  - Framework detection via output                               │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 5: Contents API (framework detection)                   │
│  - package.json (dependencies)                                  │
│  - CI workflow (test commands)                                   │
│  - Config files (vitest.config.ts, jest.config.js)              │
│  - Raw mode: application/vnd.github.raw+json                    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 6: GitLab Native (pipeline API + test reports)          │
│  - Coverage via pipeline.coverage (sem arquivo local)           │
│  - JUnit XML via job.artifacts[].file_type: "junit"            │
│  - Test report via GET /pipelines/:id/test_report               │
│  - failure_reason + runner_manager (diagnóstico)                │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 7: User Fallback (última instância)                      │
│  - askFilePath() — tab completion, validação de formato         │
│  - CTRF JSON / JUnit XML / Mochawesome — auto-detecção         │
│  - Repository path — GitHub owner/repo ou GitLab project ID    │
│  - Retry loop — [R]etry / [S]kip / [A]bort / [D]etails        │
│  - Feedback — success/error boxes com exemplos e dicas          │
│  - Só executa em TTY (CI sempre pula)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Fallback chain**: CI API → Artifacts → Check Runs → Job Logs → Contents API → GitLab Test Reports → **User Input**

---

## ESLint Rules (mandatory)

```jsonc
{
    "rules": {
        "no-console": "error",
        "no-process-exit": "error",
        "no-throw-literal": "error",
        "no-unnecessary-condition": "error",
        "prefer-const": "error",
        "no-var": "error",
        "eqeqeq": "error",
        "no-implicit-coercion": "error",
        "typescript-eslint/no-explicit-any": "error",
        "typescript-eslint/no-unsafe-argument": "error",
        "typescript-eslint/no-unsafe-assignment": "error",
        "typescript-eslint/no-unsafe-member-access": "error",
        "typescript-eslint/no-unsafe-return": "error",
    },
}
```

---

## Pre-commit Hooks (mandatory)

```bash
# .husky/pre-commit
npx vitest run --reporter=verbose 2>&1
RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "❌ Tests failed. Commit rejected."
  exit 1
fi
npx eslint . --max-warnings=0
RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "❌ Lint failed. Commit rejected."
  exit 1
fi
npx tsc --noEmit
RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "❌ TypeScript failed. Commit rejected."
  exit 1
fi
echo "✅ All checks passed."
```

---

## Test Conventions

- **Framework**: Vitest
- **Naming**: `*.test.ts`
- **Mocks**: `vi.fn()`, `vi.mock()`
- **Coverage**: 100%
- **Pre-commit**: `vitest run --reporter=verbose`
- **PBT**: Property-based tests for parsers

---

## Pre-flight Checks per Phase

| Phase | tsc --noEmit | lint           | vitest       | PBT         | Auditoria   |
| ----- | ------------ | -------------- | ------------ | ----------- | ----------- |
| 15    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           | —           |
| 16    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           | —           |
| 17    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           | —           |
| 18    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | ✅ presente | —           |
| 19    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | ✅ presente | ✅ completa |

---

# MÓDULO CROSS-CUTTING — User Fallback (Camada 7)

> **Tipo**: Módulo independente, não uma fase. Usado por todas as fases que consomem DataHub.
> **Arquivo**: `shared/data-hub/test-source-fallback.ts`
> **Testes**: `shared/data-hub/test-source-fallback.test.ts`

## Contexto

Quando todas as camadas automáticas (1-6) falham — sem artifacts, sem check runs, sem test reports, sem job logs — o DataHub precisa de um **último recurso interativo**: pedir ao usuário um arquivo local ou path de repositório.

**Regras**:

- Só executa em **TTY** (CI/CD sempre pula)
- Respeita `AUTO_CONFIRM` mode (pula silenciosamente)
- Valida formato do arquivo antes de aceitar
- Retry loop com `[R]etry / [S]kip / [A]bort / [D]etails`
- Feedback visual: success/error boxes com exemplos

## Módulo: `shared/data-hub/test-source-fallback.ts`

### Tarefa F1 — RED:

| #   | Teste                                              | Esperado                                                 |
| --- | -------------------------------------------------- | -------------------------------------------------------- |
| R1  | `askTestSource('project')` em TTY                  | Retorna `{ type, path }` ou `{ type: 'skip' }`           |
| R2  | `askTestSource('project')` em non-TTY              | Retorna `{ type: 'skip' }` sem perguntar                 |
| R3  | `askTestSource('project')` com `AUTO_CONFIRM=true` | Retorna `{ type: 'skip' }` sem perguntar                 |
| R4  | `validateTestFile('ctrf.json')` com CTRF válido    | `{ valid: true, format: 'ctrf', stats: {...} }`          |
| R5  | `validateTestFile('junit.xml')` com JUnit válido   | `{ valid: true, format: 'junit' }`                       |
| R6  | `validateTestFile('mochawesome.json')` válido      | `{ valid: true, format: 'mochawesome' }`                 |
| R7  | `validateTestFile('invalid.txt')`                  | `{ valid: false, error: 'Formato não reconhecido' }`     |
| R8  | `validateTestFile('broken.json')`                  | `{ valid: false, error: 'JSON inválido: ...' }`          |
| R9  | `validateTestFile('/nonexistent.json')`            | `{ valid: false, error: 'Arquivo não encontrado' }`      |
| R10 | `formatValidationResult(valid)`                    | Box verde com stats de testes                            |
| R11 | `formatValidationResult(invalid)`                  | Box vermelho com erro e dica                             |
| R12 | `DATAHUB_ERRORS.ARTIFACT_EXPIRED`                  | `{ msg: 'Artifact expirado', hint: '...' }`              |
| R13 | `DATAHUB_ERRORS.NO_TEST_DATA`                      | `{ msg: 'Dados de teste não encontrados', hint: '...' }` |
| R14 | `DATAHUB_ERRORS.INVALID_FORMAT`                    | `{ msg: 'Formato inválido', hint: '...' }`               |
| R15 | `DATAHUB_ERRORS.ACCESS_DENIED`                     | `{ msg: 'Acesso negado', hint: '...' }`                  |

### Tarefa F1 — GREEN:

```typescript
// shared/data-hub/test-source-fallback.ts

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { box } from '../box.js';
import { palette } from '../palette.js';
import { defaultOutput as output } from '../output.js';
import { success, error, warn, info, icon } from '../prompt-format.js';
import { isTTY } from '../prompt-input-base.js';
import { askFilePath } from '../prompt-input-filepath.js';
import { humanizeError } from '../prompt-errors.js';
import { rootLogger } from '../logger.js';
import { SUMMARY_BOX_WIDTH } from '../prompt-format.js';

// === Error Definitions ===

export const DATAHUB_ERRORS = {
    ARTIFACT_EXPIRED: {
        test: /artifact.*expired|410 gone/i,
        msg: 'Artifact expirado',
        hint: 'O artifact de teste já expirou (GitHub mantém por 90 dias).\nForneça um arquivo local ou re-execute o pipeline.',
    },
    NO_TEST_DATA: {
        test: /no.*test.*data|no.*artifacts|no.*check.runs/i,
        msg: 'Dados de teste não encontrados',
        hint: 'Nenhum artifact, check run ou test report encontrado.\nVerifique se o CI está configurado para upload de test results.',
    },
    INVALID_FORMAT: {
        test: /invalid.*format|format.*not.*recognized/i,
        msg: 'Formato não reconhecido',
        hint: 'Esperado: CTRF JSON, JUnit XML, ou Mochawesome JSON.\nVerifique se o arquivo não está corrompido.',
    },
    INVALID_JSON: {
        test: /invalid.*json|json.*parse.*error/i,
        msg: 'JSON inválido',
        hint: 'O arquivo não é um JSON válido.\nVerifique se o arquivo não está truncado ou corrompido.',
    },
    INVALID_JUNIT: {
        test: /invalid.*junit|not.*junit.*xml/i,
        msg: 'Não é JUnit XML válido',
        hint: 'Esperado: <testsuite> ou <testsuites> como raiz do XML.',
    },
    ACCESS_DENIED: {
        test: /permission.*denied|access.*denied|403/i,
        msg: 'Acesso negado',
        hint: 'Sem permissão para acessar o repositório.\nVerifique se o token tem escopo "repo" ou "read:packages".',
    },
    REPO_NOT_FOUND: {
        test: /repository.*not.*found|404/i,
        msg: 'Repositório não encontrado',
        hint: 'Verifique se o caminho está correto: owner/repo\nExemplo: kevindemian/qa_tools',
    },
    FILE_NOT_FOUND: {
        test: /ENOENT|file.*not.*found/i,
        msg: 'Arquivo não encontrado',
        hint: 'Verifique se o caminho está correto e o arquivo existe.',
    },
} as const;

export type DataHubErrorKey = keyof typeof DATAHUB_ERRORS;

// === File Validation ===

export interface FileValidation {
    valid: boolean;
    format?: 'ctrf' | 'junit' | 'mochawesome' | 'unknown';
    error?: string;
    stats?: { tests: number; passed: number; failed: number; skipped: number };
}

export function validateTestFile(filePath: string): FileValidation {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Try CTRF
        if (content.includes('"results"') && content.includes('"tests"')) {
            try {
                const parsed = JSON.parse(content);
                if (parsed.results?.tests && parsed.results?.summary) {
                    return {
                        valid: true,
                        format: 'ctrf',
                        stats: {
                            tests: parsed.results.summary.total || parsed.results.tests.length,
                            passed: parsed.results.summary.passed || 0,
                            failed: parsed.results.summary.failed || 0,
                            skipped: parsed.results.summary.skipped || 0,
                        },
                    };
                }
            } catch {
                // JSON parse failed, continue to next format
            }
        }

        // Try JUnit XML
        if (content.includes('<testsuite') || content.includes('<testsuites')) {
            return { valid: true, format: 'junit' };
        }

        // Try Mochawesome
        if (content.includes('"suites"') && content.includes('"stats"')) {
            try {
                JSON.parse(content); // validate JSON
                return { valid: true, format: 'mochawesome' };
            } catch {
                // JSON parse failed
            }
        }

        return { valid: false, error: DATAHUB_ERRORS.INVALID_FORMAT.hint };
    } catch (err) {
        if (err instanceof SyntaxError) {
            return { valid: false, error: `${DATAHUB_ERRORS.INVALID_JSON.hint}\nDetalhes: ${err.message}` };
        }
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            return { valid: false, error: DATAHUB_ERRORS.FILE_NOT_FOUND.hint };
        }
        return { valid: false, error: `Erro ao ler arquivo: ${String(err)}` };
    }
}

// === Validation Result Display ===

export function formatValidationResult(result: FileValidation, filePath: string): void {
    if (result.valid) {
        const statsLine = result.stats
            ? `Testes: ${result.stats.tests} | Passaram: ${result.stats.passed} | Falharam: ${result.stats.failed} | Pularam: ${result.stats.skipped}`
            : `Formato: ${result.format?.toUpperCase()}`;
        const lines = [
            '',
            chalk.bold.green(`  ${icon('success')}  Arquivo aceito: ${filePath}`),
            '',
            palette.dim(`  ${statsLine}`),
            '',
        ];
        output.print(box(lines, { border: 'single', color: 'green', padding: 1, width: SUMMARY_BOX_WIDTH }));
    } else {
        const lines = [
            '',
            chalk.bold.red(`  ${icon('err')}  Arquivo inválido: ${filePath}`),
            '',
            palette.blue(`  →  ${result.error}`),
            '',
        ];
        output.print(box(lines, { border: 'double', color: 'red', padding: 1, width: SUMMARY_BOX_WIDTH }));
    }
}

// === Main Fallback Flow ===

export interface TestSourceResult {
    type: 'file' | 'repository' | 'skip';
    path?: string;
    error?: string;
}

export async function askTestSource(
    context: string,
    options: { autoConfirm?: boolean } = {},
): Promise<TestSourceResult> {
    // Non-TTY or auto-confirm: skip silently
    if (!isTTY() || options.autoConfirm) {
        rootLogger.debug('test-source-fallback: skipping (non-TTY or auto-confirm)');
        return { type: 'skip' };
    }

    // Show context
    const contextLines = [
        '',
        chalk.bold.red(`  ${icon('err')}  ${context}: Dados de teste não encontrados via API`),
        '',
        palette.blue('  →  Nenhum artifact, check run ou test report encontrado.'),
        palette.blue('  →  Forneça um arquivo local ou path de repositório.'),
        '',
    ];
    output.print(box(contextLines, { border: 'double', color: 'red', padding: 1, width: SUMMARY_BOX_WIDTH }));

    // Show examples
    const exampleLines = [
        '  Exemplos de arquivos aceitos:',
        '',
        '    • CTRF JSON:    ctfr-report.json, report.json',
        '    • JUnit XML:    junit.xml, test-results.xml',
        '    • Mochawesome:  mochawesome.json',
        '',
        '  Exemplos de paths de repositório:',
        '',
        '    • GitHub:       kevindemian/qa_tools',
        '    • GitLab:       47849962 (project ID)',
        '',
    ];
    output.print(box(exampleLines, { border: 'single', color: 'cyan', padding: 1, width: SUMMARY_BOX_WIDTH }));

    // Ask for input
    const answer = await askFilePath('Caminho do arquivo de teste ou path do repositório (/skip para pular)', {
        extensions: ['.json', '.xml'],
    });

    if (!answer || answer === '/skip') {
        info('Pulando — sem dados de teste para este projeto.');
        return { type: 'skip' };
    }

    // Detect: local file or repository path
    if (fs.existsSync(answer)) {
        const validation = validateTestFile(answer);
        formatValidationResult(validation, answer);

        if (validation.valid) {
            return { type: 'file', path: path.resolve(answer) };
        } else {
            return { type: 'skip', error: validation.error };
        }
    } else {
        // Treat as repository path
        success(`Path de repositório aceito: ${answer}`);
        return { type: 'repository', path: answer };
    }
}
```

### Tarefa F1 — Quality Gate:

```bash
npx vitest run shared/data-hub/test-source-fallback.test.ts   # 100% pass
npx tsc --noEmit                                                # 0 erros
npm run lint                                                    # 0 violações
```

**Checkpoint Módulo:** Módulo `test-source-fallback.ts` criado, testado, tipado.
**Commit:** `feat(data-hub): add user fallback module for test data sourcing`

---

# FAZE 15 — Critical Pipeline Fixes

## 11 — Fix Non-Existent Action Versions

| Item                 | Conteúdo                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Gap**              | CI usa `checkout@v5`, `setup-node@v6`, `download-artifact@v8`, `upload-artifact@v7` — versões que não existem |
| **Arquivo**          | `.github/workflows/ci.yml`, `setup/templates/qa-post-process-workflow.ts`                                     |
| **Versões corretas** | `checkout@v4`, `setup-node@v4`, `download-artifact@v4`, `upload-artifact@v4`                                  |

**Tarefa 11a — RED:**

| #   | Teste                           | Esperado             |
| --- | ------------------------------- | -------------------- |
| R1  | CI workflow usa versões válidas | Todas as actions @v4 |
| R2  | Template usa versões válidas    | Todas as actions @v4 |

**Tarefa 11b — GREEN:** Corrigir versões em todos os arquivos

**Tarefa 11c — Quality Gate:** `npx vitest run` = 100% pass

---

## 12 — Fix `if-no-files-found: warn`

| Item        | Conteúdo                                                                        |
| ----------- | ------------------------------------------------------------------------------- |
| **Gap**     | Upload step usa `if-no-files-found: warn` — mascara erro quando CTRF não existe |
| **Arquivo** | `.github/workflows/ci.yml:102`, `setup/templates/github-ci.ts`                  |
| **Mudança** | `warn` → `error`                                                                |

**Tarefa 12a — RED:**

| #   | Teste                                      | Esperado                 |
| --- | ------------------------------------------ | ------------------------ |
| R1  | Upload step com `if-no-files-found: error` | YAML gerado corretamente |
| R2  | Sem arquivo CTRF → step falha              | Erro visível no CI       |

**Tarefa 12b — GREEN:** Alterar `warn` para `error`

**Tarefa 12c — Quality Gate:** `npx vitest run` = 100% pass

---

## 13 — Fix `exit 0` Masking Missing CTRF

| Item        | Conteúdo                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **Gap**     | `qa-post-process.yml:37` tem `exit 0` quando CTRF não existe — mascara falha real               |
| **Arquivo** | `.github/workflows/qa-post-process.yml:37`, `setup/templates/qa-post-process-workflow.ts:44-48` |
| **Mudança** | Remover `exit 0`, usar `process.exit(1)` no código                                              |

**Tarefa 13a — RED:**

| #   | Teste                              | Esperado     |
| --- | ---------------------------------- | ------------ |
| R1  | Sem CTRF → `process.exit(1)`       | Erro visível |
| R2  | CTRF existe → continua normalmente | Fluxo OK     |

**Tarefa 13b — GREEN:** Remover `exit 0`, corrigir `pr-report-core.ts`

**Tarefa 13c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 15:** CI pipeline corrige erros visivelmente. Actions com versões válidas. Sem `exit 0` mascarando falhas.
**Commit:** `fix(ci): correct action versions, remove error masking`

---

# FAZE 16 — Error Handling Fixes

## 14 — Fix Async/Sync Mismatch in providerFactory

| Item        | Conteúdo                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| **Gap**     | `providerFactory` tipado como sync mas `createGitProvider` é async       |
| **Arquivo** | `git_triggers/pr-report-entry.ts:19`, `shared/pr-report-core.ts:667-692` |
| **Mudança** | `createGitProvider` → síncrono (import dinâmico removido)                |

**Tarefa 14a — RED:**

| #   | Teste                                                  | Esperado                  |
| --- | ------------------------------------------------------ | ------------------------- |
| R1  | `mainWithProvider()` chama `main` com factory síncrona | Verificar argumento       |
| R2  | Factory retornada é `GitProvider` (não `Promise`)      | Tipo correto              |
| R3  | Erro propagado                                         | `process.exit(1)` chamado |

**Tarefa 14b — GREEN:** Tornar `createGitProvider` síncrono

```typescript
// ANTES
export async function createGitProvider(ciEnv: CiEnvironment): Promise<GitProvider | undefined> {
    const { default: GitHubManager } = await import('./github_manager.js');
    return new GitHubManager(ciEnv.repo, githubToken);
}

// DEPOIS
import GitLabManager from './gitlab_manager.js';
import GitHubManager from './github_manager.js';

export function createGitProvider(ciEnv: CiEnvironment): GitProvider | undefined {
    return new GitHubManager(ciEnv.repo, githubToken);
}
```

**Tarefa 14c — Quality Gate:** `npx vitest run` = 100% pass

---

## 15 — Fix 12+ Silent Error Locations

| Item         | Conteúdo                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gap**      | 12+ locais mascarando erros com `warn`, `return`, `exit 0`                                                                                                        |
| **Arquivos** | `ci-data.ts:33-51`, `pr-report-core.ts:667-692`, `github-provider.ts:41,46,80-82`, `gitlab-provider.ts`, `github-pr-comment.ts:73-86`, `pr-report-entry.ts:22-25` |

**Tarefa 15a — RED:**

| #   | Teste                                       | Esperado                     |
| --- | ------------------------------------------- | ---------------------------- |
| R1  | `getOrFetchDataHub()` com erro de API       | `rootLogger.error()` + throw |
| R2  | `tryCreateGitProvider()` com token inválido | `rootLogger.error()` + throw |
| R3  | `github-pr-comment.ts` com env var faltando | `rootLogger.error()` + throw |
| R4  | `github-provider.ts` com API error          | `rootLogger.error()` + throw |

**Tarefa 15b — GREEN:** Corrigir cada local

```typescript
// ANTES (ci-data.ts:33-51)
if (!ciEnv.isCI) {
    rootLogger.warn('Não está em CI, ignorando DataHub');
    return undefined;
}

// DEPOIS
if (!ciEnv.isCI) {
    rootLogger.info('Não está em CI, DataHub não disponível');
    return undefined; // ← OK: não é erro, é condição normal
}
```

```typescript
// ANTES (github-provider.ts:41)
rootLogger.warn('Erro ao buscar dados:', error);
return;

// DEPOIS
rootLogger.error('Erro ao buscar dados do GitHub:', error);
throw error;
```

**Tarefa 15c — Quality Gate:** `npx vitest run` = 100% pass

---

## 16 — Fix CTRF Reporter Missing try-catch

| Item        | Conteúdo                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| **Gap**     | `vitest-ctrf-reporter.ts` `onTestRunEnd()` sem try-catch — falha silenciosa |
| **Arquivo** | `shared/vitest-ctrf-reporter.ts`                                            |

**Tarefa 16a — RED:**

| #   | Teste                                | Esperado                      |
| --- | ------------------------------------ | ----------------------------- |
| R1  | `onTestRunEnd()` com erro de escrita | Erro propagado, não mascarado |
| R2  | CTRF JSON inválido                   | Erro visível                  |

**Tarefa 16b — GREEN:** Adicionar try-catch

**Tarefa 16c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 16:** Todos os erros são visíveis. Sem `warn` mascarando falhas. Async/sync corrigido. CTRF reporter com try-catch.
**Commit:** `fix(error-handling): expose all silent errors, fix async/sync`

---

# FAZE 17 — Summary & Report Fixes

## 17 — Fix Log Truncation (18 chars)

| Item        | Conteúdo                                                                   |
| ----------- | -------------------------------------------------------------------------- |
| **Gap**     | `github-workflow.ts:18` e `gitlab-workflow.ts:18` truncam logs em 18 chars |
| **Arquivo** | `git_triggers/github-workflow.ts:18`, `git_triggers/gitlab-workflow.ts:18` |
| **Mudança** | Remover truncamento, usar logs completos                                   |

**Tarefa 17a — RED:**

| #   | Teste               | Esperado                |
| --- | ------------------- | ----------------------- |
| R1  | Log com 1000+ chars | Log completo preservado |
| R2  | Log vazio           | Sem erro                |

**Tarefa 17b — GREEN:** Remover truncamento

**Tarefa 17c — Quality Gate:** `npx vitest run` = 100% pass

---

## 18 — Fix Wrong Summary Data (2 tests instead of 6062)

| Item           | Conteúdo                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------- |
| **Gap**        | Summary mostra "2 tests" em vez de "6062 tests" — dados incorretos                       |
| **Causa raiz** | CTRF file incorreto ou stale, ou vitest output leakando para `$GITHUB_STEP_SUMMARY`      |
| **Arquivo**    | `shared/pr-report-core.ts:288-320` (writeToJobSummary), `shared/vitest-ctrf-reporter.ts` |

**Tarefa 18a — RED:**

| #   | Teste                | Esperado                        |
| --- | -------------------- | ------------------------------- |
| R1  | CTRF com 6062 testes | Summary mostra "6062 tests"     |
| R2  | CTRF com 0 testes    | Summary mostra "0 tests"        |
| R3  | Sem CTRF             | Summary mostra mensagem de erro |

**Tarefa 18b — GREEN:** Corrigir parsing de CTRF

**Tarefa 18c — Quality Gate:** `npx vitest run` = 100% pass

---

## 19 — Consolidate Two Summary Tables

| Item        | Conteúdo                                                 |
| ----------- | -------------------------------------------------------- |
| **Gap**     | Summary tem 2 tabelas separadas — confuso para o usuário |
| **Arquivo** | `shared/pr-report-core.ts:288-320`                       |
| **Mudança** | Consolidar em 1 tabela com abas (Summary + Details)      |

**Tarefa 19a — RED:**

| #   | Teste                        | Esperado                          |
| --- | ---------------------------- | --------------------------------- |
| R1  | Summary gerado               | 1 tabela (não 2)                  |
| R2  | Tabela contém todos os dados | Passed, failed, skipped, duration |

**Tarefa 19b — GREEN:** Consolidar tabelas

**Tarefa 19c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 17:** Summary mostra dados corretos. Uma tabela consolidada. Logs completos.
**Commit:** `fix(summary): correct test counts, consolidate tables, remove truncation`

---

# FAZE 18 — Data Extraction (Tasks 1-10)

## 189 — Extend PipelineJob with Step Conclusions (GitHub)

| Item        | Conteúdo                                           |
| ----------- | -------------------------------------------------- |
| **Gap**     | `stepConclusions` field não populado da API GitHub |
| **Arquivo** | `git_triggers/github-workflow.ts:114-133`          |

**Tarefa 189a — RED:**

| #   | Teste                                        | Esperado                           |
| --- | -------------------------------------------- | ---------------------------------- |
| R1  | Steps da API mapeados para `stepConclusions` | Array com name, conclusion, number |
| R2  | Sem steps                                    | `stepConclusions` vazio            |

**Tarefa 189b — GREEN:** Mapear `steps[]` da API

```typescript
stepConclusions: j.steps?.map((s) => ({
    name: s.name,
    conclusion: s.conclusion || s.status || '',
    number: s.number,
})),
```

**Tarefa 189c — Quality Gate:** `npx vitest run` = 100% pass

---

## 190 — Extend PipelineJob with Timestamps

| Item        | Conteúdo                                              |
| ----------- | ----------------------------------------------------- |
| **Gap**     | `started_at`, `finished_at` não populados para GitHub |
| **Arquivo** | `git_triggers/github-workflow.ts:114-133`             |

**Tarefa 190a — RED:**

| #   | Teste                      | Esperado    |
| --- | -------------------------- | ----------- |
| R1  | Timestamps mapeados da API | ISO strings |
| R2  | Sem timestamps             | `undefined` |

**Tarefa 190b — GREEN:** Mapear `started_at`, `finished_at`

**Tarefa 190c — Quality Gate:** `npx vitest run` = 100% pass

---

## 191 — Extend ArtifactInfo with Size

| Item        | Conteúdo                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------ |
| **Gap**     | `size_in_bytes` não capturado                                                              |
| **Arquivo** | `shared/types/ci-cd.ts:96-101`, `github-workflow.ts:135-151`, `gitlab-workflow.ts:104-119` |

**Tarefa 191a — RED:**

| #   | Teste                              | Esperado |
| --- | ---------------------------------- | -------- |
| R1  | `size_in_bytes` populado do GitHub | Número   |
| R2  | `size` populado do GitLab          | Número   |

**Tarefa 191b — GREEN:** Adicionar campos ao tipo e mapear

**Tarefa 191c — Quality Gate:** `npx vitest run` = 100% pass

---

## 192 — JUnit XML Parser

| Item        | Conteúdo                                      |
| ----------- | --------------------------------------------- |
| **Gap**     | Sem parser para JUnit XML (formato universal) |
| **Arquivo** | `shared/junit-xml-parser.ts` (novo)           |

**Tarefa 192a — RED:**

| #   | Teste                               | Esperado       |
| --- | ----------------------------------- | -------------- |
| R1  | XML válido → `FlatTest[]` e stats   | Dados corretos |
| R2  | XML com failures → failure messages | Capturadas     |
| R3  | XML inválido → `EMPTY_PARSE_RESULT` | Fallback       |

**Tarefa 192b — GREEN:** Implementar parser com `fast-xml-parser`

**Tarefa 192c — Quality Gate:** `npx vitest run` = 100% pass

---

## 193 — Log Parser for Test Summary

| Item        | Conteúdo                                      |
| ----------- | --------------------------------------------- |
| **Gap**     | Sem fallback para extrair test counts de logs |
| **Arquivo** | `shared/log-parser.ts` (novo)                 |

**Tarefa 193a — RED:**

| #   | Teste                        | Esperado |
| --- | ---------------------------- | -------- |
| R1  | Log vitest → counts corretos | Parsed   |
| R2  | Log jest → counts corretos   | Parsed   |
| R3  | Log vazio → resultado vazio  | Fallback |

**Tarefa 193b — GREEN:** Implementar parser com regex patterns

**Tarefa 193c — Quality Gate:** `npx vitest run` = 100% pass

---

## 194 — GitHub Check Run Annotations

| Item        | Conteúdo                                                                               |
| ----------- | -------------------------------------------------------------------------------------- |
| **Gap**     | Sem fetch de annotations (lint/test failures com file/line)                            |
| **Arquivo** | `git_triggers/github-workflow.ts`, `shared/types/ci-cd.ts`, `shared/types/data-hub.ts` |

**Tarefa 194a — RED:**

| #   | Teste                            | Esperado             |
| --- | -------------------------------- | -------------------- |
| R1  | Fetch annotations para check run | Array de annotations |
| R2  | Sem annotations                  | Array vazio          |
| R3  | API error                        | Graceful fallback    |

**Tarefa 194b — GREEN:** Implementar `wfGetCheckRunAnnotations()`

**Tarefa 194c — Quality Gate:** `npx vitest run` = 100% pass

---

## 195 — Framework Detection via Contents API

| Item        | Conteúdo                                        |
| ----------- | ----------------------------------------------- |
| **Gap**     | Sem detecção de framework do projeto monitorado |
| **Arquivo** | `shared/framework-detection.ts` (novo)          |

**Tarefa 195a — RED:**

| #   | Teste                           | Esperado                                    |
| --- | ------------------------------- | ------------------------------------------- |
| R1  | Detect vitest de package.json   | `{ framework: 'vitest', confidence: 0.95 }` |
| R2  | Detect pytest de pyproject.toml | `{ framework: 'pytest', confidence: 0.90 }` |
| R3  | Nenhum detectado                | `{ framework: 'unknown', confidence: 0 }`   |

**Tarefa 195b — GREEN:** Implementar cascade detection

**Tarefa 195c — Quality Gate:** `npx vitest run` = 100% pass

---

## 196 — GitLab Test Reports API Integration

| Item        | Conteúdo                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| **Gap**     | GitLab tem API nativa de test reports, não utilizada                              |
| **Arquivo** | `git_triggers/gitlab-workflow.ts`, `shared/data-hub/providers/gitlab-provider.ts` |

**Tarefa 196a — RED:**

| #   | Teste                              | Esperado           |
| --- | ---------------------------------- | ------------------ |
| R1  | Fetch test report do GitLab        | Dados estruturados |
| R2  | Parse test cases para `FlatTest[]` | Dados corretos     |
| R3  | API error                          | Graceful fallback  |

**Tarefa 196b — GREEN:** Implementar `glGetPipelineTestReport()`

**Tarefa 196c — Quality Gate:** `npx vitest run` = 100% pass

---

## 197 — Enrich DataHub with Multi-Source Data

| Item        | Conteúdo                                                        |
| ----------- | --------------------------------------------------------------- |
| **Gap**     | DataHub não integra todas as fontes de dados                    |
| **Arquivo** | `shared/types/data-hub.ts`, `shared/data-hub/hub.ts`, providers |

**Tarefa 197a — RED:**

| #   | Teste                                   | Esperado                           |
| --- | --------------------------------------- | ---------------------------------- |
| R1  | DataHub merge dados de múltiplas fontes | Dados completos                    |
| R2  | Fallback chain funciona                 | artifacts → GitLab → logs → CI API |
| R3  | Metrics computados corretamente         | `testPassRate`, `testCounts`       |

**Tarefa 197b — GREEN:** Integrar novas fontes no hub

**Tarefa 197c — Quality Gate:** `npx vitest run` = 100% pass

---

## 198 — Unify CI Data Systems

| Item        | Conteúdo                                                                 |
| ----------- | ------------------------------------------------------------------------ |
| **Gap**     | `git-artifact-downloader.ts` duplica DataHub                             |
| **Arquivo** | `shared/git-artifact-downloader.ts` (deprecar), `shared/data-hub/hub.ts` |

**Tarefa 198a — RED:**

| #   | Teste                                       | Esperado    |
| --- | ------------------------------------------- | ----------- |
| R1  | Nova implementação produz mesmos resultados | Equivalente |
| R2  | Backward compatibility durante deprecation  | Funcional   |

**Tarefa 198b — GREEN:** Marcar como `@deprecated`, criar implementação DataHub

**Tarefa 198c — Quality Gate:** `npx vitest run` = 100% pass

---

## 199 — Integrate User Fallback (Camada 7) into hub.ts

| Item        | Conteúdo                                                            |
| ----------- | ------------------------------------------------------------------- |
| **Gap**     | `hub.ts` não tem fallback interativo quando todas as camadas falham |
| **Arquivo** | `shared/data-hub/hub.ts`                                            |
| **Depende** | Módulo `shared/data-hub/test-source-fallback.ts` (criado acima)     |

**Tarefa 199a — RED:**

| #   | Teste                                                               | Esperado                                       |
| --- | ------------------------------------------------------------------- | ---------------------------------------------- |
| R1  | `fetchData()` em TTY com todas as camadas vazias                    | Chama `askTestSource()`                        |
| R2  | `fetchData()` em non-TTY com todas as camadas vazias                | Retorna `{ hasTestData: false }` sem perguntar |
| R3  | `fetchData()` com `AUTO_CONFIRM=true`                               | Retorna `{ hasTestData: false }` sem perguntar |
| R4  | `fetchData()` com todas as camadas vazias + usuário fornece arquivo | Retorna dados do arquivo parseado              |
| R5  | `fetchData()` com todas as camadas vazias + usuário pula            | Retorna `{ hasTestData: false }`               |

**Tarefa 199b — GREEN:** Integrar `askTestSource()` no `hub.ts`

```typescript
// shared/data-hub/hub.ts — adicionar no final de fetchData()

import { askTestSource, validateTestFile, parseLocalFile } from './test-source-fallback.js';
import { isTTY } from '../prompt-input-base.js';
import { getConfig } from '../config-accessor.js';

// No final de fetchData(), após todas as camadas:
if (!result.hasTestData && isTTY() && !getConfig().get<boolean>('autoConfirm')) {
    const source = await askTestSource(`DataHub: ${project}`);
    if (source.type === 'file' && source.path) {
        const parsed = await parseLocalFile(source.path);
        if (parsed) {
            result.hasTestData = true;
            result.raw = { ...result.raw, parsedArtifacts: [parsed] };
        }
    }
}
```

**Tarefa 199c — Quality Gate:** `npx vitest run` = 100% pass

**Checkpoint Fase 18:** Todos os parsers funcionam. Framework detection ativo. GitLab test reports integrados. DataHub enriquecido. Sistema unificado. **Fallback interativo integrado.**
**Commit:** `feat(data-hub): add multi-source extraction, parsers, framework detection, user fallback`

---

# FAZE 19 — Auditoria Completa de Qualidade

A auditoria NÃO é apenas rodar lint e vitest. É uma investigação profunda de TUDO O QUE FOI IMPLEMENTADO em busca de erros, falhas, gaps, riscos, defeitos de implementação, edge cases negligenciados. PENSAR COMO UM TESTER e buscar onde o software FALHA.

## Princípios da Auditoria

1. **Não confiar em nada** — testar cada caminho de código
2. **Quebrar o sistema** — tentar fazer falhar de todas as formas possíveis
3. **Investigar o óbvio** — o que parece funcionar pode ter falhas ocultas
4. **Pensar no extremo** — edge cases, boundary conditions, dados malformados
5. **Questionar suposições** — o que o código assume que pode estar errado?

---

## 19.1 — Auditoria de Type Safety

**Objetivo**: Encontrar todos os type holes que permitem erros em runtime.

| #   | Verificação                                | Ferramenta                          | Esperado      |
| --- | ------------------------------------------ | ----------------------------------- | ------------- |
| 1   | Buscar `as any` em todo o codebase         | `rg "as any"`                       | 0 ocorrências |
| 2   | Buscar `!` (non-null assertion)            | `rg "!\."`                          | 0 ocorrências |
| 3   | Buscar `@ts-ignore` / `@ts-expect-error`   | `rg "@ts-ignore\|@ts-expect-error"` | 0 ocorrências |
| 4   | Buscar `// eslint-disable`                 | `rg "eslint-disable"`               | 0 ocorrências |
| 5   | Verificar `noUncheckedIndexedAccess` ativo | `tsconfig.json`                     | `true`        |
| 6   | Rodar `npx tsc --noEmit`                   | TypeScript                          | 0 erros       |

**Se encontrar qualquer ocorrência**: Investigar se é justificável. Se não, corrigir.

---

## 19.2 — Auditoria de Silent Failures

**Objetivo**: Encontrar todos os locais onde erros são engolidos.

| #   | Verificação                  | Padrão                       | Esperado                   |
| --- | ---------------------------- | ---------------------------- | -------------------------- |
| 1   | `rootLogger.warn` + `return` | Erro mascarado               | `rootLogger.error` + throw |
| 2   | `try/catch` com catch vazio  | Erro ignorado                | Log + re-throw             |
| 3   | `exit 0` em script de CI     | Falha mascarada              | Remover                    |
| 4   | `if-no-files-found: warn`    | Upload falha silenciosamente | `error`                    |
| 5   | Retorno `undefined` sem log  | Dados perdidos               | Log + throw                |
| 6   | `catch (e) { /* ignore */ }` | Erro ignorado                | Log + throw                |

**Arquivos para investigar**:

- `shared/pr-report-core.ts` — `tryCreateDataHub()`, `main()`
- `shared/ci-data.ts` — `getOrFetchDataHub()`
- `shared/data-hub/providers/*.ts` — todos os providers
- `git_triggers/pr-report-entry.ts` — `mainWithProvider()`
- `shared/vitest-ctrf-reporter.ts` — `onTestRunEnd()`
- `shared/github-pr-comment.ts` — `postPrComment()`

---

## 19.3 — Auditoria de Edge Cases

**Objetivo**: Testar o que acontece com dados extremos, vazios, malformados.

### 19.3.1 — Dados de Entrada

| #   | Cenário                                | Arquivo          | Comportamento Esperado               |
| --- | -------------------------------------- | ---------------- | ------------------------------------ |
| 1   | API retorna `null`                     | providers        | Tratar como "sem dados", não crashar |
| 2   | API retorna `undefined`                | providers        | Tratar como "sem dados", não crashar |
| 3   | API retorna array vazio `[]`           | providers        | Retornar array vazio, não crashar    |
| 4   | API retorna objeto com campos faltando | providers        | Usar defaults, não crashar           |
| 5   | JSON malformado                        | parsers          | `EMPTY_PARSE_RESULT`, não crashar    |
| 6   | XML malformado                         | junit-xml-parser | `EMPTY_PARSE_RESULT`, não crashar    |
| 7   | Log vazio                              | log-parser       | Retornar resultado vazio             |
| 8   | Log com encoding errado                | log-parser       | Tratar como vazio                    |
| 9   | Token GitHub inválido                  | providers        | Erro claro, não crashar              |
| 10  | Token GitLab inválido                  | providers        | Erro claro, não crashar              |

### 19.3.2 — Boundary Conditions

| #   | Cenário                | Arquivo          | Comportamento Esperado      |
| --- | ---------------------- | ---------------- | --------------------------- |
| 1   | Pipeline com 0 jobs    | github-workflow  | Retornar array vazio        |
| 2   | Pipeline com 1 job     | github-workflow  | Funcionar normalmente       |
| 3   | Job com 0 steps        | github-workflow  | `stepConclusions` vazio     |
| 4   | Job com 1 step         | github-workflow  | Funcionar normalmente       |
| 5   | Artifact com 0 bytes   | github-workflow  | `size_in_bytes: 0`          |
| 6   | Log com 1MB            | log-parser       | Funcionar (sem truncamento) |
| 7   | Log com 10MB           | log-parser       | Funcionar (sem truncamento) |
| 8   | CTRF com 0 testes      | result_parser    | Retornar stats zerados      |
| 9   | CTRF com 100k testes   | result_parser    | Funcionar (memória OK)      |
| 10  | JUnit XML com 0 testes | junit-xml-parser | Retornar stats zerados      |

### 19.3.3 — Condições de Corrida

| #   | Cenário                                   | Arquivo            | Comportamento Esperado |
| --- | ----------------------------------------- | ------------------ | ---------------------- |
| 1   | Múltiplas chamadas simultâneas ao DataHub | hub.ts             | Sem race condition     |
| 2   | DataHub sendo criado enquanto lido        | hub.ts             | Sem race condition     |
| 3   | Provider retornando mientras outro falha  | composite-provider | Fallback correto       |

---

## 19.4 — Auditoria de Contratos

**Objetivo**: Verificar se interfaces e implementações são consistentes.

| #   | Verificação                                | Arquivos                                   | Esperado                       |
| --- | ------------------------------------------ | ------------------------------------------ | ------------------------------ |
| 1   | `GitProvider` interface vs implementações  | `github-workflow.ts`, `gitlab-workflow.ts` | Todos os métodos implementados |
| 2   | `RawData` tipo vs dados fornecidos         | providers                                  | Todos os campos preenchidos    |
| 3   | `ComputedMetrics` tipo vs dados computados | compute/\*.ts                              | Todos os campos computados     |
| 4   | `ParseResult` tipo vs retorno dos parsers  | parsers                                    | Todos os campos retornados     |
| 5   | `DataHub` tipo vs instância criada         | hub.ts                                     | Todos os campos preenchidos    |
| 6   | `PipelineJob` tipo vs dados da API         | workflows                                  | Todos os campos mapeados       |
| 7   | `ArtifactInfo` tipo vs dados da API        | workflows                                  | Todos os campos mapeados       |

---

## 19.5 — Auditoria de Integração

**Objetivo**: Verificar se todas as partes trabalham juntas corretamente.

| #   | Fluxo                                    | Arquivos                                | Esperado                       |
| --- | ---------------------------------------- | --------------------------------------- | ------------------------------ |
| 1   | GitHub → DataHub → Compute → Report      | providers, hub, compute, pr-report-core | Dados chegam completos         |
| 2   | GitLab → DataHub → Compute → Report      | providers, hub, compute, pr-report-core | Dados chegam completos         |
| 3   | Fallback: artifacts → GitLab → logs → CI | providers, hub                          | Fallback funciona em cascata   |
| 4   | Framework detection → Report             | framework-detection, pr-report-core     | Framework aparece no report    |
| 5   | Annotations → Report                     | providers, pr-report-core               | Annotations aparecem no report |
| 6   | Test counts → Summary                    | parsers, pr-report-core                 | Counts corretos no summary     |
| 7   | CTRF → Parser → Report                   | result_parser, pr-report-core           | Dados do CTRF no report        |
| 8   | JUnit XML → Parser → Report              | junit-xml-parser, pr-report-core        | Dados do JUnit no report       |

---

## 19.6 — Auditoria de Segurança

**Objetivo**: Encontrar vulnerabilidades de segurança.

| #   | Verificação                | Padrão                                        | Esperado          |
| --- | -------------------------- | --------------------------------------------- | ----------------- |
| 1   | Secrets no código          | `rg "password\|secret\|token\|key"` hardcoded | 0 ocorrências     |
| 2   | Injection via log parsing  | Regex patterns                                | Sem ReDoS         |
| 3   | Path traversal             | File operations                               | Paths sanitizados |
| 4   | Token exposto em logs      | `rootLogger.*token`                           | Nunca logar token |
| 5   | Token exposto em erros     | `catch.*token`                                | Nunca expor token |
| 6   | Comando de shell injection | `exec.*\$`                                    | Sem injection     |

---

## 19.7 — Auditoria de Performance

**Objetivo**: Identificar gargalos e problemas de performance.

| #   | Verificação                | Arquivo          | Esperado            |
| --- | -------------------------- | ---------------- | ------------------- |
| 1   | fetch() sem timeout        | providers        | Timeout configurado |
| 2   | fetch() sem retry          | providers        | Retry com backoff   |
| 3   | Log parsing de 10MB        | log-parser       | < 1s                |
| 4   | JUnit XML parsing de 10MB  | junit-xml-parser | < 1s                |
| 5   | CTRF parsing de 10MB       | result_parser    | < 1s                |
| 6   | Memory leak em loops       | providers        | Sem leak            |
| 7   | Conexões HTTP não fechadas | providers        | Properly closed     |

---

## 19.8 — Auditoria de Fallback Chain

**Objetivo**: Verificar se cada nível de fallback funciona corretamente.

| #   | Cenário                | Fallback             | Esperado                 |
| --- | ---------------------- | -------------------- | ------------------------ |
| 1   | Sem artifacts          | → GitLab test report | Dados do GitLab          |
| 2   | Sem GitLab test report | → Log parsing        | Dados do log             |
| 3   | Sem log parsing        | → CI API             | Dados básicos da API     |
| 4   | Sem nada               | → Erro claro         | Mensagem de erro visível |
| 5   | GitHub com artifacts   | → CTRF/JUnit         | Dados do artifact        |
| 6   | GitHub sem artifacts   | → Check runs         | Annotations do check run |
| 7   | GitLab com test report | → Test report        | Dados estruturados       |
| 8   | GitLab sem test report | → Job logs           | Dados do log             |

---

## 19.9 — Auditoria de Error Propagation

**Objetivo**: Verificar se erros propagam corretamente até o usuário.

| #   | Cenário                     | Fluxo                                   | Esperado                         |
| --- | --------------------------- | --------------------------------------- | -------------------------------- |
| 1   | API error durante fetch     | provider → hub → pr-report-core → entry | Erro visível no CI               |
| 2   | Parse error durante parsing | parser → hub → pr-report-core → entry   | Erro visível no CI               |
| 3   | File write error            | pr-report-core → entry                  | Erro visível no CI               |
| 4   | Network timeout             | provider → hub → pr-report-core → entry | Erro visível com timeout message |
| 5   | Rate limit hit              | provider → hub → pr-report-core → entry | Erro com rate limit message      |
| 6   | Invalid JSON response       | provider → hub → pr-report-core → entry | Erro de parse visível            |

---

## 19.10 — Auditoria de Dados

**Objetivo**: Verificar se dados são preservados corretamente através do pipeline.

| #   | Verificação                | Pipeline             | Esperado               |
| --- | -------------------------- | -------------------- | ---------------------- |
| 1   | Timestamps preservados     | API → provider → hub | ISO strings intactos   |
| 2   | Números preservados        | API → provider → hub | Sem perda de precisão  |
| 3   | Strings preservadas        | API → provider → hub | Sem truncamento        |
| 4   | Arrays preservados         | API → provider → hub | Sem perda de elementos |
| 5   | Null/undefined preservados | API → provider → hub | Sem conversão indevida |
| 6   | Nested objects preservados | API → provider → hub | Sem perda de campos    |

---

## 19.11 — Auditoria de Regressão

**Objetivo**: Verificar se mudanças não quebraram funcionalidade existente.

| #   | Verificação                                    | Arquivos                        | Esperado                          |
| --- | ---------------------------------------------- | ------------------------------- | --------------------------------- |
| 1   | Todos os testes existentes passam              | `npx vitest run`                | 100% pass                         |
| 2   | Nenhum teste foi modificado para passar        | Git diff                        | Sem mudanças em testes existentes |
| 3   | Nenhum `describe.skip` ou `it.skip` adicionado | `rg "describe.skip\|it.skip"`   | 0 ocorrências                     |
| 4   | Coverage não diminuiu                          | `npx vitest run --coverage`     | ≥ 100%                            |
| 5   | Lint não diminuiu                              | `npx eslint . --max-warnings=0` | 0 violações                       |
| 6   | TypeScript não diminuiu                        | `npx tsc --noEmit`              | 0 erros                           |

---

## 19.12 — Auditoria de Comportamento

**Objetivo**: Verificar se o software se comporta como esperado em cenários reais.

| #   | Cenário Real                       | Esperado                            |
| --- | ---------------------------------- | ----------------------------------- |
| 1   | Push para branch com PR aberto     | PR report gerado com dados corretos |
| 2   | Push para branch sem PR            | Sem erro (skip normal)              |
| 3   | Pipeline falha no step de testes   | Erro reportado no PR comment        |
| 4   | Pipeline falha no step de lint     | Erro reportado no PR comment        |
| 5   | Pipeline passa com 0 testes        | Warning no PR report                |
| 6   | Pipeline passa com testes falhando | Erro no PR report                   |
| 7   | Múltiplos jobs no pipeline         | Todos os jobs reportados            |
| 8   | Job sem steps                      | Sem erro                            |
| 9   | Job sem artifacts                  | Fallback para logs                  |
| 10  | Job sem logs                       | Fallback para CI API básica         |

---

## 19.13 — Comandos de Auditoria

```bash
# 1. Type Safety
npx tsc --noEmit
rg "as any" --include="*.ts" --include="*.tsx"
rg "!\." --include="*.ts" --include="*.tsx"
rg "@ts-ignore|@ts-expect-error" --include="*.ts" --include="*.tsx"

# 2. Silent Failures
rg "rootLogger\.warn.*return" --include="*.ts"
rg "catch.*\{.*\}" --include="*.ts"
rg "exit 0" --include="*.yml" --include="*.yaml"
rg "if-no-files-found: warn" --include="*.yml" --include="*.yaml"

# 3. Lint & Format
npx eslint . --max-warnings=0
npx prettier --check .

# 4. Tests
npx vitest run --reporter=verbose
npx vitest run --coverage

# 5. Security
rg "password|secret|token|key" --include="*.ts" --include="*.tsx" | grep -v "test\|spec\|mock\|type\|interface"

# 6. Performance
rg "fetch\(" --include="*.ts" | grep -v "timeout\|AbortController"

# 7. Integration
npx vitest run --reporter=verbose --grep "integration"
```

---

## 19.14 — Checklist de Auditoria

| #   | Dimensão                          | Status | Achados |
| --- | --------------------------------- | ------ | ------- |
| 1   | Type Safety                       | ⬜     |         |
| 2   | Silent Failures                   | ⬜     |         |
| 3   | Edge Cases — Dados de Entrada     | ⬜     |         |
| 4   | Edge Cases — Boundary Conditions  | ⬜     |         |
| 5   | Edge Cases — Condições de Corrida | ⬜     |         |
| 6   | Contratos                         | ⬜     |         |
| 7   | Integração                        | ⬜     |         |
| 8   | Segurança                         | ⬜     |         |
| 9   | Performance                       | ⬜     |         |
| 10  | Fallback Chain                    | ⬜     |         |
| 11  | Error Propagation                 | ⬜     |         |
| 12  | Dados                             | ⬜     |         |
| 13  | Regressão                         | ⬜     |         |
| 14  | Comportamento                     | ⬜     |         |

---

## 19.15 — Critérios de Aceite da Auditoria

A auditoria está completa quando TODAS as seguintes condições são atendidas:

| #   | Critério                            | Target            |
| --- | ----------------------------------- | ----------------- |
| 1   | `npx tsc --noEmit`                  | 0 erros           |
| 2   | `npx eslint . --max-warnings=0`     | 0 violações       |
| 3   | `npx vitest run`                    | 100% pass         |
| 4   | `npx vitest run --coverage`         | ≥ 100%            |
| 5   | `rg "as any"`                       | 0 ocorrências     |
| 6   | `rg "@ts-ignore\|@ts-expect-error"` | 0 ocorrências     |
| 7   | `rg "eslint-disable"`               | 0 ocorrências     |
| 8   | `rg "exit 0"`                       | 0 ocorrências     |
| 9   | `rg "if-no-files-found: warn"`      | 0 ocorrências     |
| 10  | Todos os edge cases documentados    | 0 pendências      |
| 11  | Todos os contratos verificados      | 0 inconsistências |
| 12  | Todos os fallbacks testados         | 0 falhas          |
| 13  | Todos os erros propagam             | 0 erros engolidos |
| 14  | Performance aceitável               | < 1s por operação |

**Se QUALQUER critério falhar**: Voltar para a fase anterior, corrigir, e repetir auditoria.

---

## 19.16 — Output da Auditoria

A auditoria gera um relatório em `audit/functional/AUDIT-REPORT.md` com:

```markdown
# Auditoria de Qualidade — DataHub Multi-Source

## Resumo

- Data: YYYY-MM-DD
- Total de verificações: XX
- Achados: XX
- Críticos: XX
- Médios: XX
- Baixos: XX

## Type Safety

...

## Silent Failures

...

## Edge Cases

...

## Contratos

...

## Integração

...

## Segurança

...

## Performance

...

## Fallback Chain

...

## Error Propagation

...

## Dados

...

## Regressão

...

## Comportamento

...

## Conclusão

...
```

---

## Ordem de Execução

```
┌─────────────────────────────────────────────────────────────────────┐
│ FAZE 15 (pipeline fixes) → FAZE 16 (error handling) → FAZE 17     │
│                                                                    │
│ FAZE 18 (data extraction) — paralelo quando possível               │
│ Tasks 189-191 (types + mappings) → 192-193 (parsers) → 194-196    │
│ → 197 (integration) → 198 (unification)                           │
├─────────────────────────────────────────────────────────────────────┤
│ FAZE 19 (auditoria) — APÓS todas as fases anteriores               │
│ 19.1 (type safety) → 19.2 (silent failures) → 19.3 (edge cases)   │
│ → 19.4 (contratos) → 19.5 (integração) → ... → 19.16 (report)    │
├─────────────────────────────────────────────────────────────────────┤
│ Quality Gates: tsc → lint → vitest → PBT → Auditoria completa     │
├─────────────────────────────────────────────────────────────────────┤
│ Commit por fase + relatório de auditoria final                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Quality Gates por Tarefa

> **Nota**: Esta é a granularidade por tarefa. Para a visão por fase, ver "Quality Gates por Phase" na linha ~3502.

| Tarefa | tsc --noEmit | lint           | vitest       | PBT         |
| ------ | ------------ | -------------- | ------------ | ----------- |
| 11     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 12     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 13     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 14     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 15     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 16     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 17     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 18     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 19     | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 189    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 190    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 191    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 192    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | ✅ presente |
| 193    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | ✅ presente |
| 194    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 195    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 196    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 197    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |
| 198    | ✅ 0 erros   | ✅ 0 violações | ✅ 100% pass | —           |

---

## Decisions Log

| #   | Decision                                        | Rationale                                         | Trade-off                                   | Source     |
| --- | ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------- | ---------- |
| 1   | JUnit XML como formato universal                | Todos os market tools suportam                    | Depende de framework emitir XML             | Plano      |
| 2   | GitLab test reports API (nativa)                | Melhor qualidade, sem parsing manual              | GitHub não tem equivalente                  | Plano      |
| 3   | Framework detection via cascade                 | Confidence score permite fallback                 | Pode errar em projetos customizados         | Plano      |
| 4   | Log parsing como último fallback                | Sempre disponível                                 | Menos preciso que XML                       | Plano      |
| 5   | Remover truncamento de logs                     | Dados completos necessários                       | Maior consumo de memória                    | Plano      |
| 6   | Consolidar tabelas de summary                   | UX melhor                                         | Perde granularidade visual                  | Plano      |
| 7   | Usar downloadArtifact() existente               | Já implementado, não duplicar código              | Depende de redirect 302                     | Iteração 1 |
| 8   | Check Runs como fonte primária                  | publish-test-results é fonte rica de dados        | Só funciona com essa action                 | Iteração 1 |
| 9   | Limitar GitHub metrics a documentação           | Endpoints são UI-based, não REST                  | Perde dados de performance                  | Iteração 1 |
| 10  | Cross-repository como caso de uso principal     | qa_tools analisa projetos externos                | Requer permissões expandidas                | Iteração 1 |
| 11  | `expired` em `ArtifactInfo`                     | Saber se artifact existe antes de tentar download | Campo adicional no tipo                     | Iteração 1 |
| 12  | `AdmZip` para extrair ZIP contents              | Biblioteca madura, sem dependências extras        | Mais uma dependência                        | Iteração 1 |
| 13  | GitLab coverage via pipeline API                | Campo `coverage` já vem no response da pipeline   | Elimina leitura local para GitLab           | Iteração 2 |
| 14  | GitLab artifacts tipados (`file_type: "junit"`) | Detecção nativa de JUnit XML, sem adivinhar nomes | Depende de GitLab job artifacts             | Iteração 2 |
| 15  | Detecção automática de publish-test-results     | `app.slug` em Check Runs identifica a action      | Pode mudar se action renomear check runs    | Iteração 2 |
| 16  | Contents API raw mode para framework detection  | Elimina base64 decode, simplifica parsing         | Limite de 1MB                               | Iteração 2 |
| 17  | Artifact name filter na listagem                | Reduz overhead de API, filtra por nome direto     | Só funciona com nome exato                  | Iteração 2 |
| 18  | Cross-cutting modules (extractors, fallback)    | Componível, testável, não polui fases             | Requer integração manual em hub.ts          | Iteração 3 |
| 19  | Webhook como optional ("plus")                  | Corporações frequentemente bloqueiam webhooks     | Padrão é REST API                           | Iteração 3 |
| 20  | Billable minutes / cost fora de escopo          | Não importante para este projeto                  | Sem métricas de custo                       | Iteração 3 |
| 21  | Coverage GitHub via cascata (CTRF→Regex→User)   | API não expõe coverage nativo                     | Regex é impreciso (70%)                     | Iteração 3 |
| 22  | CSV para baseline e cruzamento de dados         | Histórico expira (90 dias), precisa de referência | Requer upload manual de baseline            | Iteração 3 |
| 23  | Extractors como módulos independentes           | Cada tipo de dado tem sua cascata própria         | Mais arquivos, mas mais organizado          | Iteração 3 |
| 24  | Metrics derivadas 100% confiáveis               | Cálculos matemáticos sobre dados já obtidos       | Não inclui cost/billing                     | Iteração 3 |
| 25  | "GitHub sem artifacts" = ~75% (não 50%)         | Check Runs + job logs + CSV + annotations         | Granularidade reduzida, não disponibilidade | Iteração 3 |

---

## Estimates

> **Nota**: Esta é a estimativa original (Phases 15-19). Para a estimativa completa (Phases 15-26), ver "Estimates — Atualizado" na linha ~3436.

| Phase     | Tasks        | Hours   | Risk   |
| --------- | ------------ | ------- | ------ |
| 15        | 11-13        | 3h      | Low    |
| 16        | 14-16        | 4h      | Medium |
| 17        | 17-19        | 3h      | Low    |
| 18        | 189-198      | 12h     | Medium |
| 19        | 19.1-19.16   | 8h      | High   |
| **Total** | **19 tasks** | **30h** | —      |

---

## Affected Files

> **Nota**: Esta é a visão por tarefa. Para a visão consolidada completa, ver "Affected Files — Resumo Completo" na linha ~3420.

| File                                           | Changes                                                       |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `.github/workflows/ci.yml`                     | Action versions, `if-no-files-found: error`                   |
| `.github/workflows/qa-post-process.yml`        | Remove `exit 0`                                               |
| `setup/templates/qa-post-process-workflow.ts`  | Action versions, remove `exit 0`                              |
| `setup/templates/github-ci.ts`                 | Action versions, `if-no-files-found: error`                   |
| `git_triggers/pr-report-entry.ts`              | Remove cast, fix async/sync                                   |
| `git_triggers/github-workflow.ts`              | Steps, timestamps, annotations, remove truncation             |
| `git_triggers/gitlab-workflow.ts`              | Size, test reports, remove truncation                         |
| `shared/pr-report-core.ts`                     | Fix wiring, fix summary data, consolidate tables              |
| `shared/vitest-ctrf-reporter.ts`               | Add try-catch                                                 |
| `shared/ci-data.ts`                            | Fix silent errors                                             |
| `shared/github-pr-comment.ts`                  | Fix silent errors                                             |
| `shared/types/ci-cd.ts`                        | Extend ArtifactInfo, add CheckRunAnnotation, GitLabTestReport |
| `shared/types/data-hub.ts`                     | Add annotations, framework, gitlabTestReport, parsedArtifacts |
| `shared/data-hub/hub.ts`                       | Integrate new sources, artifact download, fallback chain      |
| `shared/data-hub/providers/github-provider.ts` | Download artifacts, fetch annotations, framework detection    |
| `shared/data-hub/providers/gitlab-provider.ts` | Fetch test reports, framework detection                       |
| `shared/junit-xml-parser.ts`                   | **New** — JUnit XML parser                                    |
| `shared/log-parser.ts`                         | **New** — Log parsing                                         |
| `shared/framework-detection.ts`                | **New** — Framework detection                                 |
| `shared/artifact-parser.ts`                    | **New** — ZIP extraction + CTRF/JUnit/Mochawesome parsing     |
| `shared/git-artifact-downloader.ts`            | Deprecate                                                     |
| `audit/functional/AUDIT-REPORT.md`             | **New** — Relatório de auditoria                              |

---

# FAZE 20 — Contents API + Framework Detection Remoto

## Objetivo

Permitir que qa_tools detecte automaticamente qual framework de teste um projeto externo utiliza, sem instalar nada no projeto. Usa Contents API do GitHub/GitLab para ler arquivos remotos.

## Contexto

- qa_tools NÃO está instalado dentro dos projetos monitorados
- Não pode executar `package.json` ou ler filesystem local
- Precisa ler arquivos remotos via API para detectar framework
- Padrão da indústria: Allure (adapter por framework), ReportPortal (agent por framework), CTRF (formato padrão)

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│  Contents API (GitHub / GitLab)                              │
│  - GET /repos/{owner}/{repo}/contents/{path}                │
│  - GET /projects/:id/repository/files/{path}                │
├─────────────────────────────────────────────────────────────┤
│  Framework Detector (novo módulo)                            │
│  - package.json analysis (deps + devDeps)                   │
│  - Config file detection (vitest.config, jest.config, etc.) │
│  - CI workflow YAML analysis (test commands)                 │
│  - Multi-signal scoring (confidence 0.0-1.0)                │
├─────────────────────────────────────────────────────────────┤
│  Output: { framework, reportFormat, confidence, signals }    │
└─────────────────────────────────────────────────────────────┘
```

## 20.1 — Extender GitProvider com Contents API

| Item        | Conteúdo                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| **Gap**     | `GitProvider` não tem `getFileContents()` — não consegue ler arquivos remotos                         |
| **Arquivo** | `shared/types/ci-cd.ts:140-169`, `git_triggers/github-workflow.ts`, `git_triggers/gitlab-workflow.ts` |

**Tarefa 20.1a — RED:**

| #   | Teste                             | Esperado                    |
| --- | --------------------------------- | --------------------------- |
| R1  | `getFileContents('package.json')` | Retorna conteúdo do arquivo |
| R2  | Arquivo não existe                | Retorna `null`              |
| R3  | API error                         | Graceful fallback           |
| R4  | Diretório não existe              | Retorna `null`              |

**Tarefa 20.1b — GREEN:**

Adicionar ao `GitProvider`:

```typescript
getFileContents: (path: string) => Promise<string | null>;
listDirectory: (path: string) => Promise<Array<{ name: string; path: string; type: string }>>;
```

GitHub implementation (`github-workflow.ts`):

```typescript
export async function wfGetFileContents(
    client: HttpClient,
    owner: string,
    repo: string,
    filePath: string,
): Promise<string | null> {
    const resp = await apiGet(client, `/repos/${owner}/${repo}/contents/${filePath}`, { responseType: 'json' });
    if (!resp.data?.content) return null;
    return Buffer.from(resp.data.content, 'base64').toString('utf8');
}
```

GitLab implementation (`gitlab-workflow.ts`):

```typescript
export async function glGetFileContents(
    client: HttpClient,
    owner: string,
    repo: string,
    filePath: string,
): Promise<string | null> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    const resp = await apiGet(client, `/projects/${projectPath}/repository/files/${encodeURIComponent(filePath)}/raw`);
    return typeof resp.data === 'string' ? resp.data : null;
}
```

**Tarefa 20.1c — Quality Gate:** `npx vitest run` = 100% pass + `npx tsc --noEmit` = 0 erros

---

## 20.2 — Criar Framework Detector

| Item        | Conteúdo                                               |
| ----------- | ------------------------------------------------------ |
| **Gap**     | Não existe detecção de framework para projetos remotos |
| **Arquivo** | `shared/framework-detection.ts` (novo)                 |
| **Teste**   | `shared/framework-detection.test.ts` (novo)            |
| **PBT**     | `shared/framework-detection.property.test.ts` (novo)   |

**Tarefa 20.2a — RED:**

| #   | Teste                                     | Esperado                                       |
| --- | ----------------------------------------- | ---------------------------------------------- |
| R1  | package.json com `vitest` em devDeps      | `{ framework: 'vitest', confidence: 0.95 }`    |
| R2  | package.json com `jest` em devDeps        | `{ framework: 'jest', confidence: 0.95 }`      |
| R3  | package.json com `@playwright/test`       | `{ framework: 'playwright', confidence: 0.9 }` |
| R4  | package.json com `cypress`                | `{ framework: 'cypress', confidence: 0.9 }`    |
| R5  | package.json com `pytest` em requirements | `{ framework: 'pytest', confidence: 0.9 }`     |
| R6  | Nenhum framework detectado                | `{ framework: 'unknown', confidence: 0 }`      |
| R7  | Múltiplos frameworks (monorepo)           | Retorna todos com scores                       |
| R8  | package.json malformado                   | `{ framework: 'unknown', confidence: 0 }`      |

**Tarefa 20.2b — GREEN:**

```typescript
export interface FrameworkDetection {
    framework: string;
    confidence: number; // 0.0 - 1.0
    reportFormat: 'ctrf' | 'junit' | 'mochawesome' | 'json' | 'unknown';
    source: 'package.json' | 'config-file' | 'workflow-yaml' | 'combined';
    signals: DetectionSignal[];
}

export interface DetectionSignal {
    type: 'package-manifest' | 'config-file' | 'test-directory' | 'workflow-yaml';
    evidence: string;
    weight: number;
}

export function detectFrameworkFromPackageJson(pkgJson: Record<string, unknown>): FrameworkDetection {
    /* ... */
}

export function detectFrameworkFromConfig(fileName: string, content: string): FrameworkDetection {
    /* ... */
}

export function detectFrameworkFromWorkflow(yamlContent: string): FrameworkDetection {
    /* ... */
}

export function mergeDetections(detections: FrameworkDetection[]): FrameworkDetection {
    /* ... */
}
```

**Scoring:**
| Signal | Weight |
|--------|--------|
| Config file present | +0.4 |
| Package dependency found | +0.3 |
| Test directory exists | +0.2 |
| Test files found | +0.1 |

**Tarefa 20.2c — Quality Gate:** `npx vitest run` = 100% pass + PBT presente

---

## 20.3 — Integrar Detector no DataHub

| Item        | Conteúdo                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| **Gap**     | DataHub não usa framework detection                                       |
| **Arquivo** | `shared/types/data-hub.ts`, `shared/data-hub/hub.ts`, `shared/ci-data.ts` |

**Tarefa 20.3a — RED:**

| #   | Teste                           | Esperado                     |
| --- | ------------------------------- | ---------------------------- |
| R1  | DataHub popula `raw.framework`  | Framework detectado presente |
| R2  | Fallback quando detection falha | `framework: 'unknown'`       |

**Tarefa 20.3b — GREEN:**

Adicionar a `RawData`:

```typescript
export interface RawData {
    // ... campos existentes
    framework?: FrameworkDetection;
}
```

No `GitHubDataProvider.fetchRawData()` e `GitLabDataProvider.fetchRawData()`:

```typescript
// Após fetch de runs
const pkgContent = await this.provider.getFileContents('package.json');
if (pkgContent) {
    const pkgJson = JSON.parse(pkgContent) as Record<string, unknown>;
    raw.framework = detectFrameworkFromPackageJson(pkgJson);
}
```

**Tarefa 20.3c — Quality Gate:** `npx vitest run` = 100% pass

---

## 20.4 — Detectar Config Files Remotos

| Item        | Conteúdo                                                    |
| ----------- | ----------------------------------------------------------- |
| **Gap**     | Detector só analisa package.json — não detecta config files |
| **Arquivo** | `shared/framework-detection.ts`                             |

**Tarefa 20.4a — RED:**

| #   | Teste                                | Esperado                           |
| --- | ------------------------------------ | ---------------------------------- |
| R1  | `vitest.config.ts` com CTRF reporter | confidence +0.4, reportFormat ctrf |
| R2  | `jest.config.js` existe              | confidence +0.4                    |
| R3  | `pytest.ini` existe                  | confidence +0.4                    |
| R4  | Nenhum config file                   | Sem mudança de confidence          |

**Tarefa 20.4b — GREEN:**

```typescript
const CONFIG_FILES = [
    { name: 'vitest.config.ts', framework: 'vitest', weight: 0.4 },
    { name: 'vitest.config.js', framework: 'vitest', weight: 0.4 },
    { name: 'vitest.config.mjs', framework: 'vitest', weight: 0.4 },
    { name: 'jest.config.js', framework: 'jest', weight: 0.4 },
    { name: 'jest.config.ts', framework: 'jest', weight: 0.4 },
    { name: 'pytest.ini', framework: 'pytest', weight: 0.4 },
    { name: 'pyproject.toml', framework: 'pytest', weight: 0.3 },
    { name: '.rspec', framework: 'rspec', weight: 0.4 },
];
```

**Tarefa 20.4c — Quality Gate:** `npx vitest run` = 100% pass

---

## 20.5 — Analisar CI Workflow YAML

| Item        | Conteúdo                                                      |
| ----------- | ------------------------------------------------------------- |
| **Gap**     | Detector não analisa workflows CI para detectar test commands |
| **Arquivo** | `shared/framework-detection.ts`                               |

**Tarefa 20.5a — RED:**

| #   | Teste                      | Esperado            |
| --- | -------------------------- | ------------------- |
| R1  | Workflow com `npm test`    | Detecta vitest/jest |
| R2  | Workflow com `pytest`      | Detecta pytest      |
| R3  | Workflow com `cargo test`  | Detecta Rust test   |
| R4  | Workflow com `go test`     | Detecta Go test     |
| R5  | Workflow sem test commands | Sem detecção        |

**Tarefa 20.5b — GREEN:**

```typescript
const TEST_COMMANDS: Record<string, { framework: string; weight: number }> = {
    'npm test': { framework: 'vitest/jest', weight: 0.3 },
    'npx vitest': { framework: 'vitest', weight: 0.5 },
    'npx jest': { framework: 'jest', weight: 0.5 },
    pytest: { framework: 'pytest', weight: 0.5 },
    'python -m pytest': { framework: 'pytest', weight: 0.5 },
    'cargo test': { framework: 'rust-test', weight: 0.5 },
    'go test': { framework: 'go-test', weight: 0.5 },
    'dotnet test': { framework: 'dotnet-test', weight: 0.5 },
};
```

**Tarefa 20.5c — Quality Gate:** `npx vitest run` = 100% pass

---

## Commit: `feat(data-hub): add Contents API + framework detection`

---

# FAZE 21 — Artifact Download + Parse

## Objetivo

Baixar e parsear conteúdo de artifacts de CI (CTRF JSON, JUnit XML) via APIs do GitHub/GitLab. Integrar ao DataHub como fonte de dados primária.

## Contexto

- `GitProvider.downloadArtifact(id)` já existe — retorna `{ buffer, filename }`
- `GitProvider.listPipelineArtifacts(pipelineId)` já existe — retorna `ArtifactInfo[]`
- DataHub já lista metadados de artifacts mas nunca baixa conteúdo
- Padrão da indústria: CIAnalyzer (download + parse JUnit), gh-ci-artifacts (artifact-detective)

## 21.1 — Criar Artifact Parser Module

| Item        | Conteúdo                                            |
| ----------- | --------------------------------------------------- |
| **Gap**     | Não existe módulo unificado para parse de artifacts |
| **Arquivo** | `shared/artifact-parser.ts` (novo)                  |
| **Teste**   | `shared/artifact-parser.test.ts` (novo)             |
| **PBT**     | `shared/artifact-parser.property.test.ts` (novo)    |

**Tarefa 21.1a — RED:**

| #   | Teste                                   | Esperado                       |
| --- | --------------------------------------- | ------------------------------ |
| R1  | ZIP com ctrf.json                       | Parse CTRF bem-sucedido        |
| R2  | ZIP com test-results.json (mochawesome) | Parse Mochawesome bem-sucedido |
| R3  | ZIP com results.xml (JUnit)             | Parse JUnit bem-sucedido       |
| R4  | ZIP vazio                               | `null`                         |
| R5  | ZIP com arquivo não reconhecido         | `null`                         |
| R6  | ZIP corrompido                          | `null` + log warning           |
| R7  | Múltiplos arquivos JSON, só um é CTRF   | Seleciona o correto            |
| R8  | JUnit XML com 0 testes                  | Stats zerados                  |

**Tarefa 21.1b — GREEN:**

```typescript
import { AdmZip } from './deps.js';
import { parseTestResults } from './result_parser.js';
import { parseJUnitXml } from './junit-xml-parser.js';

export interface ArtifactParseResult {
    type: 'ctrf' | 'mochawesome' | 'junit' | 'unknown';
    testCount: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    tests: FlatTest[];
    raw: unknown;
}

export function extractAndParseArtifact(buffer: Buffer, filename?: string): ArtifactParseResult | null {
    const zip = new AdmZip(buffer);
    for (const entry of zip.getEntries()) {
        // 1. Tentar CTRF
        if (entry.name.includes('ctrf') && entry.name.endsWith('.json')) {
            const raw = JSON.parse(entry.getData().toString('utf8'));
            if (isCtrfFormat(raw)) {
                const parsed = parseTestResults(raw);
                return mapToArtifactResult('ctrf', parsed, raw);
            }
        }
        // 2. Tentar Mochawesome
        if (entry.name.includes('mochawesome') && entry.name.endsWith('.json')) {
            const raw = JSON.parse(entry.getData().toString('utf8'));
            const parsed = parseTestResults(raw);
            return mapToArtifactResult('mochawesome', parsed, raw);
        }
        // 3. Tentar JUnit XML
        if (entry.name.endsWith('.xml')) {
            const xml = entry.getData().toString('utf8');
            const parsed = parseJUnitXml(xml);
            if (parsed) return mapToArtifactResult('junit', parsed, parsed);
        }
    }
    return null;
}
```

**Tarefa 21.1c — Quality Gate:** `npx vitest run` = 100% pass + PBT presente

---

## 21.2 — Estender RawData com Dados de Artifacts Parseados

| Item        | Conteúdo                                                      |
| ----------- | ------------------------------------------------------------- |
| **Gap**     | `RawData.artifacts` contém só metadados — não contém conteúdo |
| **Arquivo** | `shared/types/data-hub.ts`                                    |

**Tarefa 21.2a — RED:**

| #   | Teste                              | Esperado                     |
| --- | ---------------------------------- | ---------------------------- |
| R1  | `RawData.parsedArtifacts` populado | Dados parseados presentes    |
| R2  | Sem artifacts                      | `parsedArtifacts: undefined` |

**Tarefa 21.2b — GREEN:**

```typescript
export interface RawData {
    // ... campos existentes
    /** Dados de artifacts parseados (CTRF, JUnit, Mochawesome) */
    parsedArtifacts?: ArtifactParseResult[];
}
```

**Tarefa 21.2c — Quality Gate:** `npx vitest run` = 100% pass

---

## 21.3 — Download de Artifacts nos Providers

| Item        | Conteúdo                                                             |
| ----------- | -------------------------------------------------------------------- |
| **Gap**     | Providers listam artifacts mas nunca baixam conteúdo                 |
| **Arquivo** | `shared/data-hub/providers/github-provider.ts`, `gitlab-provider.ts` |

**Tarefa 21.3a — RED:**

| #   | Teste                                       | Esperado                             |
| --- | ------------------------------------------- | ------------------------------------ |
| R1  | Provider baixa artifacts dos últimos 3 runs | `parsedArtifacts` populado           |
| R2  | Artifact não contém dados de teste          | Ignora artifact                      |
| R3  | Download falha (API error)                  | Graceful fallback, log warning       |
| R4  | ZIP corrompido                              | Graceful fallback, log warning       |
| R5  | Rate limit atingido                         | Para download, usa dados disponíveis |

**Tarefa 21.3b — GREEN:**

No `GitHubDataProvider.fetchRawData()`:

```typescript
async fetchRawData(options: FetchOptions): Promise<RawData> {
    // ... código existente: runs, jobs, artifacts metadata ...

    // NOVO: download de artifacts CTRF/JUnit para runs mais recentes
    const parsedArtifacts: ArtifactParseResult[] = [];
    for (const run of runs.slice(0, 3)) {
        const runId = run.id;
        if (runId == null) continue;
        const runIdNum = typeof runId === 'string' ? parseInt(runId, 10) : runId;
        const arts = artifactsMap.get(runIdNum) ?? [];

        for (const art of arts) {
            if (!this.isTestArtifact(art.name)) continue;
            try {
                const { buffer } = await this.provider.downloadArtifact(art.id);
                const parsed = extractAndParseArtifact(buffer, art.name);
                if (parsed && parsed.testCount > 0) {
                    parsedArtifacts.push(parsed);
                }
            } catch (err) {
                rootLogger.debug(`GitHub: artifact download failed for ${art.name}: ${String(err)}`);
            }
        }
    }

    return { runs, jobs: jobsMap, artifacts: artifactsMap, failureReasons: failureReasonsMap,
             parsedArtifacts: parsedArtifacts.length > 0 ? parsedArtifacts : undefined };
}

private isTestArtifact(name: string): boolean {
    const lower = name.toLowerCase();
    return /ctrf|test-result|mochawesome|junit|test-report/.test(lower);
}
```

**Tarefa 21.3c — Quality Gate:** `npx vitest run` = 100% pass

---

## 21.4 — Fallback Chain no Hub

| Item        | Conteúdo                                                  |
| ----------- | --------------------------------------------------------- |
| **Gap**     | Hub não implementa fallback chain para dados de artifacts |
| **Arquivo** | `shared/data-hub/hub.ts`                                  |

**Tarefa 21.4a — RED:**

| #   | Teste                                        | Esperado                   |
| --- | -------------------------------------------- | -------------------------- |
| R1  | Dados de artifacts disponíveis               | Usa artifacts              |
| R2  | Sem artifacts, GitLab test report disponível | Usa GitLab test report     |
| R3  | Sem nenhum dado de teste                     | Stats zerados, log warning |

**Tarefa 21.4b — GREEN:**

No `DataHubImpl.computeMetrics()`:

```typescript
// Preferência: artifacts parseados > job logs > dados básicos
if (raw.parsedArtifacts && raw.parsedArtifacts.length > 0) {
    // Usar dados dos artifacts para enriquecer métricas
    const merged = mergeArtifactResults(raw.parsedArtifacts);
    // Sobrescrever passRate com dados reais de teste
    computed.testPassRate = calculateTestPassRate(merged);
    computed.testCounts = {
        passed: merged.passed,
        failed: merged.failed,
        skipped: merged.skipped,
        total: merged.testCount,
    };
}
```

**Tarefa 21.4c — Quality Gate:** `npx vitest run` = 100% pass

---

## 21.5 — GitLab Test Reports API

| Item        | Conteúdo                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| **Gap**     | GitLab tem API nativa de test reports — não utilizada                             |
| **Arquivo** | `git_triggers/gitlab-workflow.ts`, `shared/data-hub/providers/gitlab-provider.ts` |

**Tarefa 21.5a — RED:**

| #   | Teste                              | Esperado                      |
| --- | ---------------------------------- | ----------------------------- |
| R1  | Fetch test report do GitLab        | Dados estruturados retornados |
| R2  | Parse test cases para `FlatTest[]` | Dados corretos                |
| R3  | API error                          | Graceful fallback             |
| R4  | Pipeline sem test report           | `null`                        |

**Tarefa 21.5b — GREEN:**

Em `gitlab-workflow.ts`:

```typescript
export interface GitLabTestReport {
    testSuiteName: string;
    totalCount: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    testCases: GitLabTestCase[];
}

export interface GitLabTestCase {
    classname: string;
    name: string;
    status: 'success' | 'failed' | 'skipped';
    duration: number;
    stackTrace?: string;
}

export async function glGetPipelineTestReport(
    client: HttpClient,
    owner: string,
    repo: string,
    pipelineId: number,
): Promise<GitLabTestReport | null> {
    const projectPath = projectPath(owner, repo);
    const resp = await apiGet(client, `/projects/${projectPath}/pipelines/${pipelineId}/test_report`);
    return mapGitLabTestReport(resp.data);
}
```

**Tarefa 21.5c — Quality Gate:** `npx vitest run` = 100% pass

---

## 21.6 — Adicionar fast-xml-parser

| Item            | Conteúdo                               |
| --------------- | -------------------------------------- |
| **Gap**         | Não existe parser JUnit XML no projeto |
| **Dependência** | `fast-xml-parser` (npm)                |

**Tarefa 21.6a — RED:**

| #   | Teste                           | Esperado          |
| --- | ------------------------------- | ----------------- |
| R1  | `npm install fast-xml-parser`   | Package instalado |
| R2  | Import em `junit-xml-parser.ts` | Sem erros de tipo |

**Tarefa 21.6b — GREEN:** `npm install fast-xml-parser`

**Tarefa 21.6c — Quality Gate:** `npx vitest run` = 100% pass

---

## 21.7 — JUnit XML Parser

| Item        | Conteúdo                                                     |
| ----------- | ------------------------------------------------------------ |
| **Gap**     | Não existe parser JUnit XML — formato universal da indústria |
| **Arquivo** | `shared/junit-xml-parser.ts` (novo)                          |
| **Teste**   | `shared/junit-xml-parser.test.ts` (novo)                     |
| **PBT**     | `shared/junit-xml-parser.property.test.ts` (novo)            |

**Tarefa 21.7a — RED:**

| #   | Teste                                     | Esperado              |
| --- | ----------------------------------------- | --------------------- |
| R1  | JUnit XML válido → `FlatTest[]` e stats   | Dados corretos        |
| R2  | JUnit XML com failures → failure messages | Capturadas            |
| R3  | JUnit XML com skipped → skipped count     | Contado corretamente  |
| R4  | JUnit XML inválido → `EMPTY_PARSE_RESULT` | Fallback              |
| R5  | JUnit XML vazio (0 testes)                | Stats zerados         |
| R6  | JUnit XML com múltiplos testsuite         | Merge corretamente    |
| R7  | JUnit XML com attachment tags             | Ignorado (não crasha) |

**Tarefa 21.7b — GREEN:**

```typescript
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
});

export interface JUnitTestCase {
    classname: string;
    name: string;
    time: number;
    status: 'passed' | 'failed' | 'skipped' | 'error';
    message?: string;
    stackTrace?: string;
}

export interface JUnitParseResult {
    tests: JUnitTestCase[];
    stats: { passed: number; failed: number; skipped: number; total: number; duration: number };
}

export function parseJUnitXml(xmlContent: string): JUnitParseResult | null {
    try {
        const parsed = xmlParser.parse(xmlContent);
        if (!parsed) return null;
        // Normalizar testsuite/testcases
        const testSuites = normalizeTestSuites(parsed);
        const tests: JUnitTestCase[] = [];
        for (const suite of testSuites) {
            for (const tc of suite.testcase ?? []) {
                tests.push(mapTestCase(tc));
            }
        }
        return { tests, stats: computeStats(tests) };
    } catch {
        return null;
    }
}
```

**Tarefa 21.7c — Quality Gate:** `npx vitest run` = 100% pass + PBT presente

---

## 21.8 — CTRF como Formato Nativo

| Item            | Conteúdo                                                     |
| --------------- | ------------------------------------------------------------ |
| **Gap**         | Projeto já suporta CTRF mas não usa o `ctrf` package oficial |
| **Dependência** | `ctrf` (npm)                                                 |

**Tarefa 21.8a — RED:**

| #   | Teste                                 | Esperado            |
| --- | ------------------------------------- | ------------------- |
| R1  | `npm install ctrf`                    | Package instalado   |
| R2  | Validação CTRF via `validateStrict()` | Valida corretamente |

**Tarefa 21.8b — GREEN:** `npm install ctrf` + usar `validateStrict()` no `result_parser.ts`

**Tarefa 21.8c — Quality Gate:** `npx vitest run` = 100% pass

---

## Commit: `feat(data-hub): add artifact download + CTRF/JUnit parsers`

---

# FAZE 22 — Migração de Consumidores

## Objetivo

Migrar TODOS os consumidores de dados locais para usar DataHub como fonte única de verdade. Eliminar leituras de arquivos locais.

## Mapeamento de Consumidores

### Consumidores de `result_parser.ts` (26 production, 32 test)

| Consumidor                                   | Uso Atual                       | Migração                       |
| -------------------------------------------- | ------------------------------- | ------------------------------ |
| `git_triggers/test-results.ts`               | `parseTestResults`              | Usar DataHub `parsedArtifacts` |
| `git_triggers/pipeline-handler.ts`           | `ParseResult` type              | Usar DataHub types             |
| `git_triggers/pipeline-jira.ts`              | `ParseResult` type              | Usar DataHub types             |
| `git_triggers/llm-pipeline.ts`               | `ParseResult` type              | Usar DataHub types             |
| `git_triggers/batch-mode.ts`                 | `ParseResult` type              | Usar DataHub types             |
| `git_triggers/interactive-mode.ts`           | `parseTestResults`              | Usar DataHub                   |
| `jira_management/commands/case17.ts`         | `parseTestResultsFile`          | Usar DataHub                   |
| `jira_management/commands/case17-helpers.ts` | `FlatTest` type                 | Manter (tipo de contrato)      |
| `shared/pr-report-core.ts`                   | `parseTestResultsFile`          | Usar DataHub                   |
| `shared/git-artifact-downloader.ts`          | `parseTestResults`              | **Deprecar**                   |
| `shared/report-html.ts`                      | `FlatTest` type                 | Manter                         |
| `shared/report-types.ts`                     | `FlatTest` type                 | Manter                         |
| `shared/session-context.ts`                  | `ParseResult` type              | Usar DataHub                   |
| `shared/metrics.ts`                          | `ParseResult`, `FlatTest` types | Manter                         |
| `shared/bug-report.ts`                       | `ParseResult` type              | Manter                         |
| `shared/store.ts`                            | `FlatTest` type                 | Manter                         |
| `shared/vitest-ctrf-reporter.ts`             | `CtrfData`, `CtrfTest` types    | Manter                         |

### Consumidores de `coverage-source.ts` (1 production)

| Consumidor                         | Uso Atual         | Migração                    |
| ---------------------------------- | ----------------- | --------------------------- |
| `shared/pr-report-core.ts:373,456` | `resolveCoverage` | Usar DataHub `raw.coverage` |

### Consumidores de `git-artifact-downloader.ts` (3 production)

| Consumidor                                      | Uso Atual            | Migração     |
| ----------------------------------------------- | -------------------- | ------------ |
| `jira_management/commands/case17.ts`            | `fetchGitHistory`    | Usar DataHub |
| `jira_management/commands/case17-test-utils.ts` | re-export            | **Deprecar** |
| `shared/session-context.ts`                     | `fetchLatestTestRun` | Usar DataHub |

### Consumidores de `pr-report-core.ts` (6 production)

| Consumidor                        | Uso Atual          | Migração                |
| --------------------------------- | ------------------ | ----------------------- |
| `git_triggers/batch-mode.ts`      | `generatePrReport` | Manter (já usa DataHub) |
| `git_triggers/pr-report-entry.ts` | `main`             | Manter                  |

---

## 22.1 — Migrar `pr-report-core.ts` para DataHub

| Item        | Conteúdo                                                          |
| ----------- | ----------------------------------------------------------------- |
| **Gap**     | `pr-report-core.ts` lê `ctrfPath` local + `resolveCoverage` local |
| **Arquivo** | `shared/pr-report-core.ts`                                        |

**Tarefa 22.1a — RED:**

| #   | Teste                           | Esperado                    |
| --- | ------------------------------- | --------------------------- |
| R1  | `main()` com DataHub disponível | Usa dados do DataHub        |
| R2  | `main()` sem DataHub            | Fallback para arquivo local |
| R3  | Coverage vem do DataHub         | Não lê arquivo local        |

**Tarefa 22.1b — GREEN:**

Refatorar `main()`:

```typescript
async function main(opts: MainOptions, providerFactory?: ProviderFactory): Promise<void> {
    const ciEnv = getCiEnv();
    const dataHub = await tryCreateDataHub(ciEnv, providerFactory);

    // NOVO: usar dados do DataHub quando disponíveis
    let testResult: ParseResult | undefined;
    if (dataHub?.raw.parsedArtifacts && dataHub.raw.parsedArtifacts.length > 0) {
        testResult = mergeArtifactResults(dataHub.raw.parsedArtifacts);
    } else {
        // Fallback: ler arquivo local (compatibilidade)
        testResult = parseTestResultsFile(opts.ctrfPath);
    }

    // Coverage do DataHub
    const coverage = dataHub?.raw.coverage?.percentage ?? resolveCoverage()?.coveragePct ?? 0;

    // ... resto do fluxo
}
```

**Tarefa 22.1c — Quality Gate:** `npx vitest run` = 100% pass

---

## 22.2 — Migrar `session-context.ts` para DataHub

| Item        | Conteúdo                                                                     |
| ----------- | ---------------------------------------------------------------------------- |
| **Gap**     | `session-context.ts` usa `fetchLatestTestRun()` de `git-artifact-downloader` |
| **Arquivo** | `shared/session-context.ts`                                                  |

**Tarefa 22.2a — RED:**

| #   | Teste                                | Esperado               |
| --- | ------------------------------------ | ---------------------- |
| R1  | `ensureDataHub()` retorna DataHub    | Dados completos        |
| R2  | `fetchLatestTestRun()` descontinuado | Warning de deprecation |

**Tarefa 22.2b — GREEN:**

```typescript
// Substituir fetchLatestTestRun() por DataHub
export async function ensureDataHub(provider: GitProvider, repo: string): Promise<DataHub | undefined> {
    return getOrFetchDataHub(provider, repo);
}
```

**Tarefa 22.2c — Quality Gate:** `npx vitest run` = 100% pass

---

## 22.3 — Migrar `case17.ts` para DataHub

| Item        | Conteúdo                                                         |
| ----------- | ---------------------------------------------------------------- |
| **Gap**     | `case17.ts` usa `fetchGitHistory()` de `git-artifact-downloader` |
| **Arquivo** | `jira_management/commands/case17.ts`, `case17-test-utils.ts`     |

**Tarefa 22.3a — RED:**

| #   | Teste                             | Esperado               |
| --- | --------------------------------- | ---------------------- |
| R1  | `case17` com DataHub disponível   | Usa dados do DataHub   |
| R2  | `fetchGitHistory()` descontinuado | Warning de deprecation |

**Tarefa 22.3b — GREEN:**

```typescript
// Substituir fetchGitHistory() por DataHub
const dataHub = await getOrFetchDataHub(provider, repo);
const history = dataHub
    ? {
          commits: '', // DataHub não tem commits ainda
          runs: dataHub.raw.runs.map((r) => ({
              runId: r.id,
              createdAt: r.created_at ?? '',
              passed: 0,
              failed: 0,
              skipped: 0,
              total: 0,
              passRate: 0,
          })),
          flakyTests: dataHub.computed.flakyRate.map((f) => f.title),
      }
    : await fetchGitHistory();
```

**Tarefa 22.3c — Quality Gate:** `npx vitest run` = 100% pass

---

## 22.4 — Migrar `test-results.ts` para DataHub

| Item        | Conteúdo                                                        |
| ----------- | --------------------------------------------------------------- |
| **Gap**     | `test-results.ts` baixa artifacts diretamente — duplica DataHub |
| **Arquivo** | `git_triggers/test-results.ts`                                  |

**Tarefa 22.4a — RED:**

| #   | Teste                                 | Esperado                      |
| --- | ------------------------------------- | ----------------------------- |
| R1  | `downloadTestArtifacts()` com DataHub | Usa DataHub                   |
| R2  | `downloadTestArtifacts()` sem DataHub | Fallback para download direto |

**Tarefa 22.4b — GREEN:**

```typescript
export async function downloadTestArtifacts(m: GitProvider, pipelineId: string | number): Promise<ParseResult | null> {
    // NOVO: tentar DataHub primeiro
    const dataHub = await getOrFetchDataHub(m, Config.get('GITHUB_REPOSITORY') ?? '');
    if (dataHub?.raw.parsedArtifacts && dataHub.raw.parsedArtifacts.length > 0) {
        return mergeArtifactResults(dataHub.raw.parsedArtifacts);
    }

    // Fallback: download direto (código existente)
    // ... manter para compatibilidade
}
```

**Tarefa 22.4c — Quality Gate:** `npx vitest run` = 100% pass

---

## 22.5 — Migrar `metrics.ts` para DataHub

| Item        | Conteúdo                                                      |
| ----------- | ------------------------------------------------------------- |
| **Gap**     | `metrics.ts` lê `ctrf-report.json` local para saveParseResult |
| **Arquivo** | `shared/metrics.ts`                                           |

**Tarefa 22.5a — RED:**

| #   | Teste                                       | Esperado                |
| --- | ------------------------------------------- | ----------------------- |
| R1  | `saveParseResult()` aceita dados do DataHub | Funciona                |
| R2  | `saveParseResult()` aceita arquivo local    | Compatibilidade mantida |

**Tarefa 22.5b — GREEN:**

Manter `saveParseResult()` como está — ela salva no MetricsStore local (cache). A mudança está em QUEM chama: os callers devem vir do DataHub, não de arquivos locais.

**Tarefa 22.5c — Quality Gate:** `npx vitest run` = 100% pass

---

## 22.6 — Migrar `batch-mode.ts` para DataHub

| Item        | Conteúdo                                                              |
| ----------- | --------------------------------------------------------------------- |
| **Gap**     | `batch-mode.ts` usa `getOrFetchDataHub` mas também lê arquivos locais |
| **Arquivo** | `git_triggers/batch-mode.ts`                                          |

**Tarefa 22.6a — RED:**

| #   | Teste                                         | Esperado          |
| --- | --------------------------------------------- | ----------------- |
| R1  | Batch mode usa DataHub para todos os projetos | Dados unificados  |
| R2  | Sem DataHub para projeto                      | Fallback graceful |

**Tarefa 22.6b — GREEN:** Refatorar para usar DataHub como fonte primária

**Tarefa 22.6c — Quality Gate:** `npx vitest run` = 100% pass

---

## Commit: `refactor: migrate all consumers to DataHub as single source of truth`

---

# FAZE 23 — Deprecation + Cleanup

## Objetivo

Deprecar e remover código duplicado que foi substituído pelo DataHub.

## 23.1 — Deprecar `git-artifact-downloader.ts`

| Item        | Conteúdo                                 |
| ----------- | ---------------------------------------- |
| **Gap**     | Módulo duplica funcionalidade do DataHub |
| **Arquivo** | `shared/git-artifact-downloader.ts`      |

**Tarefa 23.1a — RED:**

| #   | Teste                                 | Esperado            |
| --- | ------------------------------------- | ------------------- |
| R1  | `@deprecated` em `fetchGitHistory`    | Warning TypeScript  |
| R2  | `@deprecated` em `fetchLatestTestRun` | Warning TypeScript  |
| R3  | Todos os callers migrados             | Nenhum caller ativo |

**Tarefa 23.1b — GREEN:**

```typescript
/**
 * @deprecated Use DataHub.getOrFetchDataHub() instead.
 * This module will be removed in the next major version.
 */
export async function fetchGitHistory(): Promise<CiContext> {
    /* ... */
}

/**
 * @deprecated Use DataHub.parsedArtifacts instead.
 * This module will be removed in the next major version.
 */
export async function fetchLatestTestRun(): Promise<ParseResult | null> {
    /* ... */
}
```

**Tarefa 23.1c — Quality Gate:** `npx vitest run` = 100% pass

---

## 23.2 — Deprecar `coverage-source.ts` (leitura local)

| Item        | Conteúdo                                                        |
| ----------- | --------------------------------------------------------------- |
| **Gap**     | `readIstanbulCoverage()` lê arquivo local — deve vir do DataHub |
| **Arquivo** | `shared/coverage-source.ts`                                     |

**Tarefa 23.2a — RED:**

| #   | Teste                                       | Esperado           |
| --- | ------------------------------------------- | ------------------ |
| R1  | `@deprecated` em `readIstanbulCoverage`     | Warning TypeScript |
| R2  | `resolveCoverage()` aceita dados do DataHub | Nova assinatura    |

**Tarefa 23.2b — GREEN:**

```typescript
/**
 * @deprecated Use DataHub.raw.coverage instead.
 * Local file reading will be removed in the next major version.
 */
export function readIstanbulCoverage(coveragePath?: string): CoverageResult | undefined {
    /* ... */
}

/**
 * Resolve coverage from available sources.
 * Priority: DataHub > Istanbul local > CTRF field > undefined
 */
export function resolveCoverage(options?: {
    istanbulPath?: string;
    ctrfCoverage?: number;
    dataHubCoverage?: number; // NOVO
}): CoverageResult | undefined {
    if (options?.dataHubCoverage !== undefined && options.dataHubCoverage >= 0) {
        return { coveragePct: options.dataHubCoverage, source: 'ctrf', detail: `datahub ${options.dataHubCoverage}%` };
    }
    // ... fallback existente
}
```

**Tarefa 23.2c — Quality Gate:** `npx vitest run` = 100% pass

---

## 23.3 — Deprecar `case17-test-utils.ts` re-exports

| Item        | Conteúdo                                                       |
| ----------- | -------------------------------------------------------------- |
| **Gap**     | `case17-test-utils.ts` re-exporta de `git-artifact-downloader` |
| **Arquivo** | `jira_management/commands/case17-test-utils.ts`                |

**Tarefa 23.3a — RED:**

| #   | Teste                       | Esperado           |
| --- | --------------------------- | ------------------ |
| R1  | `@deprecated` em re-exports | Warning TypeScript |

**Tarefa 23.3b — GREEN:** Adicionar `@deprecated` JSDoc

**Tarefa 23.3c — Quality Gate:** `npx vitest run` = 100% pass

---

## 23.4 — Atualizar Mocks

| Item         | Conteúdo                                                                     |
| ------------ | ---------------------------------------------------------------------------- |
| **Gap**      | Mocks de módulos deprecados precisam ser atualizados                         |
| **Arquivos** | `shared/__mocks__/git-artifact-downloader.ts`, `shared/__mocks__/metrics.ts` |

**Tarefa 23.4a — RED:**

| #   | Teste                              | Esperado        |
| --- | ---------------------------------- | --------------- |
| R1  | Mocks refletem nova API do DataHub | Testes passam   |
| R2  | Nenhum mock quebrado               | 0 erros de mock |

**Tarefa 23.4b — GREEN:** Atualizar mocks para usar DataHub

**Tarefa 23.4c — Quality Gate:** `npx vitest run` = 100% pass

---

## Commit: `refactor: deprecate local data modules, redirect to DataHub`

---

# FAZE 24 — Atualização de Contratos

## Objetivo

Atualizar tipos e interfaces para refletir a nova arquitetura baseada em DataHub.

## 24.1 — Estender `ArtifactInfo` com Metadados

| Item        | Conteúdo                                               |
| ----------- | ------------------------------------------------------ |
| **Gap**     | `ArtifactInfo` tem só `id` e `name` — faltam metadados |
| **Arquivo** | `shared/types/ci-cd.ts:96-101`                         |

**Tarefa 24.1a — RED:**

| #   | Teste                              | Esperado       |
| --- | ---------------------------------- | -------------- |
| R1  | `ArtifactInfo` tem `size_in_bytes` | Campo presente |
| R2  | `ArtifactInfo` tem `created_at`    | Campo presente |
| R3  | `ArtifactInfo` tem `content_type`  | Campo presente |

**Tarefa 24.1b — GREEN:**

```typescript
export interface ArtifactInfo {
    id: string | number;
    name: string;
    size_in_bytes?: number;
    created_at?: string;
    content_type?: string;
}
```

**Tarefa 24.1c — Quality Gate:** `npx vitest run` = 100% pass

---

## 24.2 — Adicionar `CheckRunAnnotation` ao GitHub

| Item        | Conteúdo                                                   |
| ----------- | ---------------------------------------------------------- |
| **Gap**     | Não suporta annotations do GitHub Check Runs               |
| **Arquivo** | `shared/types/ci-cd.ts`, `git_triggers/github-workflow.ts` |

**Tarefa 24.2a — RED:**

| #   | Teste                                      | Esperado             |
| --- | ------------------------------------------ | -------------------- |
| R1  | `CheckRunAnnotation` type existe           | Definido             |
| R2  | `wfGetCheckRunAnnotations()` retorna dados | Array de annotations |

**Tarefa 24.2b — GREEN:**

```typescript
export interface CheckRunAnnotation {
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: 'notice' | 'warning' | 'failure';
    title: string | null;
    message: string | null;
    raw_details: string | null;
}
```

**Tarefa 24.2c — Quality Gate:** `npx vitest run` = 100% pass

---

## 24.3 — Adicionar `GitLabTestReport` ao GitLab

| Item        | Conteúdo                                                   |
| ----------- | ---------------------------------------------------------- |
| **Gap**     | Não suporta test reports nativos do GitLab                 |
| **Arquivo** | `shared/types/ci-cd.ts`, `git_triggers/gitlab-workflow.ts` |

**Tarefa 24.3a — RED:**

| #   | Teste                                     | Esperado           |
| --- | ----------------------------------------- | ------------------ |
| R1  | `GitLabTestReport` type existe            | Definido           |
| R2  | `glGetPipelineTestReport()` retorna dados | Dados estruturados |

**Tarefa 24.3b — GREEN:**

```typescript
export interface GitLabTestReport {
    testSuiteName: string;
    total_count: number;
    success_count: number;
    failed_count: number;
    skipped_count: number;
    test_cases: Array<{
        classname: string;
        name: string;
        status: 'success' | 'failed' | 'skipped';
        duration: number;
        stack_trace?: string;
    }>;
}
```

**Tarefa 24.3c — Quality Gate:** `npx vitest run` = 100% pass

---

## 24.4 — Atualizar `RawData` com Todos os Novos Campos

| Item        | Conteúdo                                                          |
| ----------- | ----------------------------------------------------------------- |
| **Gap**     | `RawData` não tem campos para annotations, framework, test report |
| **Arquivo** | `shared/types/data-hub.ts`                                        |

**Tarefa 24.4a — RED:**

| #   | Teste                               | Esperado         |
| --- | ----------------------------------- | ---------------- |
| R1  | `RawData` tem todos os novos campos | Campos definidos |

**Tarefa 24.4b — GREEN:**

```typescript
export interface RawData {
    runs: PipelineRun[];
    jobs: Map<number, PipelineJob[]>;
    artifacts: Map<number, ArtifactInfo[]>;
    failureReasons: Map<number, string[]>;
    coverage?: RawCoverage;
    jiraIssues?: RawJiraIssue[];
    /** Framework detection result */
    framework?: FrameworkDetection;
    /** Parsed artifact data (CTRF, JUnit, Mochawesome) */
    parsedArtifacts?: ArtifactParseResult[];
    /** GitHub check run annotations */
    annotations?: Map<number, CheckRunAnnotation[]>;
    /** GitLab test report */
    gitlabTestReport?: GitLabTestReport;
}
```

**Tarefa 24.4c — Quality Gate:** `npx vitest run` = 100% pass

---

## 24.5 — Atualizar `ComputedMetrics` com Dados de Teste

| Item        | Conteúdo                                                 |
| ----------- | -------------------------------------------------------- |
| **Gap**     | `ComputedMetrics` não tem `testPassRate` ou `testCounts` |
| **Arquivo** | `shared/types/data-hub.ts`                               |

**Tarefa 24.5a — RED:**

| #   | Teste                                | Esperado       |
| --- | ------------------------------------ | -------------- |
| R1  | `ComputedMetrics` tem `testPassRate` | Campo presente |
| R2  | `ComputedMetrics` tem `testCounts`   | Campo presente |

**Tarefa 24.5b — GREEN:**

```typescript
export interface ComputedMetrics {
    // ... campos existentes
    /** Test pass rate from artifacts (0-100) */
    testPassRate?: number;
    /** Test counts from artifacts */
    testCounts?: { passed: number; failed: number; skipped: number; total: number };
    /** Detected framework */
    framework?: string;
}
```

**Tarefa 24.5c — Quality Gate:** `npx vitest run` = 100% pass

---

## Commit: `feat(types): extend contracts for artifact download + framework detection`

---

# FAZE 25 — Testing + Quality Gates

## Objetivo

Garantir cobertura 100%, PBT para parsers, e que todos os quality gates passam.

## 25.1 — Unit Tests para Novos Módulos

| Módulo                            | Testes Necessários   |
| --------------------------------- | -------------------- |
| `framework-detection.ts`          | 20+ testes unitários |
| `artifact-parser.ts`              | 15+ testes unitários |
| `junit-xml-parser.ts`             | 15+ testes unitários |
| `coverage-source.ts` (atualizado) | 5+ testes unitários  |

## 25.2 — Property-Based Tests

| Módulo                   | Propriedades                               |
| ------------------------ | ------------------------------------------ |
| `artifact-parser.ts`     | "Nunca lança exceção com input arbitrário" |
| `junit-xml-parser.ts`    | "Nunca lança exceção com XML arbitrário"   |
| `framework-detection.ts` | "Confidence sempre entre 0 e 1"            |

## 25.3 — Integration Tests

| Fluxo                                    | Teste            |
| ---------------------------------------- | ---------------- |
| GitHub → DataHub → Compute → Report      | E2E completo     |
| GitLab → DataHub → Compute → Report      | E2E completo     |
| Fallback: artifacts → GitLab → logs → CI | Cascata funciona |

## 25.4 — Pre-commit Checklist

```bash
npx vitest run --reporter=verbose          # 100% pass
npx vitest run --coverage                 # ≥ 100%
npx eslint . --max-warnings=0             # 0 violações
npx tsc --noEmit                          # 0 erros
rg "as any" --include="*.ts"              # 0 ocorrências
rg "@ts-ignore|@ts-expect-error" --include="*.ts"  # 0 ocorrências
```

---

# FAZE 26 — Auditoria Final de Qualidade

## Objetivo

Auditoria completa de TODA a refatoração. Verificar que nenhum consumidor ainda lê dados locais.

## 26.1 — Verificar Migração Completa

| #   | Verificação                                | Comando                        | Esperado               |
| --- | ------------------------------------------ | ------------------------------ | ---------------------- |
| 1   | Nenhum import de `git-artifact-downloader` | `rg "git-artifact-downloader"` | Só em mocks/deprecated |
| 2   | Nenhum `readIstanbulCoverage` em produção  | `rg "readIstanbulCoverage"`    | Só em deprecated       |
| 3   | Nenhum `parseTestResultsFile` em produção  | `rg "parseTestResultsFile"`    | Só em deprecated       |
| 4   | Nenhum `fs.readFileSync` para coverage     | `rg "readFileSync.*coverage"`  | 0 ocorrências          |
| 5   | Todos os providers usam DataHub            | `rg "getOrFetchDataHub"`       | N múltiplos            |
| 6   | DataHub tem `parsedArtifacts`              | `rg "parsedArtifacts"`         | Presente               |
| 7   | DataHub tem `framework`                    | `rg "raw.framework"`           | Presente               |

## 26.2 — Verificar Type Safety

| #   | Verificação           | Comando            | Esperado      |
| --- | --------------------- | ------------------ | ------------- |
| 1   | `npx tsc --noEmit`    | TypeScript         | 0 erros       |
| 2   | `rg "as any"`         | Type safety        | 0 ocorrências |
| 3   | `rg "!\."`            | Non-null assertion | 0 ocorrências |
| 4   | `rg "eslint-disable"` | Lint bypass        | 0 ocorrências |

## 26.3 — Verificar Cobertura

| #   | Verificação                      | Comando         | Esperado     |
| --- | -------------------------------- | --------------- | ------------ |
| 1   | `npx vitest run --coverage`      | Coverage total  | ≥ 100%       |
| 2   | Novos módulos têm PBT            | `rg "property"` | Presente     |
| 3   | Todos os edge cases documentados | Audit report    | 0 pendências |

## 26.4 — Verificar Performance

| #   | Verificação                 | Comando          | Esperado |
| --- | --------------------------- | ---------------- | -------- |
| 1   | Contents API response time  | Integration test | < 2s     |
| 2   | Artifact download time      | Integration test | < 5s     |
| 3   | JUnit XML parse time (10MB) | Benchmark        | < 1s     |
| 4   | CTRF parse time (10MB)      | Benchmark        | < 1s     |

## 26.5 — Output da Auditoria

Relatório em `audit/functional/AUDIT-REPORT-REFACTORING.md`:

```markdown
# Auditoria de Refatoração — DataHub Global

## Resumo

- Data: YYYY-MM-DD
- Total de verificações: XX
- Migrações completas: XX/XX
- Módulos deprecados: XX
- Novos módulos: XX

## Migração de Consumidores

- [x] pr-report-core.ts → DataHub
- [x] session-context.ts → DataHub
- [x] case17.ts → DataHub
- [x] test-results.ts → DataHub
- [x] batch-mode.ts → DataHub
- [ ] (pendências)

## Deprecation Status

- [x] git-artifact-downloader.ts → @deprecated
- [x] coverage-source.ts (local) → @deprecated
- [x] case17-test-utils.ts → @deprecated

## Type Safety

- [ ] 0 `as any`
- [ ] 0 `@ts-ignore`
- [ ] 0 `eslint-disable`

## Coverage

- [ ] ≥ 100%
- [ ] PBT presente

## Conclusão

...
```

---

## Progress

- [ ] Phase 15 — Critical Pipeline Fixes
- [ ] Phase 16 — Error Handling Fixes
- [ ] Phase 17 — Summary & Report Fixes
- [ ] Phase 18 — Data Extraction (Tasks 189-198)
- [ ] Phase 19 — Auditoria Completa de Qualidade
- [ ] Phase 20 — Contents API + Framework Detection (Tasks 20.1-20.5)
- [ ] Phase 21 — Artifact Download + Parse (Tasks 21.1-21.8)
- [ ] Phase 22 — Migração de Consumidores (Tasks 22.1-22.6)
- [ ] Phase 23 — Deprecation + Cleanup (Tasks 23.1-23.4)
- [ ] Phase 24 — Atualização de Contratos (Tasks 24.1-24.5)
- [ ] Phase 25 — Testing + Quality Gates (Tasks 25.1-25.4)
- [ ] Phase 26 — Auditoria Final de Qualidade (Tasks 26.1-26.5)

---

## Affected Files — Resumo Completo

### Arquivos Novos — Parsers

| Arquivo                                       | Descrição                            |
| --------------------------------------------- | ------------------------------------ |
| `shared/framework-detection.ts`               | Framework detection via Contents API |
| `shared/framework-detection.test.ts`          | Tests                                |
| `shared/framework-detection.property.test.ts` | PBT                                  |
| `shared/artifact-parser.ts`                   | Artifact download + parse            |
| `shared/artifact-parser.test.ts`              | Tests                                |
| `shared/artifact-parser.property.test.ts`     | PBT                                  |
| `shared/junit-xml-parser.ts`                  | JUnit XML parser                     |
| `shared/junit-xml-parser.test.ts`             | Tests                                |
| `shared/junit-xml-parser.property.test.ts`    | PBT                                  |

### Arquivos Novos — Cross-Cutting Modules

| Arquivo                                                   | Descrição                         |
| --------------------------------------------------------- | --------------------------------- |
| `shared/data-hub/test-source-fallback.ts`                 | User fallback module (Camada 7)   |
| `shared/data-hub/test-source-fallback.test.ts`            | Tests                             |
| `shared/data-hub/extractors/coverage-extractor.ts`        | Cascata de coverage               |
| `shared/data-hub/extractors/coverage-extractor.test.ts`   | Tests                             |
| `shared/data-hub/extractors/test-count-extractor.ts`      | Cascata de test counts            |
| `shared/data-hub/extractors/test-count-extractor.test.ts` | Tests                             |
| `shared/data-hub/extractors/failure-classifier.ts`        | Cascata de failure classification |
| `shared/data-hub/extractors/failure-classifier.test.ts`   | Tests                             |
| `shared/data-hub/extractors/framework-detector.ts`        | Cascata de framework detection    |
| `shared/data-hub/extractors/framework-detector.test.ts`   | Tests                             |
| `shared/data-hub/metrics/metrics-types.ts`                | Interfaces de métricas            |
| `shared/data-hub/metrics/metrics-calculator.ts`           | Métricas derivadas de raw data    |
| `shared/data-hub/metrics/metrics-calculator.test.ts`      | Tests + PBT                       |
| `shared/data-hub/metrics/csv-exporter.ts`                 | Export CSV                        |
| `shared/data-hub/metrics/csv-exporter.test.ts`            | Tests                             |
| `shared/data-hub/metrics/csv-importer.ts`                 | Import CSV baseline               |
| `shared/data-hub/metrics/csv-importer.test.ts`            | Tests                             |

### Arquivos Modificados

| Arquivo                                         | Mudanças                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `shared/types/ci-cd.ts`                         | +`getFileContents`, +`listDirectory`, +`size_in_bytes`, +`CheckRunAnnotation`, +`GitLabTestReport`    |
| `shared/types/data-hub.ts`                      | +`framework`, +`parsedArtifacts`, +`annotations`, +`gitlabTestReport`, +`testPassRate`, +`testCounts` |
| `shared/data-hub/hub.ts`                        | Integrar extractors + metrics + fallback chain + user fallback                                        |
| `shared/data-hub/providers/github-provider.ts`  | +artifact download, +framework detection, +annotations                                                |
| `shared/data-hub/providers/gitlab-provider.ts`  | +artifact download, +framework detection, +test reports                                               |
| `git_triggers/github-workflow.ts`               | +`wfGetFileContents`, +`wfListDirectory`, +`wfGetCheckRunAnnotations`                                 |
| `git_triggers/gitlab-workflow.ts`               | +`glGetFileContents`, +`glListDirectory`, +`glGetPipelineTestReport`                                  |
| `shared/pr-report-core.ts`                      | Usar DataHub como fonte primária + métricas derivadas                                                 |
| `shared/session-context.ts`                     | Usar DataHub em vez de `fetchLatestTestRun`                                                           |
| `shared/ci-data.ts`                             | Integrar novos providers                                                                              |
| `git_triggers/test-results.ts`                  | Usar DataHub como fallback                                                                            |
| `git_triggers/batch-mode.ts`                    | Usar DataHub para todos os projetos                                                                   |
| `jira_management/commands/case17.ts`            | Usar DataHub em vez de `fetchGitHistory`                                                              |
| `jira_management/commands/case17-test-utils.ts` | @deprecated                                                                                           |
| `shared/coverage-source.ts`                     | @deprecated local reading                                                                             |
| `shared/git-artifact-downloader.ts`             | @deprecated                                                                                           |

### Arquivos Deprecados (Manter por Compatibilidade)

| Arquivo                                         | Status      | Substituto           |
| ----------------------------------------------- | ----------- | -------------------- |
| `shared/git-artifact-downloader.ts`             | @deprecated | DataHub              |
| `shared/coverage-source.ts` (local)             | @deprecated | DataHub.raw.coverage |
| `jira_management/commands/case17-test-utils.ts` | @deprecated | DataHub              |

---

## Estimates — Atualizado

### Cross-Cutting Modules (antes das Phases)

| Módulo                               | Hours   | Risk   |
| ------------------------------------ | ------- | ------ |
| User Fallback (test-source-fallback) | 2h      | Low    |
| Coverage Extractor                   | 2h      | Low    |
| Test Count Extractor                 | 2h      | Low    |
| Failure Classifier                   | 1h      | Low    |
| Framework Detector                   | 2h      | Medium |
| Metrics Calculator + Types           | 3h      | Low    |
| CSV Exporter                         | 1h      | Low    |
| CSV Importer                         | 1h      | Low    |
| **Subtotal Modules**                 | **14h** | —      |

### Phases

| Phase     | Tasks        | Hours   | Risk   |
| --------- | ------------ | ------- | ------ |
| 15        | 11-13        | 3h      | Low    |
| 16        | 14-16        | 4h      | Medium |
| 17        | 17-19        | 3h      | Low    |
| 18        | 189-200      | 14h     | Medium |
| 19        | 19.1-19.16   | 8h      | High   |
| 20        | 20.1-20.5    | 6h      | Medium |
| 21        | 21.1-21.8    | 10h     | High   |
| 22        | 22.1-22.7    | 10h     | High   |
| 23        | 23.1-23.4    | 3h      | Low    |
| 24        | 24.1-24.5    | 4h      | Medium |
| 25        | 25.1-25.4    | 4h      | Low    |
| 26        | 26.1-26.5    | 4h      | Medium |
| **Total** | **57 tasks** | **85h** | —      |

---

## Dependencies

> **Related Plan**: `shared/plans/centralize-test-constants.md` — Centraliza action versions e mock modules. Deve ser executado ANTES ou EM PARALELO com Phase 15 (ambos corrigem action versions, mas com abordagens diferentes: este plano corrige para versões fixas, o plano de constantes cria fonte única de verdade).

```
Phase 15-17 (Pipeline Fixes) ──┐
                                ├──→ Phase 18-19 (Data Extraction + Audit)
Phase 20 (Contents API) ───────┤
                                ├──→ Phase 21 (Artifact Download)
Phase 24 (Contracts) ──────────┤
                                ├──→ Phase 22 (Consumer Migration)
                                ├──→ Phase 23 (Deprecation)
                                └──→ Phase 25-26 (Testing + Audit)
```

---

## Quality Gates por Phase

| Phase | tsc --noEmit | lint | vitest  | PBT | Audit       |
| ----- | ------------ | ---- | ------- | --- | ----------- |
| 20    | ✅ 0 erros   | ✅ 0 | ✅ 100% | ✅  | —           |
| 21    | ✅ 0 erros   | ✅ 0 | ✅ 100% | ✅  | —           |
| 22    | ✅ 0 erros   | ✅ 0 | ✅ 100% | —   | —           |
| 23    | ✅ 0 erros   | ✅ 0 | ✅ 100% | —   | —           |
| 24    | ✅ 0 erros   | ✅ 0 | ✅ 100% | —   | —           |
| 25    | ✅ 0 erros   | ✅ 0 | ✅ 100% | ✅  | —           |
| 26    | ✅ 0 erros   | ✅ 0 | ✅ 100% | ✅  | ✅ completa |

---

# ITERAÇÃO 1 — Descobertas e Gaps (2026-07-06)

## Contexto da Iteração

Esta seção documenta todas as descobertas, insights e gaps identificados na iteração de planejamento. Cada iteração futura deve adicionar novas seções aqui, refinando e excluindo informações subótimas.

---

## 1. Fontes de Dados GitHub Identificadas

### 1.1 GitHub Artifacts REST API (CONFIRMADA)

**Endpoint principal:**

```
GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip
→ 302 Found (Location header com URL temporária, expira em 1 minuto)
→ 410 Gone (artifact expirado/deletado)
```

**Response schema completo (GET /repos/{owner}/{repo}/actions/artifacts):**

```json
{
    "total_count": 10,
    "artifacts": [
        {
            "id": 12345,
            "node_id": "MDg6QXJ0aWZhY3QxMjM0NQ==",
            "name": "ctrf-report",
            "size_in_bytes": 1024,
            "url": "https://api.github.com/repos/owner/repo/actions/artifacts/12345",
            "archive_download_url": "https://api.github.com/repos/owner/repo/actions/artifacts/12345/zip",
            "expired": false,
            "created_at": "2026-07-05T21:39:42Z",
            "expires_at": "2026-07-06T21:39:42Z",
            "updated_at": "2026-07-05T21:39:42Z",
            "digest": "sha256:abc123...",
            "workflow_run": {
                "id": 123456,
                "repository_id": 62689551,
                "head_repository_id": 62689551,
                "head_branch": "main",
                "head_sha": "abc123..."
            }
        }
    ]
}
```

**Filtros disponíveis:**

- `name` — filtra por nome do artifact (ex: `?name=ctrf-report`)
- `direction` — ordenação (asc/desc)

**Status codes:**

- `200` — OK
- `302` — Redirect para download (expira em 1 minuto)
- `410` — Artifact expirado/deletado

### 1.2 GitHub Check Runs API (CONFIRMADA)

**Endpoints:**

```
GET /repos/{owner}/{repo}/commits/{sha}/check-runs
GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations
```

**Dados disponíveis em Check Runs:**

- `output.title` — título do check
- `output.summary` — resumo (ex: "2 errors, 5 warnings")
- `output.text` — detalhes em markdown
- `output.annotations_count` — número de annotations
- `annotations[]` — array com file/line/message para cada falha

**Publish-test-results action (EnricoMi/publish-unit-test-result-action):**

- Publica resultados de teste como Check Runs
- Cria PR comments com resumo
- Gera annotations com arquivo/linha/mensagem
- Output JSON acessível via `steps.*.outputs.json`
- **IMPORTANTE**: Muitos projetos usam essa action — fonte rica de dados

### 1.3 GitHub Actions Metrics (LIMITADA)

**Endpoints conhecidos:**

- `/repos/{owner}/{repo}/actions/workflows/{id}/timing` — billable minutes
- `/repos/{owner}/{repo}/actions/metrics/performance` — UI-based
- `/repos/{owner}/{repo}/actions/metrics/usage` — UI-based

**Status**: A maioria dos endpoints é **UI-based**, não acessível via REST API para uso programático. O endpoint de timing está "closing down" (descontinuado).

**Decisão**: Não incluir como fonte de dados primária. Documentar como limitação conhecida.

### 1.4 Cross-Workflow Artifact Download (CONFIRMADA)

**Como funciona:**

- `actions/download-artifact@v4` suporta parâmetro `run-id`
- Requer token com permissões expandidas (PAT ou GITHUB_TOKEN com escopo adequado)
- Padrão: workflow B baixa artifact de workflow A via `workflow_run` event

**Exemplo:**

```yaml
- uses: actions/download-artifact@v4
  with:
      name: ctrf-report
      run-id: ${{ github.event.workflow_run.id }}
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Relevância para qa_tools**: CRÍTICA — o qa_tools analisa projetos EXTERNOS, então precisa baixar artifacts de outros repositórios/workflows.

---

## 2. Estado Atual do Código

### 2.1 Componentes que JÁ EXISTEM

| Componente                              | Local                                             | Status                                   |
| --------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `GitProvider.listPipelineArtifacts()`   | `shared/types/ci-cd.ts:164`                       | Existe, retorna `ArtifactInfo[]`         |
| `GitProvider.downloadArtifact()`        | `shared/types/ci-cd.ts:165`                       | Existe, retorna `{ buffer, filename }`   |
| `GitHubArtifact` type                   | `shared/types/ci-cd.ts:200-205`                   | Existe com `size_in_bytes`, `created_at` |
| `GitHubArtifactsResponse` type          | `shared/types/ci-cd.ts:208-210`                   | Existe                                   |
| DataHub chama `listPipelineArtifacts()` | `shared/data-hub/providers/github-provider.ts:38` | Existe                                   |
| `ArtifactInfo` type                     | `shared/types/ci-cd.ts:96-101`                    | Existe, minimalista                      |

### 2.2 Componentes que FALTAM

| Componente                                | Status            | Impacto                                 |
| ----------------------------------------- | ----------------- | --------------------------------------- |
| DataHub chama `downloadArtifact()`        | **NÃO EXISTE**    | CRÍTICO — artifacts nunca são baixados  |
| `ArtifactInfo` com `size_in_bytes`        | **NÃO MAPEADO**   | `GitHubArtifact` tem, mas não é mapeado |
| `ArtifactInfo` com `expired`              | **NÃO EXISTE**    | Não saber se artifact ainda existe      |
| `ArtifactInfo` com `archive_download_url` | **NÃO EXISTE**    | URL direta para download                |
| `ArtifactInfo` com `digest`               | **NÃO EXISTE**    | Hash de integridade                     |
| Parser de ZIP contents                    | **NÃO EXISTE**    | Não extrai CTRF/JUnit de dentro do ZIP  |
| Check Runs como fonte de testes           | **NÃO EXISTE**    | Só usado para annotations               |
| Cross-repository download                 | **NÃO DETALHADO** | Caso de uso principal do qa_tools       |

### 2.3 Gap Crítico: DataHub Nunca Baixa Artifacts

**Fluxo atual (INCOMPLETO):**

```
GitHubDataProvider.fetchRawData()
  → listPipelineArtifacts(runId)  ✅ Retorna metadata
  → artifactsMap.set(runId, arts) ✅ Salva metadata
  → NUNCA chama downloadArtifact() ❌ Conteúdo nunca é baixado
```

**Fluxo desejado (COMPLETO):**

```
GitHubDataProvider.fetchRawData()
  → listPipelineArtifacts(runId)  ✅ Retorna metadata
  → Para cada artifact de teste:
    → downloadArtifact(artifactId)  ✅ Baixa ZIP
    → extractAndParseArtifact()     ✅ Extrai CTRF/JUnit
    → parsedArtifacts.push()        ✅ Salva dados parseados
```

---

## 3. Gaps Identificados no Plano Atual

### Gap 1: DataHub Nunca Baixa Conteúdo de Artifacts (CRÍTICO)

**Problema**: O plano (Phase 21) descreve criar um módulo novo (`artifact-parser.ts`), mas **já existe** `downloadArtifact()` no `GitProvider`. O plano não detalha:

- Como lidar com o **redirect 302** do endpoint de download
- Como extrair e parsear o conteúdo do ZIP (CTRF JSON, JUnit XML)
- Que o DataHub precisa **chamar** `downloadArtifact()` existente

**Solução proposta**:

1. Adicionar chamada a `downloadArtifact()` no `GitHubDataProvider.fetchRawData()`
2. Criar `extractAndParseArtifact()` que:
    - Recebe o Buffer do download
    - Usa `AdmZip` para extrair conteúdo
    - Identifica CTRF JSON, JUnit XML, Mochawesome JSON
    - Parseia e retorna dados estruturados
3. Adicionar campo `parsedArtifacts` ao `RawData`

### Gap 2: `ArtifactInfo` é Minimalista (MÉDIO)

**Problema**: O tipo `ArtifactInfo` tem só `id` e `name`. A API do GitHub retorna muito mais:

- `size_in_bytes` — tamanho do artifact
- `created_at` — data de criação
- `expired` — se artifact expirou
- `archive_download_url` — URL direta para download
- `digest` — hash de integridade
- `workflow_run` — metadata do workflow

**Solução proposta**:

1. Estender `ArtifactInfo` com campos opcionais
2. Mapear todos os campos da API para o tipo
3. Usar `expired` para filtrar artifacts disponíveis

### Gap 3: Check Runs como Fonte Primária de Test Results (ALTO)

**Problema**: O plano atual trata Check Runs apenas como "enrichment" (Camada 4 — Annotations). Mas o `publish-test-results` cria Check Runs com **dados estruturados de teste**:

- `output.summary` — contagem de testes (ex: "10 passed, 2 failed")
- `output.text` — relatório detalhado em markdown
- `annotations[]` — falhas com arquivo/linha/mensagem
- PR comments com resumo completo

**Solução proposta**:

1. Adicionar nova camada: "Check Runs (GitHub, fonte primária)"
2. Detectar automaticamente se projeto usa `publish-test-results`
3. Extrair dados de teste dos Check Runs via API
4. Usar como fonte primária quando disponível, com fallback para artifacts

### Gap 4: Download Cross-Repository Não Detalhado (ALTO)

**Problema**: O plano não detalha como o qa_tools baixa artifacts de **outros repositórios** (que é seu caso de uso principal). Cenários:

- Repositório público → `GITHUB_TOKEN` funciona
- Repositório privado → precisa PAT com escopo `repo`
- Cross-workflow → precisa de `run-id` parameter

**Solução proposta**:

1. Documentar cenários de permissão
2. Adicionar lógica de fallback: artifacts → GitLab test reports → logs → CI API
3. Testar com repositórios públicos e privados

### Gap 5: GitHub Actions Metrics são UI-Based (BAIXO)

**Problema**: Os endpoints de metrics (performance/usage) são **UI-based**, não acessíveis via REST API para uso programático. O endpoint de timing está "closing down".

**Solução proposta**: Documentar como limitação conhecida. Não incluir como fonte de dados.

---

## 4. Decisões desta Iteração

| #   | Decisão                                            | Rationale                                               | Trade-off                    |
| --- | -------------------------------------------------- | ------------------------------------------------------- | ---------------------------- |
| 7   | Usar `downloadArtifact()` existente                | Já implementado, não duplicar código                    | Depende de redirect 302      |
| 8   | Check Runs como fonte primária (não só enrichment) | `publish-test-results` é fonte rica de dados            | Só funciona com essa action  |
| 9   | Limitar GitHub metrics a documentação              | Endpoints são UI-based, não REST                        | Perde dados de performance   |
| 10  | Cross-repository como caso de uso principal        | qa_tools analisa projetos externos                      | Requer permissões expandidas |
| 11  | `expired` em `ArtifactInfo`                        | Saber se artifact ainda existe antes de tentar download | Campo adicional no tipo      |
| 12  | `AdmZip` para extrair ZIP contents                 | Biblioteca madura, sem dependências extras              | Mais uma dependência         |

---

## 5. Próximos Passos (Iteração 2)

### 5.1 Prioridades

1. **Atualizar Phase 21** (Artifact Download) com:
    - Chamada a `downloadArtifact()` existente
    - `extractAndParseArtifact()` com `AdmZip`
    - Handling de redirect 302
    - Fallback chain: CTRF → JUnit → Mochawesome → unknown

2. **Atualizar Phase 24** (Contracts) com:
    - Estender `ArtifactInfo` com campos da API
    - Adicionar `CheckRunAnnotation` (já planejado)
    - Adicionar `GitLabTestReport` (já planejado)

3. **Adicionar nova fase** para Check Runs:
    - Detectar `publish-test-results` via Check Runs API
    - Extrair dados de teste de Check Runs
    - Usar como fonte primária quando disponível

4. **Atualizar Affected Files** com:
    - `shared/artifact-parser.ts` (novo)
    - `shared/check-run-extractor.ts` (novo, se necessário)

### 5.2 Perguntas para Próxima Iteração

1. Como detectar automaticamente se um projeto usa `publish-test-results`?
2. Qual a prioridade entre artifacts vs Check Runs vs GitLab test reports?
3. Como testar cross-repository download sem token de produção?
4. Vale a pena criar um "artifact fingerprint" baseado em `digest`?

---

## 6. Referências

- [GitHub Artifacts REST API](https://docs.github.com/pt/rest/actions/artifacts?apiVersion=2026-03-10)
- [publish-test-results action](https://github.com/EnricoMi/publish-unit-test-result-action)
- [Check Runs API](https://docs.github.com/pt/rest/checks/runs)
- [Cross-workflow artifact download](https://github.com/actions/download-artifact?tab=readme-ov-file#download-artifacts-from-other-workflow-runs-or-repositories)
- [GitLab Pipelines API](https://docs.gitlab.com/api/pipelines/)
- [GitLab Jobs API](https://docs.gitlab.com/api/jobs/)
- [GitLab Pipeline Schedules API](https://docs.gitlab.com/api/pipeline_schedules/)
- [GitHub Contents API](https://docs.github.com/pt/rest/repos/contents?apiVersion=2026-03-10)
- [GitHub Commits API](https://docs.github.com/pt/rest/commits/commits?apiVersion=2026-03-10)
- [GitHub Workflows API](https://docs.github.com/pt/rest/actions/workflows?apiVersion=2026-03-10)

---

# ITERAÇÃO 2 — Pesquisa Extensiva de APIs (2026-07-06)

## Escopo

Pesquisa extensiva de 14 seções de documentação GitHub/GitLab para identificar fontes de dados adicionais para o DataHub.

---

## 1. Descobertas de Alta Relevância

### 1.1 GitLab Coverage via Pipeline API (NÃO ESTAVA NO PLANO)

**Endpoint:**

```
GET /projects/:id/pipelines/:pipeline_id
```

**Campo:**

```json
{
    "id": 287,
    "status": "success",
    "coverage": "85.5", // ← COBERTURA DIRETO NA API!
    "duration": 34,
    "queued_duration": 6
}
```

**Impacto**: ELIMINA necessidade de ler `coverage/coverage-summary.json` local para projetos GitLab. O campo `coverage` já vem parseado e formatado.

**Ação no plano**: Atualizar Camada 6 (GitLab Test Reports) para incluir coverage via pipeline API. Não precisa de `coverage-source.ts` para GitLab.

### 1.2 GitLab Job Artifacts Tipados (NÃO ESTAVA NO PLANO)

**Endpoint:**

```
GET /projects/:id/pipelines/:pipeline_id/jobs
```

**Response:**

```json
"artifacts": [
  {"file_type": "archive", "size": 1000, "filename": "artifacts.zip", "file_format": "zip"},
  {"file_type": "junit", "size": 750, "filename": "junit.xml.gz", "file_format": "gzip"},
  {"file_type": "trace", "size": 1500, "filename": "job.log", "file_format": "raw"}
]
```

**Impacto**:

- `file_type: "junit"` indica que o GitLab já identificou o JUnit XML
- Não precisa adivinhar nomes de arquivo — o tipo diz tudo
- `failure_reason` ("script_failure", "stuck_or_timeout_failure") classifica o tipo de falha

**Ação no plano**: Provider GitLab deve inspecionar `artifacts[].file_type` antes de tentar download.

### 1.3 GitHub Check Runs `app` — Detecção de `publish-test-results` (NÃO ESTAVA NO PLANO)

**Endpoint:**

```
GET /repos/{owner}/{repo}/commits/{sha}/check-runs
```

**Response (relevante):**

```json
{
    "check_runs": [
        {
            "name": "test-results",
            "status": "completed",
            "conclusion": "success",
            "app": {
                "slug": "github-actions",
                "name": "GitHub Actions"
            },
            "output": {
                "title": "Test Results",
                "summary": "10 tests passed, 2 failed, 1 skipped",
                "text": "Detailed report in markdown...",
                "annotations_count": 2
            }
        }
    ]
}
```

**Impacto**:

- O `publish-test-results` cria check runs com nome e app identificáveis
- `app.slug` permite detectar automaticamente se projeto usa a action
- `output.summary` contém contagem de testes parseável
- `output.text` contém relatório detalhado
- `annotations_count` indica quantas falhas com arquivo/linha

**Ação no plano**: Adicionar detecção automática de `publish-test-results` via `app.slug` + nome do check run. Extrair dados de teste de `output.summary`.

### 1.4 GitHub Contents API — Raw Mode (NÃO ESTAVA NO PLANO)

**Endpoint:**

```
GET /repos/{owner}/{repo}/contents/package.json
Accept: application/vnd.github.raw+json
```

**Comportamento**:

- Retorna conteúdo cru (string pura) sem encoding base64
- Limite: 1MB para raw mode
- 1-100MB: só raw ou object media type
- > 100MB: não suportado
- Limite de 1.000 arquivos para listagem de diretório

**Impacto**: Framework detection via `package.json` fica mais simples — sem decoding de base64.

### 1.5 GitHub Artifacts — Filtro por Nome (NÃO ESTAVA NO PLANO)

**Endpoint:**

```
GET /repos/{owner}/{repo}/actions/artifacts?name=ctrf-report
```

**Impacto**:

- Filtra artifacts por nome, reduzindo chamadas API
- Pode buscar diretamente artifacts de teste (ctrf-report, test-results, etc.)

### 1.6 GitHub Commits — Stats (NOVO para qa_tools)

**Endpoint:**

```
GET /repos/{owner}/{repo}/commits
```

**Response (relevante):**

```json
{
    "stats": {
        "additions": 10,
        "deletions": 5,
        "total": 15
    }
}
```

**Impacto**: Code churn metrics (mudanças de código) combinadas com CI health. Pode correlacionar "muitas mudanças" com "mais falhas".

---

## 2. Descobertas de Média Relevância

| API                    | Dado                                                            | Utilidade                        |
| ---------------------- | --------------------------------------------------------------- | -------------------------------- |
| GitLab Pipeline        | `source` (push/web/schedule/parent_pipeline)                    | Detecta trigger do pipeline      |
| GitLab Pipeline        | `detailed_status` (text/label/group)                            | Status mais rico                 |
| GitLab Job             | `runner_manager` (version/platform/architecture)                | Diagnóstico de ambiente          |
| GitLab Job             | `failure_reason` ("script_failure", "stuck_or_timeout_failure") | Classificação de falha           |
| GitHub Repository      | `topics[]`                                                      | Heurística de tipo de projeto    |
| GitHub Commit Statuses | `GET /repos/{owner}/{repo}/commits/{ref}/status`                | Fallback para CI systems antigos |

---

## 3. Endpoints Irrelevantes / Fora de Escopo

| API                         | Motivo                                   |
| --------------------------- | ---------------------------------------- |
| GitHub Rendering as Graphs  | Tutorial D3.js, irrelevante para backend |
| GitHub Actions Secrets      | Só nomes, valores inacessíveis           |
| GitHub Actions Variables    | Requer admin access                      |
| GitHub Actions Metrics (UI) | Não REST-accessible, closing down        |
| GitHub Languages API        | Redundante com Contents API              |
| GitLab Pipeline Schedules   | Já implementado                          |
| GitLab Test Suites (403)    | Endpoint protegido, não acessível        |
| GitLab MR Reports (403)     | Endpoint protegido, não acessível        |

---

## 4. Resumo — 6 Descobertas que Mudam o Plano

| #   | Descoberta                              | Impacto                                    | Prioridade |
| --- | --------------------------------------- | ------------------------------------------ | ---------- |
| 1   | GitLab `coverage` via pipeline API      | Elimina leitura local para GitLab          | ALTA       |
| 2   | GitLab `artifacts[].file_type: "junit"` | Detecção nativa JUnit XML                  | ALTA       |
| 3   | GitHub `app.slug` em Check Runs         | Detecção automática `publish-test-results` | ALTA       |
| 4   | GitHub Contents raw mode                | Framework detection sem base64             | MÉDIA      |
| 5   | GitHub Artifact `name` filter           | Listagem eficiente                         | MÉDIA      |
| 6   | GitHub Commit `stats`                   | Code churn + CI health                     | BAIXA      |

---

## 5. Sobre `publish-test-results` no Marketplace

**Resposta à pergunta**: SIM, devemos avaliar.

O `publish-test-results` (EnricoMi/publish-unit-test-result-action) é uma das actions mais populares do GitHub Marketplace. Ela:

- Publica resultados de teste como **Check Runs**
- Cria **PR comments** com resumo
- Gera **annotations** com arquivo/linha/mensagem
- Output JSON acessível via `steps.*.outputs.json`

**Como integrar no DataHub**:

1. **Detecção automática**: Listar Check Runs para o commit SHA, filtrar por `app.slug` e/ou nome do check run
2. **Extração de dados**: Ler `output.summary` para contagem de testes, `output.text` para detalhes
3. **Fallback**: Se não encontrar check runs de `publish-test-results`, usar artifacts ou job logs

**Perguntas para próxima iteração**:

1. Qual o nome exato do check run que `publish-test-results` cria? (precisa testar)
2. O output JSON é acessível via API ou só via step outputs?
3. Como distinguish entre `publish-test-results` e outras actions que criam check runs?

---

## 6. Atualizações Necessárias no Plano

### 6.1 Arquitetura — Camada 6 (GitLab)

Atualizar para incluir:

- Coverage via pipeline API (`pipeline.coverage`)
- JUnit XML via `job.artifacts[].file_type: "junit"`
- Test reports via `GET /projects/:id/pipelines/:pid/test_report`

### 6.2 Nova Camada — Check Runs (GitHub, fonte primária)

Já adicionada na Iteração 1. Refinar com:

- Detecção via `app.slug`
- Extração via `output.summary`
- Fallback chain: Check Runs → Artifacts → Job Logs

### 6.3 Provider GitLab

Atualizar para:

- Ler `coverage` diretamente da pipeline
- Inspecionar `artifacts[].file_type` antes de download
- Usar `failure_reason` para classificar falhas

### 6.4 Provider GitHub

Atualizar para:

- Detectar `publish-test-results` via Check Runs
- Usar Contents raw mode para framework detection
- Filtrar artifacts por `name`

---

## 7. Referências Adicionais

- [GitLab Pipelines API](https://docs.gitlab.com/api/pipelines/)
- [GitLab Jobs API](https://docs.gitlab.com/api/jobs/)
- [GitLab Pipeline Schedules API](https://docs.gitlab.com/api/pipeline_schedules/)
- [GitHub Contents API](https://docs.github.com/pt/rest/repos/contents?apiVersion=2026-03-10)
- [GitHub Commits API](https://docs.github.com/pt/rest/commits/commits?apiVersion=2026-03-10)
- [GitHub Workflows API](https://docs.github.com/pt/rest/actions/workflows?apiVersion=2026-03-10)
