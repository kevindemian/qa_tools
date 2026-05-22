# QA Tools

Ferramentas internas de automação QA para gerenciamento de releases no Jira/Xray, triggers de pipeline Git e reporting de testes.

```
qa_tools/
├── jira_management/    ← CLI interativa para Jira/Xray (16 operações)
├── git_triggers/       ← CLI para GitLab/GitHub (pipeline, MR, nivelar)
├── shared/             ← Módulos base (config, logger, prompt, state, http-client)
└── config/             ← projects.json, providers.json, reviewers.json
```

## Início rápido

```bash
cp .env.example .env        # edite com seus tokens (ver docs/06-env-vars.md)
npm install
npm run typecheck            # 0 erros
npm test                     # 502 testes, 25 suites
```

- Executar Jira: `npx tsx jira_management/main.ts`
- Executar Git: `npx tsx git_triggers/main.ts`
- Ver docs: `npx tsx docs/help-docs.ts`

---

## Documentação

| # | Documento | O que cobre |
|---|-----------|-------------|
| [Instalação](docs/00-install.md) | Pré-requisitos, `.env`, wrappers (`.sh`/`.bat`/`.ps1`), verificação |
| [Primeiros passos](docs/01-primeiros-passos.md) | Primeira execução, menu, comandos `/help`, `/history`, auto-mode CI |
| [Jira Management](docs/02-jira-management.md) | Todas as 16 opções do menu em detalhe |
| [Git Triggers](docs/03-git-triggers.md) | GitLab/GitHub, pipeline polling, merge requests, nivelar branches |
| [Formato CSV](docs/04-csv-format.md) | Especificação do CSV multi-bloco para importação de testes |
| [Formato JSON](docs/05-json-format.md) | Formato JSON para importação de testes |
| [Variáveis de ambiente](docs/06-env-vars.md) | Tabela completa de todas as env vars |
| [Arquivos de configuração](docs/07-config-files.md) | `projects.json`, `providers.json`, `reviewers.json` |
| [Fluxos completos](docs/08-fluxos-completos.md) | Jornadas típicas: CSV→Test Execution, release, pipeline CI |
| [Troubleshooting](docs/09-troubleshooting.md) | Problemas comuns e soluções |

---

## Testes

```bash
npm test                # 502 testes, 25 suites
npm run typecheck       # 0 erros tsc --noEmit
npm run lint            # 0 erros eslint
```

---

## Licença

MIT
