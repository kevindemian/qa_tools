# Dead Code Registry — Deferred Indefinitely (sine die)

> **Regra:** Itens com risco > 0 não podem ser removidos sem análise sistêmica.
> Registrados aqui para auditoria e planejamento futuro.
> Nenhuma ação será tomada até que a causa raiz possa ser corrigida.

## Categorias

| Categoria                                  | Risco | Qtd    | Decisão                               |
| ------------------------------------------ | ----- | ------ | ------------------------------------- |
| Função órfã com valor de domínio           | Alto  | 1      | Integrar, não remover                 |
| Type que documenta domínio (não-integrado) | Médio | 1      | Integrar na assinatura, não remover   |
| Test re-exports intencionais               | Alto  | 9      | Projeto deliberado para testabilidade |
| Underscore test-only exports               | Alto  | 2      | Convenção explícita                   |
| Barrel `export *` estrutural               | Médio | 17     | Trocar por exports explícitos         |
| Entry point                                | Médio | 1      | Requer análise de carregamento        |
| **Total**                                  |       | **31** |                                       |

---

## 1. Função órfã com valor de domínio

### `refineWithConsistency` — `shared/llm-self-consistency.ts:190`

**O que é:** Função real com ~35 linhas implementando refinamento por auto-consistência.
Define um prompt de refinamento e faz uma chamada LLM adicional para convergir candidatos divergentes.

**Por que não pode ser removida:**

- É parte do design do módulo de self-consistency (documentado no header do módulo)
- O módulo principal `consensusGenerate` retorna `divergence: 'none' | 'low' | 'high'`
- `refineWithConsistency` foi projetada para ser chamada quando `divergence === 'high'`
- Mas ninguém faz essa chamada — é um **gap de integração**, não código morto

**Root cause:** O pipeline de chamada `consensusGenerate → refineWithConsistency` nunca foi completado.

**Correção correta:** Integrar `refineWithConsistency` em `consensusGenerate`:

- Após obter resultado com `divergence === 'high'`, chamar automaticamente `refineWithConsistency`
- Ou criar uma função orchestrator `generateWithConsistency()` que chama ambos

---

## 2. Type que documenta domínio (não-integrado)

### `JiraMode` — `shared/jira-auth.ts:19`

**O que é:** `export type JiraMode = 'server' | 'cloud'`

**Por que não pode ser removida:**

- Documenta os modos de operação suportados pelo Jira auth
- A função `createJiraAuthHeader` recebe `mode: string` em vez de `mode: JiraMode`
- Isso é uma **falha de design**: o type existe mas não foi integrado à assinatura

**Correção correta:** Trocar parâmetro de `createJiraAuthHeader` de `string` para `JiraMode`.
Isso muda contrato — requer análise de todos os consumidores.

**Consumidores atuais:**

- `e2e/smoke-jira-cloud.test.ts` (test)
- Potencialmente `jira_resource.ts` ou `xray-client.ts` em produção

---

## 3. Test re-exports intencionais

### `jira_management/commands/case17.ts` (9 exports)

Exportados especificamente para serem importados por testes (`case17.test.ts`).
Remover quebraria os testes.

| Export           | Origin              |
| ---------------- | ------------------- |
| CiContext        | `case17-helpers.ts` |
| RunStats         | `case17-helpers.ts` |
| CTRF_LAST_FILE   | `case17-helpers.ts` |
| GIT_HISTORY_RUNS | `case17-helpers.ts` |
| isGitHubCi       | `case17-helpers.ts` |
| isGitLabCi       | `case17-helpers.ts` |
| buildDiffSummary | `case17-helpers.ts` |
| isValidCtrfData  | `case17-helpers.ts` |
| resolveMapping   | `case17-helpers.ts` |

---

## 4. Underscore test-only exports

Convenção `_` = "exportado apenas para teste".

| Arquivo                             | Export          | Uso                |
| ----------------------------------- | --------------- | ------------------ |
| `git_triggers/session-state.ts:161` | `_resetForTest` | Testes de sessão   |
| `shared/llm-fallback.ts:136`        | `_trackUsage`   | Testes de métricas |

---

## 5. Barrel `export *` estrutural

### `shared/llm-fallback.ts` (17 exports)

`export * from './llm-fallback-config.js'` e `export * from './llm-fallback-http.js'`
cria re-exports implícitos. Nenhum consumidor importa esses nomes DO BARREL;
importam diretamente dos submódulos.

**Exports envolvidos:**
ProviderFormat, buildOpenAiPayload, buildGeminiPayload, LlmErrorPayloadSchema,
LLM_TEMP_DEFAULT, getFetchRetries, fetchWithRetry, LLM_RETRY_BASE_WAIT_MS,
LLM_RETRY_MAX_WAIT_MS, LLM_FETCH_TIMEOUT_MS, LLM_ERROR_BODY_TRUNCATION,
LlmClientMetrics, estimateCostUSD, getModelPricing, hasPricingForModel,
\_trackUsage, extractContent

**Correção:** Trocar `export *` por exports explícitos.
Risco médio — verificar se algum teste importa via barrel.

---

## 6. Entry point default export

### `git_triggers/main.ts:31 — default`

O export default do entry point CLI. Pode ser consumido pelo runtime ou por
loaders. Requer análise para confirmar se é usado externamente.

---

## 7. Outros barrel re-exports (risco baixo)

### `jira_management/import-prep.ts` (2 exports)

| Export           | Origin                      |
| ---------------- | --------------------------- |
| PreviewMdOptions | `import-prep-preview.ts`    |
| ValidationResult | `import-prep-validation.ts` |

Re-exports de barrel que ninguém importa. Risco baixo, deferido por
consistência com os demais barrel re-exports.

---

## Histórico

| Data       | Ação                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 2026-06-07 | Criação do registro. Sprint Dead Code removeu 28 exports (fase 1). 31 itens deferidos. |
