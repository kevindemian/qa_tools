# TASK: Fase 22 — Corrections (Retomada / Re-escopo / Re-auditoria)

> **Parte do plano DataHub SSOT.** Reorganizado de `data-hub-ssot-enforcement.md` (2026-07-12).
> Documento original preservado (marcado SUPERSEDED). Este é o documento de verdade para as correções da Fase 22.
> **STATUS: 📋 DOCUMENTO DE REFERÊNCIA (tracking).** FASE 8/C = ✅ CONCLUÍDO · WS1 = SUPERSEDED (2026-07-13: `saveMetricsStore` retido na interface `DataHub` como facade delegate; `persistence` é `private` — `hub.ts:105`; `types/data-hub.ts:663` proíbe acesso direto. Remoção reabriria encapsulamento ou forçaria `createDataHubPersistence()` direto — anti-padrão do facade. Sem alteração de código.) · WS2 = ✅ CONCLUÍDO (2026-07-12: guarda `no-restricted-syntax` estendida em `eslint.config.mjs` para `new Store(` + `import store.js`; verificada por probe) · WS3 = ✅ RESOLVIDO (2026-07-12: débito N2-B documentado em `quarantine.ts` como false positive; severity-1, CI não afetado). Não há tarefa executável livre neste doc.

## PLANO DE RETOMADA — Consolidado (2026-07-11)

> **Base:** reavaliação direta de código (`tsc`/`vitest`/`eslint`/grep) do plano + correção do plano obsoleto `.mimocode/plans/1783732539632-shiny-wolf.md`
> **Estado verificado:** `tsc --noEmit` = 0 erros · `vitest run` = 6343 pass / 9 skip · Fases 0–6, 10.1 (ESLint) e Dimension 5 = concluídas
> **Gaps ainda abertos:** G4, G12, G13, G14, G16, G18 + novos N1, N2, N3, N4, N5, N6, N7

### PRINCÍPIOS

- Cada tarefa é atômica, testável, verificável (comando exato) e commitável isoladamente.
- Fases são sequenciais onde há dependência; Blocos independentes podem ser paralelizados.
- Nenhum checkpoint passa por workaround/suppress de regra de segurança.

### DECISÕES REGISTRADAS (2026-07-11)

- **N3 = (A)** `dataHub` obrigatório em `pr-report-core.ts` (Invariant 8). Escopo estrito: só `pr-report-core`; `traceability-matrix`/`pipeline-cost` ficam como estão (não citados no invariante).
- **N2 = (B)** Reescopar checkpoint de auditoria para validar apenas as regras SSOT (que passam); os 426 warnings `security/detect-non-literal-fs-filename` viram **débito separado e agendado** (tarefa dedicada fora deste plano). Regra de segurança NÃO é suprimida. Se o CI usar `eslint --max-warnings=0`, ele permanece vermelho até o débito ser resolvido.
- **EH-2** (`String(err)` ~50 sítios) = débito à parte, fora do escopo SSOT.
- **TECHDOC.md** será atualizado (tarefa E4).
- **Phase 9** executada APÓS a deleção total dos produtores deprecados (C4).
- **Phase 11** executada por ÚLTIMO (pendências antigas antes de novas).
- Plano `.mimocode/plans/1783732539632-shiny-wolf.md` marcado como **SUPERSEDED**.

### ORDEM DE EXECUÇÃO

```
FASE A — Error Handling (EH-6/EH-7)        [novo, não coberto antes]
  A1 interactive-mode: _getErrorMessage → formatErr
  A2 setup/*: corrigir catch{} silenciosos
  A3 framework-detector: String(err) → extractErrorMessage
FASE B — Interface/Export (G4)
  B1 remover export de createDataHubPersistence
FASE C — Deleção fontes alternativas (G12/G13/G14)
  C1 migrar buildCommitLog p/ data-hub  (PRÉ-REQUISITO de C2 — R2)
  C2 deletar commit-log.ts
  C3 deletar ci-test-downloader.ts
  C4 deletar coverage-source.ts
FASE 9 — Consumidores silenciosos (após C4)
  9.1 tsc --noEmit + vitest run full; corrigir o que quebrar
FASE E — Invariant 8 + Auditoria + Docs
  E1 pr-report-core: dataHub obrigatório (N3-A)
  E2 reescopar checkpoint eslint p/ regras SSOT; abrir PR débito 426 (N2-B)
  E3 auditoria Fase 7 (comandos A–J) → PROGRESS.md (G18)
  E4 atualizar docs/TECHDOC.md (Phase 10.2)
FASE D — Phase 11 Reporter Detection (G16)
  D1 pesquisa viabilidade AST/híbrido
  D2 implementar detecção híbrida
FASE F — Limpeza
  F1 remover mocks mortos (N6)
  F2 corrigir inconsistência EH-8 no plano (N7)
  F3 marcar .mimocode/plans/1783732539632-shiny-wolf.md como SUPERSEDED
```

### FASE A — Error Handling (EH-6 / EH-7) — CHECKPOINTS

**A1 — `interactive-mode.ts`: `_getErrorMessage` → `formatErr` (N1 / EH-6)**

- Ação: substituir as 14 ocorrências de `_getErrorMessage(err)` por `formatErr(err)`; deletar a função (def L841). NUNCA catch vazio; `formatErr` já faz `extractErrorMessage`+`humanizeError`.
- Checkpoint:
    ```bash
    rg "_getErrorMessage" git_triggers/interactive-mode.ts           # 0
    npx tsc --noEmit
    npx vitest run git_triggers/interactive-mode.test.ts            # 100% pass
    ```
- Commit: `fix(error-handling): replace _getErrorMessage with formatErr in interactive-mode (EH-6)`

**A2 — `setup/*`: verificar e corrigir `catch {}` silenciosos (N4 / EH-7)**

- Ação: `setup/detector.ts:95,140,154`, `setup/main.ts:26`, `setup/builder/workflow-builder.ts:82`, `setup/config-writer.ts:37` — inspecionar corpo; onde não loga, adicionar `rootLogger.warn(extractErrorMessage(err))`. Proibir catch vazio.
- Checkpoint:
    ```bash
    npx vitest run setup/                                          # 100% pass
    ```
- Commit: `fix(error-handling): eliminate silent catches in setup modules (EH-7)`

**A3 — `framework-detector.ts`: `String(err)` → `extractErrorMessage` (N5)**

- Ação: `shared/data-hub/extractors/framework-detector.ts:36` usar `extractErrorMessage(err)`.
- Checkpoint:
    ```bash
    rg "String\(err\)" shared/data-hub/extractors/                 # 0
    npx vitest run shared/data-hub/__tests__/extractors/          # 100% pass
    ```
- Commit: `fix(error-handling): use extractErrorMessage in framework-detector`

### FASE B — Interface/Export (G4)

**B1 — `createDataHubPersistence`: confirmar ausência de consumidor externo + documentar como factory interno**

- **Correção de curso (2026-07-11):** o plano original dizia "remover o `export`". Verificado que `factory.ts:55` obtém `createDataHubPersistence` via `(await import('./persistence.js')).createDataHubPersistence(repo)` — o que **exige** o `export`. Remover o `export` quebra `tsc` e runtime (TypeError na criação de todo DataHub). Em ESM, um módulo não pode chamar função não-exportada de outro módulo no mesmo pacote.
- **Verificação (grep):** `createDataHubPersistence` só é referenciado em `persistence.ts` (def), `factory.ts:55` (dynamic import, DENTRO de `shared/data-hub/`), e em testes. **Zero consumidor de produção fora de `shared/data-hub/`.** Logo o defeito real do G4 (vazamento externo) **não existe**.
- **Ação (root-cause, sem quebrar origem):**
    1. Manter `createDataHubPersistence` exportado — é API interna de `shared/data-hub/`, usada unicamente por `createDataHub` (factory.ts).
    2. Adicionar JSDoc explicitando que é o factory de persistence interno do DataHub, não parte da API pública.
    3. `factory.ts:55`: tornar o acoplamento interno explícito (import estático em vez de dynamic import), sem alterar comportamento.
- **Checkpoint:**
    ```bash
    npx tsc --noEmit
    rg "createDataHubPersistence" --include='*.ts' -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'  # 0 (sem consumidor externo)
    npx vitest run shared/data-hub/                              # 100% pass
    ```
- Commit: `refactor(data-hub): document createDataHubPersistence as internal factory; no external consumer (G4)`

### FASE C — Deleção de Fontes Alternativas (G12/G13/G14) — ORDEM CRÍTICA

**C1 — Migrar `buildCommitLog` p/ dentro de `data-hub` (N8 / R2 — PRÉ-REQUISITO)**

- **Decisão de design (2026-07-11):** OPÇÃO A — novo `shared/data-hub/extractors/commit-log-extractor.ts`. Justificativa técnica: (1) SRP — providers buscam dados brutos da API; `buildCommitLog` é transformação pura (runs→log), ortogonal a I/O. (2) Consistência com `extractors/` existente (`framework-detector`, `failure-classifier`, `coverage-extractor`). (3) Testabilidade — função pura isolada, sem instanciar provider. (4) DIP — extractor não depende de provider; provider depende do extractor. (Opções B=absorver no provider e C=base class foram rejeitadas: duplicação/SRP violado e over-engineering/acoplamento por herança, respectivamente.)
- Ação: mover `buildCommitLog` (e os tipos/helpers de que depende) para `shared/data-hub/extractors/commit-log-extractor.ts`; atualizar `github-provider.ts`, `gitlab-provider.ts` para importar de `../extractors/commit-log-extractor.js`.
- Checkpoint:
    ```bash
    rg "from.*commit-log" shared/data-hub/providers/             # 0
    npx tsc --noEmit
    npx vitest run shared/data-hub/__tests__/providers/          # 100% pass
    ```
- Commit: `refactor(data-hub): internalize buildCommitLog — unblock commit-log deletion`

**C2 — Deletar `shared/commit-log.ts` (G14)**

- Checkpoint: `rg "commit-log" --include='*.ts' -g '!__tests__' -g '!*.test.ts' -g '!docs' -g '!plans' # 0` ; `npx vitest run`
- Commit: `refactor(data-hub): delete commit-log alternative source`

**C3 — Deletar `shared/ci-test-downloader.ts` (G12)**

- Pré: confirmar 0 consumidores de produção (`session-context.ts` já migrado — comentário L21).
- Checkpoint: `rg "ci-test-downloader" --include='*.ts' -g '!__tests__' -g '!*.test.ts' -g '!docs' -g '!plans' # 0` ; `npx vitest run`
- Commit: `refactor(data-hub): delete ci-test-downloader alternative source`

**C4 — Deletar `shared/coverage-source.ts` (+ testes) (G13)**

- Pré: `coverage-source` sem consumidores de produção (só testes).
- Checkpoint: `rg "coverage-source" --include='*.ts' -g '!docs' -g '!plans' # 0` ; `npx vitest run`
- Commit: `refactor(data-hub): delete coverage-source alternative source`

### FASE 9 — Consumidores Silenciosos (após E1)

> **Ordem (dependency-ordered):** executada APÓS **E1**. `batch-mode.generatePrReportIfNeeded` é chamador de `generatePrReport` (`pr-report-core`), cujo contrato obrigatório (DataHub mandatório + Camada 7) é estabelecido em E1. Logo **E1 precede FASE 9** — não o contrário.

- 9.1 Migrar consumidores silenciosos (`batch-mode`, `traceability-matrix`, `pipeline-cost`) para `dataHub: DataHub` obrigatório; remover fallbacks silenciosos; injetar `getDataHub()` onde o caller não o tem; deletar código obsoleto (`buildFlakinessMap`, branch `runs` do MetricsStore).
- Commit: `fix(data-hub): migrate silent consumers to mandatory DataHub (SSOT)`

### FASE E — Invariant 8 + Auditoria + Docs

> **Execução imediata (após C):** **E1 vem ANTES de FASE 9** (dependência de contrato — ver stub de FASE 9). E2/E3/E4 permanecem como fases posteriores de E, executadas em seu momento.

**E1 — `dataHub` obrigatório em `pr-report-core.ts` (N3-A / Invariant 8) + alinhamento Camada 7**

- Ação: tornar `dataHub: DataHub` (não opcional) em `pr-report-core.ts` (L82,186,352,386); atualizar callers; remover fallbacks (`?? []`, `?? undefined`).
- **Alinhamento com a decisão arquitetural das 7 camadas (Camada 7 / fallback manual):** o `main()` de `pr-report-core` DEVE usar o fallback do `DataHub.create` (Camada 7: `applyLayer7Fallback` → `askTestSource`) em vez do atual `warn + return` quando os dados são insuficientes. Três desfechos obrigatórios:
    1. **Interativo (TTY, não-CI) + usuário fornece arquivo** → `askTestSource()` injeta `parsedArtifacts` via `parseTestResultsFile`; `generatePrReport` recebe `dataHub` obrigatório real.
    2. **Interativo + usuário declina** (`USER_SKIPPED`/`USER_CANCELLED`) → `rootLogger.warn('PR Report não gerado: dados de teste insuficientes (usuário declinou o relatório manual).')` + `return` (aviso explícito, sem silêncio, sem parcial).
    3. **Não-interativo (CI / sem TTY / sem `TEST_REPORT_PATH`)** → **erro explícito**: `throw new Error('Falha ao obter dados de teste: sem dados do versionador/Jira e solicitação de relatório manual indisponível em contexto não-interativo.')`. (Corrige divergência: `applyLayer7Fallback` hoje retorna `warning` LAYER7_SKIPPED; a decisão exige ERRO quando a fase de solicitação é pulada.)
- **Correção em `applyLayer7Fallback` (hub.ts):** quando `fallback.error === 'NO_TTY' || 'NO_DATA_SOURCE'` e não há outra fonte de dados, propagar erro (não apenas `skipped: true`).
- Checkpoint:
    ```bash
    rg "dataHub\?: DataHub" shared/pr-report-core.ts            # 0
    npx tsc --noEmit
    npx vitest run shared/__tests__/pr-report*                   # 100% pass
    # testes dos 3 desfechos (forneceu / declinou / não-interativo→erro)
    ```
- Commit: `refactor(pr-report-core): make dataHub mandatory + wire Camada 7 manual fallback (Invariant 8)`

**E2 — Débito ESLint pré-existente (N2-B)**

- Ação: reescopar checkpoint de auditoria para validar apenas regras SSOT; abrir PR dedicado para os 426 warnings `security/detect-non-literal-fs-filename` (não suprimir a regra).
- Checkpoint (SSOT gate): regras `no-restricted-syntax`/`no-restricted-imports` do `eslint.config.mjs` = 0 violações.
- Commit: `chore(eslint): scope audit checkpoint to SSOT rules; open fs-warning debt PR`

**E3 — Auditoria pós-migração (Fase 7) (G18)**

- Ação: executar TODOS os comandos A–J da Fase 7.1; registrar em `audit/functional/PROGRESS.md`.
- Checkpoint:
    ```bash
    npx tsc --noEmit
    npx vitest run --reporter=verbose | tail -10
    rg "loadMetricsStore" --include='*.ts' -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'  # 0
    rg "store\.runs" --include='*.ts' -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'        # 0
    rg "dataHub\?: DataHub" shared/health-score.ts shared/quality-gate.ts shared/pr-report-core.ts   # 0
    ```
- Commit: `audit(ssot): post-migration verification — zero bypasses confirmed`

**E4 — Atualizar `docs/TECHDOC.md` (Phase 10.2)**

- Ação: documentar DataHub como SSOT obrigatório; nenhum módulo fora `data-hub/` acessa MetricsStore/Store.
- Commit: `docs(techdoc): update SSOT architecture — DataHub as mandatory source of truth`

### FASE D — Phase 11 Reporter Detection (G16)

**D1 — Pesquisa de viabilidade**

- Ação: avaliar AST (ts-morph/jscodeshift/esbuild) × package.json deps × regex expandida; documentar decisão.
- Checkpoint: decisão registrada no plano.

**D2 — Implementar detecção híbrida**

- Ação: `setup/detector.ts` — package.json (devDeps) + config files + AST opcional; frameworks vitest/jest/cypress/playwright; formatos CTRF/JUnit/Mochawesome.
- Checkpoint:
    ```bash
    npx tsc --noEmit
    npx vitest run setup/                                        # 0 falhas
    ```
- Commit: `feat(setup): hybrid reporter detection (package.json + config + AST)`

### FASE L4 — Robustez da Camada 4 (Job Logs) — zero-dep + estruturado-first (G19)

**Contexto e Evidência de Pesquisa (2026-07-11):**

Camada 4 (`shared/log-parser.ts`) é o **último recurso** da cascata de extração (após Camadas 1–6 estruturadas). Estado atual: ANSI já é stripado; porém há 6 defeitos de implementação (listados em Gaps) e, mais grave, **a Camada 4 estava concebida como fonte de counts**, o que é incorreto: com token de versionador disponível, Camadas 1/2/3/6 fornecem **dados estruturados** (runs/jobs/artifacts/check-runs/GitLab native). O GitHub expõe resultados de teste em **JSON/JUnit XML** (via artifact) e o GitLab em **JUnit XML**; CSV de test-summary só existe via reporter custom do usuário — não é nativo do GitHub/GitLab. Parsing estruturado (já consumido por `junit-xml-parser.ts` + `artifact-parser.ts`, alimentando `confidence: 'high'`) é o caminho primário para counts.

Pesquisa externa (fontes indicadas pelo usuário) confirma esse ecossistema:

**Detecção/ingestão estruturada (camadas primárias):**

- **gh-ci-artifacts** (jmchilton): "Download and parse GitHub Actions CI artifacts and logs for LLM analysis. Artifact type detection powered by **artifact-detective**, which identifies and validates **20+ test framework and linter output formats**." Saída normalizada: `catalog.json`, `converted/` (NDJSON/JSON), `logs/`.
- **artifact-detective**: valida 20+ formatos de test/linter (CTRF, JUnit, Mochawesome, etc.).
- **testing_artifact_detector**: detecção de artifacts de teste em CI.

**Padrão-ouro de normalização/extração de falha (modelo para a Camada 4):**

- **CTRF** (Common Test Report Format): schema normalizado por teste — campos `name, status (passed/failed/skipped/pending/other), duration, message, trace, suite, rawStatus, filepath, retries, flaky, extra`. Alvo canônico de normalização de `FailureRecord`.
- **Allure**: `statusDetails.{known, muted, flaky, message, trace}`; distinção **`failed` (produto) vs `broken` (infra/ambiente)**; `retriesCount/isRetry`; `severity` (blocker→trivial); `categories` por `messageRegex`/`traceRegex` (buckets de causa-raiz).
- **testmcp**: adapter por framework com **fallback em camadas** (JSON nativo → JUnit XML → stdout regex); Vitest adapter trata **v1 (tasks) e v2+ (jest-style)**; `enrichment/source-context` = parser de stack trace + trecho de código do repo.
- **failure-packager** (`michaelko`): detecta framework, extrai **blocos de falha, assertions, stacks, file references, summary lines**, contexto de ambiente sanitizado, e **trunca log por `--max-log-chars`**. Modelo de "máximo valor para AI" a partir do log.
- **sift**: heurísticas locais primeiro → **buckets de causa-raiz** com âncora e dica de fix; só cai no modelo se heurística incerta ("traceback bruto = last resort").
- **Vitest/pytest**: Vitest auto-detecta AI agent → reporter `minimal` (só falhas); `--reporter=json`/`junit`; formatos **v1≠v2**. Pytest `-r` summary, `-v` por-linha, `--tb=short/long`.

→ Conclusão: counts pertencem à **Camada 2+ (ingestão estruturada via token)**, não a regex de log. A Camada 4 é **camada de detalhe de falha + cross-reference**, alinhada a CTRF/Allure/failure-packager.

**Gaps Encontrados (pesquisa + auditoria de código):**

| #     | Gap                                          | Evidência                                                                                                                                        | Decisão                                                                                   |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------- |
| L4-G1 | 2 páginas de métricas do repo não acessíveis | `GET …/actions/metrics/performance` e `…/usage` retornaram **404** (não públicas; exigem sessão autenticada da UI do GitHub). Não inspecionadas. | REGISTRAR limitação; não bloqueia (CSV de test-summary é fonte estruturada independente). |
| L4-G2 | Camada 4 escopada como fonte de counts       | `log-parser.ts` tratado como produtor de métricas; com token, counts vêm de Camada 2+.                                                           | CORRIGIR — redefinir papel (L4.0).                                                        |
| L4-G3 | **NaN vaza para métricas**                   | `failed`/`skipped` não validados (AGENTS §24.1 violado) em `log-parser.ts`.                                                                      | CORRIGIR (L4.1).                                                                          |
| L4-G4 | **Vitest com falhas não capturado**          | regex `/Tests\s+(\d+)\s+passed/` exige "passed" após o número; Vitest `A failed                                                                  | B passed` mal interpretado (`total = passed` errado).                                     | CORRIGIR (L4.2). |
| L4-G5 | Sem detecção de truncamento                  | logs grandes podem vir truncados sem sinalização.                                                                                                | CORRIGIR (L4.3).                                                                          |
| L4-G6 | Sem `confidence`/`evidence`                  | consumidor não distingue dado robusto de chute.                                                                                                  | CORRIGIR (L4.4).                                                                          |
| L4-G7 | Localização não tratada                      | pytest/mocha em pt-BR quebram extração baseada em keyword inglês.                                                                                | CORRIGIR (L4.5).                                                                          |
| L4-G8 | Stack traces multi-linha truncados           | captura single-line `.{10,200}` perde contexto.                                                                                                  | CORRIGIR (L4.4).                                                                          |
| L4-G9 | Divergência Camada 7 (superficial na L4)     | `applyLayer7Fallback` retorna `warning`/skipped em NO_TTY; decisão exige ERRO quando a fase de solicitação é pulada.                             | Já coberto por E1; não reimplementar aqui.                                                |

**L4.0 — Redefinição de papel (estruturado-first)**

- **Camada 2+ (primário, via token):** `junit-xml-parser.ts` (fast-xml-parser — GitHub JSON/JUnit XML, GitLab JUnit XML), `artifact-parser.ts` (CTRF/Mochawesome/JSON). Alimentam `dataHub.testResults`/`computed` com `confidence: 'high'`. CSV de test-summary (se houver) é reporter custom do versionador, não nativo do GitHub/GitLab; consumido pelo mesmo path estruturado se presente. `csv-importer.ts` real importa `ComputedMetrics` (preocupação distinta, irrelevante para contagens).
- **Camada 4 (job logs) — redefinida:**
    1. _Primário:_ extrair **mensagens de falha, stack traces, contexto de erro** (robusto, estruturado por framework).
    2. _Cross-reference:_ comparar totais derivados de log vs totais estruturados; **divergência é warning explícito de qualidade (nunca silencioso)**.
    3. _Last-resort:_ SOMENTE quando **nenhum** artifact estruturado existe, tentar extração conservadora de totais via regex com `confidence: 'low'` + `evidence` (linhas casadas); **abster-se (retornar `counts: null`) se ambíguo**.

**L4.1 — Fundação segura (NaN-guard obrigatório)**

- Toda extração de count valida `Number.isFinite`; não-finito → aquele source retorna `counts: null` (nunca NaN).
- Invariante de consistência: rejeitar `total !== passed+failed+skipped` (tolerância) → abstém em vez de emitir parcial.

**L4.2 — Registry de parsers por framework/versão (zero-dep)**

- `LogParserRegistry`: vitest v1/v2/v3, jest (spec/dot), mocha (spec/dot), pytest, go, dotnet.
- Cada parser: detecta markers do framework, faz **scan de linhas (máquina de estados)** usando `extractNumberBefore` (já seguro, sem backtracking), extrai passed/failed/skipped/total.
- Vitest correto: `Tests A failed | B passed | C skipped` → `passed=B, failed=A, skipped=C, total=A+B+C`.

**L4.3 — Entrada higiênica + truncamento**

- `stripAnsi` endurecido (CSI + OSC + outros escapes).
- Cap de tamanho de input; detectar linha final incompleta / ausência de terminador conhecido → `confidence` baixa ou abstém counts.

**L4.4 — Falhas multi-linha + confidence/evidence + classificação (CTRF/Allure-aligned)**

- Captura de stack traces com **janela limitada** (ex.: 40 linhas) em vez de `.{10,200}` single-line.
- **`FailureRecord` (forma CTRF/Allure):** `{ name, suite, status (failed|broken|skipped), message, trace, file?, line?, duration?, retries?, flaky?, category, confidence }`. `file`/`line` já previstos (nullable) para o enrichment futuro (ver deferimento abaixo).
- **Classificação em buckets de causa-raiz** (padrão Allure Categories / sift): `assertion`, `timeout`, `network`, `panic/segfault`, `known-bug` (`known`), `environment` (`broken`≠`failed`). Emitir `category` + `confidence`.
- **Detecção de retry/flaky:** marcadores `retried`/`flaky`/`RERUN` → flip GREEN→RED no run.
- Retornar `LogParseResult` com `{ counts, failures, framework, confidence, evidence, truncated, source: 'log' }`.
- **Deferido (documentado, não silencioso — BACKLOG `CDH-L4X1`):** _source-enrichment_ (mapear frame superior do stack → trecho de código do repo, estilo testmcp `enrichment/source-context`). Diferido para manter `log-parser.ts` **desacoplado** (consome só `string`; sem acesso a FS do repo alvo). O `FailureRecord.file?`/`line?` já acomoda o preenchimento posterior sem quebrar contrato.

**L4.5 — Localização best-effort**

- pytest/mocha: capturar **layout numérico posicional** do framework (não keyword em inglês); documentar que output 100% localizado está fora de escopo garantido (caso comum ainda capturado).

**L4.6 — Consumidores**

- `failure-classifier.ts`, `test-count-extractor`: absorvem `confidence`; abstêm quando `counts === null`. Forma atual preservada (campos adicionais opcionais).

**L4.7 — Testes**

- `shared/__tests__/log-parser.test.ts` + `log-parser.property.test.ts`: vitest v1/v2/v3 (com/sem falhas), jest dot/spec, mocha, pytest localizado, go, truncamento, ANSI, **propriedade: nenhum count finito jamais é NaN**, stack trace multi-linha.
- Casos de cross-reference: divergência log × estruturado → warning explícito (nunca silencioso).
- Casos de abstencion: log ambíguo sem artifact estruturado → `counts: null` + `confidence: 'low'`.
- Checkpoint:
    ```bash
    npx tsc --noEmit
    npx vitest run shared/__tests__/log-parser.test.ts shared/__tests__/log-parser.property.test.ts shared/data-hub/__tests__/extractors/
    rg "NaN" shared/log-parser.ts                                   # 0 (nenhum NaN propagado)
    ```
- Commit: `refactor(data-hub): harden Layer 4 log parser — zero-dep, NaN-safe, structured-first, framework/version registry`

### FASE F — Limpeza

**F1 — Remover mocks mortos (N6)**

- Ação: `case17.test.ts` (`vi.mock('../../shared/commit-log')`); `loadRun` mocks residuais em testes.
- Checkpoint: `npx vitest run jira_management/ shared/`
- Commit: `test: remove dead mocks (commit-log, loadRun)`

**F2 — Corrigir inconsistência EH-8 no plano (N7)**

- Ação: documentar que `formatErr(err: unknown): string` é a assinatura correta; código já conforme.
- Commit: `docs(plan): clarify EH-8 — formatErr(err: unknown) is correct signature`

**F3 — Marcar `.mimocode/plans/1783732539632-shiny-wolf.md` como SUPERSEDED**

- Ação: adicionar cabeçalho `> SUPERSEDED — ver PLANO DE RETOMADA no data-hub-ssot-enforcement.md`.
- Commit: `docs(plan): mark stale corrective plan as SUPERSEDED`

---

## PRÓXIMA FASE — Migração de Consumidores (SSOT) — RE-ESCOPADA POR AUDITORIA (2026-07-12)

> **SUPERSEDED (2026-07-12):** a re-auditoria fresca (seção "RE-AUDITORIA FRESCA + PLANO AJUSTADO" no fim do documento) provou que os consumidores de leitura (FASE 1/3/4/5/6) **já estão SSOT em código**. O inventário "23 arquivos / 30+ call sites" desta seção estava obsoleto. O gap real remanescente é a **fonte alternativa legada (`Store`, `shared/store.ts`)**, tratado na seção nova. Esta seção é mantida como histórico de auditoria, não como pendência.

> **Re-escopo por auditoria read-only:** uma re-auditoria fresca (grep/tsc/leitura de código) revelou
> que o inventário "COMPLETE BYPASS INVENTORY" (Categorias A–G) e a "Retomada" estavam **largamente
> já executados** no estado atual do código. O plano anterior (Blocos 1–4) estava obsoleto. Esta seção
> registra o estado VERIFICADO e o único gap genuíno restante, com prova de equivalência (AGENTS §10).

### Estado VERIFICADO (evidência, não suposição)

| Item (inventário)                                               | Estado              | Evidência                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 `commit-log.ts`                                              | **JÁ EXECUTADO**    | arquivo inexistente; `github/gitlab-provider` importam `buildCommitLog` de `extractors/commit-log-extractor.ts`                                                                                                                           |
| C3 `ci-test-downloader.ts`                                      | **JÁ EXECUTADO**    | arquivo inexistente; `session-context.ts:21` confirma remoção                                                                                                                                                                             |
| C4 `coverage-source.ts`                                         | **JÁ EXECUTADO**    | arquivo inexistente; `github-provider` popula `raw.coverage`                                                                                                                                                                              |
| A1/A2/A3 `health-score.ts`                                      | **JÁ EXECUTADO**    | `health-score.ts` não referencia `store.coverageHistory`/`_computeExpWeighted`                                                                                                                                                            |
| A4 `quality-gate.ts`                                            | **JÁ EXECUTADO**    | usa `dataHub.computed.coverage`                                                                                                                                                                                                           |
| A5 `pr-report-core` metricsTrends                               | **JÁ EXECUTADO**    | `pr-report-core` usa `dataHub.computed.*` (linhas 192, 426)                                                                                                                                                                               |
| Categoria D (loadMetricsStore direto)                           | **JÁ EXECUTADO**    | zero callers de produção; regra ESLint SSOT (`eslint.config.mjs:212`) sinaliza violação                                                                                                                                                   |
| `storeRuns` (case17)                                            | **JÁ SSOT**         | `case17.ts:218` = `hub?.computed.metricsRuns ?? []`                                                                                                                                                                                       |
| `calcFlakinessEntries(projectRuns)` / `calcMetricsTrends(runs)` | **JÁ SSOT (dados)** | todos os sítios recebem `hub.computed.metricsRuns` (filtrado por projeto). O hub já chama `calcFlakinessEntries`/`calcMetricsTrends` internamente (`hub.ts:658-659`). Recomputar localmente é _scoping por projeto_, não bypass de dados. |

### Único gap genuíno: lista de quarentena (B4)

`isQuarantined(testTitle)` (`shared/quarantine.ts:201`) lê `quarantine.json` **diretamente** via
`loadAndExpire()`; o `DataHub` **não é dono** desse dado. O `computed.quarantineStatus` do hub é
**derivado de flaky-rate** (`calcQuarantineStatus(flakyRate)`), portanto **NÃO é equivalente** à
lista de quarentena (B4 do inventário estava incorreto ao equiparar os dois). O único consumidor de
produção de `isQuarantined` é `pr-report-core.ts` (linhas 198, 208).

**Correção na origem (root-cause, AGENTS §4):**

1. O hub passa a **ser dono** da quarentena: `DataHubImpl` carrega `loadQuarantine()` em todos os 4
   pontos de construção e expõe `getQuarantine(): QuarantineStore`.
2. `pr-report-core.buildFlakySection(dataHub)` passa a ler `dataHub.getQuarantine().entries` (caminho
   de produção 100% SSOT). `isQuarantined` permanece como loader canônico (usado em testes/standalone),
   sem comportamento alterado.

**Prova de equivalência:** `getQuarantine()` retorna o mesmo `QuarantineStore` que `isQuarantined`
lia (`loadQuarantine()` lê o mesmo arquivo; a expiração é responsabilidade de `loadAndExpire`/cron e
não afeta a leitura de produção). `pr-report-core` obtém `boolean` idêntico via `.entries.some(...)`.

### Preservações deliberadas (NÃO são bypass de SSOT)

- **`e2e/gen-report-complete.ts`** — scaffolding de fixture (lê `fixtures/ctrf-report.json`, sem hub).
  Ferramenta de teste, não fluxo de dados de produção. Forçar hub é over-engineering (AGENTS §21).
- **`case17.ts --extra-run file`** — arquivo de report fornecido explicitamente via CLI como entrada
  discreta (`TestRunTab`). O fluxo primário do `case17` já usa `getDataHub()` (linha 158/216). Entrada
  de usuário ≠ fonte que o hub deve possuir.

### Implementação (escopo real)

```
data-hub/quarantine-ssot:
  shared/types/data-hub.ts        → interface DataHub: + getQuarantine(): QuarantineStore
  shared/data-hub/hub.ts          → DataHubImpl carrega loadQuarantine() nos 4 construtores; getQuarantine()
  shared/pr-report-core.ts        → buildFlakySection usa dataHub.getQuarantine().entries (remove isQuarantined)
  shared/test-utils/.../data-hub-mock.ts → + getQuarantine no makeDataHubMock
  teste                           → hub.getQuarantine() retorna QuarantineStore; pr-report roteia pelo hub
```

### Checkpoints / critérios de auditoria

```bash
npx tsc --noEmit                                                       # 0 erros
npx vitest run shared/data-hub shared/__tests__/integration shared/pr-report*   # 100% pass
rg -rn "loadAndExpire\(|loadMetricsStore\(" shared --glob '!**/*.test.ts' \
   --glob '!**/__tests__/**' | rg -v "data-hub/|eslint.config|audit/|BACKLOG|PROGRESS|SHA.md|plans/|.md:"  # 0 (fora de quarantine.ts)
rg -n "isQuarantined\(" shared --glob '!**/*.test.ts' --glob '!**/__tests__/**' | rg -v "quarantine.ts:"   # apenas pr-report (agora via hub) ou 0
npm run lint                                                         # 0 violações
```

Auditoria final (manual, além de testes): confirmar que (a) `getQuarantine` existe em interface+impl+mock;
(b) `pr-report-core` não importa mais `isQuarantined`; (c) nenhum leitor direto de Store/quarantine.json
resta fora de `quarantine.ts`; (d) os sítios de `calcFlakinessEntries` sobre `hub.computed.metricsRuns`
continuam apontando para o hub (já SSOT).

---

## RE-AUDITORIA FRESCA + PLANO AJUSTADO (2026-07-12, autorizado)

> Re-auditoria read-only (grep + leitura de código + `tsc`) executada após a conclusão da fase de quarentena. O objetivo foi enumerar os gaps reais de SSOT, não confiar no narrativo de "próximas fases" do plano (que se provou obsoleto, igual ao inventário de consumidores).

### 1. Re-auditoria — achados (evidência)

| Alegação do plano (FASE 1/3/4/5/6)                                | Estado REAL (código)                                                                             |
| :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| "23 arquivos usam `persistence.loadMetricsStore()`"               | **FALSO** — zero chamadores executáveis fora de `data-hub/`.                                     |
| "30+ call sites criam `createDataHubPersistence()`"               | **FALSO** — zero em produção.                                                                    |
| "quality-gate/health-score têm assinatura híbrida `MetricsStore`" | **FALSO** — `quality-gate.ts:9` _"MetricsStore is NOT used"_; `runQualityGate(options.dataHub)`. |
| "18 sites acessam `store.runs` direto"                            | **FALSO** — todos leem `dataHub.raw.*` / `dataHub.computed.*`.                                   |
| `loadMetricsStore()` exposto na interface pública                 | **JÁ REMOVIDO** — só existe em `persistence.ts` (dono).                                          |

**Leituras SSOT verificadas:** `quality-gate` (`dataHub.raw/computed`), `pr-report-core` (inclusive `getQuarantine()`), `case12`/`case21`/`main.ts` (`hub.raw`), `case17` (`hub.computed.metricsRuns`, `hub.raw.commitLog`), `git_triggers` (zero bypass), `coverage-gap`/`pipeline-cost` (`hub.raw`).

**Gap real remanescente — fonte alternativa legada (`Store`):**

- Classe `Store` em `shared/store.ts`. Instanciada em produção em **2 pontos**: `shared/session-context.ts:118` (`new Store(...)`) e `git_triggers/pipeline-handler.ts`.
- Importada em `session-context.ts` e `pipeline-handler.ts`; mock em `shared/__mocks__/store.ts`.
- Papel: **cache de resultados de teste SHA-keyed** (arquivo). Em `resolveTestDataSource` (`session-context.ts:200`): Passo 1 lê do legacy `Store` (`tryLoadFromCache`); Passo 2 lê do **DataHub** (`_getLatestTestResultFromDataHub` → `hub.raw.parsedArtifacts`) e, se achar, também escreve no legacy `Store` (`trySaveCiResult`). DataHub é fonte primária; legacy `Store` é cache secundário + único escritor dos arquivos `.qa-store`.
- **DataHub JÁ possui o equivalente**: `hub.ts` popula `raw.parsedArtifacts` (linhas 269–316, 484–542) e deriva `computed.metricsRuns`. Logo a leitura do legacy `Store` é **redundante — desde que o DataHub esteja inicializado nos pontos de chamada**.

**Conclusão:** FASE 1/3/4/5/6 (leitura SSOT) concluídas. O trabalho restante real não é "migrar 23 consumidores" — é **FASE 8/C + FASE 9: eliminar a fonte alternativa legada (`Store`)**, com verificação de causa raiz prévia (cobertura do cache pelo DataHub).

### 2. Plano ajustado ordenado (até a conclusão do track)

| Ordem | Item                                            | Escopo principal                                                                                                                                                                                                                                                                         | Autorização                                                                    |
| :---- | :---------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------- |
| 0     | Verificação de causa raiz (read-only)           | Confirmar que `isDataHubInitialized()` é verdadeiro em **todos** os callers de `resolveTestDataSource` (case15, case17, pipeline-handler) — define se o cache legado é redundante                                                                                                        | —                                                                              |
| 1     | **FASE 8/C + FASE 9 — Eliminar `Store` legado** | Mover leitura de cache 100% para `hub.raw.parsedArtifacts`; remover `new Store(` em `session-context.ts`/`pipeline-handler.ts`, deletar `shared/store.ts` + `shared/__mocks__/store.ts` + imports; tratar `tryLoadFromCache`/`trySaveCiResult`/`resolveFromBranch`                       | Root-cause (§4): não deletar sem equivalência comprovada no passo 0            |
| 2     | **WS2 — Guarda contínua**                       | Estender `eslint.config.mjs:212` para bloquear `new Store(` / `import ...store.js` fora de `data-hub/` (trava a eliminação do passo 1)                                                                                                                                                   | Adição de mecanismo de segurança (§5) — ok                                     |
| 3     | **WS3 — Lint N2-B**                             | Corrigir `security/detect-non-literal-fs-filename` em `shared/quarantine.ts` (validar caminho contra base permitida; **sem** `eslint-disable`)                                                                                                                                           | Obrigatório (§4/§25)                                                           |
| 4     | **WS1 — Contrato (autorizado)**                 | Remover `saveMetricsStore(store: MetricsStore): void` da interface pública `DataHub` (manter em `DataHubPersistence`); podar o campo dos mocks (`data-hub-mock.ts`, `context-factory.ts`, `pr-report.test.ts`, `quality-gate.integration.test.ts`, `hub-st1.test.ts`, `factory.test.ts`) | **Autorizado expressamente pelo usuário em 2026-07-12, sem reservas (§6/§18)** |
| 5     | **WS4 — Reconciliar planos (este item)**        | Atualizar `data-hub-ssot-enforcement.md` (feito aqui) e sinalizar `data-hub-layered-architecture.md` como obsoleto no narrativo de consumidores                                                                                                                                          | Item de execução                                                               |

> `data-hub-layered-architecture.md` e `PROGRESS-LAYERED-ARCH.md` contêm narrativo de "próximas fases" igualmente obsoleto (claim de 18/23 call sites). Estão **superseded** por esta seção; reconcile detalhado fica para WS4-final (ou edição pontual posterior).

### 3. Solução tecnicamente superior (registrada por decisão)

- **WS1 (Q1):** autorizar remoção de `saveMetricsStore` da interface pública — zero consumidores de produção, elimina contract rot, reforça o invariante "consumidores não tocam persistence", e corrige defeito de mock-shape (campo extra nos mocks). Condições de §6 satisfeitas; autorização do usuário obtida.
- **Ordem (Q2):** FASE 8/C primeiro (núcleo do plano = fonte alternativa real), precedida da verificação de causa raiz e **emparelhada com WS2** (guarda que trava regressão). WS3 não é primeiro: é débito de segurança independente, só warning, não desbloqueia o objetivo de domínio (§8).

### 4. Checkpoints de execução (retomada)

```
[CHECKPOINT 0] Verificação (read-only) de isDataHubInitialized() nos callers de resolveTestDataSource:
              callers: case15.ts, case17.ts, pipeline-handler.ts (+ recursão resolveFromBranch).
              FINDING C1: case15.ts importa SÓ resolveSessionContext e chama resolveTestDataSource sem
              garantir DataHub → legacy Store era o único fallback de cache.
              FINDING C2: DESCOBERTA CRÍTICA — múltiplos arquivos têm flag imutável `chattr +i`,
              inclusive `jira_management/commands/case15.ts` e `eslint.config.mjs` (mecanismo de segurança,
              AGENTS §5/§18). NÃO se remove a flag sem autorização explícita do usuário.
              DECISÃO (Opção A, autorizada pelo usuário): DataHubPersistence ASSUME o cache por-SHA do
              legacy Store (preservando os NOMES de método públicos: loadReport/saveReport/put/getBranch/
              loadMetrics/saveMetrics), e o legacy Store é deletado. Assim o imutável case15.ts (que chama
              store.saveReport/store.put) compila INALTERADO — a causa raiz (fonte alternativa) é eliminada
              sem violar a imutabilidade (§4/§5/§18). O cache NÃO migra para hub.raw (evita exigir DataHub
              inicializado nos callers; resolve C1 sem tocar arquivo imutável).
[CHECKPOINT 1] FASE 8/C — CONCLUÍDO (Opção A) · WS2 — CONCLUÍDO (2026-07-12, ver CHECKPOINT 1b).
              (a) Tipos ReportMeta/BranchEntry relocados de store.ts → shared/types/data-hub.ts (C2 atendido).
              (b) DataHubPersistence (interface + impl em persistence.ts) assume o cache por-SHA;
                  formato de arquivo reports/... idêntico ao legacy (§9 zero regressão).
                  Métodos públicos legados preservados: loadReport, saveReport, put, getBranch,
                  loadMetrics, saveMetrics. factory createDataHubPersistence chama backend.init() (idempotente).
              (c) session-context.ts: resolveSessionContext retorna DataHubPersistence via
                  createDataHubPersistence(projectName, detectStoreBackend(detectProjectGitDir()));
                  tryLoadFromCache→store.loadReport(sha); trySaveCiResult→store.saveReport/put/flush;
                  resolveFromBranch→store.getBranch(branch).
              (d) pipeline-handler.ts: createDataHubPersistence + saveReport/put/flush (substitui new Store).
              (e) case17.ts + case17-test-utils.ts: saveMetrics/loadMetrics em DataHubPersistence.
              (f) DELETADO: shared/store.ts, shared/__mocks__/store.ts, shared/store.test.ts,
                  shared/__tests__/store.property.test.ts.
              (g) Testes migrados: persistence-cache.test.ts (novo, de store.test.ts),
                  store.integration.test.ts (reescrito), mocks atualizados (data-hub-mock.ts,
                  factory.test.ts, hub-st1.test.ts, session-context.test.ts, pipeline-handler.test.ts,
                  case17.test.ts — remoção de mocks mortos de store.js).
              (h) Verificação: `npx tsc --noEmit` = 0 erros (inclui case15.ts imutável);
                  `npx vitest run` = 6376 passed / 0 failures.
              (i) grep prova: zero `new Store(`; zero import de shared/store.js fora de data-hub/
                  (o único consumer imutável usa os métodos preservados em DataHubPersistence).
[CHECKPOINT 1b] WS2 — ✅ CONCLUÍDO (2026-07-12): guarda contínua estendida em `eslint.config.mjs`
               (bloco `no-restricted-syntax` global, mesmo escopo do `loadMetricsStore` existente) para
               bloquear `NewExpression[callee.name="Store"]` (new Store) e
               `ImportDeclaration[source.value=/\/store\.js$/]` (import de store.js).
               EVICÊNCIA: probe `new Store(); import {x} from './store.js';` lintado → 2 erros SSOT
               (no-restricted-syntax) disparados; arquivo real `shared/types/data-hub.ts` = 0 erros
               (config carrega, zero regressão). grep prévio: 0 `new Store(` e 0 import store.js no código.
               NOTA: a flag `chattr +i` de `eslint.config.mjs` foi removida pelo usuário para permitir a
               edição e NÃO pôde ser restaurada por este agente (chattr negado por política); recomenda-se
               que o usuário reaplique `chattr +i eslint.config.mjs` para manter o mecanismo de segurança.
[CHECKPOINT 2] WS3 — ✅ RESOLVIDO (2026-07-12): débito N2-B documentado, sem alteração de código/config.
               Os 6 warnings `security/detect-non-literal-fs-filename` em `shared/quarantine.ts` (linhas 82, 94, 95,
               110, 111, 262) são FALSE POSITIVES: os paths derivam de `getDataDir()` → `Config.get('xdgStateHome')`
               / `os.homedir()` (paths corretos, não controlados por atacante). A regra `isStaticExpression` não
               trata `Config.get()`/`os.homedir()` como estáticos POR DESIGN (aceitar retorno de função arbitrária
               como "estático" seria漏洞 de segurança). Severidade = warning (1), não error (2); o lint gate
               (`scripts/quality-check.ts:98`) falha apenas em severity-2 → CI não afetado. Marcador N2-B adicionado
               no topo de `quarantine.ts`; débito idêntico existe em `shared/ai-feedback.ts` (5 warnings, não rastreado).
               Decisão (análise adversarial): documentar > mudar config (scope fix eliminaria só 1/6 e adicionaria
               risco) > eslint-disable (proibido, §18) > desligar regra (enfraquece §5).
[CHECKPOINT 3] WS1 — estado preservado (concluído em sessão anterior: saveMetricsStore fora da interface
              pública DataHub; mocks podados). Sem regressão por esta sessão.
[CHECKPOINT 4] WS4-final — PARCIAL: este documento atualizado (CHECKPOINTS). STATUS DO TRACK pendente de
              consolidação final quando o usuário reavaliar o track.
```

### 5. Estado de prontidão para retomada

- Branch: `feat/ssot-gap-corrections`. Último commit de código: `d49c6ac0` (quarentena SSOT). Último commit de docs: `7782ec62`.
- Débito N2-B e exposição `saveMetricsStore` agora **autorizados para correção** na próxima fase (não mais "fora de escopo").
- Próxima ação ao retomar: executar **CHECKPOINT 0** (verificação read-only de `isDataHubInitialized()` nos callers), depois **CHECKPOINT 1** (FASE 8/C + WS2).
