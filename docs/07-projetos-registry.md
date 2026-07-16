# 07 — Registry de Projetos Multi-Projeto (Canônico)

Este guia é a documentação canônica do suporte multi-projeto do QA Tools. Ele
substitui a seção legada de `projects.json`/`providers.json` (ver
[`07-config-files.md`](07-config-files.md) para os demais arquivos de configuração).

## Visão geral

A partir do suporte multi-projeto, cada projeto é registrado **uma única vez**
em um *registry* persistido em XDG (`~/.config/qa-tools/projects.json`), e não
mais em `config/projects.json` no diretório de trabalho.

- **Registro central:** `~/.config/qa-tools/projects.json`
  (`$XDG_CONFIG_HOME/qa-tools/projects.json` quando definido).
- **Config por projeto:** `<projectDir>/.qa-tools/<projectName>.env`
  (escrito pelo Setup Wizard, carregado como overlay em runtime).
- **Artifacts por projeto:** `<projectDir>/.qa-tools/`
- **Estado por projeto:** `<projectDir>/.qa-tools/state.json` (isolado).

## Estrutura de `ProjectEntry`

Cada entrada do registry segue o schema `ProjectEntry`:

| Campo       | Tipo     | Obrigatório | Descrição |
| ----------- | -------- | ----------- | --------- |
| `name`      | string   | sim         | Identificador único do projeto (sem `/`, `..`, `\`). |
| `dir`       | string   | sim         | Diretório-raiz do projeto (PROJECT_ROOT). Todos os artifacts/estado residem aqui. |
| `provider`  | string   | não         | Provedor Git: `github` \| `gitlab`. |
| `projectId` | string   | não         | ID/repo do projeto no provedor (ex.: `org/repo` ou `REPO-123`). |
| `jiraKey`   | string   | não         | Chave de projeto Jira/Xray (ex.: `PROJ`). |
| `migrated`  | boolean  | não         | `true` quando a entrada veio da migração legado→XDG (protegida contra edição/remoção pelo menu). |

`dir` recebe o PROJECT_ROOT (D1). Projetos com `migrated: true` são **protegidos**
contra edição/remoção pelo menu Gerenciar (D-U4).

## Comandos e fluxos

### Setup Wizard (registrar projeto)

```bash
npx tsx setup/main.ts --dir /caminho/do/projeto
```

O wizard:

1. Detecta o framework (`tsx`, `maven`, ...) e o provedor Git.
2. Pergunta o `jiraKey` do projeto (opcional).
3. Registra a entrada via `addProject()` no registry XDG.
4. Escreve o overlay `<projectDir>/.qa-tools/<name>.env` com
   `QA_PROJECT_PROVIDER`, `QA_PROJECT_ID`, `QA_PROJECT_JIRA_KEY`, `QA_PROJECT_FRAMEWORK`.

### Entry menu (selecionar projeto ativo)

Ao subir o CLI (`npm run jira` / `npm run git`), o menu:

- Lista os projetos do registry com flag de validade (`[INVÁLIDO]`) e de migração
  (`[MIGRADO]`).
- Auto-seleciona se houver apenas um projeto válido.
- Oferece "Adicionar projeto" (dispara o Setup Wizard) e "Gerenciar projetos".

O projeto ativo é propagado aos módulos-filho via `QA_CURRENT_PROJECT` /
`QA_PROJECT_DIR` (env vars). Se o módulo já recebe `--project <name>`, a seleção
interativa é pulada.

### Migração legado → XDG (cutover atômico)

Na subida do CLI, `_initInfrastructure()` executa `migrateLegacyProjects()`:

- Se existir `config/projects.json` (formato antigo) no diretório de trabalho,
  cada entrada é convertida para `ProjectEntry` (com `migrated: true`,
  `dir` = PROJECT_ROOT) e registrada no registry XDG.
- O legado é renomeado para `config/projects.json.migrated` (não há dual-write).
- Idempotente: entradas já existentes no registry são puladas (`skipped`), não duplicadas.
- Nomes inválidos (path traversal) ou JSON corrompido **lançam erro** (não silenciado).

## Backward compatibility (modo legado)

Se nenhum projeto estiver registrado, o CLI opera como antes: o usuário pode
escolher "Continuar sem projeto (modo legado)" e os módulos funcionam sem
contexto de projeto. A migração é opcional e não quebra instalações antigas.

## Troubleshooting

- **Projeto `[INVÁLIDO]`:** o `dir` não existe mais no disco. Use "Gerenciar
  projetos → Editar diretório".
- **Registry corrompido:** restaurado automaticamente do backup
  `~/.config/qa-tools/projects.json.bak`.
- **`migrated: true` não pode ser editado/removido pelo menu:** remova a entrada
  diretamente do registry XDG e rode o Setup Wizard novamente, se necessário.

Veja também: [`06-env-vars.md`](06-env-vars.md), [`10-setup-wizard.md`](10-setup-wizard.md),
[`07-config-files.md`](07-config-files.md), [`TECHDOC.md`](TECHDOC.md).
