# Error-Handling Enforcement — Auditoria Independente + Plano

> **Data:** 2026-07-12
> **Escopo:** Codebase inteira (`shared/`, `jira_management/`, `git_triggers/`, `scripts/`, `setup/`, `e2e/`)
> **Método:** Leitura independente de **todos** os blocos `catch`/`.catch` do repo (não se baseia em nenhuma auditoria anterior).
> **Substitui:** `shared/plans/silent-degradation-fix.md` (documento anterior descartado — auditoria falha/contraditória).

---

## 1. CONCLUSÃO

O padrão de **degradação graciosa / erro silenciado NÃO é isolado — ele empesteia a codebase**. Foram medidas **286 ocorrências distintas** de `catch` que engole o erro (retorna default/fallback que mascara a falha), distribuídas em **todos** os diretórios.

| Diretório                      | Sítios de degradação silenciosa |
| ------------------------------ | ------------------------------- |
| `shared/`                      | 128                             |
| `jira_management/`             | 64                              |
| `git_triggers/`                | 59                              |
| `scripts/` + `setup/` + `e2e/` | 35                              |
| **TOTAL**                      | **286**                         |

O mecanismo é **centralizado e deliberado**: `shared/git-provider-error.ts` expõe `handleError(err, { returnNull: true })`, que faz `log` e retorna `null` — colapsando 401/403/404/500 num `null` indistinguível. Há **73 usos de `returnNull: true`** em `git_triggers/` alimentados por esse sink.

### 1.1 Dois achados de Severidade-1 (desativação de mecanismo de segurança)

Violam a Regra 5 (Safety Mechanism Immutability) do `AGENTS.md`:

1. **`shared/llm-validation.ts:27-36`** — ao falhar o carregamento do validation hook, instalava um validador _no-op_ que retorna `{ valid: true }`. **A validação de respostas LLM era silenciosamente desligada.**
2. **`scripts/validation-hook.ts:1747-1748`** — `runCheckCommitMsg` fazia `catch { return { valid: true } }`. **Uma exceção de validação virava resultado aprovado.**

Ambos **corrigidos em fail-closed** (veja §4): o erro agora é explícito e a validação não é desativada.

### 1.2 Bug concreto relatado (versionador)

`git_triggers/github-workflow.ts:357-361` (`wfGetFileContents`) e `:389-393` (`wfListDirectory`):

- `404` → `return null` (silencioso, sem log).
- Qualquer outro erro → `handleError(..., { returnNull: true })` → `null`.

Resultado: um **403 "token sem permissão para ler arquivo" torna-se um `null` opaco**, indistinguível de "arquivo não encontrado". O usuário não recebe informação alguma. Este é exatamente o padrão denunciado.

---

## 2. POR QUE A SOLUÇÃO DEVE SER TIPADA (NÃO SINTÁTICA)

A garantia do Rust de "erro não pode ser ignorado" nasce do **contrato de tipo**, não da sintaxe:

- `Result<T, E>` declara a falibilidade no tipo de retorno.
- `#[must_use]` + lint `unused_must_use` → erro de compilação se um `Result` for descartado.
- O operador `?` propaga, nunca engole.

TypeScript **não tem** `Result` nativo nem `#[must_use]`. Regras como `no-floating-promises`/`no-unused-expressions` não entendem um canal de erro `Result`. Portanto a "garantia de compilação" deve ser **aproximada em tempo de lint/build** (`eslint --max-warnings 0` = falha de build).

**Consequência:** uma regra sintática ("banir `return null` no catch") seria **errada** — não distingue sentinela legítima (ex.: `null` = não encontrado, contrato de domínio) de erro engolido. A correção exige tornar a falibilidade **explícita no tipo** (`Result<T, ExternalError>`), e aí sim a regra de lint pode provar que o `Err` foi tratado.

---

## 3. SOLUÇÃO TECNICAMENTE SUPERIOR (evidência)

**Arquitetura de `Result`/`ExternalError` explícito + regra local `must-use-result` + catraca por diff no pre-commit.**

- **`neverthrow`** (~500K downloads/semana, ~5KB, `Result`/`ResultAsync`): tipo `Result` para TS, com async via `ResultAsync`. (https://github.com/supermacro/neverthrow)
- **Regra `local-result/must-use-result` (own, em `scripts/eslint-plugins/result-catraca.cjs`):** port de Rust `#[must_use]` para TS. É **type-aware** (`context.sourceCode.parserServices` + `TypeChecker`): um `Result` não consumido via `.match()`/`.unwrapOr()`/`.andThen()`/`.map()`/`.mapErr()`/`.orElse()`/retorno/atribuição vira erro de lint.
    - **Decisão:** `eslint-plugin-neverthrow` (dependência original) está **abandonado** (v1.1.4, 2021) e incompatível com ESLint 10 — usa `context.parserServices`, removido no ESLint 9+. Para respeitar a Regra 5 (mecanismo de segurança é nosso), a regra foi reimplementada localmente e é de propriedade do QA Tools. Validação: descarta `Result` ⇒ erro; `ok(1).unwrapOr(0)` ⇒ OK (zero falso-positivo).
- **Catraca (diff-based) no pre-commit (`.husky/pre-commit`), NÃO no CI:** o CI (`ci.yml`) pode ser alterado por PR, logo não é local confiável. O pre-commit roda a regra nos arquivos stageados e bloqueia `returnNull: true` em linhas adicionadas. (husky + lint-staged)

**Por que é superior:**

1. **Causa raiz, não sintoma** — o contrato de tipo que mentia (`handleError` promete `null`) vira `Result<T, ExternalError>`.
2. **Machine-enforced e gradual** — com 286 sítios, só a catraca (lint só no diff) viabiliza a correção sem big-bang. Sem a regra, qualquer "correção manual" das 73 ocorrências de `returnNull` **regera**.
3. **Baixo falso-positivo** — a regra dispara no _tipo_ `Result`, não na sintaxe; código legado que retorna `T | null` não é tocado.
4. **Informação exata** — `ExternalError { kind | status | scope | resource | operation | remediation }` entrega "token sem `contents:read` para `repo/path`" em vez de `null` opaco.

**Alternativas rejeitadas:**

- _Banir `return null` no catch_ (sintética): falso-positivo em massa, não distingue sentinela de erro engolido.
- _Throws tipados + banir swallow_: throws apagam o tipo de erro no call site (não verificável via lint); ban-swallow amplo feriria sentinelas.
- _Effect-TS_: paradigm shift (DI, fibers) — overkill para CLI I/O-bound.
- _In-house `Result`_: reimplementa `neverthrow` com menos ecossistema.

---

## 4. CORREÇÕES JÁ APLICADAS (Tarefa A — P0)

| Arquivo                                | Antes                                                           | Depois                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/llm-validation.ts:27-36`       | `catch` → validador no-op `{ valid: true }` (desliga validação) | `catch` → validador **fail-closed** `{ valid: false, error, requiresHumanReview: true }`; `rootLogger.error`. `validateLlmResponse` propaga `LlmError` explícito. |
| `scripts/validation-hook.ts:1747-1748` | `catch { return { valid: true } }` (exceção vira aprovado)      | `catch (err)` → `return { valid: false, issues:[{severity:'block', error}], ... }` → entry point faz `process.exit(1)` (commit bloqueado). Log explícito.         |

Verificação: `tsc --noEmit` OK; self-test do hook `51/51`.

## 4.1 STATUS DE IMPLEMENTAÇÃO (Tarefa B — catraca + causa raiz)

| Item                                             | Estado            | Detalhe                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regra `must-use-result` (catraca de `Result`)    | **FEITO (local)** | `eslint-plugin-neverthrow` abandonado/incompatível com ESLint 10 (usava `context.parserServices`, removido). Reimplementada localmente em `scripts/eslint-plugins/result-catraca.cjs` (`local-result/must-use-result`). Validação: descarta `Result` ⇒ erro; `ok(1).unwrapOr(0)` ⇒ OK. |
| `ExternalError` + `classifyGitError`             | **FEITO**         | `shared/errors.ts`: tipo com `kind\|status\|scope\|resource\|operation\|remediation`; mapeia 401→auth, 403→permission (com `remediation` citando o escopo ausente), 404→notFound, 429→rateLimit, rede→network, 5xx→server.                                                             |
| `wfGetFileContents` / `wfListDirectory` (GitHub) | **FEITO**         | Lançam `ExternalError` em não-404; `null` só em 404.                                                                                                                                                                                                                                   |
| `glGetFileContents` (GitLab)                     | **FEITO**         | Análogo ao GitHub.                                                                                                                                                                                                                                                                     |
| Superfície no TUI (não só log)                   | **FEITO**         | `detectFrameworkFromAPI` propaga o `ExternalError`; `detectFrameworkCascade` (`shared/data-hub/extractors/framework-detector.ts`) captura kind auth/permission/rateLimit/network/server e chama `warn()` (visível na CLI/TUI via `shared/prompt-format.ts`).                           |
| Catraca diff no pre-commit                       | **FEITO**         | `.husky/pre-commit`: bloqueia `returnNull: true` em linhas adicionadas/modificadas de `.ts`. Não está no CI (CI pode ser alterado por PR).                                                                                                                                             |
| `eslint-plugin-neverthrow` (dependência)         | **REMOVIDA**      | `package.json` devDependency removida.                                                                                                                                                                                                                                                 |

Verificação: `tsc --noEmit` OK; `eslint` OK nos arquivos alterados; testes dos sinks atualizados para esperar `rejects.toBeInstanceOf(ExternalError)`; 117 testes da suíte afetada passam.

> **Limitação conhecida:** o "versionador" citado (fallback 'v0.0.0') não foi localizado como função isolada — o único leitor de arquivo de repo em produção é `GitProvider.getFileContents` (consumido por `detectFrameworkFromAPI`/`detectFrameworkCascade`). A correção cobre esse caminho. Demais 286 sítios de degradação silenciosa migram gradualmente via catraca (arquivos tocados não podem adicionar `returnNull: true`).

---

## 5. PLANO DE IMPLEMENTAÇÃO (catraca)

### Phase 0 — Infra de catraca (Tarefa B, parte 1)

- Adicionar `neverthrow` (runtime). A regra `must-use-result` é **local** (`scripts/eslint-plugins/result-catraca.cjs`), não dependência externa.
- `eslint.config.mjs` (já type-aware via `recommendedTypeChecked` + `parserOptions.project`): registrar plugin `'local-result'` e habilitar `'local-result/must-use-result': 'error'`. A regra só morde valores do tipo `Result`, logo é **zero-falso-positivo em código legado** e atua como catraca natural sobre código novo.
- Pre-commit (`.husky/pre-commit`): catraca diff-based — bloqueia `returnNull: true` em linhas adicionadas/modificadas de `.ts` stageados; roda lint-staged (que executa a regra `must-use-result` só nos arquivos alterados). CI (`ci.yml`) **não** recebe a catraca (pode ser alterado por PR — local não confiável).

### Phase 2 — Causa raiz no sink git-provider (Tarefa B, parte 2)

- `shared/errors.ts`: adicionar `ExternalError` (estende `Error`) com `kind | status | scope | resource | operation | remediation`; adicionar `classifyGitError(err, ctx): ExternalError` (mapeia status→kind: 401/403→`permission`/`auth` com `scope` inferido da operação; 404→`notFound`; 429→`rateLimit`; rede→`network`; 5xx→`server`).
- `shared/git-provider-error.ts`: `handleError` deixa de retornar `null` mentiroso; classifica e retorna `Result<T, ExternalError>` (ou `throw` para auth/permission, honrando a decisão "lançar exceção explícita").
- `git_triggers/github-workflow.ts`: `wfGetFileContents`/`wfListDirectory` → em erro, classificam; **404 → `null` (skip legítimo)**; **401/403/redes/5xx → `throw ExternalError` explícito** (não silenciado). Callers (`github_manager.ts:195/199`) atualizados para tratar o throw.
- Testes (Regra 19): property-based `status→kind`; unit 401/403→`ExternalError` com `scope`+`remediation`; teste da regra `must-use-result` (Result ignorado → erro).

### Phase 3+ — Migração incremental (Tarefa C, permanente)

- Issue de acompanhamento: os ~280 sítios restantes migram **organicamente** conforme cada arquivo entra no diff, convertendo o caminho fallível para `Result`/`ExternalError` e tratando o `Err`. Não é um big-bang.
- A catraca impede regressão: código novo que ignore um `Result` falha no lint.

### Divisão de tarefas (decisão do usuário)

- **Tarefa A** (P0, imediata): os dois bypasses de mecanismo de segurança — `llm-validation.ts` + `validation-hook.ts`. ✅ Concluída.
- **Tarefa B** (catraca + causa raiz): Phase 0 + Phase 2 neste branch.
- **Tarefa C** (rastreamento permanente): migração incremental via diff — issue, não big-bang.

A própria catraca torna-se um **mecanismo de segurança** (Regra 5): uma vez adicionada, não pode ser enfraquecida.

---

## 6. RISCOS / TRADE-OFFS (honestos)

- `validateLlmResponse` agora **rejeita** respostas quando o hook está indisponível (fail-closed). Ambientes sem o hook precisam de um hook pass-through **explícito** (escolha audítavel), não de um default silencioso.
- `neverthrow` (~5KB) é nova dependência — custo desprezível.
- Lint type-aware é mais lento (parse do `Program`) → deve ficar **só no diff**.
- Curva de aprendizado (`Result` API) — mitigada por `.match()`/`.unwrapOr()`.
- `must-use-result` aceita `.unwrapOr(null)` (poderia re-silenciar) → exigir `.match()` nos caminhos críticos (git-provider, validação); `_unsafeUnwrap` só em testes.

---

## 7. AUDIT TRAIL — TAREFA C (migração incremental, estado 2026-07-12)

Esta seção é o **registro de achados** da Tarefa C: inventaria os sítios `returnNull: true` remanescentes, marca o incremento #1 como concluído e fixa a ordem planejada dos incrementos restantes. A migração é **orgânica via diff** (catraca), **não big-bang** — ver §5 Phase 3+ e a advertência de §3.1 ("correção manual das 73 ocorrências regenera sem a catraca").

### 7.1 Inventário de `returnNull: true` remanescente (produção, arquivos commitados)

| Arquivo                             | Sítios | Funções / caminho                                                                           |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `git_triggers/github-branch.ts`     | 2      | `getDefaultBranch` / `listBranches` (apiGet c/ `returnNull: true`)                          |
| `git_triggers/gitlab-branch.ts`     | 2      | `getDefaultBranch` / `listBranches`                                                         |
| `git_triggers/github-issues.ts`     | 1      | `getIssue`                                                                                  |
| `git_triggers/gitlab-issues.ts`     | 1      | `getIssue`                                                                                  |
| `git_triggers/github-pr.ts`         | 3      | `createPullRequest` (100), `mergePullRequest` (122), outro (165)                            |
| `git_triggers/gitlab-pr.ts`         | 3      | `createMergeRequest` (85), `acceptMergeRequest` (107), outro (148)                          |
| `git_triggers/github-api.ts`        | —      | **propagador**: `apiGet` repassa `returnNull` ao sink (linha 22)                            |
| `git_triggers/gitlab-api.ts`        | —      | **propagador**: `apiGet` repassa `returnNull` ao sink (linha 26)                            |
| `git_triggers/git-provider-base.ts` | —      | **propagador**: `publicGet/publicPost` repassa `returnNull` (linha 38)                      |
| `shared/git-provider-error.ts`      | —      | **sink**: overload `returnNull: true` (linhas 9-11) + branch `if (options.returnNull)` (17) |

**Total produção:** 12 sítios diretos em 6 arquivos-folha + 3 propagadores + 1 sink.

**Arquivos de teste com `returnNull: true`** (expectativas / mocks a atualizar na migração de cada arquivo-folha): `github-branch.test.ts` (41,51,99), `gitlab-branch.test.ts` (68,114), `github-issues.test.ts` (76), `gitlab-issues.test.ts` (60), `github-pr.test.ts` (335,378,586), `gitlab-pr.test.ts` (205,213,340), `github-api.test.ts` (58), `gitlab-api.test.ts` (67), `git-provider-base.test.ts` (54), `shared/git-provider-error.test.ts` (20,27,37), `shared/test-utils/mock-modules.ts` (95-96) + `mock-modules.test.ts` (121,123).

### 7.2 Incremento #1 — CONCLUÍDO (2026-07-12)

**Arquivos:** `git_triggers/github-workflow.ts`, `git_triggers/gitlab-workflow.ts` + respectivos `.test.ts`.

**Comportamento resultante (causa raiz corrigida — sem `null` silencioso):**

- `github-workflow.ts`: `listWorkflows`, `wfGetRecentPipelines` → `try/catch` lança `ExternalError` (classificado); `wfGetPipeline` → `404` ⇒ `null`, senão lança; `wfGetPipelineJobs`, `wfListPipelineArtifacts`, `wfGetCICDVariables` → `returnNull` removido, propagam lançamento; `wfDownloadArtifact`, `wfGetJobLogs` → `404` ⇒ `null`, senão `ExternalError`; `wfGetWorkflowRunTiming` → `404` ⇒ `null`, senão lança; **`wfGetRepoTree` → removido o `catch` silencioso (`rootLogger.warn` + `return null`)** → `404` ⇒ `null`, senão lança `ExternalError`. Imports `handleError`/`extractErrorMessage` removidos (não usados).
- `gitlab-workflow.ts`: `glGetSchedules`, `glGetRecentPipelines`, `glGetPipelineJobs`, `glListPipelineArtifacts`, `glGetCICDVariables` → `returnNull` removido + `try/catch` lança `ExternalError`; `glGetPipeline`, `glGetTestReport` → `404` ⇒ `null`, senão lança; `glGetJobLogs` → `404` ⇒ `null`, senão `ExternalError`; **`glGetRepoTree`, `glListDirectory` → removido o `catch` silencioso** → `404` ⇒ `null`, senão lança; `glDownloadArtifact` → lança `ExternalError`. Imports `extractErrorMessage`/`rootLogger` removidos.
- **Testes:** `returnNull: true` removido de todas as `toHaveBeenCalledWith`; casos de "silencioso ⇒ `[]`/`null`" convertidos para `rejects.toBeInstanceOf(ExternalError)` (funções de lista) ou `404` ⇒ `null` + lançamento em não-404 (funções de contrato `| null`).

**Catraca:** zero literais `returnNull: true` nos 4 arquivos (produção + testes) → diff limpo.

**Verificação:** `npx vitest run git_triggers/github-workflow.test.ts` = 49 pass; `git_triggers/gitlab-workflow.test.ts` = 42 pass; `npx tsc --noEmit` sem erros de import não-usado.

### 7.3 Ordem planejada dos incrementos restantes (Tarefa C)

Cada incremento migra **um arquivo-folha** (remove `returnNull: true`, envolve `try/catch` → `classifyGitError`, `null` só em `404` onde o contrato exige, e atualiza o `.test.ts` correspondente). Os **propagadores + sink são o último passo**, eliminados só quando nenhum caller usa `returnNull`.

1. `github-branch.ts` + `gitlab-branch.ts` (2+2 sítios — menores, isolados).
2. `github-issues.ts` + `gitlab-issues.ts` (1+1).
3. `github-pr.ts` + `gitlab-pr.ts` (3+3 — maiores, mais callers).
4. **Fim:** `github-api.ts` + `gitlab-api.ts` + `git-provider-base.ts` (remover a opção `returnNull` das assinaturas de `apiGet/publicGet`) e, por último, `shared/git-provider-error.ts` (remover overload `returnNull: true` + branch `if (options.returnNull)`).

> **Por que o sink não foi reworkado no incremento #1:** editar `handleError` para removê-lo introduz um literal `returnNull: true` na assinatura do overload, que a própria catraca bloqueia em linha modificada. Logo o sink só pode ser reworkado **após** o último caller folha — caso contrário forçaria um big-bang (quebraria os 12 sítios remanescentes em um único commit). O caminho default (sem `returnNull`) do `handleError` **já lança**; o que resta eliminar é a capacidade de retornar `null`.

### 7.4 Verificação por incremento

- `npx tsc --noEmit` → 0 erros.
- `npm run lint` → 0 severidade-2; `grep -rn "returnNull: true"` sobre os arquivos do incremento ⇒ 0 literais **adicionados**.
- `npx vitest run <arquivo>.test.ts` → verde; casos de erro afirmam `rejects.toBeInstanceOf(ExternalError)` (ou `404` ⇒ `null`).

### 7.5 Status

- **Tarefa A** ✅ (§4)
- **Tarefa B** ✅ catraca + `ExternalError`/`classifyGitError` + `wfGetFileContents`/`wfListDirectory`/`glGetFileContents` (§4.1)
- **Tarefa C** — incremento #1 ✅ (§7.2); incrementos 2–4 pendentes (§7.3).
