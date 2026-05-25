# Variáveis de Ambiente

Todas as variáveis são carregadas do arquivo `.env` na raiz do projeto.

---

## Jira / Xray

| Variável              | Getter Config              | Obrigatória? | Padrão   | Descrição                           |
| --------------------- | -------------------------- | ------------ | -------- | ----------------------------------- |
| `JIRA_BASE_URL`       | `Config.jiraBaseUrl`       | Sim (Jira)   | —        | URL base do Jira Server             |
| `JIRA_PERSONAL_TOKEN` | `Config.jiraPersonalToken` | Sim (Jira)   | —        | Token Bearer para autenticação Jira |
| `XRAY_BASE_URL`       | `Config.xrayBaseUrl`       | Sim (Xray)   | —        | URL base do servidor Xray           |
| `JIRA_PROJECT`        | `Config.jiraProject`       | Não          | `ECSPOL` | Projeto Jira padrão                 |

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

| Variável       | Getter Config       | Obrigatória? | Padrão  | Descrição                        |
| -------------- | ------------------- | ------------ | ------- | -------------------------------- |
| `LOG_LEVEL`    | `Config.logLevel`   | Não          | `INFO`  | Nível mínimo de log              |
| `LOG_FILE`     | `Config.logFile`    | Não          | `false` | Habilitar log em arquivo         |
| `LOG_DIR`      | `Config.logDir`     | Não          | `logs`  | Diretório de logs                |
| `LOG_MAX_SIZE` | `Config.logMaxSize` | Não          | `5MB`   | Tamanho máximo do arquivo de log |

## Comportamento / CI

| Variável         | Getter Config         | Obrigatória? | Padrão  | Descrição                       |
| ---------------- | --------------------- | ------------ | ------- | ------------------------------- |
| `DEBUG`          | `Config.debug`        | Não          | `false` | Modo debug                      |
| `QUIET`          | `Config.quiet`        | Não          | `false` | Suprimir output informativo     |
| `DRY_RUN`        | `Config.dryRun`       | Não          | `false` | Simular sem executar            |
| `AUTO_CONFIRM`   | `Config.autoConfirm`  | Não          | `false` | Pular prompts de confirmação    |
| `AUTO_CHOICE`    | `Config.autoChoice`   | Não          | —       | Auto-selecionar opção do menu   |
| `ON_ERROR`       | `Config.onError`      | Não          | `abort` | Ação em erro (`abort` / `skip`) |
| `XDG_STATE_HOME` | `Config.xdgStateHome` | Não          | —       | Diretório de estado persistente |

## LLM (7 tiers)

| Variável                | Getter Config               | Obrigatória? | Padrão                                             | Descrição                                                    |
| ----------------------- | --------------------------- | ------------ | -------------------------------------------------- | ------------------------------------------------------------ |
| `LLM_API_KEY`           | `Config.llmApiKey`          | Condicional  | —                                                  | API key do provedor **main** (análise principal)             |
| `LLM_MODEL`             | `Config.llmModel`           | Não          | `google/gemini-2.0-flash-exp`                      | Modelo do tier **main**                                      |
| `LLM_BASE_URL`          | `Config.llmBaseUrl`         | Não          | `https://openrouter.ai/api/v1`                     | URL base do tier **main**                                    |
| `LLM_SMALL_API_KEY`     | `Config.llmSmallApiKey`     | Não          | —                                                  | API key do tier **small** (tarefas leves)                    |
| `LLM_SMALL_MODEL`       | `Config.llmSmallModel`      | Não          | `gemini-2.0-flash-lite`                            | Modelo do tier **small**                                     |
| `LLM_FAST_API_KEY`      | `Config.llmFastApiKey`      | Não          | —                                                  | API key do tier **fast** (PR desc, classify, run comparison) |
| `LLM_FAST_MODEL`        | `Config.llmFastModel`       | Não          | `llama3-8b-8192`                                   | Modelo do tier **fast**                                      |
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

**Hierarquia de tiers:**

- **main**: análise principal de falhas (`failure-analysis.ts`, `case18.ts`)
- **fast**: tarefas rápidas — PR description, classificação, comparação de runs
- **report**: análise estruturada com validação JSON (usa mesma config do **main**, temperatura reduzida)
- **reviewer**: validação cruzada das análises (provedor independente recomendado)
- **fallback**: usado quando **main** falha (após 3 retries)
- **batch**: tarefas de fundo sem requisito de latência

---

← [Voltar ao README](../README.md) | [Instalação](00-install.md)
