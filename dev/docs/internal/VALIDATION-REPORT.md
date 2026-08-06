# VALIDATION-REPORT — Validação Determinística de Artefatos

> Gerado em 2026-08-05T09:01:26.104Z por `scripts/deterministic-validation.ts` (II.2).
> Protocolo: `dev/docs/internal/VALIDATION-PLAN.md`. Gate local (D6); CI real postergado pós-mutation-testing.

## 1. Resultado por passo

| Passo | Status | Detalhe |
|---|---|---|
| harness | ✅ PASS | 21 HTML artifacts regenerated; doctype=all ok |
| scorecard | ✅ PASS | AQS scorecard: 0 failed; removable=none |
| D1 | ✅ PASS | full vitest passed (pristine env) |
| D2 | ✅ PASS | R8.1–R8.7 content validation passed |
| D3 | ✅ PASS | WCAG ≥ 4.5:1 + renderer determinism (D5) passed |

**Overall: PASS**

## 2. Hashes sha256 dos artefatos HTML (prova de reprodutibilidade)

| Artefato | sha256 |
|---|---|
| ai-comparison.html | `6081a1e479553c5497da0237c97eaf87f931f72d61354178c232ba1fb46b9bb2` |
| ai-effectiveness.html | `6709ca964649764fbd2863b9bb392141f628e111f92f9b92d3facd07efc21d6c` |
| backlog-health.html | `d09e3d433c7ca0265dd92e77c674499d21f231a33095d6a5baff390fc67da046` |
| coverage-gap.html | `8b0227685e8cad32b0b0b940c8b4afe6d8d889f2d402519e00a5eadcda3eb31c` |
| cross-squad-benchmark.html | `020e3d5ce6a0c008dcf3675aa849f9241e3fab1244d95f2f3b0097cc26b293ef` |
| defect-seasonality.html | `b9fc92d38760189dda0a36184fdb136db92c14a72a2a3ce187470ff177a279a6` |
| defect-trend.html | `90ccf4ad664804cd36a0bcc48138188160af66173f2a4b5aef22abfdad4b7d10` |
| developer-profile.html | `cad9e740337877681875ba2ba687e9237d0c18aed1bc57c4d07fbdd63af5a3b7` |
| docs.html | `58c60c77eee9e44d064b4042da682f8a87ab4da9cc234ba5bc8ba6826b9e0a15` |
| flakiness-no-datahub.html | `e08939acbd12ef2a8946da56f3ebf38df2daf6a5675902fe46e4cb5b49526d1e` |
| flakiness.html | `55bb7390063980932476493fd8bbc5de1c66af274cb51a9553cddc8d2cdca1b7` |
| impact-alert.html | `bd2c4252b4980bf0bb8fd8a78caafc5725682aec21dc27611ad382a6691ab190` |
| incident-report.html | `8423a9270dac8502a6bf0b9ca418634180d036f3c368e4d791bb96036514ebc8` |
| pipeline-cost.html | `9522693b8e3cbe7c1dbdd76c181167ae6f8ebc02bf308f1439c855b918a6e2f2` |
| pipeline-health.html | `b4d514cab6277fc5017452c4ec4ef69390e8a537ffbe5185350716e4f79d5c27` |
| release-score.html | `84f641bccca5a3e82303685203ec7841a762dae8346cb42a652323832f101f00` |
| requirement-score.html | `aac2957032d39c06dee8d799c5e7488d8191d13e26a568bc0ca66cebb7ad29a5` |
| silent-regression.html | `e181b799fb593aa5e70d190f485182a506490c820e6e8cf9f76977a1c96e6079` |
| suite-optimization.html | `e5a61856635556a16ee6e23cf4cacc66a273021d5b431dd50ef1a4ad94486192` |
| test-report.html | `7f892d82ceb9886e601ef1acbf58c66d0e6ef583697c25cb4f12d3dd3e7c236d` |
| traceability.html | `94a2c46706d31c0a3b9a411072436e13ed457edd8d69baf09512031b54bbda39` |

Re-prova: re-rodar `deterministic-validation.ts` e comparar — hashes idênticos = prova determinística (Fase III.3).

## 3. Scorecard (I-9.3)

```json
{
    "artifacts": [
        {
            "specId": "ai-effectiveness",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Acceptance Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Records",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Modified",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Deleted",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Top Version",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Sample Size",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Version Breakdown",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Daily Trend",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "sample-size-warning",
                    "status": "pass",
                    "weight": 1,
                    "details": "aviso de sample presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "ai-comparison",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: AI Pass Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Manual Pass Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: AI Sample",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Manual Sample",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: AI Flakiness",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Manual Flakiness",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Advantage Analysis",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Sample Size Warning",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Version Breakdown",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "sample-size-warning",
                    "status": "pass",
                    "weight": 1,
                    "details": "aviso de sample presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "incident-report",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Overall Severity",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Events",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: High Severity",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Medium Severity",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Low Severity",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Events Timeline",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Per-Type Count Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "impact-alert",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Critical",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Warning",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Info",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Alerts",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Alert Cards",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "traceability",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Total Epics",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Tests",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Coverage",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Avg Flakiness",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Traceability Tree",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Uncovered Epics Highlight",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Awareness Section",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "flakiness",
            "score": 91,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Flaky Tests",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Flaky Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: High Flakiness",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Threshold",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Flaky Tests Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Source Quality Banner",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "sample-size-warning",
                    "status": "fail",
                    "weight": 1,
                    "details": "spec.sampleSizeWarning=true mas aviso de sample ausente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "backlog-health",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Health Score",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Stale Issues",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Unassigned",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Bugs w/o Tests",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Issues",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Stale Issues",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Density by Epic",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "pipeline-cost",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Total Cost",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Avg Cost/Run",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Duration",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Run Count",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Cost/Minute",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Cost per Run Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "suite-optimization",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Tests to Optimize",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Potential Savings",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Slow Threshold",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Flaky Threshold",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Duration",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Optimization Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Action Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "cross-squad-benchmark",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Average Score",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Score Range",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Std Deviation",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Top Squad",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Bottom Squad",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Squad Count",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Leaderboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Score Distribution",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "release-score",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Release Gate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Score",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Grade",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Checks Passed",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Breakdown",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommendation",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "silent-regression",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Regressions Found",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Avg Increase",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Threshold (z)",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Tests",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Regression Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "defect-trend",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Top Category",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Defects",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Trend Direction",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Avg Defects/Day",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Trend Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "defect-seasonality",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Peak Day",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Peak Hour",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Records",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Avg Defects/Day",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Day of Week Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Hour of Day Table",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "developer-profile",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Total Authors",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Total Failures",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Top Contributor",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Top Failure Author",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Author Ranking",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Category Ranking",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "requirement-score",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Requirements",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Overall Score",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Acceptance Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Kept/Modified/Deleted",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Generated Tests",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Score Breakdown",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Recommended Actions",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "coverage-gap",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Total Issues",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Covered",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Gaps",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Weighted Coverage",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Raw Coverage",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Quality Gate",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Coverage by Epic",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Hierarchy",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Coverage Gaps",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        },
        {
            "specId": "report-html",
            "score": 75,
            "overall": "warn",
            "checks": [
                {
                    "name": "Metric: Passed",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Failed",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Skipped",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Pass Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Duration",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Failed Tests",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Charts",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Trends",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Quality Gate",
                    "status": "fail",
                    "weight": 1,
                    "details": "seção obrigatória ausente do output: \"Quality Gate\""
                },
                {
                    "name": "Section: Health Score",
                    "status": "fail",
                    "weight": 1,
                    "details": "seção obrigatória ausente do output: \"Health Score\""
                },
                {
                    "name": "Section: Test Table",
                    "status": "fail",
                    "weight": 1,
                    "details": "seção obrigatória ausente do output: \"Test Table\""
                },
                {
                    "name": "Section: Diff Comparison",
                    "status": "fail",
                    "weight": 1,
                    "details": "seção obrigatória ausente do output: \"Diff Comparison\""
                },
                {
                    "name": "Section: Timeline",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": [
                "Quality Gate",
                "Health Score",
                "Test Table",
                "Diff Comparison"
            ]
        },
        {
            "specId": "pipeline-health",
            "score": 100,
            "overall": "pass",
            "checks": [
                {
                    "name": "Metric: Total Runs",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Passed",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Failed",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Pass Rate",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Metric: Avg Duration",
                    "status": "pass",
                    "weight": 1,
                    "details": "métrica presente no output"
                },
                {
                    "name": "Section: Summary",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Top Failing Jobs",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Failure Intelligence",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "Section: Branch Breakdown",
                    "status": "pass",
                    "weight": 1,
                    "details": "seção presente no output"
                },
                {
                    "name": "timestamp",
                    "status": "pass",
                    "weight": 1,
                    "details": "data-part=\"timestamp\" presente"
                },
                {
                    "name": "data-dashboard",
                    "status": "pass",
                    "weight": 1,
                    "details": "atributo data-dashboard presente"
                }
            ],
            "missingSections": []
        }
    ],
    "unscored": [
        {
            "specId": "schedule-handler",
            "status": "nao-aplicavel",
            "note": "orchestrator — não gera artefato standalone"
        },
        {
            "specId": "interactive-mode",
            "status": "nao-aplicavel",
            "note": "orchestrator — não gera artefato standalone"
        },
        {
            "specId": "pr-report-markdown",
            "status": "gate-proprio",
            "note": "pr-report gate próprio (teto T2)"
        },
        {
            "specId": "pr-report-job-summary",
            "status": "gate-proprio",
            "note": "pr-report gate próprio (teto T2)"
        },
        {
            "specId": "pr-report-html",
            "status": "gate-proprio",
            "note": "pr-report gate próprio (teto T2)"
        }
    ],
    "total": 19,
    "passed": 18,
    "failed": 0,
    "removable": []
}
```
