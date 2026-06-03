# Production Configuration — QA Tools E2E Reference

Validado contra Jira Server (Xray Server) em produção em 2026-05-29.

---

## 1. Variáveis de Ambiente (`.env`)

| Variável              | Valor em Produção                                      | Notas                                                       |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| `JIRA_BASE_URL`       | `https://jiraprod.srv.euronext.com`                    | Também aceita `jira.euronext.com` (Cloudflare roteia igual) |
| `JIRA_PERSONAL_TOKEN` | PAT (Bearer)                                           | Autenticação via **Bearer token**, não Basic                |
| `JIRA_USER_EMAIL`     | `Kevin.Borges.contractor@euronext.com`                 | Apenas para referência                                      |
| `XRAY_BASE_URL`       | `https://jiraprod.srv.euronext.com/rest/raven/2.0/api` | Xray Server REST API                                        |
| `XRAY_MODE`           | `server` (não definido = default)                      | Cloud mode requer `XRAY_CLIENT_ID` + `XRAY_CLIENT_SECRET`   |
| `GITHUB_TOKEN`        | `github_pat_...`                                       | Token clássico com permissões de leitura                    |

⚠️ `XRAY_MODE=cloud` requer configuração adicional (`XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`, `xray.cloud.getxray.app`). Não testado.

---

## 2. Jira Server Topology

```
Usuário → Cloudflare → Apache Tomcat 9.0.111 → Jira Data Center
```

- **Rate limit**: ~2-3 requests/minuto por token (429 Too Many Requests)
- **Cooldown**: ~30-60s após 429
- **Hosts funcionais**: `jira.euronext.com` (preferencial), `jiraprod.srv.euronext.com` (redirect)
- **Código tem retry**: 5 tentativas com backoff exponencial (2s, 4s, 8s, 16s, 32s). Pode ser insuficiente em horário de pico.

---

## 3. Endpoints da API

### Jira REST API (base: `/rest/api/2`)

| Endpoint        | Método | Uso                                      |
| --------------- | ------ | ---------------------------------------- |
| `myself`        | GET    | Autenticação                             |
| `project/{key}` | GET    | Validação de projeto                     |
| `issue`         | POST   | Criar issue (Test, Test Execution, etc.) |
| `issue/{key}`   | GET    | Ler issue                                |
| `issue/{key}`   | PUT    | Atualizar issue                          |
| `issuetype`     | GET    | Listar issue types                       |
| `field`         | GET    | Listar custom fields                     |
| `issueLinkType` | GET    | Listar link types                        |
| `issueLink`     | POST   | Criar link entre issues                  |
| `search`        | GET    | JQL search                               |

### Xray Server API (base: `/rest/raven/2.0/api`)

| Endpoint              | Método | Uso                               |
| --------------------- | ------ | --------------------------------- |
| `test/{key}/steps`    | GET    | Ler steps de um test              |
| `test/{key}/steps`    | POST   | Adicionar/atualizar step          |
| `test/{key}/testruns` | GET    | Histórico de execuções de um test |
| `import/execution`    | POST   | Importar resultado de execução    |

**Importante:** A Raven API tem versões 1.0 e 2.0.

- `/rest/raven/1.0/api/test/{key}/testruns` — retorna steps + status + evidencias
- `/rest/raven/2.0/api/test/{key}/testruns` — mesmo formato (compatível)

Ambas funcionam na instância de produção.

---

## 4. Field Mappings (Jira Custom Fields)

### Pre-condition em Test (`customfield_13708`)

```
Nome: Pre-Conditions association
Schema: com.xpandit.plugins.xray:test-precondition-custom-field
Tipo: Array de strings (issue keys)
Exemplo: ["ECSPOL-1202"]
Forma de envio: { "fields": { "customfield_13708": ["ECSPOL-1202"] } }
```

- **Pode ser enviado na criação** (POST /issue) ou via PUT posterior
- O código atual faz GET → append → PUT via `JiraLinkManager.associatePrecondition()`

### Test Execution — Tests (`customfield_13715`)

```
Nome: Tests association with a Test Execution
Schema: com.xpandit.plugins.xray:testexec-tests-custom-field
Tipo: Array de strings (issue keys)
Exemplo: ["ECSPOL-1295", "ECSPOL-1255"]
Forma de envio: { "fields": { "customfield_13715": ["KEY-1", "KEY-2"] } }
```

- ⚠️ A resposta do GET mostra `[{"testKey":"ECSPOL-1295","testRunId":22055473}]` — objeto com `testKey` + `testRunId`
- Mas o **envio** é feito como array de strings simples
- **Não cria issuelinks** — é um campo de referência próprio do Xray

### Issue Type IDs

| Type           | ID                     |
| -------------- | ---------------------- |
| Test           | (variável por projeto) |
| Pre-Condition  | (variável)             |
| Test Execution | `11802`                |
| Epic           | `11200`                |

### Link Types

| Nome  | ID      | inward         | outward |
| ----- | ------- | -------------- | ------- |
| Tests | `10600` | "is tested by" | "tests" |

---

## 5. Step Field Format (Xray Server)

### POST `/test/{key}/steps`

**Payload correto:**

```json
{
    "index": 1,
    "fields": {
        "Action": "Acessar sistema",
        "Data": "https://url.com",
        "Expected Result": "Sistema carregado"
    }
}
```

### 🐛 Bug confirmado: `ExpectedResult` vs `Expected Result`

**Arquivo:** `jira_management/xray-client.ts:17-22` (`ServerStepImporter.importStep`)

O código envia `fields.ExpectedResult` (sem espaço), mas a API Xray Server espera `fields.Expected Result` (com espaço).

**Payload enviado pelo código (ERRADO):**

```json
{ "fields": { "ExpectedResult": "valor" } }
```

**Payload esperado pela API (CORRETO):**

```json
{ "fields": { "Expected Result": "valor" } }
```

**Impacto:** `POST /test/{key}/steps` retorna 400 com erro: `"Provided field expectedresult does not exist or is disabled"`

**Possível correção:**

```typescript
// xray-client.ts — ServerStepImporter.importStep
const payload: Record<string, unknown> = {
    index: stepIndex,
    fields: {
        Action: step.fields.Action ?? '',
        Data: step.fields.Data ?? '',
        'Expected Result': step.fields.ExpectedResult ?? '', // ← espaço
    },
};
await this.jiraResource.postJiraResource('test/' + issueKey + '/steps', payload);
```

Ou, alternativamente, renomear `ExpectedResult` para `ExpectedResult` → `Expected Result` no `TestStep` em `shared/types.ts`.

### GET `/test/{key}/steps` — Response format

```json
{
    "steps": [
        {
            "id": 276260,
            "index": 1,
            "fields": {
                "Action": {
                    "type": "Wiki",
                    "value": {
                        "raw": "Acessar pagina",
                        "rendered": "<p>Acessar pagina</p>"
                    }
                },
                "Data": { "type": "Wiki", "value": { "raw": "", "rendered": "" } },
                "Expected Result": { "type": "Wiki", "value": { "raw": "", "rendered": "" } }
            },
            "attachments": [],
            "testCallStep": false
        }
    ]
}
```

- Fields são objetos Wiki, não strings simples
- `raw` = texto puro, `rendered` = HTML
- A API de GET retorna estrutura aninhada, mas POST aceita strings simples

---

## 6. Import Execution Endpoint (Xray)

`POST /rest/raven/2.0/api/import/execution`

Payload esperado:

```json
{
    "testExecutionKey": "ECSPOL-XXXX",
    "tests": [{ "testKey": "ECSPOL-1255", "status": "TODO" }]
}
```

Não testado completamente (rate limiting impediu o POST), mas o endpoint respondeu com 400 erro significativo confirmando que existe.

---

## 7. GitHub (Read-Only)

| Operação                      | Status   | Observação                                                           |
| ----------------------------- | -------- | -------------------------------------------------------------------- |
| `getBranch('main')`           | ✅ OK    | Retorna `name`, `sha`                                                |
| `getBranch('__nonexist__')`   | ✅ OK    | Retorna `null`                                                       |
| `getDiff('main', 'dev')`      | ⚠️ Vazio | Branch `dev` não existe no repositório (`kevindemian/qa_tools`)      |
| `getRecentPipelines(5)`       | ✅ OK    | 5 runs retornadas                                                    |
| `getCICDVariables()`          | ⚠️ 403   | Token sem permissão para ler variáveis CI/CD. Código trata como `[]` |
| `searchMergeRequests('open')` | ✅ OK    | 0 PRs abertos                                                        |

Token requer permissões: `repo` (full control) para branches/diffs, `actions:read` para pipelines, `secrets` para variáveis CI/CD.

---

## 8. Issues Criadas Durante E2E

| Key         | Tipo           | Descrição                                        | Label |
| ----------- | -------------- | ------------------------------------------------ | ----- |
| ECSPOL-1255 | Test           | TC01 - Busca de politica (pre-existente)         | `e2e` |
| ECSPOL-1295 | Test           | TC E2E - Teste automatizado de integracao (nova) | `e2e` |
| ECSPOL-1296 | Test Execution | E2E Smoke - 2026-05-29 (nova)                    | —     |

ECSPOL-1295 tem 2 steps (3º step perdido por rate limit durante POST).

---

## 9. Issues Conhecidas (Debt Técnico)

### P1 — Step field name mismatch (✅ Corrigido)

`ServerStepImporter` enviava `ExpectedResult`, Xray Server espera `Expected Result`.  
**Arquivo:** `jira_management/xray-client.ts:17-22`  
**Impacto histórico:** `createTestsFromCsv` falhava ao postar steps em produção.  
**Correção:** Payload alterado para usar `'Expected Result'` (com espaço). Validado em testes unitários.

### P2 — Rate limiting

Jira Data Center atrás de Cloudflare limita a ~2-3 req/min.  
**Impacto:** Importação de múltiplos testes (lote >1) é inviável.  
**Workaround:** Adicionar delay de 5-10s entre POSTs no `import-loop.ts` quando `Config.rateLimitDelay` estiver setado.

### P3 — Xray History endpoint URL mal construída (✅ Corrigido)

**Arquivo:** `jira_management/xray-history.ts` (`ServerHistoryProvider.getHistory`)

A URL chamada era `rest/raven/1.0/api/test/{key}/testruns`, mas o `JiraResource` usado tinha base URL = `https://jira.euronext.com/rest/api/2`. A URL resultante era:

```
https://jira.euronext.com/rest/api/2/rest/raven/1.0/...  ❌ (duplo /rest/)
```

**Correção:** `ServerHistoryProvider` agora usa `XRAY_BASE_URL` como base, eliminando o duplo `/rest/`. Validado em testes unitários.

### P4 — Step #3 perdido por rate limit

O step 3 de ECSPOL-1295 não foi criado porque o rate limit atingiu durante o POST.  
**Impacto:** Dados inconsistentes se o processo for interrompido no meio. O checkpoint/resume pode mitigar, mas não se o rate limit for o problema.

### P5 — Report CTRF usa fixture, não dados reais

`e2e/fixtures/ctrf-report.json` contém testes genéricos (`TC01 - Login valido`, etc.) sem correspondência com execuções reais. O report gerado mescla CI/CD real (workflows do GitHub) com resultados de teste falsos — as seções ficam inconsistentes entre si.

**Impacto:** Relatórios de demonstração podem enganar se não for explicitado que os test results são fixture. Para um report 100% real, o CTRF precisa vir de uma execução de pipeline com nomes de teste reais mapeados no `mapping.json`.

---

## 10. E2E Test Artifacts (2026-05-29)

| Arquivo                      | Propósito                                                    |
| ---------------------------- | ------------------------------------------------------------ |
| `e2e/run-e2e.ts`             | Script e2e automatizado (Fases 1-6)                          |
| `e2e/gen-report.ts`          | Geração de report básico (CTRF + CI/CD)                      |
| `e2e/gen-report-complete.ts` | Geração de report completo (CTRF + CI/CD + Xray History)     |
| `e2e/create-test-manual.sh`  | Criação manual de test + TE via curl (workaround rate limit) |
| `reports/2026-05-29/`        | Reports gerados (2 versões) + mapping + baseline CTRF        |
| `docs/PRODUCTION-CONFIG.md`  | Este documento                                               |
| `jira_xray_config_backup.md` | Backup de configuração do ambiente                           |

### Fluxo de Geração de Relatório

```
CI/CD Pipeline
    ↓ (gera CTRF JSON)
qa_tools case17 (ou gen-report*.ts)
    ↓ parse + mapping.json → Xray history
generateHtmlReport()
    ↓ injeta CI/CD context + Jira context + Xray history
writeReport() → reports/YYYY-MM-DD/report-*.html
```

## 11. Checklist de Manutenção

Ao atualizar o código, verificar:

- [ ] `shared/types.ts:TestStep.fields.ExpectedResult` — nome do campo corresponde ao que a Xray Server API espera
- [ ] `jira_management/xray-client.ts:ServerStepImporter.importStep` — payload enviado para POST steps
- [ ] `jira_management/jira_link_manager.ts:associatePrecondition` — `customfield_13708` (field ID pode mudar entre instâncias Jira)
- [ ] `jira_management/test-execution-creator.ts` — `customfield_13715` (field ID do Test Execution)
- [ ] `shared/config.ts` — `XRAY_MODE` default é `server`
- [ ] `.env.example` — manter sincronizado com as variáveis reais
