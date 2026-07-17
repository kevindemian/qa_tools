# Setup Wizard — Geração Automática de Pipeline CI

> Ferramenta interativa para gerar configuração de CI/CD (GitHub Actions ou GitLab CI), arquivos de projeto e hook pre-push.

---

## 1. Execução

```bash
npx tsx setup/main.ts
```

Para configurar um projeto que está em **outra pasta**, informe o caminho:

```bash
npx tsx setup/main.ts --dir /caminho/do/projeto
```

O wizard guia o usuário por 3 etapas:

### Etapa 1 — Detecção

O `detector.ts` lê o `package.json` do projeto atual e identifica automaticamente:

| Framework  | Detectado por                      | Test command gerado                   |
| ---------- | ---------------------------------- | ------------------------------------- |
| Cypress    | `cypress` em devDependencies       | `npx cypress run --reporter ctrf`     |
| Playwright | `@playwright/test` ou `playwright` | `npx playwright test --reporter ctrf` |
| Jest       | `jest` em devDependencies          | `npx jest --reporter ctrf`            |
| Vitest     | `vitest` em devDependencies        | `npx vitest run --reporter ctrf`      |
| Genérico   | (fallback)                         | `npm test`                            |

Campos detectados: `framework`, `testCmd`, `installCmd`, `ctrfReportPath`, `nodeVersion`.

### Etapa 2 — Configuração interativa

O wizard pergunta:

| Pergunta                   | Default                                                                | Descrição                        |
| -------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| Nome do projeto            | Nome do repositório (extraído do `.git/config`)                        | Identifica o projeto no menu      |
| Git provider               | Detectado (`github`/`gitlab`)                                          | Define qual template usar        |
| Jira project key           | (vazio)                                                                | Chave do projeto no Jira/Xray (opcional) |
| Repo owner (user/org)      | Dono do repositório remoto                                             | Usado no template GitHub         |
| Test framework             | Detectado                                                              | Framework de testes              |
| Test command               | Detectado                                                              | Comando que gera CTRF            |
| Install command            | Detectado (`npm ci` ou `npm ci && npx playwright install --with-deps`) | Instalação de dependências       |
| CTRF report path           | Detectado                                                              | Path do relatório CTRF           |
| Node version               | `20`                                                                   | Versão Node no pipeline          |
| Integrar com Jira?         | `sim`                                                                  | Adiciona step QA Tools pós-teste |
| Gerar Flakiness Dashboard? | `sim`                                                                  | Adiciona dashboard               |
| Análise de falhas com IA?  | `sim`                                                                  | Adiciona análise LLM             |
| Criar hook pre-push?       | `não`                                                                  | Bloqueia push se testes falharem |

### Etapa 3 — Geração

O wizard registra o projeto para uso nas próximas execuções e gera/atualiza:

| Item                                           | Ação                                  |
| ---------------------------------------------- | ------------------------------------- |
| `.github/workflows/qa.yml` ou `.gitlab-ci.yml` | Pipeline CI completa                  |
| Registro do projeto                            | Salva provedor, repositório e Jira key para uso futuro |
| `.env.example`                                 | Template com tokens + config          |
| `.git/hooks/pre-push` (se solicitado)          | Hook que executa testes               |

Nenhum arquivo existente é sobrescrito (merge seguro).

---

## 2. Template GitHub Actions

Gerado em `.github/workflows/qa.yml`:

```yaml
name: QA Pipeline
on: [push, pull_request, workflow_dispatch]
jobs:
    qa-tools:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with: { node-version: '20' }
            - name: Install dependencies
              run: npm ci
            - name: Run tests
              run: npx cypress run --reporter ctrf
            - name: Upload CTRF report
              uses: actions/upload-artifact@v4
              with:
                  name: ctrf-report
                  path: cypress/reports/ctrf-report.json
                  if-no-files-found: warn
            - name: QA Tools Post-Processing
              if: always()
              run: npx tsx git_triggers/main.ts --batch --project <nome> --branch ${{ github.ref_name }}
              env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Features condicionais

| Feature habilitada                | Adiciona no pipeline                          |
| --------------------------------- | --------------------------------------------- |
| Jira Integration + IA + Flakiness | Step `QA Tools Post-Processing` com `--batch` |

---

## 3. Template GitLab CI

Gerado em `.gitlab-ci.yml`:

```yaml
stages: [test]
qa-tools:
    stage: test
    image: node:20
    script:
        - npm ci
        - npx cypress run --reporter ctrf
    artifacts:
        paths: [cypress/reports/ctrf-report.json]
        reports:
            junit: reports/junit.xml
```

Extensão condicional: se Jira/IA/Flakiness habilitados, adiciona ao script:

```yaml
- npx tsx git_triggers/main.ts --batch --project <nome> --branch $CI_COMMIT_BRANCH
```

---

## 4. Hook Pre-push

Se solicitado, o hook `.git/hooks/pre-push` é criado com:

```bash
#!/bin/sh
echo "Running pre-push checks..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
npx tsx git_triggers/main.ts --batch --project <nome> --branch "$CURRENT_BRANCH"
if [ $? -ne 0 ]; then
  echo "❌ Pre-push checks falharam. Use 'git push --no-verify' para bypass."
  exit 1
fi
echo "✅ All pre-push checks passed."
exit 0
```

---

## 5. Arquivos de Configuração

O provedor, o repositório e a Jira key do projeto são **registrados** pelo wizard
e ficam disponíveis quando você seleciona o projeto no menu — você não precisa
editar arquivos de configuração manualmente. Veja
[`07-projetos-registry.md`](07-projetos-registry.md).

O wizard também gera um `.env.example` como ponto de partida para as credenciais:

### `.env.example`

```env
GITHUB_TOKEN=
GIT_TOKEN=
GIT_BASE_URL=
JIRA_BASE_URL=
JIRA_TOKEN=
JIRA_USER_EMAIL=
QA_TOOLS_LOGS_DIR=logs
QA_FAIL_ON=90
```

---

## 6. Estrutura do Módulo

| Arquivo                             | Função                                                 |
| ----------------------------------- | ------------------------------------------------------ |
| `setup/main.ts`                     | CLI wizard interativo                                  |
| `setup/detector.ts`                 | Detecta framework + comando de teste                   |
| `setup/context.ts`                  | Tipos `SetupContext`, `Framework`, `GitProvider`       |
| `setup/builder/workflow-builder.ts` | Geração YAML via AST (merge com existente)             |
| `setup/templates/github-ci.ts`      | Template GitHub Actions                                |
| `setup/templates/gitlab-ci.ts`      | Template GitLab CI                                     |
| `setup/templates/pre-push-hook.ts`  | Script shell do hook pre-push                          |
| `setup/config-writer.ts`            | Gera `.env.example`                                    |

---

← [Voltar ao README](../README.md) | [Instalação](00-install.md) | [Git Triggers](03-git-triggers.md)
