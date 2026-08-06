# FUTURE-PLANS — Plano Consolidado (run prod + planos futuros + débitos)

**Arquivo de planos futuros e débitos a quitar** (renomeado de
`PROD-RUN-ECSPOL-1498-PLAN.md` em 2026-08-06 para identificação clara).

**Data**: 2026-08-06
**Branch**: `feature/associate-te-cli`
**Projeto**: ECSPOL (Jira Cloud: `euronext.atlassian.net`)
**Modo**: Cloud (Xray Cloud GraphQL)

### Missão

Exercitar o código em produção real (Jira cloud ECSPOL) via menu interativo manual
(sem `--auto`), como usuário humano, criando e atualizando issues. Detectar bugs e
corrigi-los **no código** (origem, AGENTS.md §4). Issues são o meio, não o fim.

### Orientação fixa (não-negociável)

Feature com dois caminhos (`--auto` ou manual) → **sempre optar pelo manual**
(queremos exercitar o código do usuário, não o auto). Se manual falhar → marcar a
feature como **candidata à unificação de caminho para auto**. Decisão de unificação
somente após mapear os bugs observados no run.

---

## Fase 1 — Preparação (concluída)

1. Dividir `TEST-SUIT-ECSPOL-1498.csv` (3 TCs, todos `Linked Issues: ECSPOL-1498 (is a test for)`,
   `Pre-condition: ECSPOL-1458, ECSPOL-1460, ECSPOL-1828`):
   - `UPDATE-TC1.csv` — TC1 → UPDATE por key de **ECSPOL-1835** + título sobrescrito (autorizado pelo usuário).
   - `CREATE-TC2-TC3.csv` — TC2+TC3 → criação normal.
   - Local: `C:\Users\KBorges\OneDrive - Euronext\Desktop\POLICY LOG\US-ECSPOL-1498\`
2. Pré-checagem read-only (validada):
   - ECSPOL-1835 (Test), ECSPOL-1498 (User Story), ECSPOL-1458/1460/1828 (Pre-Condition) — todos existem (200).
   - Auth Jira cloud: `Authorization: Basic base64(email:apiToken)` → 200 (Bearer → 403 esperado, não é o caminho cloud).
   - Auth Xray cloud: `POST /api/v2/authenticate` → 200.
   - Link type `Test`: inward `is tested by`, outward `is a test for` (bate com CSV).
   - Sem duplicidade de títulos TC2/TC3 em ECSPOL (JQL sem matches).
   - Sem Test Execution existente em ECSPOL.

---

## Fase 2 — Execução (caminho manual)

1. `script -qec` pseudo-TTY → `npm run jira` → menu 1 → `UPDATE-TC1.csv`
   → prompt "Mapear por chave Jira?" responde `ECSPOL-1835` → `_attemptUpdateByKey`
   → UPDATE por key (título sobrescrito).
2. Menu 1 → `CREATE-TC2-TC3.csv` → sem targetKeys → `_attemptUpdate` (busca por título
   sem match) → criação normal.
3. Capturar toda a saída; mapear cada bug observado.

---

## Fase 3 — Tarefas pós-run (candidatas, decidir tecnicamente após dados do run)

### T1 — Decisão de unificação de caminho (auto vs manual)

Divergência confirmada:

- **Manual** casa por **título**: `findExistingMatches` (`jira_management/import-orchestrator.ts:79`)
  e `_attemptUpdate` (`jira_management/test-case-factory.ts:156`) via
  `project = "X" AND summary = "<título CSV>"`.
- **Auto** casa por **key**: `--target-keys <KEY1,KEY2,...>` → `Config.set('targetKeys')`
  (`jira_management/main.ts:521-533`) → `_attemptUpdateByKey`
  (`jira_management/test-case-factory.ts:217`). A key é informada pelo operador,
  **não** lida do CSV.

Consequência real: TC1 do CSV (`[VERSION-COMPARISON]-[CHANGE-NAVIGATION]...`) **não casa**
com summary de ECSPOL-1835 (`[NOTIFICATION-STATE]-[RESTORE]...`). No manual, criaria issue
nova; no auto (com targetKeys), atualiza por key.

Decisão: **após o run**, avaliar tecnicamente qual caminho é superior → unificar
(auto único OU manual único). Orientação do usuário: manual é preferido; se manual
falhar → candidata à unificação para auto.

### T2 — Menu de mapeamento explícito

Substituir matching implícito por menu explícito:

```
Como casar os testes do CSV com issues no Jira?
  1) Por título  (summary == título CSV)
  2) Por chave   (informar KEYs na ordem do CSV)
  3) Ambos       (tentar título; se não achar, usar key)
```

Opção 1 = comportamento manual atual; opção 2 = comportamento auto atual.
Remove a confusão entre os dois caminhos.

### T3 — Serviço de busca compartilhado

Extrair `jira_management/services/issue-search.service.ts` seguindo o padrão DI de
`issue-picker.ts`/`issue-link.service.ts`, eliminando duplicação da JQL
`summary = "..."` (2 sites → 1 serviço). Qualquer feature futura chama o serviço em vez
de reinventar a JQL. Classificação §23.2: **Tier 2 (fluid)** — extração preservando
funcionalidade. G5: runtime consumer (não documentation-only).

### T4 — Resiliência da busca por título (3 lacunas)

- **T4a. POST cloud sem retry HTTP**: retry cobre apenas GET/PUT
  (`shared/infra/http-client.ts:168` — `method === 'get' || method === 'put' ? maxRetries : 0`).
  Busca cloud é **POST** (`postToApiRoot` → `/rest/api/3/search/jql`,
  `shared/jira/jira-client.ts:217`) → sem retry para 429/5xx (só auto-retry de rede,
  `AUTO_RETRY_MAX=2`). Assimetria server(GET retry)/cloud(POST sem retry).

- **T4b. Busca cloud fora do circuit breaker**: `postToApiRoot` não chama
  `checkCircuitBreaker` (`shared/jira/jira-client.ts:90-107`), diferente de
  `getJiraResource`/`postJiraResource`/`putJiraResource`.

- **T4c. Falha de busca → cria duplicata (§25)**: `_attemptUpdate` no catch retorna
  `null` → "criação prosseguirá" (`jira_management/test-case-factory.ts:207-214`);
  idem `findExistingMatches` (`jira_management/import-orchestrator.ts:85-87`).
  Erro de rede na busca vira criação nova em vez de erro explícito.
  Violação do §25 (zero-silencing) + risco de duplicata.

---

## Fase 4 — Correções + validação

1. Corrigir cada bug aceito no código (origem, §4).
2. Se T1 → unificação aprovada, implementar.
3. Gates completos: typecheck, lint, testes (554 arquivos / 7687 testes), coverage
   (90.42/80.99/93.64/91.84; floors 90/80/91/90), depcruise, no-swallow.
4. Commit + push (git push; `gh` não instalado).

---

## Fase 5 — Tarefas futuras (registradas fora do escopo atual)

### T5 — Flaky do `pr-report` (não reproduzido isolado)

- **Sintoma**: `shared/__tests__/pr-report.test.ts` > "calls createCheckRun with
  success conclusion when quality gate passes" (linha 277) falha ~1 em 4 quando roda
  `npx vitest run shared git_triggers` (6119 testes); passa isolado 3x; falhou 1x em 5
  tentativas com a mudança aplicada.
- **Investigação**: AssertionError exato nunca capturado (envio anterior abortado).
  Outros erros na árvore são simulados por testes (features.json schema, `.bak` inválido,
  llm-fallback) — não são os culpados.
- **Causa raiz**: não identificada. Não gastar tempo agora (decisão do usuário).
- **Ação futura**: reproduzir em loop com captura do assertion real; suspeitas: estado
  global compartilhado entre suítes (Config/logger), ordem de execução, timer/async leak.

### T6 — Unificação targetKeys (concluída nesta sessão)

- `case29.ts` usava `Config.set('targetKeys', ...)` (anti-pattern do bug 1).
- Correção: `targetKeys` flui como parâmetro (`CreateFromFileParams.targetKeys` →
  `createTestsFromCsv` → `createTestsFromTestCases` → `prepareTestRun` →
  `resolveTargetKeys(explicit)`), precedência: param > Config (CLI) > prompt.
- `case29.ts` consumidor do motor universal; `services/` não envolvido.

### T7 — Débito: rework anti-mock dos testes do case01 (count-driven) — PENDENTE

**Estado**: Task 2 (count-driven import, `dev/docs/plans/COUNT-DRIVEN-IMPORT-PLAN.md`)
código-fonte completo e suite verde (554 arquivos / 7718 testes; floors 90/80/90 ok).
Falhas de teste pré-existentes resolvidas na fonte (default `'create'` do
`prepareTestRun` confirmado como contrato no plano, D2) + testes estale atualizados.

**Problema (diretriz ANTI-MOCK THEATER, não-negociável)**: os testes de handler do
case01 ainda mockam lógica interna `createTestsFromCsv`:

- `jira_management/commands/__tests__/case01.test.ts` → `vi.mock('../../create_tests')`.
- `jira_management/commands/__tests__/case01.integration.test.ts` →
  `vi.spyOn(createTestsModule, 'createTestsFromCsv').mockResolvedValue(...)`.

Diretriz: proibido mockar classes/funções/helpers/módulos locais; se A interage com B o
fluxo roda real e integrado; mocks estritos de fronteira (HTTP externo via `nock`);
validar side effects (estado mutado, Config, `pushHistory`, HTTP consumido via
`nock.isDone()`), não só o retorno.

**Ação correta (iniciada em 2026-08-06, não concluída)**: reescrever os dois arquivos
para rodar o pipeline real (`createTestsFromCsv` → `import-orchestrator` →
`test-case-factory`) com:

- `nock` na fronteira HTTP (Jira `http://localhost:9999/jira/rest/api/2` + Xray),
  `JIRA_MODE=server`, `HOME=tmpHome` (hermético), `setTestSleep(noop)`.
- Config REAL (`Config.reset()` por teste; `set` é override in-memory — sem mock).
- Prompts interativos mockados (fronteira UI): `ask`, `askFilePath`, `onError`,
  `warn`, `info`, `askConfirm`.
- CSV real em tmpHome (leitura real via `readBulkCsvWithMeta`).
- Assertions de side effects: `nock.isDone()`, `pushHistory`, `ctx.inMemoryTasksId`,
  `Config.get('importMode'|'targetKeys')` pós-handler, mensagens `warn`
  (re-asks / ignoradas / cancelada).

**Escopo também afetado**: `jira_management/__tests__/integration-handlers.test.ts` e
`jira_management/commands/__tests__/handlers.test.ts` (Case01) continuam mockando
`createTestsFromCsv` — aplicar o mesmo tratamento se dentro do escopo.

**Verificação**: suite completa + typecheck + lint + coverage (floors) verdes.

---

## Fase 6 — Continuação (opcional)

1. Menu 13 (criar Test Execution) + menu 28 (associar TE aos testes) — exercitar o fluxo
   de Test Execution. Sem TE existente em ECSPOL, o menu 28 exigirá criar via menu 13
   (ou fluxo `--create-te` do case01).

---

## Evidências técnicas (referência)

| Item | Localização |
|------|-------------|
| `findExistingMatches` (matching por título, informativo) | `jira_management/import-orchestrator.ts:70-90` |
| Prompt manual "Mapear por chave Jira?" | `jira_management/import-orchestrator.ts:99-133` |
| `_attemptUpdate` (matching por título, decisor) | `jira_management/test-case-factory.ts:145-215` |
| `_attemptUpdateByKey` (matching por key) | `jira_management/test-case-factory.ts:217-237` |
| `_doUpdate` (clean-slate + fallback PUT) | `jira_management/test-case-factory.ts:71-143` |
| `skipExisting: true` no loop | `jira_management/import-loop.ts:66-75` |
| `--target-keys` parse | `jira_management/main.ts:521-533` |
| `--update-policy` parse | `jira_management/main.ts:506-519` |
| `searchJiraIssues` cloud → POST v3 | `shared/jira/jira-client.ts:207-228` |
| `postToApiRoot` (sem circuit breaker) | `shared/jira/jira-client.ts:90-107` |
| Retry só GET/PUT | `shared/infra/http-client.ts:168` |
| Retry constants (HTTP_MAX_RETRIES=10, AUTO_RETRY_MAX=2, timeout=120s) | `shared/infra/http-client.ts:29-49` |
| `getLinkTypeByName` (casa por nome/inward/outward) | `jira_management/link-types.ts:71-85` |
| `linkSourceToTargets` (inward=target, outward=source) | `jira_management/services/issue-link.service.ts:539-593` |
| `ORIENTATION_HINTS` (Tests: inward `is tested by`, outward `tests`) | `jira_management/services/issue-link.service.ts:52-54` |
| CSV block split `^---$`, CRLF→LF | `jira_management/csv_resource.ts:321-328` |
| Auth cloud Basic `email:token` | `shared/jira/jira-client.ts:59-69`, `shared/jira/jira-auth.ts:65-69` |

---

## Arquivos de trabalho

- `C:\Users\KBorges\OneDrive - Euronext\Desktop\POLICY LOG\US-ECSPOL-1498\TEST-SUIT-ECSPOL-1498.csv` (original, 3 TCs)
- `C:\Users\KBorges\OneDrive - Euronext\Desktop\POLICY LOG\US-ECSPOL-1498\UPDATE-TC1.csv` (TC1 → UPDATE ECSPOL-1835)
- `C:\Users\KBorges\OneDrive - Euronext\Desktop\POLICY LOG\US-ECSPOL-1498\CREATE-TC2-TC3.csv` (TC2+TC3 → criação)
- `jira_management/teste_real.csv` (validação prévia do fluxo, 2 testes com links reais)
- `jira_management/test_steps.csv` (7 testes Policy History, sem links)
- `.env.local` (credenciais reais de produção; `.env` tem placeholders)
