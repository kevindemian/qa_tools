# TASK: 7-Layer — Layer 4 Log Parser (Robustez)

> **Parte do plano DataHub SSOT.** Reorganizado de `data-hub-ssot-enforcement.md` (2026-07-12).
> Documento original preservado (marcado SUPERSEDED).
> **STATUS: ✅ CONCLUÍDO (Fase L4 — Extração Profunda + Xray, executada 2026-07-11).**
> ⚠️ **INCONSISTÊNCIA DE NOMENCLATURA (detectada 2026-07-12):** o nome do arquivo (`logparser`) e o título de capítulo original ("Robustez da Camada 4 / Job Logs / zero-dep") referem-se à tarefa de robustez do `log-parser.ts` (L4.0–L4.7). Porém o **corpo deste arquivo contém a Fase L4 de Extração Profunda + Xray** (providers Xray/ST-1/PM-1/LA-1/XR-1/PM-4/ST-3/MENU/WIRE), já executada. A tarefa real de robustez do log-parser (L4-G1..G9, L4.0..L4.7) está documentada em `TASK-22-corrections.md` (seção "FASE L4 — Robustez da Camada 4 (Job Logs)"). Requer reconciliação de nomenclatura/realocação pelo usuário.

## FASE L4 — Extração Profunda (última gota) + Xray

> **Executada:** 2026-07-11
> **Escopo:** GitHub / GitLab / Jira / Coverage (existentes) + **Xray** (novo provider). ADO fora do escopo.
> **Autorização:** usuário (build mode) — implementar tudo conforme planejado, sem deferir.

### Decisões de arquitetura

1. **Hook de validação versionado (tecnicamente superior):** o hook editado (code-only) agora tem
   source-of-truth versionado no repo em `scripts/validation-hook.ts`; `~/.config/opencode/validation_hook.ts`
   é um **symlink** para esse arquivo. `CONFIG_DIR` do hook resolve sempre para `~/.config/opencode`,
   então o symlink não altera o comportamento nem quebra a inicialização do opencode. `tsc` do repo
   exclui `scripts/validation-hook.ts` (artefato de config; validado por `--test` próprio, 51/51).
2. **Escopo Xray:** `XrayCloudClient` (GraphQL) já existia; criado `XrayDataProvider` (novo).
   ADO não existe como provider → fora do escopo desta fase.
3. **Scratch file** `VALIDATION HOOK ATUALIZADO.txt` removido da working tree.
4. **pre-commit** `.husky/pre-commit`: removida a exclusão redundante `:!BACKLOG.md :!shared/plans/`
   (o hook agora pula `.md` por design).

### Itens implementados

| ID   | Item                                                                                                                               | Arquivo                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| ST-1 | `RawData.xray?: RawXrayData` + `RawXrayTestRun/Execution/Data`; `source` union + `'xray'`                                          | `shared/types/data-hub.ts`                                    |
| PM-1 | `mapIssue` profundo (priority/assignee/reporter/components/fixVersions/sprint/storyPoints/parentKey/statusCategory/resolutionDate) | `shared/data-hub/providers/jira-provider.ts`                  |
| LA-1 | `fromAnnotations` captura `level` + `endLine` + nível `warning`                                                                    | `shared/data-hub/extractors/failure-classifier.ts`            |
| XR-1 | `XrayDataProvider` sobre `XrayCloudClient` (GraphQL, mapeamento defensivo)                                                         | `shared/data-hub/providers/xray-provider.ts` (NOVO)           |
| PM-4 | `CompositeProvider` + `DataHubImpl.mergeRawData` fundem `xray` (dedupe por key/id)                                                 | `composite-provider.ts`, `hub.ts`                             |
| ST-3 | `raw.xray` é payload por fetch (não persistido); `persistence.ts` já persiste MetricsRun/coverage/failure                          | `shared/data-hub/persistence.ts` (revalidado — já satisfeito) |
| MENU | `_showDataHubSummary` renderiza `jiraIssues` + `xray` (execuções/test runs)                                                        | `git_triggers/interactive-mode.ts`                            |
| WIRE | `createDataHub` monta `[gitProvider, XrayDataProvider?]` (config-gated, nunca bloqueia CI)                                         | `shared/data-hub/factory.ts`                                  |

### Testes

- `shared/data-hub/__tests__/jira-provider.test.ts` — extração profunda do Jira.
- `shared/data-hub/__tests__/failure-classifier.test.ts` — anotações failure/warning + log fallback.
- `shared/data-hub/__tests__/xray-provider.test.ts` — mapeamento GraphQL → RawXrayData (client mockado).
- `shared/data-hub/__tests__/xray-integration.test.ts` — CompositeProvider + DataHubImpl.create fundem xray (e2e de merge).

### Condição de "done" (última gota)

Cada provider entrega o máximo de campos suportados pela API; campos ausentes são ignorados por
safeguard clauses (nunca lançam, nunca silenciam). `tsc --noEmit` 0 erros; suíte data-hub verde.

---
