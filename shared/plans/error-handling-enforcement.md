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
