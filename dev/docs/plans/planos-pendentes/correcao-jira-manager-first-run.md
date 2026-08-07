# PLANO DE CORREÇÃO — Jira Manager: wizard first-run obrigatório + erro `_getSession` + splash que nunca inicializa

**Local:** `dev/docs/plans/planos-pendentes/`
**Data de criação:** 2026-08-07
**Autoridade:** instrução explícita do usuário (AGENTS.md §1).

---

## 0. Regras de execução (AGENTS.md — não negociáveis)

- **TDD RED→GREEN (Regra 19.9/19.11):** teste que reproduz o defeito primeiro; correção na implementação, nunca no teste.
- **Causa raiz (Regra 4):** nenhum workaround, bypass, correção parcial ou paliativa.
- **Zero erro silencioso (Regra 25):** nenhum catch que destrua stack; nenhuma exceção engolida sem registro.
- **Contratos imutáveis (Regra 6):** alteração de assinatura exige produtores/consumidores identificados e autorização.
- **Equivalência (Regra 10):** sem equivalência presumida; prova por comportamento especificado.
- **Solução tecnicamente superior** sempre; sem novos débitos.
- **SOP §22:** fases sequenciais; checkpoint registrado antes de avançar.

---

## 1. Contexto e evidência (verificado contra código real em 2026-08-07)

### 1.1 Erro reproduzido pelo usuário

```
? Configurações incompletas. Deseja configurar agora? (N): s
✗ Erro interno não tratado (async): this._getSession is not a function
ERR Unhandled Rejection  {"reason":"TypeError: this._getSession is not a function"}
ERR Entry menu child module error: Processo encerrou com código 1
```

### 1.2 Evidências da investigação

- `_getSession` tem **0 ocorrências** em: source (`.ts`/`.js`), todo `node_modules/@inquirer` (core 11.2.1 único, deduped — confirmado via `npm ls`), `dist/` (não existe), e git history. O erro **não pode** nascer do `@inquirer` instalado no repo atual.
- Handler de `unhandledRejection` **destrói o stack** — a única evidência que apontaria a origem:
  - `jira_management/main.ts:673-677`: `rootLogger.error('Unhandled Rejection', { reason: String(reason) })`
  - `git_triggers/main.ts:13-17`: idêntico
  - `String(reason)` de um `TypeError` devolve só a mensagem. O stack trace é descartado.
- `printError` → `extractErrorMessage` (`shared/ui/prompt-errors.ts:125`) lê apenas `message`/`response.data`, **nunca** `stack`.
- `uncaughtException` **já** loga `stack` nos dois entry points (`jira_management/main.ts:681`, `git_triggers/main.ts:21`) — apenas o caminho async (o que o usuário atingiu) destrói o stack.
- Fluxo do crash: `entry-menu` spawna child `tsx jira_management/main.ts` → `initStartup()` → `validateEnv()` acusa config incompleta → `offerEnvSetup()` retorna `true` mas o retorno é **descartado** (`main.ts:619-621`:
  ```js
  if (offerEnvSetup(envResult)) { /* env setup offered */ }
  ```
  ) → `maybeRunFirstRunWizard()` roda incondicionalmente (`main.ts:622-627`).
- Comparação com o uso **correto** de `offerEnvSetup` em `git_triggers/interactive-mode.ts:741-747` — dispara o setup quando o retorno é `true`.

### 1.3 Wizard de first run

- `shared/ui/first-run.ts` — biblioteca (`isFirstRun`, `_markFirstRunDone`, `maybeRunFirstRunWizard`); skip em CI/batch via `_isBatchOrCI()`; flag `_firstRunDone` persistida no state.
- Call-sites de `maybeRunFirstRunWizard`:
  - `jira_management/main.ts:623` — **startup** (auto-chamada a ser removida)
  - `jira_management/commands/case24.ts:11` — **menu 24, opt-in** (permanece)
- `case24.ts` já é a entrada "no menu" pedida pelo usuário, coberta por `case24.test.ts`.
- Testes: `shared/__tests__/first-run.test.ts`, `jira_management/commands/__tests__/case24.test.ts`, `jira_management/__tests__/main.test.ts`, `jira_management/__tests__/integration-handlers.test.ts`, `jira_management/__tests__/integration-menu-connectivity.test.ts`.

### 1.4 Summary da inicialização que nunca inicializa

- `jira_management/main.ts:616`:
  ```js
  await showSplash(getStatePath(), undefined, undefined, undefined, healthScore);
  ```
  `jiraBaseUrl` e `jiraToken` são sempre `undefined` → em `shared/ui/splash.ts:158-166` os checks `Jira API` e `Token` nunca são montados (Token sempre mostra "não configurado").
- Mesmo defeito em `git_triggers/interactive-mode.ts:844` e `shared/ui/entry-menu.ts:411`.
- `shared/__tests__/splash.test.ts` já exercita `showSplash(undefined, 'https://jira.example.com', 'token123', 'cloud')` — a assinatura suporta os args.
- Guard de placeholder existente: `_isJiraConfigured()` em `jira_management/main.ts:252-258`.

---

## 2. Fases de execução

### Fase 0 — Diagnóstico (pré-requisito para qualquer reprodução útil)

**Objetivo:** impedir que o handler global destrua o stack trace (causa raiz do "log vazio" / "erro sem origem").

**Tarefas:**

- **J-0.1** — `jira_management/main.ts:673-677`: `unhandledRejection` passa a registrar `error` + `stack` completos quando `reason instanceof Error` (mantendo console + exit code). Sem TDD (handler de processo não é função pura); validar via `tsc` + suíte.
- **J-0.2** — `git_triggers/main.ts:13-17`: mesma correção (consistência sistêmica).
- **J-0.3** — Verificação: `npx tsc --noEmit` limpo; suíte relacionada (`jira_management`, `git_triggers`) verde.

**Checkpoint Fase 0:** handlers registram stack completo.

### Fase 1 — Reprodução empírica (stack real do `_getSession`)

**Objetivo:** capturar o stack trace completo que apontará a origem exata do `_getSession`.

**Tarefas:**

- **J-1.1** — Executar `LOG_FILE=true LOG_LEVEL=DEBUG npm run jira` repetindo o fluxo reportado (config incompleta → responder "s" → wizard).
- **J-1.2** — Ler `logs/qa-tools-*.log` e extrair o stack completo do `_getSession`.
- **J-1.3** — Identificar o módulo/pacote/versão que o stack revelar (ex.: outro node_modules, instalação global, dist stale, versão de `@inquirer` divergente, chamador dinâmico).

**Checkpoint Fase 1:** origem exata do `_getSession` identificada.

### Fase 2 — Correção da causa raiz do `_getSession`

**Objetivo:** corrigir na origem o que o stack da Fase 1 revelar.

**Tarefas:**

- **J-2.1** — Corrigir a origem (alinhar versão de `@inquirer`, corrigir resolução de módulo, remover dist/instalação stale, corrigir o chamador, etc.) — escopo exato confirmado com o usuário após a Fase 1.
- **J-2.2** — TDD: se houver defeito em código do repo, escrever teste RED que o reproduza antes de corrigir.

**Checkpoint Fase 2:** fluxo completo do jira (incluindo wizard via menu 24) não lança mais `_getSession`.

> **STATUS 2026-08-07:** ✅ Concluída. Causa raiz: `shared/deps.ts` importava `nock` (ativa interceptor global `http.ClientRequest` no import — `node_modules/nock/index.js:47-52`), quebrando o `HttpsProxyAgent` do proxy egress (`MockHttpSocket.passthrough` com `this` errado → `_getSession`). Corrigido na origem: nock removido de `deps.ts`; consumidores de teste usam ponte test-only `shared/__tests__/nock.ts` (imports relativos não violam o DepWall). RED→GREEN em `shared/__tests__/deps-runtime.test.ts`.

### Fase 3 — Wizard first-run opt-in

**Objetivo:** remover a obrigatoriedade do wizard mantendo a configuração acessível no menu.

**Tarefas:**

- **J-3.1** — `jira_management/main.ts:622-627`: remover `await maybeRunFirstRunWizard()` de `initStartup`. **Manter** `shared/ui/first-run.ts` e `case24.ts` (menu 24 = caminho opt-in; skip CI/batch + flag `_firstRunDone` preservados).
- **J-3.2** — `jira_management/main.ts:619-621`: corrigir o dead-block `if (offerEnvSetup(envResult)) { /* env setup offered */ }`. Usar o retorno para disparar o setup espelhando `git_triggers/interactive-mode.ts:741-747`, ou remover o prompt do startup (decisão de UX alinhada ao requisito "configuração no menu").
- **J-3.3** — Atualizar testes que verificam a auto-chamada (`jira_management/__tests__/main.test.ts:72`, `integration-handlers.test.ts`) para o novo comportamento (wizard não roda no startup; menu 24 ainda abre).
- **J-3.4** — TDD: teste que falha se o wizard rodar no startup; teste que passa se abrir via menu 24.

**Checkpoint Fase 3:** jira abre sem wizard obrigatório; menu 24 abre o wizard sob demanda.

> **STATUS 2026-08-07:** ✅ Concluída. J-3.1+J-3.2: removidos a auto-chamada `maybeRunFirstRunWizard()` e o dead-block `offerEnvSetup` de `initStartup` (`jira_management/main.ts`); `validateEnv()` preservado (já loga warnings). J-3.4: RED→GREEN em `jira_management/__tests__/main.test.ts` ("first-run wizard is NOT auto-run at startup"). `case24.ts` (menu 24 opt-in) e `git_triggers` (fluxo próprio) inalterados.

### Fase 4 — Splash status real

**Objetivo:** fazer os checks "Jira API"/"Token" da splash renderizarem de verdade.

**Tarefas:**

- **J-4.1** — `jira_management/main.ts:616`: passar credenciais reais quando configuradas —
  ```js
  await showSplash(getStatePath(),
    _isJiraConfigured() ? base_url : undefined,
    _isJiraConfigured() ? personal_token : undefined,
    jira_mode,
    healthScore);
  ```
  (evita chamada de rede em placeholder via `_isJiraConfigured()` existente).
- **J-4.2** — Avaliar consistência sistêmica em `git_triggers/interactive-mode.ts:844` e `shared/ui/entry-menu.ts:411` (mesmo tratamento ou decisão documentada).
- **J-4.3** — TDD: teste de `buildSplashLines`/`showSplash` com credenciais reais refletindo status correto (Jira online/offline + Token configurado).

**Checkpoint Fase 4:** splash mostra status reais; sem chamada de rede com placeholders.

> **STATUS 2026-08-07:** ✅ Concluída. J-4.1: `initStartup` passa credenciais reais quando `_isJiraConfigured()`. J-4.2: helper compartilhado `shared/jira/config.ts` (`isJiraConfigured`) usado nos 3 call-sites (`jira_management/main.ts`, `git_triggers/interactive-mode.ts:844`, `shared/ui/entry-menu.ts:411`) — sem duplicação. J-4.3: `shared/__tests__/jira-config.test.ts` (RED→GREEN, 5 casos) + `splash.test.ts` já cobre credenciais reais.

### Fase 5 — Validação completa

**Tarefas:**

- **J-5.1** — `npx tsc --noEmit`.
- **J-5.2** — `npx vitest run` completo (7353+ testes) + `quality-check` 20/20.
- **J-5.3** — lint, depcruise, unused-exports, no-swallow.
- **J-5.4** — Commit por mudança (J-0 → J-1 evidência → J-2 → J-3 → J-4), push, monitorar CI via GitHub API.

**Checkpoint Fase 5:** suíte verde + CI verde.

> **STATUS 2026-08-07:** ✅ Validação completa verde — tsc limpo, vitest 544 files/7365 tests, quality-check 20/20, depcruise 0 violações, unused-exports limpo. J-5.4 (commit por mudança + push + CI) aguarda autorização do usuário.

---

## 3. Critérios de aceite (medíveis)

- [x] Jira abre sem wizard obrigatório; menu 24 abre o wizard opt-in.
- [x] Erro com **stack trace completo** aparece no log (`LOG_FILE=true`).
- [x] `_getSession` corrigido na origem (sem workaround).
- [x] Splash mostra status Jira API/Token reais quando configurados; nenhuma chamada de rede com placeholder.
- [x] Handler `unhandledRejection` registra `error` + `stack` nos dois entry points.
- [ ] Suíte completa + CI verdes. (suíte verde; CI pendente do commit/push)
- [x] Nenhum workaround, bypass ou enfraquecimento de safety mechanism.

---

## 4. Decisões pendentes (reabrem apenas com evidência da Fase 1)

- **Fase 2:** se o stack revelar resolução de outro node_modules/versão/instalação global, o escopo exato da correção será confirmado com o usuário antes de executar.
- **J-3.2:** forma final do prompt `offerEnvSetup` (disparar setup vs. remover) definida na execução da tarefa.

---

## 5. Fase 6 (adicional) — UX: remover flags `[MIGRADO]` da listagem de seleção de projeto

**Data:** 2026-08-07
**Autoridade:** instrução explícita do usuário durante teste manual — "o menu de seleção de projeto é ok, o problema são os warnings de migração".

### 5.1 Contexto

- Ao rodar `qatools.sh`, a tela inicial lista projetos numerados com o flag `[MIGRADO]` em todas as entradas migradas: `shared/ui/entry-menu.ts:103` (`displayProjects`).
- Origem do flag: D-U4 — entradas migradas recebem `migrated: true` e são protegidas contra edição/remoção (`isProjectProtected`, `entry-menu-logic.ts:4-6`).
- A proteção D-U4 é **reaplicada** com warning próprio em `manageProjectsFlow` (`entry-menu.ts:209-211`) quando o usuário tenta editar/remover uma entrada migrada.
- Na tela de seleção, o flag `[MIGRADO]` é ruído: o usuário precisa escolher o projeto ativo, não saber que ele foi migrado. O flag `[INVÁLIDO]` (diretório quebrado) é informação útil na seleção e permanece.
- O `main()` do entry-menu já limpa a tela entre menus (`entry-menu.ts:408`, `\x1Bc`).

### 5.2 Tarefas

- **J-6.1** — `shared/ui/entry-menu.ts:103`: remover o flag `[MIGRADO]` da renderização de `displayProjects`, mantendo `[INVÁLIDO]`.
- **J-6.2** — Preservar `isProjectProtected` e a proteção D-U4 em `manageProjectsFlow` (warning ao editar/remover entrada migrada). Nenhuma alteração de contrato de proteção.
- **J-6.3** — TDD RED→GREEN: teste que verifica que `displayProjects` não imprime `[MIGRADO]` (mas mantém `[INVÁLIDO]`), e que `isProjectProtected` continua true somente com `migrated=true`.

**Checkpoint Fase 6:** tela inicial sem `[MIGRADO]`; proteção D-U4 preservada; suíte `shared/__tests__/entry-menu*.test.ts` verde.
