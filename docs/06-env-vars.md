# Variáveis de Ambiente

Todas as variáveis são carregadas do arquivo `.env` na raiz do projeto.

---

## Jira / Xray

| Variável | Getter Config | Obrigatória? | Padrão | Descrição |
|----------|--------------|-------------|--------|-----------|
| `JIRA_BASE_URL` | `Config.jiraBaseUrl` | Sim (Jira) | — | URL base do Jira Server |
| `JIRA_PERSONAL_TOKEN` | `Config.jiraPersonalToken` | Sim (Jira) | — | Token Bearer para autenticação Jira |
| `XRAY_BASE_URL` | `Config.xrayBaseUrl` | Sim (Xray) | — | URL base do servidor Xray |
| `JIRA_PROJECT` | `Config.jiraProject` | Não | `ECSPOL` | Projeto Jira padrão |

## Git (GitLab / GitHub)

| Variável | Getter Config | Obrigatória? | Padrão | Descrição |
|----------|--------------|-------------|--------|-----------|
| `GIT_TOKEN` | `Config.gitToken` | Sim (Git) | — | Token GitLab PRIVATE-TOKEN |
| `GIT_BASE_URL` | `Config.gitBaseUrl` | Sim (Git) | — | URL do servidor GitLab |
| `GITHUB_TOKEN` | `Config.githubToken` | Condicional | — | Token Bearer GitHub |
| `GITHUB_API_URL` | `Config.githubApiUrl` | Não | `https://api.github.com` | URL da API GitHub |

## Arquivos / Importação

| Variável | Getter Config | Obrigatória? | Padrão | Descrição |
|----------|--------------|-------------|--------|-----------|
| `CSV_DEFAULT_PATH` | `Config.csvDefaultPath` | Não | — | Caminho padrão para CSV |
| `CSV_PATH` | `Config.csvPath` | Não | — | Sobrescreve caminho CSV |
| `CSV_LABELS` | `Config.csvLabels` | Não | — | Labels separadas por vírgula |
| `JSON_PATH` | `Config.jsonPath` | Não | — | Caminho padrão para JSON |
| `JSON_LABELS` | `Config.jsonLabels` | Não | — | Labels para import JSON |
| `CYPRESS_PROJECT_PATH` | `Config.cypressProjectPath` | Não | — | Diretório do projeto Cypress |

## Logging

| Variável | Getter Config | Obrigatória? | Padrão | Descrição |
|----------|--------------|-------------|--------|-----------|
| `LOG_LEVEL` | `Config.logLevel` | Não | `INFO` | Nível mínimo de log |
| `LOG_FILE` | `Config.logFile` | Não | `false` | Habilitar log em arquivo |
| `LOG_DIR` | `Config.logDir` | Não | `logs` | Diretório de logs |
| `LOG_MAX_SIZE` | `Config.logMaxSize` | Não | `5MB` | Tamanho máximo do arquivo de log |

## Comportamento / CI

| Variável | Getter Config | Obrigatória? | Padrão | Descrição |
|----------|--------------|-------------|--------|-----------|
| `DEBUG` | `Config.debug` | Não | `false` | Modo debug |
| `QUIET` | `Config.quiet` | Não | `false` | Suprimir output informativo |
| `DRY_RUN` | `Config.dryRun` | Não | `false` | Simular sem executar |
| `AUTO_CONFIRM` | `Config.autoConfirm` | Não | `false` | Pular prompts de confirmação |
| `AUTO_CHOICE` | `Config.autoChoice` | Não | — | Auto-selecionar opção do menu |
| `ON_ERROR` | `Config.onError` | Não | `abort` | Ação em erro (`abort` / `skip`) |
| `XDG_STATE_HOME` | `Config.xdgStateHome` | Não | — | Diretório de estado persistente |

---

← [Voltar ao README](../README.md) | [Instalação](00-install.md)
