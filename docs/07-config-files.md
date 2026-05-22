# Arquivos de Configuração — `config/`

Os arquivos JSON no diretório `config/` definem os projetos disponíveis e o provedor Git de cada um. São lidos pelo módulo `git_triggers/main.ts`.

---

## `config/projects.json`

Mapeia nomes de projeto para o **ID do projeto no GitLab** ou **`owner/repo` no GitHub**.

```json
{
  "qa_ibabs": "47849962",
  "qa_tools": "62689551"
}
```

- **Chave**: nome interno do projeto (usado no menu do CLI).
- **Valor**: no GitLab, é o ID numérico do projeto. No GitHub, usa-se o formato `owner/repo` (ex: `"my-org/my-repo"`).

**Onde é lido**: `git_triggers/main.ts:142` — carregado com `JSON.parse(fs.readFileSync(...))`. Suporta sobrescrita por variáveis de ambiente `PROJECT_ID_<NOME>`.

---

## `config/providers.json`

Mapeia nomes de projeto para o provedor Git (`"gitlab"` ou `"github"`).

```json
{
  "qa_ibabs": { "provider": "gitlab" },
  "qa_tools": { "provider": "gitlab" }
}
```

Cada entrada define o provedor que será usado ao criar o manager (`GitLabManager` ou `GitHubManager`). Se o provedor for `"github"`, pode-se incluir `"repo"` para especificar o repositório (caso contrário, usa o valor de `projects.json`).

**Onde é lido**: `git_triggers/main.ts:48` — carregado e usado pela função `getProviderForProject()` (linha 56) e `createManagerForProject()` (linha 61).

---

## `config/reviewers.json`

Array de IDs de usuário do GitLab para atribuição automática de revisores em Merge Requests.

```json
[
  12161752,
  14566471,
  23136801
]
```

> ⚠️ Este arquivo é específico para projetos que usam **GitLab**. No GitHub, a atribuição de revisores é feita pela API nativa do GitHub.

**Onde é lido**: `git_triggers/main.ts` — utilizado no fluxo de criação de MR para definir os revisores automaticamente.

---

← [Voltar ao README](../README.md) | [Git Triggers](03-git-triggers.md)
