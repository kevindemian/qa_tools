# Test Suite Audit — Manifesto de Progresso

Escopo: auditoria MANUAL dois-a-dois (source+teste) de TODOS os 506 arquivos de teste do repo
(`*.test.ts`/`*.spec.ts`). Método obrigatório: leitura integral arquivo-a-arquivo, em pares
source+teste (§16/§20.1/§20.6/§21). NENHUMA conclusão por grep/scan/amostragem é válida.
T1=teste codifica bug | T2=assert fraco | T3=mock shape violado (§26.1) | T4=.skip/.todo órfão | T5=coverage theater | T6=falha engolida | T7=suppress no teste
Ação: opção1=apagar+criar | opção2=corrigir in-place.

Status: pending | audited-clean | fixed-Tx

INVENTÁRIO (506):

- shared: 356 (B1.1/B1.2a/B1.2b/B1.3/B1.4/B1.5/B1.9/B1.integration/B1.system/B2.1/B2.2/B2.3)
- git_triggers: 42 (B3)
- jira_management: 73 (B4)
- scripts: 8 (B5)
- setup: 14 (B6)
- e2e: 13 (B7)

Concluído até agora: 111 (shared B1.1 + B1.2a + parte B1.2b). Restam: 395.

## B1.1 — core utils (27) — AUDITADA: 27/27 audited-clean, 0 fixes

- [audited-clean] shared/**tests**/config-accessor.property.test.ts
- [audited-clean] shared/**tests**/config-accessor.test.ts
- [audited-clean] shared/**tests**/config-schema.test.ts
- [audited-clean] shared/**tests**/config-validator.test.ts
- [audited-clean] shared/**tests**/date-utils.test.ts
- [audited-clean] shared/**tests**/deps.test.ts
- [audited-clean] shared/**tests**/env-example-sync.test.ts
- [audited-clean] shared/**tests**/env-loader-overlay.test.ts
- [audited-clean] shared/**tests**/env-loader.test.ts
- [audited-clean] shared/**tests**/errors.test.ts
- [audited-clean] shared/**tests**/escape.test.ts
- [audited-clean] shared/**tests**/feature-config.property.test.ts
- [audited-clean] shared/**tests**/feature-config.test.ts
- [audited-clean] shared/**tests**/field-names.test.ts
- [audited-clean] shared/**tests**/parse-project-flag.test.ts
- [audited-clean] shared/**tests**/path-utils.test.ts
- [audited-clean] shared/**tests**/project-context.test.ts
- [audited-clean] shared/**tests**/project-paths.test.ts
- [audited-clean] shared/**tests**/project-registry.property.test.ts
- [audited-clean] shared/**tests**/project-registry.test.ts
- [audited-clean] shared/**tests**/quoted-string.test.ts
- [audited-clean] shared/**tests**/safe-json.test.ts
- [audited-clean] shared/**tests**/sanitize.test.ts
- [audited-clean] shared/**tests**/session-context.test.ts
- [audited-clean] shared/**tests**/shared-invariants.test.ts
- [audited-clean] shared/**tests**/state.property.test.ts
- [audited-clean] shared/**tests**/state.test.ts

## B1.2a — report/html (split de B1.2) — AUDITADA: 47/47, 2 fixes T3

- [audited-clean] shared/**tests**/ai-comparison.property.test.ts
- [audited-clean] shared/**tests**/ai-comparison.test.ts
- [audited-clean] shared/**tests**/ai-effectiveness.property.test.ts
- [audited-clean] shared/**tests**/ai-effectiveness.test.ts
- [audited-clean] shared/**tests**/ai-feedback.test.ts
- [audited-clean] shared/**tests**/backlog-health.property.test.ts
- [audited-clean] shared/**tests**/backlog-health.test.ts
- [audited-clean] shared/**tests**/bug-report-validator.test.ts
- [audited-clean] shared/**tests**/bug-report.schema.test.ts
- [audited-clean] shared/**tests**/bug-report.test.ts
- [audited-clean] shared/**tests**/coverage-gap-html.property.test.ts
- [audited-clean] shared/**tests**/coverage-gap-utils.test.ts
- [audited-clean] shared/**tests**/coverage-gap.test.ts
- [audited-clean] shared/**tests**/flakiness-dashboard-html.property.test.ts
- [audited-clean] shared/**tests**/flakiness-dashboard.test.ts
- [audited-clean] shared/**tests**/generate-coverage-gap-html.test.ts
- [audited-clean] shared/**tests**/html-factory.test.ts
- [audited-clean] shared/**tests**/impact-alert.property.test.ts
- [audited-clean] shared/**tests**/impact-alert.test.ts
- [audited-clean] shared/**tests**/incident-report.property.test.ts
- [audited-clean] shared/**tests**/incident-report.test.ts
- [audited-clean] shared/**tests**/markdown.test.ts
- [audited-clean] shared/**tests**/pr-report-core.compute-diff.test.ts
- [audited-clean] shared/**tests**/pr-report-core.main.test.ts
- [audited-clean] shared/**tests**/pr-report-core.property.test.ts
- [audited-clean] shared/**tests**/pr-report-core.test.ts
- [audited-clean] shared/**tests**/pr-report-core.wiring.property.test.ts
- [audited-clean] shared/**tests**/pr-report-core.wiring.test.ts
- [audited-clean] shared/**tests**/report-chart.test.ts
- [audited-clean] shared/**tests**/report-diff.test.ts
- [audited-clean] shared/**tests**/report-export.test.ts
- [audited-clean] shared/**tests**/report-generator.test.ts
- [audited-clean] shared/**tests**/report-html-project.test.ts
- [audited-clean] shared/**tests**/report-html.property.test.ts
- [fixed-T3] shared/**tests**/report-html.test.ts (opção2: removeu vi.mock local config-accessor/logger → env real)
- [fixed-T3] shared/**tests**/report-sections.test.ts (opção2: removeu vi.mock local report-table → buildTestTable real)
- [audited-clean] shared/**tests**/report-scripts.test.ts
- [audited-clean] shared/**tests**/report-styles.test.ts
- [audited-clean] shared/**tests**/report-table.test.ts
- [audited-clean] shared/**tests**/report-types.test.ts
- [audited-clean] shared/**tests**/report-utils.test.ts
- [audited-clean] shared/**tests**/report-validator.test.ts
- [audited-clean] shared/**tests**/show-docs.test.ts
- [audited-clean] shared/**tests**/traceability-matrix.property.test.ts
- [audited-clean] shared/**tests**/traceability-matrix.test.ts
- [audited-clean] shared/**tests**/pr-report.test.ts
- [audited-clean] shared/**tests**/vitest-ctrf-reporter.test.ts

## B1.2b — quality/score (split de B1.2)

- [audited-clean] shared/**tests**/analysis-validator.test.ts
- [audited-clean] shared/**tests**/artifact-validator.test.ts
- [audited-clean] shared/**tests**/benchmark-metrics.property.test.ts
- [audited-clean] shared/**tests**/benchmark-metrics.test.ts
- [audited-clean] shared/**tests**/benchmark-validators.test.ts
- [audited-clean] shared/**tests**/comparison-schema.test.ts
- [audited-clean] shared/**tests**/comparison-validator.test.ts
- [audited-clean] shared/**tests**/coverage-verifier.property.test.ts
- [audited-clean] shared/**tests**/coverage-verifier.test.ts
- [audited-clean] shared/**tests**/cross-squad-benchmark.property.test.ts
- [fixed-T3] shared/**tests**/cross-squad-benchmark.test.ts
- [audited-clean] shared/**tests**/data-quality.test.ts
- [audited-clean] shared/**tests**/defect-seasonality.property.test.ts
- [fixed-T3] shared/**tests**/defect-seasonality.test.ts
- [audited-clean] shared/**tests**/defect-trend-html.property.test.ts
- [audited-clean] shared/**tests**/defect-trend.test.ts
- [audited-clean] shared/**tests**/developer-profile.property.test.ts
- [fixed-T3] shared/**tests**/developer-profile.test.ts
- [audited-clean] shared/**tests**/evidence-validator.test.ts
- [audited-clean] shared/**tests**/health-score.property.test.ts
- [audited-clean] shared/**tests**/health-score.test.ts
- [audited-clean] shared/**tests**/quality-gate.property.test.ts
- [audited-clean] shared/**tests**/quality-gate.test.ts
- [audited-clean] shared/**tests**/quality-metrics.property.test.ts
- [audited-clean] shared/**tests**/quality-metrics.test.ts
- [audited-clean] shared/**tests**/quality-suggester.property.test.ts
- [audited-clean] shared/**tests**/quality-suggester.test.ts
- [audited-clean] shared/**tests**/release-score.property.test.ts
- [audited-clean] shared/**tests**/release-score.test.ts
- [audited-clean] shared/**tests**/requirement-score.property.test.ts
- [fixed-T3] shared/**tests**/requirement-score.test.ts
- [audited-clean] shared/**tests**/run-comparison.property.test.ts
- [audited-clean] shared/**tests**/run-comparison.test.ts
- [audited-clean] shared/**tests**/silent-regression.property.test.ts
- [audited-clean] shared/**tests**/silent-regression.test.ts
- [audited-clean] shared/**tests**/suite-optimization.property.test.ts
- [audited-clean] shared/**tests**/suite-optimization.test.ts
- [pending] shared/**tests**/targeted-retry.test.ts
- [pending] shared/**tests**/test-impact.property.test.ts
- [pending] shared/**tests**/test-impact.test.ts

## B1.3 — llm/analysis (23)

- [pending] shared/**tests**/classify.schema.test.ts
- [pending] shared/**tests**/failure-analysis.schema.test.ts
- [pending] shared/**tests**/failure-analysis.test.ts
- [pending] shared/**tests**/framework-detection.property.test.ts
- [pending] shared/**tests**/framework-detection.test.ts
- [pending] shared/**tests**/llm-benchmark.test.ts
- [pending] shared/**tests**/llm-cache.test.ts
- [pending] shared/**tests**/llm-client.test.ts
- [pending] shared/**tests**/llm-fallback-config.test.ts
- [pending] shared/**tests**/llm-fallback-http.test.ts
- [pending] shared/**tests**/llm-fallback.test.ts
- [pending] shared/**tests**/llm-metrics.test.ts
- [pending] shared/**tests**/llm-probe.test.ts
- [pending] shared/**tests**/llm-provider-profiles.test.ts
- [pending] shared/**tests**/llm-rate-limiter.test.ts
- [pending] shared/**tests**/llm-review-prompts.test.ts
- [pending] shared/**tests**/llm-review.rejection.test.ts
- [pending] shared/**tests**/llm-review.test.ts
- [pending] shared/**tests**/llm-self-consistency.test.ts
- [pending] shared/**tests**/llm-validation.test.ts
- [pending] shared/**tests**/model-adapter.test.ts
- [pending] shared/**tests**/model-discovery.test.ts
- [pending] shared/**tests**/model-resolver.test.ts

## B1.4 — ui (22)

- [pending] shared/**tests**/box.test.ts
- [pending] shared/**tests**/breadcrumbs.test.ts
- [pending] shared/**tests**/cli_base.test.ts
- [pending] shared/**tests**/entry-menu-logic.test.ts
- [pending] shared/**tests**/entry-menu.test.ts
- [pending] shared/**tests**/first-run.test.ts
- [pending] shared/**tests**/output.test.ts
- [pending] shared/**tests**/palette.test.ts
- [pending] shared/**tests**/prompt-errors.test.ts
- [pending] shared/**tests**/prompt-format.test.ts
- [pending] shared/**tests**/prompt-input-base.test.ts
- [pending] shared/**tests**/prompt-input-editor.test.ts
- [pending] shared/**tests**/prompt-input-filepath.test.ts
- [pending] shared/**tests**/prompt-input-inquirer.test.ts
- [pending] shared/**tests**/prompt-input.test.ts
- [pending] shared/**tests**/prompt-summary.test.ts
- [pending] shared/**tests**/prompt-ui.test.ts
- [pending] shared/**tests**/prompt.test.ts
- [pending] shared/**tests**/spinner.test.ts
- [pending] shared/**tests**/splash.test.ts
- [pending] shared/**tests**/theme-tokens.test.ts
- [pending] shared/**tests**/theme.test.ts

## B1.5 — ci/jira/infra (31)

- [pending] shared/**tests**/ci-data-incremental.test.ts
- [pending] shared/**tests**/ci-data.test.ts
- [pending] shared/**tests**/ci-detect.test.ts
- [pending] shared/**tests**/ci-injector.test.ts
- [pending] shared/**tests**/circuit-breaker.test.ts
- [pending] shared/**tests**/disk-cache.test.ts
- [pending] shared/**tests**/git-metrics-adapter.property.test.ts
- [pending] shared/**tests**/git-metrics-adapter.test.ts
- [pending] shared/**tests**/git-provider-error.test.ts
- [pending] shared/**tests**/git-sha.test.ts
- [pending] shared/**tests**/host-semaphore.test.ts
- [pending] shared/**tests**/http-client.test.ts
- [pending] shared/**tests**/jira-auth.test.ts
- [pending] shared/**tests**/jira-client.test.ts
- [pending] shared/**tests**/jira-helper.test.ts
- [pending] shared/**tests**/junit-xml-parser.property.test.ts
- [pending] shared/**tests**/junit-xml-parser.test.ts
- [pending] shared/**tests**/log-parser-failure-records.test.ts
- [pending] shared/**tests**/log-parser.property.test.ts
- [pending] shared/**tests**/log-parser.test.ts
- [pending] shared/**tests**/logger.test.ts
- [pending] shared/**tests**/open.test.ts
- [pending] shared/**tests**/proxy-config.test.ts
- [pending] shared/**tests**/publish.test.ts
- [pending] shared/**tests**/result_parser.test.ts
- [pending] shared/**tests**/store-backend.fallback.test.ts
- [pending] shared/**tests**/store-backend.test.ts
- [pending] shared/**tests**/temp-dir.property.test.ts
- [pending] shared/**tests**/temp-dir.test.ts
- [pending] shared/**tests**/tls.test.ts
- [pending] shared/**tests**/xray-cloud-client.test.ts

## B1.9 — other (13)

- [pending] shared/**tests**/config.test.ts
- [pending] shared/**tests**/github-check-run.test.ts
- [pending] shared/**tests**/github-pr-comment.test.ts
- [pending] shared/**tests**/pipeline-cost.property.test.ts
- [pending] shared/**tests**/pipeline-cost.test.ts
- [pending] shared/**tests**/pipeline-schema.test.ts
- [pending] shared/**tests**/pipeline-validator.test.ts
- [pending] shared/**tests**/quarantine.property.test.ts
- [pending] shared/**tests**/quarantine.test.ts
- [pending] shared/**tests**/test-case-validator.test.ts
- [pending] shared/**tests**/test-suite.schema.test.ts
- [pending] shared/**tests**/test-utils.test.ts
- [pending] shared/**tests**/validation.test.ts

## B1.integration — shared/**tests**/integration (46)

- [pending] shared/**tests**/integration/ai-comparison.integration.test.ts
- [pending] shared/**tests**/integration/ai-effectiveness.integration.test.ts
- [pending] shared/**tests**/integration/backlog-health.integration.test.ts
- [pending] shared/**tests**/integration/benchmark-metrics.integration.test.ts
- [pending] shared/**tests**/integration/ci-data-getOrFetch.integration.test.ts
- [pending] shared/**tests**/integration/ci-data.integration.test.ts
- [pending] shared/**tests**/integration/ci-menu.integration.test.ts
- [pending] shared/**tests**/integration/ci-pipeline-file-generation.integration.test.ts
- [pending] shared/**tests**/integration/config-accessor.integration.test.ts
- [pending] shared/**tests**/integration/coverage-gap.integration.test.ts
- [pending] shared/**tests**/integration/coverage-verifier.integration.test.ts
- [pending] shared/**tests**/integration/cross-squad-benchmark.integration.test.ts
- [pending] shared/**tests**/integration/defect-seasonality.integration.test.ts
- [pending] shared/**tests**/integration/defect-trend.integration.test.ts
- [pending] shared/**tests**/integration/developer-profile.integration.test.ts
- [pending] shared/**tests**/integration/entry-menu-project.integration.test.ts
- [pending] shared/**tests**/integration/feature-config.integration.test.ts
- [pending] shared/**tests**/integration/flakiness-dashboard.integration.test.ts
- [pending] shared/**tests**/integration/git-metrics-adapter.integration.test.ts
- [pending] shared/**tests**/integration/health-score.integration.test.ts
- [pending] shared/**tests**/integration/impact-alert.integration.test.ts
- [pending] shared/**tests**/integration/incident-report.integration.test.ts
- [pending] shared/**tests**/integration/integration-helpers.test.ts
- [pending] shared/**tests**/integration/logger.integration.test.ts
- [pending] shared/**tests**/integration/module-integration.integration.test.ts
- [pending] shared/**tests**/integration/pipeline-cost.integration.test.ts
- [pending] shared/**tests**/integration/project-context.integration.test.ts
- [pending] shared/**tests**/integration/project-registry.integration.test.ts
- [pending] shared/**tests**/integration/quality-gate.integration.test.ts
- [pending] shared/**tests**/integration/quality-metrics.integration.test.ts
- [pending] shared/**tests**/integration/quality-suggester.integration.test.ts
- [pending] shared/**tests**/integration/quarantine.integration.test.ts
- [pending] shared/**tests**/integration/release-score.integration.test.ts
- [pending] shared/**tests**/integration/report-html.integration.test.ts
- [pending] shared/**tests**/integration/reports-dir.integration.test.ts
- [pending] shared/**tests**/integration/requirement-score.integration.test.ts
- [pending] shared/**tests**/integration/run-comparison.integration.test.ts
- [pending] shared/**tests**/integration/setup-wizard.integration.test.ts
- [pending] shared/**tests**/integration/silent-regression.integration.test.ts
- [pending] shared/**tests**/integration/state-project.integration.test.ts
- [pending] shared/**tests**/integration/state.integration.test.ts
- [pending] shared/**tests**/integration/store.integration.test.ts
- [pending] shared/**tests**/integration/suite-optimization.integration.test.ts
- [pending] shared/**tests**/integration/temp-dir.integration.test.ts
- [pending] shared/**tests**/integration/test-impact.integration.test.ts
- [pending] shared/**tests**/integration/traceability-matrix.integration.test.ts

## B1.system/migration/e2e — (3)

- [pending] shared/**tests**/e2e/ci-data-e2e.test.ts
- [pending] shared/**tests**/migration/migrate-projects.test.ts
- [pending] shared/**tests**/system/ci-data-system.test.ts

## B2.1 — data-hub tests (84)

- [pending] shared/data-hub/**tests**/artifact-parser.property.test.ts
- [pending] shared/data-hub/**tests**/artifact-parser.test.ts
- [pending] shared/data-hub/**tests**/cache.test.ts
- [pending] shared/data-hub/**tests**/compute/avg-duration.property.test.ts
- [pending] shared/data-hub/**tests**/compute/avg-duration.test.ts
- [pending] shared/data-hub/**tests**/compute/branch-health.property.test.ts
- [pending] shared/data-hub/**tests**/compute/branch-health.test.ts
- [pending] shared/data-hub/**tests**/compute/compute-cost.test.ts
- [pending] shared/data-hub/**tests**/compute/coverage.property.test.ts
- [pending] shared/data-hub/**tests**/compute/coverage.test.ts
- [pending] shared/data-hub/**tests**/compute/failure-reasons.property.test.ts
- [pending] shared/data-hub/**tests**/compute/failure-reasons.test.ts
- [pending] shared/data-hub/**tests**/compute/flakiness-entries.test.ts
- [pending] shared/data-hub/**tests**/compute/flaky-rate.property.test.ts
- [pending] shared/data-hub/**tests**/compute/flaky-rate.test.ts
- [pending] shared/data-hub/**tests**/compute/pass-rate.property.test.ts
- [pending] shared/data-hub/**tests**/compute/pass-rate.test.ts
- [pending] shared/data-hub/**tests**/compute/phase22-foundation.test.ts
- [pending] shared/data-hub/**tests**/compute/pipeline-cost.property.test.ts
- [pending] shared/data-hub/**tests**/compute/pipeline-cost.test.ts
- [pending] shared/data-hub/**tests**/compute/quarantine-status.property.test.ts
- [pending] shared/data-hub/**tests**/compute/quarantine-status.test.ts
- [pending] shared/data-hub/**tests**/compute/release-score.property.test.ts
- [pending] shared/data-hub/**tests**/compute/release-score.test.ts
- [pending] shared/data-hub/**tests**/compute/retry-flaky.test.ts
- [pending] shared/data-hub/**tests**/compute/run-failure-rate.property.test.ts
- [pending] shared/data-hub/**tests**/compute/run-failure-rate.test.ts
- [pending] shared/data-hub/**tests**/compute/run-pass-rate.property.test.ts
- [pending] shared/data-hub/**tests**/compute/run-pass-rate.test.ts
- [pending] shared/data-hub/**tests**/compute/scoring.property.test.ts
- [pending] shared/data-hub/**tests**/compute/scoring.test.ts
- [pending] shared/data-hub/**tests**/compute/suite-speed.property.test.ts
- [pending] shared/data-hub/**tests**/compute/suite-speed.test.ts
- [pending] shared/data-hub/**tests**/compute/test-duration-map.property.test.ts
- [pending] shared/data-hub/**tests**/compute/test-duration-map.test.ts
- [pending] shared/data-hub/**tests**/compute/test-duration-p95.property.test.ts
- [pending] shared/data-hub/**tests**/compute/test-duration-p95.test.ts
- [pending] shared/data-hub/**tests**/compute/trends.property.test.ts
- [pending] shared/data-hub/**tests**/compute/trends.test.ts
- [pending] shared/data-hub/**tests**/extractors/commit-log-extractor.test.ts
- [pending] shared/data-hub/**tests**/extractors/coverage-extractor.property.test.ts
- [pending] shared/data-hub/**tests**/extractors/coverage-extractor.test.ts
- [pending] shared/data-hub/**tests**/extractors/coverage-files-extractor.test.ts
- [pending] shared/data-hub/**tests**/extractors/failure-classifier.property.test.ts
- [pending] shared/data-hub/**tests**/extractors/failure-classifier.test.ts
- [pending] shared/data-hub/**tests**/extractors/framework-detector.test.ts
- [pending] shared/data-hub/**tests**/factory.test.ts
- [pending] shared/data-hub/**tests**/failure-classifier.test.ts
- [pending] shared/data-hub/**tests**/global-hub.test.ts
- [pending] shared/data-hub/**tests**/hub-ingest-gate.test.ts
- [pending] shared/data-hub/**tests**/hub-st1.test.ts
- [pending] shared/data-hub/**tests**/hub.test.ts
- [pending] shared/data-hub/**tests**/integration/compute.integration.test.ts
- [pending] shared/data-hub/**tests**/integration/framework-detection.integration.test.ts
- [pending] shared/data-hub/**tests**/integration/hub.integration.test.ts
- [pending] shared/data-hub/**tests**/integration/providers.integration.test.ts
- [pending] shared/data-hub/**tests**/jira-provider.test.ts
- [pending] shared/data-hub/**tests**/metrics/csv.test.ts
- [pending] shared/data-hub/**tests**/metrics/json-exporter.test.ts
- [pending] shared/data-hub/**tests**/persistence-cache.test.ts
- [pending] shared/data-hub/**tests**/persistence-st1.test.ts
- [pending] shared/data-hub/**tests**/persistence-st3.test.ts
- [pending] shared/data-hub/**tests**/persistence.test.ts
- [pending] shared/data-hub/**tests**/providers/composite-provider.test.ts
- [pending] shared/data-hub/**tests**/providers/github-provider.test.ts
- [pending] shared/data-hub/**tests**/providers/gitlab-expanded.test.ts
- [pending] shared/data-hub/**tests**/providers/gitlab-provider.test.ts
- [pending] shared/data-hub/**tests**/providers/jira-provider.test.ts
- [pending] shared/data-hub/**tests**/providers/xray-expanded.test.ts
- [pending] shared/data-hub/**tests**/quality-ingest.test.ts
- [pending] shared/data-hub/**tests**/quality.test.ts
- [pending] shared/data-hub/**tests**/raw-merge.test.ts
- [pending] shared/data-hub/**tests**/rawdata-schema.test.ts
- [pending] shared/data-hub/**tests**/schemas.test.ts
- [pending] shared/data-hub/**tests**/test-source-fallback.property.test.ts
- [pending] shared/data-hub/**tests**/test-source-fallback.test.ts
- [pending] shared/data-hub/**tests**/xray-integration.test.ts
- [pending] shared/data-hub/**tests**/xray-provider.test.ts
- [pending] shared/data-hub/extractors/**tests**/annotations-extractor.test.ts
- [pending] shared/data-hub/extractors/**tests**/commit-log-extractor.test.ts
- [pending] shared/data-hub/extractors/**tests**/coverage-extractor-branches.test.ts
- [pending] shared/data-hub/extractors/**tests**/coverage-files-extractor-full.test.ts
- [pending] shared/data-hub/extractors/**tests**/coverage-files-extractor.test.ts
- [pending] shared/data-hub/extractors/**tests**/failure-classifier.test.ts

## B2.2 — primitives/invariants/test-utils tests (20)

- [pending] shared/invariants/**tests**/numeric.test.ts
- [pending] shared/invariants/**tests**/resource-utils.test.ts
- [pending] shared/invariants/**tests**/text-utils.test.ts
- [pending] shared/invariants/**tests**/types.test.ts
- [pending] shared/primitives/**tests**/badge.test.ts
- [pending] shared/primitives/**tests**/card.test.ts
- [pending] shared/primitives/**tests**/chart.test.ts
- [pending] shared/primitives/**tests**/form.test.ts
- [pending] shared/primitives/**tests**/layout.test.ts
- [pending] shared/primitives/**tests**/table.test.ts
- [pending] shared/test-utils/**tests**/assertions.test.ts
- [pending] shared/test-utils/**tests**/constants.test.ts
- [pending] shared/test-utils/**tests**/mock-modules.test.ts
- [pending] shared/test-utils/factories/**tests**/config-factory.test.ts
- [pending] shared/test-utils/factories/**tests**/context-factory.test.ts
- [pending] shared/test-utils/factories/**tests**/git-provider-factory.test.ts
- [pending] shared/test-utils/factories/**tests**/jira-resource-factory.test.ts
- [pending] shared/test-utils/factories/**tests**/link-manager-factory.test.ts
- [pending] shared/test-utils/factories/**tests**/response-factory.test.ts
- [pending] shared/test-utils/factories/**tests**/test-execution-creator-factory.test.ts

## B2.3 — tests/** (integration/e2e repo-level)

- (vazio — nenhum arquivo de teste repo-level fora dos blocos já listados)

## B3 — git_triggers (42)

- [pending] git_triggers/**tests**/ai-pr-desc.test.ts
- [pending] git_triggers/**tests**/ai-test-impact.test.ts
- [pending] git_triggers/**tests**/batch-mode.test.ts
- [pending] git_triggers/**tests**/case00-handler.test.ts
- [pending] git_triggers/**tests**/cli-args.test.ts
- [pending] git_triggers/**tests**/cli-dispatch-selfhost.test.ts
- [pending] git_triggers/**tests**/cli-dispatch.test.ts
- [pending] git_triggers/**tests**/git-provider-base.test.ts
- [pending] git_triggers/**tests**/git-provider-factory.property.test.ts
- [pending] git_triggers/**tests**/git-provider-factory.test.ts
- [pending] git_triggers/**tests**/github-api.test.ts
- [pending] git_triggers/**tests**/github-branch.test.ts
- [pending] git_triggers/**tests**/github-expanded.test.ts
- [pending] git_triggers/**tests**/github-issues.test.ts
- [pending] git_triggers/**tests**/github-pr.test.ts
- [pending] git_triggers/**tests**/github-workflow.test.ts
- [pending] git_triggers/**tests**/github_manager.test.ts
- [pending] git_triggers/**tests**/gitlab-api.test.ts
- [pending] git_triggers/**tests**/gitlab-branch.test.ts
- [pending] git_triggers/**tests**/gitlab-issues.test.ts
- [pending] git_triggers/**tests**/gitlab-pr.test.ts
- [pending] git_triggers/**tests**/gitlab-workflow.test.ts
- [pending] git_triggers/**tests**/gitlab_manager.test.ts
- [pending] git_triggers/**tests**/integration-handlers.test.ts
- [pending] git_triggers/**tests**/integration/interactive-showDataHubSummary.integration.test.ts
- [pending] git_triggers/**tests**/integration/pipeline-health.integration.test.ts
- [pending] git_triggers/**tests**/integration/session-state-ensureDataHub.integration.test.ts
- [pending] git_triggers/**tests**/interactive-mode.test.ts
- [pending] git_triggers/**tests**/llm-pipeline.test.ts
- [pending] git_triggers/**tests**/main.test.ts
- [pending] git_triggers/**tests**/mr-handler.test.ts
- [pending] git_triggers/**tests**/nivelar.test.ts
- [pending] git_triggers/**tests**/pipeline-handler.test.ts
- [pending] git_triggers/**tests**/pipeline-health-html.property.test.ts
- [pending] git_triggers/**tests**/pipeline-health.test.ts
- [pending] git_triggers/**tests**/pipeline-jira.test.ts
- [pending] git_triggers/**tests**/pr-report-reconfig-inject.test.ts
- [pending] git_triggers/**tests**/pr-report-setup-handler.test.ts
- [pending] git_triggers/**tests**/schedule-handler.test.ts
- [pending] git_triggers/**tests**/session-state.test.ts
- [pending] git_triggers/**tests**/test-results.test.ts
- [pending] git_triggers/**tests**/ui-helpers.test.ts

## B4 — jira_management (73)

- [pending] jira_management/**tests**/constants.test.ts
- [pending] jira_management/**tests**/coverage-cloud.test.ts
- [pending] jira_management/**tests**/coverage.test.ts
- [pending] jira_management/**tests**/create_tests.test.ts
- [pending] jira_management/**tests**/csv-import-schema.test.ts
- [pending] jira_management/**tests**/csv_resource.test.ts
- [pending] jira_management/**tests**/dashboard-handlers.test.ts
- [pending] jira_management/**tests**/import-loop.test.ts
- [pending] jira_management/**tests**/import-orchestrator.test.ts
- [pending] jira_management/**tests**/import-prep-parsers.test.ts
- [pending] jira_management/**tests**/import-prep-preview.test.ts
- [pending] jira_management/**tests**/import-prep-validation.test.ts
- [pending] jira_management/**tests**/import-prep.test.ts
- [pending] jira_management/**tests**/import-safety-harness.test.ts
- [pending] jira_management/**tests**/integration-handlers.test.ts
- [pending] jira_management/**tests**/integration-menu-connectivity.test.ts
- [pending] jira_management/**tests**/issue-linker.test.ts
- [pending] jira_management/**tests**/jira-resource-sprint-cloud.test.ts
- [pending] jira_management/**tests**/jira-resource-sprint.test.ts
- [pending] jira_management/**tests**/jira-resource-types.test.ts
- [pending] jira_management/**tests**/jira-resource-version.test.ts
- [pending] jira_management/**tests**/jira_link_manager.test.ts
- [pending] jira_management/**tests**/jira_resource.test.ts
- [pending] jira_management/**tests**/link-operations.test.ts
- [pending] jira_management/**tests**/link-types.test.ts
- [pending] jira_management/**tests**/main.test.ts
- [pending] jira_management/**tests**/mapping-file-generator.test.ts
- [pending] jira_management/**tests**/menu-data.test.ts
- [pending] jira_management/**tests**/package_version_manager.test.ts
- [pending] jira_management/**tests**/precondition-handler.test.ts
- [pending] jira_management/**tests**/precondition-importer.test.ts
- [pending] jira_management/**tests**/precondition-matcher.test.ts
- [pending] jira_management/**tests**/result_reporter-cloud.test.ts
- [pending] jira_management/**tests**/result_reporter.test.ts
- [pending] jira_management/**tests**/test-case-factory.test.ts
- [pending] jira_management/**tests**/test-execution-creator-cloud.test.ts
- [pending] jira_management/**tests**/test-execution-creator.test.ts
- [pending] jira_management/**tests**/ui-helpers.test.ts
- [pending] jira_management/**tests**/xray-client.test.ts
- [pending] jira_management/**tests**/xray-history.test.ts
- [pending] jira_management/commands/**tests**/case01.integration.test.ts
- [pending] jira_management/commands/**tests**/case01.test.ts
- [pending] jira_management/commands/**tests**/case02.integration.test.ts
- [pending] jira_management/commands/**tests**/case02.test.ts
- [pending] jira_management/commands/**tests**/case03.test.ts
- [pending] jira_management/commands/**tests**/case04.test.ts
- [pending] jira_management/commands/**tests**/case05.test.ts
- [pending] jira_management/commands/**tests**/case06.test.ts
- [pending] jira_management/commands/**tests**/case07.test.ts
- [pending] jira_management/commands/**tests**/case08.test.ts
- [pending] jira_management/commands/**tests**/case09.test.ts
- [pending] jira_management/commands/**tests**/case10.test.ts
- [pending] jira_management/commands/**tests**/case11.test.ts
- [pending] jira_management/commands/**tests**/case12.test.ts
- [pending] jira_management/commands/**tests**/case13.test.ts
- [pending] jira_management/commands/**tests**/case14.test.ts
- [pending] jira_management/commands/**tests**/case15.test.ts
- [pending] jira_management/commands/**tests**/case16.test.ts
- [pending] jira_management/commands/**tests**/case17-helpers.test.ts
- [pending] jira_management/commands/**tests**/case17.test.ts
- [pending] jira_management/commands/**tests**/case18.schema.test.ts
- [pending] jira_management/commands/**tests**/case18.test.ts
- [pending] jira_management/commands/**tests**/case19.test.ts
- [pending] jira_management/commands/**tests**/case20.test.ts
- [pending] jira_management/commands/**tests**/case21.test.ts
- [pending] jira_management/commands/**tests**/case22.test.ts
- [pending] jira_management/commands/**tests**/case23.test.ts
- [pending] jira_management/commands/**tests**/case24.test.ts
- [pending] jira_management/commands/**tests**/case26.test.ts
- [pending] jira_management/commands/**tests**/context.test.ts
- [pending] jira_management/commands/**tests**/handlers.test.ts
- [pending] jira_management/commands/**tests**/index.test.ts
- [pending] jira_management/commands/**tests**/test-execution-flow.test.ts

## B5 — scripts (8)

- [pending] scripts/**tests**/audit-suppressions.test.ts
- [pending] scripts/**tests**/audit/structural.test.ts
- [pending] scripts/**tests**/eslint-plugins/no-swallow.test.ts
- [pending] scripts/**tests**/opencode-db-maintenance.test.ts
- [pending] scripts/**tests**/qa.test.ts
- [pending] scripts/**tests**/quality-check.test.ts
- [pending] scripts/**tests**/validation-hook.test.ts
- [pending] scripts/**tests**/validation-hook.units.test.ts

## B6 — setup (14)

- [pending] setup/**tests**/builder/workflow-builder.test.ts
- [pending] setup/**tests**/config-writer.integration.test.ts
- [pending] setup/**tests**/config-writer.test.ts
- [pending] setup/**tests**/detector.integration.test.ts
- [pending] setup/**tests**/detector.test.ts
- [pending] setup/**tests**/main.test.ts
- [pending] setup/**tests**/reporter-ast.test.ts
- [pending] setup/**tests**/reporter-isolate.test.ts
- [pending] setup/**tests**/reporter-security.test.ts
- [pending] setup/**tests**/secure-io.test.ts
- [pending] setup/**tests**/templates/github-ci.test.ts
- [pending] setup/**tests**/templates/gitlab-ci.test.ts
- [pending] setup/**tests**/templates/pre-push-hook.test.ts
- [pending] setup/**tests**/templates/qa-post-process-workflow.test.ts

## B7 — e2e (13)

- [pending] e2e/**tests**/_min-test.test.ts
- [pending] e2e/**tests**/csv-import-errors.test.ts
- [pending] e2e/**tests**/csv-import.test.ts
- [pending] e2e/**tests**/entry-to-project.test.ts
- [pending] e2e/**tests**/friendly-error-paths.test.ts
- [pending] e2e/**tests**/gen-report-complete.test.ts
- [pending] e2e/**tests**/handlers-happy-paths.test.ts
- [pending] e2e/**tests**/llm-pipeline.test.ts
- [pending] e2e/**tests**/result-pipeline.test.ts
- [pending] e2e/**tests**/smoke-jira-cloud.test.ts
- [pending] e2e/**tests**/smoke-startup.test.ts
- [pending] e2e/**tests**/smoke-xray-cloud.test.ts
- [pending] e2e/**tests**/testexec.test.ts
