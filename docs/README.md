# Índice de Documentação (QA Tools)

Hub de referência. Toda página de projeto deve linkar o
[registry de projetos (07)](07-projetos-registry.md) quando tratar de contexto
multi-projeto.

## Guias por intenção

### Começar
- [00 — Instalação](00-install.md): pré-requisitos, `.env`, wrappers, verificação.
- [01 — Primeiros passos](01-primeiros-passos.md): primeira execução, menu, `/help`, `/history`, auto-mode CI.
- [10 — Setup Wizard](10-setup-wizard.md): geração automática de pipeline CI (GitHub/GitLab).

### Operar módulos
- [02 — Jira Management](02-jira-management.md): 20 opções do menu em detalhe.
- [03 — Git Triggers](03-git-triggers.md): GitLab/GitHub, pipeline, MR, nivelar, dashboards, IA, Quality Gate.
- [11 — PR Report](11-pr-report.md): relatórios de PR/MR.

### Formato de dados
- [04 — Formato CSV](04-csv-format.md): especificação CSV multi-bloco para importação de testes.
- [05 — Formato JSON](05-json-format.md): formato JSON para importação de testes.

### Configuração e contexto
- [06 — Variáveis de ambiente](06-env-vars.md): tabela completa de env vars.
- [07 — Projetos (multi-projeto)](07-projetos-registry.md): **canônico** — selecionar, adicionar e gerenciar projetos, `--project` / `--dir`, migração de config antiga.
- [08 — Fluxos completos](08-fluxos-completos.md): jornadas típicas CSV→Test Execution, release, pipeline CI.

### Suporte
- [09 — Troubleshooting](09-troubleshooting.md): problemas comuns e soluções.
- [TECHDOC.md](../docs/TECHDOC.md): documentação técnica de referência (arquitetura, contratos).

## Detalhes técnicos

Arquitetura interna, contratos, módulos e formatos de armazenamento do suporte
multi-projeto estão documentados em [TECHDOC.md](TECHDOC.md).
