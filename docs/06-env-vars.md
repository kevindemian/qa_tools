# Variáveis de Ambiente

Todas as variáveis são carregadas do arquivo `.env` na raiz do projeto.

---

## Jira / Xray

| Variável              | Getter Config              | Obrigatória? | Padrão   | Descrição                                                                        |
| --------------------- | -------------------------- | ------------ | -------- | -------------------------------------------------------------------------------- |
| `JIRA_BASE_URL`       | `Config.jiraBaseUrl`       | Sim (Jira)   | —        | URL base do Jira Server                                                          |
| `JIRA_PERSONAL_TOKEN` | `Config.jiraPersonalToken` | Sim (Jira)   | —        | Token Bearer para autenticação Jira                                              |
| `XRAY_BASE_URL`       | `Config.xrayBaseUrl`       | Sim (Xray)   | —        | URL base do servidor Xray                                                        |
| `XRAY_MODE`           | `Config.xrayMode`          | Não          | `server` | Modo Xray: `server` (REST) ou `cloud` (GraphQL)                                  |
| `XRAY_CLOUD_ENDPOINT` | —                          | Não          | —        | Override do endpoint GraphQL Xray Cloud (padrão: `XRAY_BASE_URL`/api/v2/graphql) |
| `XRAY_CLIENT_ID`      | `Config.xrayClientId`      | Não          | —        | Client ID para autenticação Xray Cloud (modo `cloud`)                            |
| `XRAY_CLIENT_SECRET`  | `Config.xrayClientSecret`  | Não          | —        | Client Secret Xray Cloud                                                         |
| `JIRA_PROJECT`        | `Config.jiraProject`       | Não          | `ECSPOL` | Projeto Jira padrão                                                              |

## Git (GitLab / GitHub)

| Variável         | Getter Config         | Obrigatória? | Padrão                   | Descrição                  |
| ---------------- | --------------------- | ------------ | ------------------------ | -------------------------- |
| `GIT_TOKEN`      | `Config.gitToken`     | Sim (Git)    | —                        | Token GitLab PRIVATE-TOKEN |
| `GIT_BASE_URL`   | `Config.gitBaseUrl`   | Sim (Git)    | —                        | URL do servidor GitLab     |
| `GITHUB_TOKEN`   | `Config.githubToken`  | Condicional  | —                        | Token Bearer GitHub        |
| `GITHUB_API_URL` | `Config.githubApiUrl` | Não          | `https://api.github.com` | URL da API GitHub          |

## Arquivos / Importação

| Variável               | Getter Config               | Obrigatória? | Padrão | Descrição                    |
| ---------------------- | --------------------------- | ------------ | ------ | ---------------------------- |
| `CSV_DEFAULT_PATH`     | `Config.csvDefaultPath`     | Não          | —      | Caminho padrão para CSV      |
| `CSV_PATH`             | `Config.csvPath`            | Não          | —      | Sobrescreve caminho CSV      |
| `CSV_LABELS`           | `Config.csvLabels`          | Não          | —      | Labels separadas por vírgula |
| `JSON_PATH`            | `Config.jsonPath`           | Não          | —      | Caminho padrão para JSON     |
| `JSON_LABELS`          | `Config.jsonLabels`         | Não          | —      | Labels para import JSON      |
| `CYPRESS_PROJECT_PATH` | `Config.cypressProjectPath` | Não          | —      | Diretório do projeto Cypress |

## Logging

| Variável            | Getter Config       | Obrigatória? | Padrão  | Descrição                                |
| ------------------- | ------------------- | ------------ | ------- | ---------------------------------------- |
| `LOG_LEVEL`         | `Config.logLevel`   | Não          | `INFO`  | Nível mínimo de log                      |
| `LOG_FILE`          | `Config.logFile`    | Não          | `false` | Habilitar log em arquivo                 |
| `LOG_DIR`           | `Config.logDir`     | Não          | `logs`  | Diretório de logs                        |
| `LOG_MAX_SIZE`      | `Config.logMaxSize` | Não          | `5MB`   | Tamanho máximo do arquivo de log         |
| `QA_TOOLS_LOGS_DIR` | (via `temp-dir.ts`) | Não          | —       | Sobrescreve `LOG_DIR` (maior prioridade) |

## Comportamento / CI

| Variável               | Getter Config         | Obrigatória? | Padrão     | Descrição                                         |
| ---------------------- | --------------------- | ------------ | ---------- | ------------------------------------------------- |
| `DEBUG`                | `Config.debug`        | Não          | `false`    | Modo debug                                        |
| `QUIET`                | `Config.quiet`        | Não          | `false`    | Suprimir output informativo                       |
| `DRY_RUN`              | `Config.dryRun`       | Não          | `false`    | Simular sem executar                              |
| `AUTO_CONFIRM`         | `Config.autoConfirm`  | Não          | `false`    | Pular prompts de confirmação                      |
| `AUTO_CHOICE`          | `Config.autoChoice`   | Não          | —          | Auto-selecionar opção do menu                     |
| `ON_ERROR`             | `Config.onError`      | Não          | `abort`    | Ação em erro (`abort` / `skip`)                   |
| `XDG_STATE_HOME`       | `Config.xdgStateHome` | Não          | —          | Diretório de estado persistente                   |
| `QA_TOOLS_TEMP_DIR`    | (via `temp-dir.ts`)   | Não          | `temp/`    | Diretório temporário (previews, cache, docs HTML) |
| `QA_TOOLS_REPORTS_DIR` | (via `temp-dir.ts`)   | Não          | `reports/` | Diretório de relatórios gerados (HTML, flakiness) |

## LLM (7 tiers + extras)

| Variável                | Getter Config               | Obrigatória? | Padrão                                             | Descrição                                                    |
| ----------------------- | --------------------------- | ------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| `LLM_API_KEY`           | `Config.llmApiKey`          | Condicional  | —                                                  | API key do provedor **main** (análise principal)             |
| `LLM_MODEL`             | `Config.llmModel`           | Não          | `google/gemini-2.0-flash-exp`                      | Modelo do tier **main**                                      |
| `LLM_BASE_URL`          | `Config.llmBaseUrl`         | Não          | `https://openrouter.ai/api/v1`                     | URL base do tier **main**                                    |
| `LLM_SMALL_API_KEY`     | `Config.llmSmallApiKey`     | Não          | —                                                  | API key do tier **small** (tarefas leves)                    |
| `LLM_SMALL_MODEL`       | `Config.llmSmallModel`      | Não          | `gemini-2.0-flash-lite`                            | Modelo do tier **small**                                     |
| `LLM_SMALL_BASE_URL`    | `Config.llmSmallBaseUrl`    | Não          | `https://generativelanguage.googleapis.com/v1beta` | URL base do tier **small** (provedor: Gemini)                |
| `LLM_FAST_API_KEY`      | `Config.llmFastApiKey`      | Não          | —                                                  | API key do tier **fast** (PR desc, classify, run comparison) |
| `LLM_FAST_MODEL`        | `Config.llmFastModel`       | Não          | `llama-3.1-8b-instant`                             | Modelo do tier **fast**                                      |
| `LLM_FAST_BASE_URL`     | `Config.llmFastBaseUrl`     | Não          | `https://api.groq.com/openai/v1`                   | URL base do tier **fast** (provedor: Groq)                   |
| `LLM_REVIEW_API_KEY`    | `Config.llmReviewApiKey`    | Não          | —                                                  | API key do tier **reviewer** (validação cruzada)             |
| `LLM_REVIEW_MODEL`      | `Config.llmReviewModel`     | Não          | `gemini-2.0-flash-exp`                             | Modelo do tier **reviewer**                                  |
| `LLM_REVIEW_BASE_URL`   | `Config.llmReviewBaseUrl`   | Não          | `https://generativelanguage.googleapis.com/v1beta` | URL base do tier **reviewer** (provedor: Gemini)             |
| `LLM_FALLBACK_API_KEY`  | `Config.llmFallbackApiKey`  | Não          | —                                                  | API key do tier **fallback** (circuit breaker)               |
| `LLM_FALLBACK_MODEL`    | `Config.llmFallbackModel`   | Não          | `meta/llama3-70b-instruct`                         | Modelo do tier **fallback**                                  |
| `LLM_FALLBACK_BASE_URL` | `Config.llmFallbackBaseUrl` | Não          | `https://integrate.api.nvidia.com/v1`              | URL base do tier **fallback** (provedor: NVIDIA NIM)         |
| `LLM_BATCH_API_KEY`     | `Config.llmBatchApiKey`     | Não          | —                                                  | API key do tier **batch** (background tasks)                 |
| `LLM_BATCH_MODEL`       | `Config.llmBatchModel`      | Não          | `gpt-4o-mini`                                      | Modelo do tier **batch**                                     |
| `LLM_BATCH_BASE_URL`    | `Config.llmBatchBaseUrl`    | Não          | `https://models.inference.ai.azure.com`            | URL base do tier **batch** (provedor: GitHub Models)         |
| `LLM_RATE_LIMIT`        | —                           | Não          | `30`                                               | Requisições por minuto por tier                              |
| `LLM_FETCH_RETRIES`     | —                           | Não          | `3`                                                | Número de retries em falha de fetch                          |
| `LLM_MAX_TOKENS_PER_OP` | `Config.llmMaxTokens`       | Não          | `128000`                                           | Limite de tokens estimados por operação                      |
| `LLM_MAX_TOTAL_TOKENS`  | `Config.llmMaxTotalTokens`  | Não          | `0` (ilimitado)                                    | Limite total de tokens acumulados                            |
| `LLM_DISK_CACHE_DIR`    | —                           | Não          | `.llm-cache`                                       | Diretório do cache em disco para respostas LLM               |
| `LLM_CACHE_KEY`         | —                           | Não          | —                                                  | Chave AES-256 para criptografar o cache em disco             |

**Hierarquia de tiers:**

- **main**: análise principal de falhas (`failure-analysis.ts`, `case18.ts`)
- **small**: tarefas leves — fallback para main quando indisponível
- **fast**: tarefas rápidas — PR description, classificação, comparação de runs
- **report**: análise estruturada com validação JSON (usa mesma config do **main**, temperatura reduzida)
- **reviewer**: validação cruzada das análises (provedor independente recomendado)
- **fallback**: usado quando **main** falha (após 3 retries)
- **batch**: tarefas de fundo sem requisito de latência

## Comportamento / CI (extras)

| Variável           | Onde é lida        | Obrigatória? | Padrão | Descrição                                          |
| ------------------ | ------------------ | ------------ | ------ | -------------------------------------------------- |
| `BENCHMARK`        | `llm-benchmark.ts` | Não          | —      | Ativa benchmark LLM: `BENCHMARK=true`              |
| `QA_AUTO_BUG`      | `case17.ts`        | Não          | —      | Cria Bug no Jira automaticamente para falhas novas |
| `QA_FAIL_ON`       | `case17.ts`        | Não          | —      | Quality gate: pass rate mínimo (ex: `90`)          |
| `GITHUB_PR_NUMBER` | `case17.ts`        | Não          | —      | Número do PR para postar comentário de resultados  |

---

← [Voltar ao README](../README.md) | [Instalação](00-install.md)
