# Relatório de Problemas — Teste E2E

**Data:** 2026-07-22
**Testador:** Kevin Borges (kborges@euronext.com)
**Objetivo:** Criar test cases no Jira Cloud via CSV + Test Execution
**Status:** Issues 1-5 corrigidas localmente. Pendente confirmação runtime e replicação para outras máquinas.

---

## ISSUE 1 (CRÍTICA): `isAtlassianCloudGateway()` não detecta URLs `*.atlassian.net`

**Arquivo:** `jira_management/jira-resource-version.ts:53`

**Root cause:** A função `fetchSearchPage` decide entre API Cloud vs Server usando exclusivamente `isAtlassianCloudGateway(resource.baseUrl)`. Esta função (definida em `shared/jira/jira-auth.ts:36-43`) só retorna `true` para URLs Cloud Gateway (`api.atlassian.com/ex/jira/...`), **não** para URLs padrão `*.atlassian.net`.

```typescript
// shared/jira/jira-auth.ts:36-43
export function isAtlassianCloudGateway(baseUrl: string): boolean {
    const u = new URL(baseUrl);
    return u.hostname === 'api.atlassian.com' && u.pathname.includes('/ex/jira/');
}
```

```typescript
// jira_management/jira-resource-version.ts:53-67
async function fetchSearchPage(...) {
    if (isAtlassianCloudGateway(resource.baseUrl) && typeof resource.postToApiRoot === 'function') {
        // Cloud path — só entra para api.atlassian.com/ex/jira/
        const res = await resource.postToApiRoot(`/rest/api/3/search/jql?startAt=${startAt}`, { ... });
        ...
    }
    // Server fallback — SEMPRE usado para *.atlassian.net
    const url = `search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&startAt=${startAt}`;
    const data = await resource.getJiraResource<SearchResponse>(url);
    ...
}
```

**Evidência (runtime):**

```
ERR GET search?jql=project%3DECSPOL&maxResults=1&startAt=0 failed: Request failed with status code 404
ERR Erro searchJiraIssues: Request failed with status code 404 (HTTP 404)
  → /search?jql=project%3DECSPOL&maxResults=1&startAt=0
```

A requisição usou GET `/search?jql=...` (server), mas o Jira Cloud (`euronext.atlassian.net`) retornou 404 porque o endpoint `GET /rest/api/2/search` foi removido na migração Cloud (CHANGE-2046).

**Impacto:** `searchJiraIssues` sempre falha para qualquer Cloud URL padrão (`*.atlassian.net`). Impede validação do projeto, listagem de versões, busca de issues e criação de testes.

**Solução proposta:** O `JiraResourceLike` (jira-resource-types.ts) deve expor `jiraMode` (`'server' | 'cloud'`). `fetchSearchPage` deve verificar `resource.jiraMode === 'cloud'` OU `isAtlassianCloudGateway(resource.baseUrl)`.

---

## ISSUE 2 (MÉDIA): `--auto` flag não define `Config.autoConfirm`

**Arquivos:**

- `jira_management/import-prep-preview.ts:125-146`
- `jira_management/main.ts` (nenhum handler para `--auto`)

**Root cause:** A flag `--auto` na CLI é reconhecida apenas pela função `_isBatchOrCI()` (usada em gap badge e first-run wizard), mas **não** propaga para `Config.setAutoConfirm(true)`. O fluxo headless de CSV import (`runHeadlessCsvImport`) chama `confirmOrCancel()` que verifica `Config.get('autoConfirm')`.

```typescript
// import-prep-preview.ts:144-147
export function confirmOrCancel(): boolean {
    if (Config.get('autoConfirm')) return true; // false — --auto não setou
    return confirm('Criar estes testes no Jira?'); // falha em modo headless
}
```

**Evidência (runtime):**

```
i   Preview dos testes a serem criados
i   Preview aberto no navegador
!   Operação cancelada.
ERR Importação CSV falhou: Falha ao criar testes a partir do CSV.
```

**Impacto:** `npm run jira --csv <path> --auto` sempre cancela na confirmação. Usuário precisa forçar `AUTO_CONFIRM=true` manualmente.

**Solução proposta:** Em `main()`, detectar `--auto` em `process.argv` e chamar `Config.setAutoConfirm(true)`.

---

## ISSUE 3 (BAIXA): Validação de ambiente exige `XRAY_BASE_URL` mesmo com Xray Cloud

**Arquivo:** `jira_management/main.ts:207-219`

**Root cause:** `createValidateEnv` registra `XRAY_BASE_URL` como obrigatório, sem considerar que Xray Cloud usa `XRAY_CLOUD_URL` + `XRAY_CLIENT_ID`/`XRAY_CLIENT_SECRET` em vez de `XRAY_BASE_URL`.

```typescript
const validateEnv = createValidateEnv([
    { key: 'JIRA_BASE_URL', ... },
    { key: 'JIRA_PERSONAL_TOKEN', ... },
    { key: 'XRAY_BASE_URL', label: 'XRAY_BASE_URL (obrigatorio para criar testes)', ... },
]);
```

**Evidência (runtime):**

```
!   Configurações incompletas. Funcionalidades que dependem dessas variáveis serão limitadas.
!     • XRAY_BASE_URL (obrigatorio para criar testes)
```

**Impacto:** Falso positivo na validação. Usuário vê warning mesmo com Xray Cloud configurado corretamente.

**Solução proposta:** Tornar `XRAY_BASE_URL` condicional: obrigatório apenas se `XRAY_MODE=server`. Se `XRAY_MODE=cloud`, validar `XRAY_CLOUD_URL` + `XRAY_CLIENT_ID` + `XRAY_CLIENT_SECRET`.

---

## ISSUE 4 (OBSERVAÇÃO): `base_url` pode duplicar `/rest/api/2`

**Arquivo:** `jira_management/main.ts:226`

**Observação:** `initializeSession` faz `base_url + '/rest/api/2'`. Se `JIRA_BASE_URL` no `.env.local` já incluir `/rest/api/2` (convenção comum), a URL final fica `.../rest/api/2/rest/api/2`.

Não confirmado como bug (não foi a causa do 404 observado, que veio do server fallback em ISSUE 1), mas deve ser revisado.

```typescript
const base_url: string = Config.get('jiraBaseUrl'); // já inclui /rest/api/2
...
const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2', jira_mode);
// Resultado: https://euronext.atlassian.net/rest/api/2/rest/api/2
```

---

## Resumo

| #   | Severidade | Arquivo                              | Problema                                                                                             |
| --- | ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | CRÍTICA    | `jira-resource-version.ts:53`        | `isAtlassianCloudGateway` não detecta `*.atlassian.net` → Cloud search sempre cai em server fallback |
| 2   | MÉDIA      | `main.ts` + `import-prep-preview.ts` | `--auto` não seta `autoConfirm` → CSV import cancela                                                 |
| 3   | BAIXA      | `main.ts:207-219`                    | `XRAY_BASE_URL` obrigatório mesmo com Xray Cloud configurado                                         |
| 4   | OBS        | `main.ts:226`                        | `base_url + '/rest/api/2'` duplica path se env já tem `/rest/api/2`                                  |
| 5   | CRÍTICA    | `jira-resource-version.ts:74-103`    | Paginação Cloud infinita por falta de suporte a `nextPageToken`                                      |

---

## ISSUE 5 (CRÍTICA): Paginação Cloud infinita — `searchJiraIssuesCore` não usa `nextPageToken`

**Arquivo:** `jira_management/jira-resource-version.ts:74-103`

**Root cause:** O loop de paginação em `searchJiraIssuesCore` incrementa `startAt` a cada página e verifica `page.isLast` / `page.total` para decidir quando parar. Jira Cloud (API v3) não retorna `total` e retorna `isLast: false` mesmo em páginas intermediárias — o mecanismo de paginação real é `nextPageToken`. Como o código não extrai nem reenvia `nextPageToken`, cada requisição retorna os mesmos resultados da página 1, gerando loop infinito (~10000 chamadas até `MAX_TOTAL`).

**Evidência (runtime):**

```
# CLI hang — debug mostra o loop:
[http normalizeClientRequestArgs] using default protocol: https:
# pathname: "/rest/api/3/search/jql", search: "?startAt=1"
# pathname: "/rest/api/3/search/jql", search: "?startAt=2"
# ... ad infinitum
```

```json
// Resposta da Cloud após a 1a página (curl confirmou):
{
    "issues": [{ "id": "3356652" }],
    "nextPageToken": "Ch0j...",
    "isLast": false
}
```

`page.issues.length` (1) nunca < `maxResults` (1), `total` é sempre null, `isLast` é sempre false → `classifySearchPage` sempre retorna `stop=false`.

**Impacto:** CLI nunca completa. Loop de 10000 requisições HTTP. Operação de CSV e Test Execution bloqueada.

**Solução aplicada:**

1. `fetchSearchPage` recebe `nextPageToken` opcional; Cloud path usa `?nextPageToken=...` quando presente, `?startAt=...` na primeira página
2. `searchJiraIssuesCore` calcula `isCloud = resource.jiraMode === 'cloud' || isAtlassianCloudGateway(resource.baseUrl)`, propaga `page.nextPageToken` entre iterações e faz `if (isCloud && !page.nextPageToken) break` para evitar loop infinito quando Cloud sinaliza fim via ausência de token (sem depender de `isLast`/`total`)
3. `SearchPage` interface estendida com `nextPageToken?: string | null`

**Verificação:** typecheck limpo, 7/7 testes do módulo passam (2.17s).

---

## ISSUE 6 (BAIXA): `DataHub not initialized` no startup

**Arquivo:** `jira_management/main.ts:441-447`

**Root cause:** `main()` chama `getDataHub()` dentro de um try/catch, mas `ensureDataHub()` nunca foi chamado antes. O DataHub é inicializado apenas dentro do fluxo interativo (via módulos filho). Em modo headless (`--csv --auto`), o DataHub nunca é populado.

**Evidência (runtime):**

```
[startup] Health score failed: Error: DataHub not initialized. Call setDataHub() or ensureDataHub() before accessing getDataHub().
    at getDataHub (/mnt/c/dev/FORK/qa_tools-FORK/shared/data-hub/global-hub.ts:13:15)
    at main (/mnt/c/dev/FORK/qa_tools-FORK/jira_management/main.ts:445:21)
```

**Impacto:** `healthScore` fica `undefined` no startup. Sem impacto no fluxo CSV (health score é usado apenas no splash/debug), mas indica que o DataHub não foi configurado para o pipeline.

---

## ISSUE 7 (MÉDIA): `extractHost: invalid URL, returning unknown` durante associação de pre-conditions

**Arquivo:** `shared/infra/host-semaphore.ts:9`

**Root cause:** O interceptor de throttle do axios chama `extractHost(response.config.url)` após cada requisição. Quando a URL da resposta não tem hostname válido (ex: resposta de GraphQL ou URL relativa), `new URL(url)` lança erro e `extractHost` retorna `'unknown'`.

**Evidência (runtime):**

```
! extractHost: invalid URL, returning unknown
! extractHost: invalid URL, returning unknown
! extractHost: invalid URL, returning unknown
! extractHost: invalid URL, returning unknown
```

(4 ocorrências durante `addPreconditionsToTest` via Xray Cloud GraphQL)

**Impacto:** Baixo. Apenas warning — a associação de pre-condition funciona (OK). Mas polui o log e pode mascarar erros reais.

---

## ISSUE 8 (CRÍTICA — CORRIGIDA): `CloudStepImporter` recebe `jiraResourceXray` em vez de `jiraResource`

**Arquivo:** `jira_management/import-orchestrator.ts:208`

**Root cause:** `testCreationSetup()` cria o `CloudStepImporter` com `jiraResourceXray` em vez de `jiraResource`:

```typescript
// ANTES (bug):
const stepImporter = createStepImporter(jiraResourceXray, Config.get('xrayMode'));

// DEPOIS (corrigido):
const stepImporter = createStepImporter(jiraResource, Config.get('xrayMode'));
```

O `jiraResourceXray` tem `baseUrl` apontando para a URL Xray (ex: `https://xray.cloud.xpand-it.com`), **não** para a URL Jira. Quando `CloudStepImporter._resolveNumericId()` tenta fazer `GET issue/ECSPOL-1607`, o axios tenta resolver contra a baseURL Xray — que não é endpoint Jira — resultando em "Invalid URL".

**Evidência (runtime):**

```
OK  Issue criada: ECSPOL-1607
...
ERR GET issue/ECSPOL-1607 failed: Invalid URL           ← baseURL é Xray, não Jira
ERR   Step 1: Failed to resolve Jira issue key ECSPOL-1607 to numeric id: Invalid URL
```

**Impacto:** Step creation falha para TODOS os testes (não apenas o primeiro). 0/7 concluídos.

**Solução aplicada:** `import-orchestrator.ts:208` — `jiraResourceXray` → `jiraResource`.

---

## ISSUE 9 (MÉDIA — CORRIGIDA): CSV import não atualiza issues existentes

**Arquivo:** `jira_management/test-case-factory.ts`, `jira_management/import-loop.ts`

**Root cause:** Quando `skipExisting=true` encontrava uma issue por title match (`summary ~ "..."`), retornava `{ key, skipped: true }` e o caller (`_finalizeAfterIssueCreation`) registrava como "pulada" e **pulava steps/link**. Em re-execução, ECSPOL-1607 existia mas steps nunca eram criados.

**Evidência (runtime):** ECSPOL-1607 criado em execução anterior. Re-execução encontrava por title, pulava, steps nunca adicionados.

**Solução aplicada (UPDATE+DELETE flow):**

1. `test-case-factory.ts:45-50` — quando `skipExisting` acha match, chama `putJiraResource('issue/{key}', { fields })` para ATUALIZAR summary/description/labels
2. `CreateIssueResult` agora tem `updated: boolean` (além de `skipped`)
3. `import-loop.ts` — quando `updated=true`, **não** pula steps/link: executa `linkTestRelations` com `replaceSteps=true`
4. `postSteps(replaceSteps=true)` — usa `setSteps` (substituição atômica via Xray Cloud GraphQL `setTestSteps` mutation) em vez de `addTestStep` (append)

---

## Melhorias e Implementações

### M1: Mutation `setTestSteps` para substituição atômica de steps

**Arquivo:** `shared/jira/xray-cloud-client.ts` + `jira_management/xray-client.ts`

Adicionado método `setTestSteps` ao `XrayCloudClient` e `setSteps` ao `CloudStepImporter`. Usa GraphQL mutation `setTestSteps(issueId, steps)` que substitui TODOS os steps de uma vez — eliminando risco de duplicação em re-execução.

Para Server, `setSteps` itera `importStep` por step (append-only — idealmente deveria usar `PUT /test/{key}/steps`).

Interface `XrayStepImporter` estendida com método `setSteps(issueKey, steps)`.

### M2: `_finalizeAfterIssueCreation` — suporte a `updated` com steps/link

**Arquivo:** `jira_management/import-loop.ts`

O fluxo agora distingue 3 estados:

- `skipped=true` — issue existe e não foi modificada (pula steps/link)
- `updated=true` — issue existia e foi ATUALIZADA (executa steps/link com replace)
- `skipped=false, updated=false` — issue nova (executa steps/link com append)

### M3: Debug logging no startup

**Arquivo:** `jira_management/main.ts` + `shared/ui/splash.ts`

Adicionados logs `[startup]` e `[splash]` em cada passo do CLI startup para diagnóstico rápido de hangs. Erros que antes eram silenciosos (`rootLogger.debug`) agora são visíveis (`console.error` + `rootLogger.error`).

---

## ISSUE 10 (ALTA — CORRIGIDA): Checkpoint resume não executa update em tests já checkpointados

**Arquivo:** `jira_management/import-loop.ts`, `jira_management/import-prep-validation.ts`, `jira_management/test-case-factory.ts`

**Root cause:** `_checkResumeCheckpoint` retorna `resumeFrom=N` (número de testes já processados). O loop `executeTestCreationLoop` itera de `resumeFrom` até `tests.length`, **pulando completamente** os N primeiros testes. Como `createIssue` nunca é chamado para esses testes, a lógica de UPDATE via PUT (Issue 9) nunca executa neles.

**Cenário:** ECSPOL-1607 foi criado numa execução anterior (antes das correções Issues 8/9). Checkpoint marcou como "done". Execução seguinte (já com Issues 8/9 corrigidas) retomou do checkpoint, pulou test 1, e criou ECSPOL-1608 como novo — mas ECSPOL-1607 nunca foi atualizado com os dados do CSV.

**Solução aplicada:**

1. `test-case-factory.ts` — extraído `_attemptUpdate(params)` como método público reutilizável que encapsula a lógica de busca + PUT. Adicionado `checkOnly?: boolean` a `CreateIssueParams`: quando true, executa apenas busca+update, NUNCA POST (criação).
2. `import-loop.ts` — loop modificado para iterar **de 0 a tests.length** (não mais de resumeFrom). Para `t < resumeFrom`, passa `isCheckpoint: true` → `checkOnly: true` para `createIssue`. Se update encontrado, steps/link executados com `replaceSteps: true`. Se não, skip silencioso.
3. `_finalizeAfterIssueCreation` — não adiciona à `inMemoryTasksId` (já está no checkpoint) e não salva checkpoint novamente quando `isCheckpoint=true`.
4. `import-loop.ts` — add `isCheckpoint` a `ProcessOneTestOptions`.

---

## ISSUE 11 (CRÍTICA — CORRIGIDA): API `/rest/api/3/search/jql` não retorna `key`/`fields` sem `fields[]`

**Arquivo:** `jira_management/jira-resource-version.ts:57-74`

**Root cause:** A nova API de busca do Jira Cloud (`POST /rest/api/3/search/jql`) retorna **apenas `id`** por padrão — sem `key` e sem `fields`. O código esperava `issues[].fields.summary` para fazer o match exato de título, mas `fields` era `undefined`. Isso afetava TAMBÉM a validação de projeto (`initializeSession`), que usa `searchJiraIssues` para confirmar que o projeto existe.

**Evidência runtime:** ECSPOL-1607 existia com title identico ao TC-01 do CSV, mas `_attemptUpdate` nunca encontrava match. `existing.issues` vinha com `[{ id: "3357857" }]` — sem `key`, sem `fields`. Resultado: `find()` retornava `undefined` → criação de nova issue (ECSPOL-1609, ECSPOL-1616, etc.).

**Solução:** Adicionar `fields: ['summary']` ao corpo do POST em `fetchSearchPage`. Com isso a API retorna `key` + `fields.summary`:

```json
{ "issues": [{ "key": "ECSPOL-1622", "fields": { "summary": "..." } }] }
```

---

## Melhorias e Implementações (Realizadas)

### M1: Mutation `setTestSteps` para substituição atômica de steps

**Arquivo:** `shared/jira/xray-cloud-client.ts` + `jira_management/xray-client.ts`

Adicionado método `setTestSteps` ao `XrayCloudClient` e `setSteps` ao `CloudStepImporter`. Usa GraphQL mutation `setTestSteps(issueId, steps)` que substitui TODOS os steps de uma vez — eliminando risco de duplicação em re-execução.

Para Server, `setSteps` itera `importStep` por step (append-only — idealmente deveria usar `PUT /test/{key}/steps`).

Interface `XrayStepImporter` estendida com método `setSteps(issueKey, steps)`.

### M2: `_finalizeAfterIssueCreation` — suporte a `updated` com steps/link

**Arquivo:** `jira_management/import-loop.ts`

O fluxo agora distingue 3 estados:

- `skipped=true` — issue existe e não foi modificada (pula steps/link)
- `updated=true` — issue existia e foi ATUALIZADA (executa steps/link com replace)
- `skipped=false, updated=false` — issue nova (executa steps/link com append)

### M3: Debug logging no startup

**Arquivo:** `jira_management/main.ts` + `shared/ui/splash.ts`

Adicionados logs `[startup]` e `[splash]` em cada passo do CLI startup para diagnóstico rápido de hangs. Erros que antes eram silenciosos (`rootLogger.debug`) agora são visíveis (`console.error` + `rootLogger.error`).

### M4: Flag `--update-policy` e busca preview

**Arquivo:** `main.ts`, `test-case-factory.ts`, `import-orchestrator.ts`, `import-prep-preview.ts`

- Flag CLI `--update-policy=auto|skip|prompt`:
    - `auto` (default): atualiza issue existente por título
    - `skip`: pula se já existir (comportamento ORIGINAL)
    - `prompt`: pergunta ao usuário no terminal
- Preview (`import-orchestrator.ts`): antes de `confirmOrCancel()`, executa `findExistingMatches()` e exibe quantos testes já existem + política vigente
- `import-prep-preview.ts`: exibe match info no preview/resumo

---

## Melhorias Futuras — Sugestões Técnicas

### F1: Mapping file — match determinístico CSV row → Jira key

### F2: Mapping file — match determinístico CSV row → Jira key

**Problema:** Busca por `summary ~ "..."` é heurística. Pode falhar se título mudou entre execuções ou se há títulos similares.

**Solução:** Carregar `*-jira-mapping.json` (gerado automaticamente pelo import) para:

1. Saber exatamente qual Jira key corresponde a qual CSV row
2. Fazer UPDATE direto (sem busca)
3. Fallback para busca por título apenas quando não há mapping

### F3: `extractHost` — silenciar warning em URLs de resposta

**Problema:** `host-semaphore.ts:9` loga warning quando `new URL(url)` falha. O interceptor de throttle recebe URLs relativas/respostas GraphQL que não são URLs válidas.

**Solução:** Validar URL antes de chamar `new URL()`:

```typescript
export function extractHost(url: string): string {
    if (!url || !url.startsWith('http')) return 'unknown';
    try {
        return new URL(url).hostname;
    } catch {
        return 'unknown';
    }
}
```

### F4: `DataHub not initialized` no headless mode

**Problema:** `main()` chama `getDataHub()` dentro de try/catch mas `ensureDataHub()` nunca foi chamado para headless.

**Solução:** Chamar `ensureDataHub()` antes de `getDataHub()` no startup, ou remover o catch silencioso para expor o erro.

---

## ISSUE 12 (CRÍTICA — CORRIGIDA): Validação de startup usa search paginado — loop infinito

**Arquivo:** `main.ts:268-278`

**Root cause:** A validação de projeto em `initializeSession` chamava `searchJiraIssues('project=ECSPOL', 1)` com `maxResults=1`. O Cloud API v3 retorna 1 issue por página com `nextPageToken`. A função `classifySearchPage` não para porque:

- `isLast` = false (mais páginas existem)
- `issues.length < maxResults` = `1 < 1` = false
- `total` = null (v3 não retorna `total` por padrão)

**Consequência:** Para projeto com N issues, faz N requests × ~1.3s = N×1.3s de espera. Projeto com ~140 issues = ~180s.

**Solução:** Substituir `searchJiraIssues(jql, 1)` por `getJiraResource('project/' + project_name)`. Lookup direto, sem paginação, ~1.3s.

**Timing medido:** 1328ms, 1297ms, 1313ms, 1320ms por página (Cloud API). Com fix: 1 request de ~1.3s.

---

## ISSUE 13 (MÉDIA — CORRIGIDA): Sem instrumentação de timing em chamadas API

**Arquivo:** `shared/jira/jira-client.ts`

**Problema:** Impossível diagnosticar lentidão de chamadas API Jira. Todas as operações HTTP (`get`, `post`, `put`, `postToApiRoot`) não registram tempo de execução.

**Solução:** Adicionado `[timing]` log em `getJiraResource`, `postJiraResource`, `putJiraResource`, `postToApiRoot`, `getFromOriginPath`. Log:

- `>1s`: warn (visível em produção)
- `<1s`: debug (visível com `DEBUG=true`)

Formato: `[timing] POST /rest/api/3/search/jql 1328ms`

---

## ISSUE 14 (ALTA — CORRIGIDA): Multi-match sem tratamento — update pega 1º de N duplicates

**Arquivo:** `test-case-factory.ts`, `import-loop.ts`

**Root cause:** `_attemptUpdate` usa `find()` que retorna o primeiro match. Se N issues têm mesmo título, só 1 é atualizada — as demás ficam stale.

**Solução:** `_attemptUpdate` agora coleta TODOS os matches via `filter()`:

- 0 matches → cria novo
- 1 match → update (comportamento anterior)
- N>1 matches:
    - `auto`/`skip`: skip + warning "múltiplos matches"
    - `prompt`: lista numerada, usuário seleciona qual atualizar

**Novo campo:** `ambiguous?: boolean` em `CreateIssueResult`.

---

## ISSUE 15 (ALTA — CORRIGIDA): Erros de cross-reference silenciosos — PUT falha sem aviso visível

**Arquivo:** `issue-linker.ts:81-87`, `import-orchestrator.ts:222-224`

**Root cause:** `updateGroupLinks` captura erros de `GET`/`PUT` com `catch` que loga apenas no `crossLog.error` — invisível para o usuário. Se `PUT /issue/<id>` falhar (permissão, configuração de campo, rate limit), o import termina sem erro visível.

**Solução:**

1. `updateGroupLinks` retorna `string[]` (IDs dos membros que falharam)
2. `updateCrossReferences` coleta todos os failures e retorna `string[]`
3. `postProcessCheckpoint` adiciona failures ao `failedLinks` com prefixo `cross-ref:`
4. `finalizeTestCreation` inclui failures no resumo final: `"N cross-reference(s) falharam: ECSPOL-XXXX, ..."`
5. `onError` chamado para cada failure — exibe detalhes no terminal

---

## ISSUE 16 (ALTA — CORRIGIDA): Alinhamento inMemoryTasksId quebra se teste falhar na criação

**Arquivo:** `import-loop.ts:365-392`

**Root cause:** `buildCrossRefGroups` mapeia `tests[i]` → `ids[i]` por índice. Se `createIssueForTest` retorna `null`/`continue`, `_finalizeAfterIssueCreation` nunca é chamado → nenhum key é empurrado para `inMemoryTasksId` → array fica menor que `tests` → mapeamento por índice desaliniza.

**Consequência:** Testes com `group` podem mapear para keys de outros tests, gerando cross-references incorretos.

**Solução:** `processCreationAndLinking` empurra `''` (empty string) para `inMemoryTasksId` quando retorna early. `buildCrossRefGroups` filtra strings vazias (falsy) → tests sem key são ignorados corretamente.

---

## ISSUE 17 (NOVA FEATURE — IMPLEMENTADA): Target Keys para update ordenado por chave Jira

**Arquivo:** `main.ts`, `test-case-factory.ts`, `import-orchestrator.ts`

**Problema:** Matching por título é falho quando issues existentes têm títulos duplicados ou embaralhados. Não é possível atualizar um conjunto específico de issues de forma ordenada.

**Solução:** Feature `--target-keys` — mapeamento explícito por chave Jira, na ordem do CSV.

### Componentes implementados

| Componente        | Arquivo                          | Descrição                                                               |
| ----------------- | -------------------------------- | ----------------------------------------------------------------------- |
| CLI parsing       | `main.ts:450-460`                | `--target-keys KEY1,KEY2,...` → `Config.set('targetKeys', [...])`       |
| Help text         | `main.ts:428-430`                | `--target-keys <KEY1,KEY2,...>` documentado no help                     |
| UI prompt         | `import-orchestrator.ts:100-103` | Prompt interativo: "Mapear por chave Jira? (ex: ECSPOL-1605,...)"       |
| Preview           | `import-orchestrator.ts:104-120` | Mostra mapeamento `CSV[1] → ECSPOL-1605` antes da confirmação           |
| Factory key-based | `test-case-factory.ts:124-150`   | `_attemptUpdateByKey` — GET + PUT direto pela key, sem JQL search       |
| Safeguard         | `test-case-factory.ts:162-180`   | Se `targetKeys[i]` existe, issue NÃO pode ser criada — only update/skip |
| Fallback          | `test-case-factory.ts:155`       | Se `targetKeys[i]` não existe para o idx, usa matching por título       |

### Safeguard clause (crítica)

```typescript
const hasTargetKey = targetKeys && testIdx < targetKeys.length && targetKeys[testIdx];
// ...
if (hasTargetKey) {
    warn('Target key ' + targetKeys![testIdx] + ' falhou — issue NAO pode ser criada');
    return { key: targetKeys![testIdx], skipped: true };
}
```

Quando `targetKeys[i]` está definido para um teste:

- PUT na key especificada é a ÚNICA operação permitida
- Se a issue não existe ou PUT falha → skip (nunca cria nova)
- Garantia: zero issues duplicadas em update ordenado

### Uso

```bash
# CLI: update ordenado
node jira_management/main.ts --auto --target-keys ECSPOL-1605,ECSPOL-1606,...,ECSPOL-1611

# UI: prompt interativo aparece antes da confirmação
# "Mapear por chave Jira? (ex: ECSPOL-1605,ECSPOL-1606,... ou Enter para skip)"
```

---

## ISSUE 18 (CRÍTICA — CORRIGIDA): Mutation `setTestSteps` não existe no Xray Cloud API

**Arquivo:** `shared/jira/xray-cloud-client.ts:119-146`

**Root cause:** O código usava a mutation `setTestSteps` para substituir test steps, mas esta mutation não existe na API GraphQL do Xray Cloud. A mutation correta é `removeAllTestSteps` + `addTestStep` por step.

**Evidência (runtime):**

```
ERR Xray Cloud GraphQL mutation failed: 400 Bad Request
```

**Solução aplicada:** Substituído `setTestSteps` por `removeAllTestSteps` + loop `addTestStep` por step. Descoberto via introspection GraphQL da API.

---

## ISSUE 19 (CRÍTICA — CORRIGIDA): Mutation `addTestsToTestExecution` usa arg name errado

**Arquivo:** `shared/jira/xray-cloud-client.ts:191-198`

**Root cause:** O código usava `testExecIssueId` como nome do argumento, mas a API GraphQL espera `issueId`. Isso causava erro 400 na associação de testes a Test Executions.

```graphql
# ERRADO:
addTestsToTestExecution(testExecIssueId: $testExecIssueId, ...)

# CORRETO (API real):
addTestsToTestExecution(issueId: $issueId, ...)
```

**Evidência (runtime):**

```
ERR Falha na associação nativa Xray Cloud: Request failed with status code 400
```

**Solução aplicada:** Corrigido arg name de `testExecIssueId` para `issueId` na mutation e no objeto de variáveis.

---

## ISSUE 20 (FEATURE — IMPLEMENTADA): `--associate-te` — associar testes a Test Execution existente

**Arquivo:** `jira_management/main.ts`, `jira_management/commands/case28.ts`, `jira_management/menu-data.ts`

**Problema:** Não existia forma de associar testes existentes a uma Test Execution existente via CLI ou menu interativo.

**Solução implementada:**

### CLI

```bash
npx tsx jira_management/main.ts --associate-te ECSPOL-1624 --tests ECSPOL-1605,ECSPOL-1606,ECSPOL-1607
```

### Menu interativo

Opção `28` no submenu "GERAÇÃO DE CASOS DE TESTE":

- Alias: `associar-te`, `associar-testes`, `associate`

### Validação pré-association

1. Busca `GET issue/<TE_KEY>` → valida que existe e é `Test Execution`
2. Busca `GET issue/<KEY>` para cada test key → valida que existe
3. Se qualquer key inválida: `ERR Issue ECSPOL-9999 não encontrada` (por key)
4. Só então chama `addTestsToExistingExecution`

### Fluxo headless

```typescript
export async function runAssociateTe(res: RuntimeResources, teKey: string, testKeys: string[]): Promise<ExitCode> {
    // 1. Validate TE key exists and is Test Execution type
    // 2. Validate each test key exists
    // 3. If any invalid → explicit per-key error messages, return ERROR
    // 4. Associate via TestExecutionCreator.addTestsToExistingExecution
}
```

### Fluxo interativo (case28.ts)

1. Pede key da TE
2. Pede keys dos testes (vírgula ou espaço)
3. Valida TE + cada teste
4. Associa e mostra resultado

---

## Resumo

| #   | Severidade | Arquivo                                                     | Problema                                                                                             | Status        |
| --- | ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| 1   | CRÍTICA    | `jira-resource-version.ts:53`                               | `isAtlassianCloudGateway` não detecta `*.atlassian.net` → Cloud search sempre cai em server fallback | Corrigido     |
| 2   | MÉDIA      | `main.ts` + `import-prep-preview.ts`                        | `--auto` não seta `autoConfirm` → CSV import cancela                                                 | Corrigido     |
| 3   | BAIXA      | `main.ts:207-219`                                           | `XRAY_BASE_URL` obrigatório mesmo com Xray Cloud configurado                                         | Corrigido     |
| 4   | OBS        | `main.ts:226`                                               | `base_url + '/rest/api/2'` duplica path se env já tem `/rest/api/2`                                  | Corrigido     |
| 5   | CRÍTICA    | `jira-resource-version.ts:74-103`                           | Paginação Cloud infinita por falta de suporte a `nextPageToken`                                      | Corrigido     |
| 6   | BAIXA      | `main.ts`                                                   | `getDataHub()` chamado sem `ensureDataHub()` → healthScore undefined                                 | Não corrigido |
| 7   | MÉDIA      | `host-semaphore.ts:9`                                       | `extractHost` falha em URLs de resposta não-HTTP (GraphQL) → warning                                 | Não corrigido |
| 8   | CRÍTICA    | `import-orchestrator.ts:208`                                | `CloudStepImporter` recebe `jiraResourceXray` em vez de `jiraResource`                               | Corrigido     |
| 9   | MÉDIA      | `test-case-factory.ts`, `import-loop.ts`                    | CSV import não atualiza issues existentes → re-execução falha                                        | Corrigido     |
| 10  | ALTA       | `import-loop.ts`, `import-prep-validation.ts`               | Checkpoint resume não executa createIssue → update nunca aplicado em tests checkpointados            | Corrigido     |
| 11  | CRÍTICA    | `jira-resource-version.ts:57-74`                            | API `/rest/api/3/search/jql` sem `fields[]` retorna só `id` — sem `key`/`fields` para match          | Corrigido     |
| 12  | CRÍTICA    | `main.ts:268-278`                                           | Validação de projeto usa `searchJiraIssues(maxResults=1)` → loop de paginação infinito (~1.3s/issue) | Corrigido     |
| 13  | MÉDIA      | `jira-client.ts`                                            | Sem instrumentação de timing — impossível diagnosticar lentidão de API                               | Corrigido     |
| 14  | ALTA       | `test-case-factory.ts`, `import-loop.ts`                    | Multi-match não tratado — update pega 1º de N duplicates sem warning                                 | Corrigido     |
| 15  | ALTA       | `issue-linker.ts`, `import-orchestrator.ts`                 | Erros de cross-reference silenciosos — PUT falha sem aviso visível                                   | Corrigido     |
| 16  | ALTA       | `import-loop.ts`                                            | Alinhamento inMemoryTasksId quebra se teste falhar na criação                                        | Corrigido     |
| 17  | FEATURE    | `main.ts`, `test-case-factory.ts`, `import-orchestrator.ts` | Target Keys: update ordenado por chave Jira com safeguard anti-criação                               | Implementado  |
| 18  | CRÍTICA    | `shared/jira/xray-cloud-client.ts:119-146`                  | Mutation `setTestSteps` não existe no Xray Cloud API                                                 | Corrigido     |
| 19  | CRÍTICA    | `shared/jira/xray-cloud-client.ts:191-198`                  | `addTestsToTestExecution` usa arg name errado (`testExecIssueId` → `issueId`)                        | Corrigido     |
| 20  | FEATURE    | `main.ts`, `commands/case28.ts`, `menu-data.ts`             | `--associate-te`: associar testes a Test Execution existente com validação prévia                    | Implementado  |

**Status final:** 20 issues/features registradas, 18 corrigidas/implementadas (1-5, 8-20). Pendente Issues 6 (DataHub) e 7 (extractHost).
