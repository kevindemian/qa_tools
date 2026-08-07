# PR Report — Medição de Duração e Contagens (Design para Implementação Futura)

- **Data:** 2026-08-05
- **Status:** PLANEJADO (não implementado)
- **Escopo:** tornar a medição de duração/contagens do PR report genérica para repositórios clientes — não dependente das convenções internas do qa_tools.

## 1. Restrição de Domínio

O qa_tools mede **projetos clientes**, não os próprios testes. Toda a medição deve
ser válida para um repositório arbitrário com:

- qualquer número de jobs de teste (matrix, múltiplos jobs)
- qualquer formato de artifact (CTRF / JUnit / Mochawesome)
- convenções de upload desconhecidas (nomes de artifact, diretórios)
- outros jobs (mutation, quality, hooks) que NÃO sobem test artifacts

Proibido assumir: existência do `vitest.config.ts` do qa_tools, convenção
`test-report`/`reports/`, ou que um único artifact represente o run inteiro.

## 2. Diagnóstico do Comportamento Atual

Cadeia atual de duração/contagens no PR report:

1. `shared/pr-report-core.ts:654` — `deriveSsoTTestData` lê `computed.metricsRuns[0]`
   = **run mais novo que tenha test artifacts**.
2. `shared/data-hub/compute/metrics-runs.ts:56-60` — `convertToMetricsRuns` soma
   **todos os artifacts** de um run num único `MetricsRun`.
3. CI interno: só o job **Test (Node 22)** sobe o artifact `test-report`
   (`.github/workflows/ci.yml:137-143`). Node 24, mutation, quality não sobem CTRF.
4. `shared/result_parser.ts:303-311` — para CTRF, `stats.duration` =
   `summary.stop - summary.start` (wall-clock do processo vitest inteiro daquele job).
5. `shared/vitest-ctrf-reporter.ts:163-240` — gera o CTRF com `start`/`stop` do
   wall-clock do run vitest e `summary.duration` = soma das durações por teste.

### Defeitos

- **Dependência interna:** `metricsRuns[0]` representa, no nosso CI, um único job
  (Node 22). Convenção `test-report`/`reports/` é nossa.
- **Semântica errada para matrix:** somar wall-clock por artifact de jobs paralelos
  conta o mesmo tempo de teste 2x.
- **Seleção não-determinística:** `metricsRuns[0]` = "mais novo com artifact" —
  pode ser um run antigo, de outro branch, ou irrelevante.
- **Contagens parciais:** lendo um único artifact, um cliente com N jobs de teste
  (cada um subindo seu artifact) tem contagens parciais.

## 3. Decisões de Design (Aprovadas)

### 3.1 Duração — Semântica A (duração do run do CI), com fallback

- **Primário:** `run_duration_ms` do workflow run inteiro via GitHub API
  (`/actions/runs/{id}/timing`). Já implementado em
  `shared/data-hub/providers/github-provider.ts:402-419` (`fetchTiming` →
  `raw.timing`).
- **Genérico:** funciona para qualquer repositório, independente de formato/convenção.
- **Sem double-count:** é o wall-clock real do run inteiro, não a soma dos jobs.
- **Fallback (obrigatório, não-silencioso):** se timing indisponível, usar a soma
  das durações individuais dos testes (`test.duration`). Se nem isso houver,
  renderizar `N/A` explícito — nunca `0`.

### 3.2 Seleção do Run — Run atual via `GITHUB_RUN_ID`

- `shared/ci/run-id.ts:31` — `getCiRunId()` já resolve `GITHUB_RUN_ID`.
- O job que gera o report roda **dentro do mesmo workflow run** do CI
  (post-process via `workflow_call` em `ci.yml` → mesmo `GITHUB_RUN_ID`).
- Filtrar `raw.parsedArtifacts` / `metricsRuns` por esse run id
  (no `deriveSsoTTestData` ou antes, no `convertToMetricsRuns`).
- Substitui `metricsRuns[0]` (arbitrário) por seleção determinística.

### 3.3 Contagens — Todos os test artifacts do run atual

- Somar `passed`/`failed`/`skipped` de **todos** os artifacts do run atual
  (já é o comportamento de `convertToMetricsRuns` por run — falta só o escopo
  por run id).
- Cobrir matrix e múltiplos jobs de teste legítimos.
- Ler só o primeiro artifact é inválido quando há N artifacts distintos.

## 4. Plano de Implementação (Futuro)

1. **Identificar run atual:** usar `getCiRunId()` no fluxo do PR report.
2. **Escopar dados ao run atual:**
   - filtrar `raw.parsedArtifacts` pelo run id atual antes de `convertToMetricsRuns`;
   - ou filtrar `metricsRuns` no `deriveSsoTTestData` (`shared/pr-report-core.ts:654`).
3. **Duração do run:**
   - ler `run_duration_ms` do run atual a partir de `raw.timing` / `computed`;
   - fallback: soma de `test.duration` dos artifacts do run atual;
   - ausência total → `N/A` (renderização já tratada em
     `shared/pr-report-core.ts:176-183` — `renderDurationCell`).
4. **Contagens:** manter agregação por run de todos os artifacts
   (sem mudança de semântica em `convertToMetricsRuns`, apenas escopo).
5. **Cobertura de teste:**
   - testes unitários para a seleção por run id e o fallback de duração;
   - fixture E2E simulando run cliente com N artifacts (matrix) — verificar
     que a duração NÃO é a soma dos wall-clocks e que contagens agregam todos.
6. **Revalidação:** gates de qualidade (vitest, tsc, depcruise, lint, type-coverage,
   unused-exports, no-swallow, semgrep, mutation) após a mudança.

## 5. Arquivos Envolvidos

- `shared/pr-report-core.ts` — `deriveSsoTTestData` (L654), `renderDurationCell` (L176).
- `shared/data-hub/compute/metrics-runs.ts` — `convertToMetricsRuns` (L56-60).
- `shared/data-hub/hub.ts` — `computed.avgDuration` (L837), `computed.metricsRuns` (L861-864).
- `shared/data-hub/providers/github-provider.ts` — `fetchTiming` (L402-419),
  `derivePerformanceMetrics.pipelineDurationMs` (L847-867).
- `shared/ci/run-id.ts` — `getCiRunId` (L31).
- `shared/result_parser.ts` — `wallDuration` para CTRF (L303-311).
- `.github/workflows/ci.yml` — upload `test-report` (L137-143, contexto atual interno).

## 6. Não-Objetivos

- Não é para corrigir agora: **documento de referência para implementação futura**.
- Não altera a semântica de health score / pass rate (fora de escopo).
- Não remove `metricsRuns` (histórico/trends continuam consumindo) — apenas o
  PR report passa a selecionar o run atual.
