# Git Triggers — CLI Interativo

Ferramenta de linha de comando para automação de operações Git em projetos de QA. Oferece um menu interativo para disparar pipelines, gerenciar merge requests, coletar resultados de testes e nivelar branches.

---

## 1. Execução

```bash
npx tsx git_triggers/main.ts
```

Ao iniciar, um menu interativo é exibido. O usuário seleciona um projeto (mapeado em `config/projects.json`) e acessa as operações disponíveis.

**Opções do menu:**

| # | Operação |
|---|----------|
| 1 | Disparar pipeline |
| 2 | Listar schedules (GitLab) |
| 3 | Disparar schedule (GitLab) |
| 4 | Criar MR/PR |
| 5 | Listar MRs/PRs aprovados |
| 6 | Fazer merge por ID |
| 7 | Nivelar branches (main → rel_cand → dev) |
| 8 | Exportar variáveis CI/CD |
| 9 | Trocar de projeto |
| 0 | Sair |

---

## 2. Provedores Suportados

### GitLab

- Gerenciado por `GitLabManager` (`git_triggers/gitlab_manager.ts`)
- Autenticação via `PRIVATE-TOKEN` (variável `GIT_TOKEN`)
- URL base configurável via `GIT_BASE_URL`
- Suporte a schedules, pipelines, artifacts, MRs, variáveis CI/CD

### GitHub

- Gerenciado por `GitHubManager` (`git_triggers/github_manager.ts`)
- Autenticação via Bearer token (variável `GITHUB_TOKEN`)
- URL base configurável via `GITHUB_API_URL`
- Workflows disparados via `workflow_dispatch`
- Suporte a workflows, artifacts, PRs, variáveis CI/CD

A seleção do provedor é feita por projeto no arquivo `config/providers.json`.

---

## 3. Configuração

### `config/projects.json`

Mapeia nomes de projeto → identificador no provedor:

```json
{
  "qa_ibabs": "47849962",
  "qa_irmanager": "41268567"
}
```

- **GitLab**: valor = Project ID (inteiro)
- **GitHub**: valor = `"owner/repo"`
- Pode ser sobrescrito por variável de ambiente `PROJECT_ID_<NOME_MAIUSCULO>`

### `config/providers.json`

Define o provedor de cada projeto:

```json
{
  "qa_ibabs": { "provider": "gitlab" },
  "qa_irmanager": { "provider": "github", "repo": "myorg/qa-irmanager" }
}
```

- `provider`: `"gitlab"` | `"github"`
- `repo` (GitHub): opcional, substitui o valor de `projects.json` como `owner/repo`

### `config/reviewers.json`

Lista de IDs de revisores para MRs (IDs do GitLab):

```json
[12161752, 14566471, 23136801]
```

---

## 4. Pipeline Trigger (Opção 1)

1. Solicita o **branch** para disparo
2. Valida se o branch existe no repositório (`gitlab.getBranch()`)
3. Opcional: especificar **Workflow ID** (GitHub) para selecionar qual workflow disparar
4. Opcional: adicionar **variáveis** no formato `chave=valor`
5. Exibe preview e confirmação antes do disparo
6. Se confirmado, chama `triggerPipeline()` no manager correspondente

**GitLab**: POST `/projects/:id/pipeline` com `ref` e `variables`

**GitHub**: POST `/repos/:owner/:repo/actions/workflows/:id/dispatches` com `ref` e `inputs`

---

## 5. Pipeline Polling

Após disparar uma pipeline, o usuário pode optar por **aguardar a conclusão**:

```typescript
async function pollPipeline(m, pipelineId, interval = 5000, timeout = 300000)
```

- Polling a cada **5 segundos**
- Log a cada **15 segundos** informando o tempo decorrido
- Timeout padrão de **5 minutos**
- Estados de conclusão: `success`, `failed`, `canceled`, `skipped`
- Ao final, exibe o status com ícone (✓ success / ✗ failed)

---

## 6. Resultados de Teste

Fluxo executado após pipeline concluída com sucesso (opção `"Coletar resultados para Jira?"`):

### 6.1 Download de Artifacts

1. Lista artifacts da pipeline via `listPipelineArtifacts()`
2. Filtra por nome contendo `mochawesome` ou `test-result`
3. Faz download do ZIP via `downloadArtifact()`

### 6.2 Parse Mochawesome

1. Extrai `mochawesome.json` do ZIP
2. Parse com `parseMochawesome()` (`shared/result_parser.ts`)
3. Achatamento hierárquico de suítes aninhadas
4. Classificação: `passed`, `failed`, `skipped`

### 6.3 Mapeamento para Jira

1. Solicita caminho do **mapping JSON** (arquivo `*jira-mapping.json`)
2. Faz `matchResultsToTests()` — cruza títulos dos testes com o mapping
3. Cria **Test Execution** no Jira via `createTestExecutionFromResults()`
4. Utiliza `JiraResource` e `JiraLinkManager` para criar a issue e links

---

## 7. Merge Requests

### Criar MR/PR (Opção 4)

- Solicita: branch de origem, branch de destino, título e descrição
- Cria via `createMergeRequest()`
- **GitLab**: POST `/projects/:id/merge_requests`
- **GitHub**: POST `/repos/:owner/:repo/pulls`
- Se já existir MR/PR aberto com mesma origem/destino (erro 409/422), **atualiza** o existente via `updateMergeRequest()`

### Listar MRs/PRs Aprovados (Opção 5)

- Busca MRs/PRs abertos
- Filtra por `isApproved()`:
  - **GitLab**: GET `/merge_requests/:iid/approvals`
  - **GitHub**: GET `/pulls/:number/reviews` (verifica `state === 'APPROVED'`)
- Exibe lista dos aprovados

### Fazer Merge por ID (Opção 6)

- Solicita ID do MR/PR
- Verifica se já está merged; se sim, retorna
- Executa merge via `acceptMergeRequest()`
- **GitLab**: PUT `/merge_requests/:iid/merge`
- **GitHub**: PUT `/pulls/:number/merge`

### Merge Request Rápido (pós-pipeline)

Após coleta de resultados, o menu pergunta:
1. "Criar merge request de \<branch\> para?" — informa branch de destino
2. "Fazer merge agora?" — executa merge imediato

---

## 8. Nivelar Branches (`nivelar.ts`)

Operação **cascata** para sincronizar branches:

```
main  ──MR──→  rel_cand  ──MR──→  dev
```

### Fluxo

1. Solicita nomes das branches (padrões: `main`, `rel_cand`, `dev`)
2. Valida se todas existem (`getBranch()`)
3. Cria MR `main → rel_cand` com título `chore: nivelamento main -> rel_cand`
4. Cria MR `rel_cand → dev` com título `chore: nivelamento rel_cand -> dev`
5. Se uma branch não existir, a operação é abortada antes de criar qualquer MR

---

## 9. Checkpoint (Pipeline Polling)

Se o pipeline polling for interrompido (Ctrl+C, falha), o progresso é **salvo no estado** para retomada:

```typescript
updateState({
  pendingPipeline: {
    branch: currentBranch,
    pipelineId: id,
    projectName: projectName
  }
});
```

### Na próxima execução

1. Ao selecionar "Disparar pipeline" (opção 1), o sistema verifica se há `pendingPipeline`
2. Se encontrado e o projeto for o mesmo, pergunta: *"Pipeline pendente encontrada. Continuar deste ponto?"*
3. Se confirmado:
   - Remove o checkpoint do estado
   - Inicia polling da pipeline existente (sem redisparar)
   - Após conclusão, segue o fluxo normal de coleta de resultados e MR

### Persistência

O estado é salvo em `~/.local/state/qa-tools/state.json` (ou `$XDG_STATE_HOME/qa-tools/state.json`), com backup automático em `state.json.bak`.

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `GIT_TOKEN` | Sim | Token de autenticação GitLab (PRIVATE-TOKEN) |
| `GIT_BASE_URL` | Sim | URL base do GitLab (ex: `https://gitlab.seusite.com`) |
| `GITHUB_TOKEN` | Condicional | Token GitHub (necessário se usar provedor GitHub) |
| `GITHUB_API_URL` | Não | URL da API GitHub (padrão: `https://api.github.com`) |
| `JIRA_BASE_URL` | Condicional | URL base do Jira (necessário para resultados) |
| `JIRA_PERSONAL_TOKEN` | Condicional | Token pessoal Jira |
| `XRAY_BASE_URL` | Condicional | URL base Xray |

---

← [Voltar ao README](../README.md) | [Config Files](07-config-files.md) | [Env Vars](06-env-vars.md)
