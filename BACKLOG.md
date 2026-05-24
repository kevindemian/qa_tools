# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---
## LLM Integration — Geração de Testes com IA

**Prioridade**: P1 (feature nova, valor direto ao usuário)

**Abordagem**: incremental, zero dependências novas (fetch nativo + marked).

### Arquitetura

**Providers** (dual-tier, config via `.env`):

| Tier    | Provider   | Env                 | Model                            |
| ------- | ---------- | ------------------- | -------------------------------- |
| `main`  | OpenRouter | `LLM_API_KEY`       | `google/gemini-2.0-flash-exp`    |
| `small` | Gemini API | `LLM_SMALL_API_KEY` | `gemini-2.0-flash-lite` (grátis) |

- `main` → tarefas pesadas (gerar casos, analisar falhas)
- `small` → tarefas leves (classificar, extrair keywords, sanitizar)

### Fases

#### 🔶 Fase 1 — Core (`shared/llm-client.ts`)

- Função `llmPrompt(tier: 'main'|'small', system: string, user: string): Promise<string>`
- Abstrai diferenças entre APIs: OpenRouter (formato OpenAI `/v1/chat/completions`) vs Gemini (`/v1beta/models/{model}:generateContent`)
- Retry via `http-client.js` (reuso), cache de respostas (hash do prompt, TTL)
- Headers: `Authorization: Bearer {{key}}`, fallback tratado com `printError`

#### 🔶 Fase 2 — Prompt Templates (`shared/prompts/*.md`)

Arquivos markdown editáveis sem recompilar, placeholders `{{var}}`:

- `user-story-to-tests.md` — user story + AC → CSV de casos de teste (steps, pre-conditions, tags)
- `failure-analysis.md` — diff de execuções → causas raiz sugeridas
- `classify.md` — descrição de bug → severidade/área (tier small)
- Template carregado via `readFileSync` + `replace` simples

#### 🔶 Fase 3 — Comando no Menu (`jira_management/main.ts`)

Nova opção **"Gerar testes com IA"** (id `18`):

1. Input: issue key (ex. `ECSPOL-123`)
2. `JiraResource.getIssue(key)` → summary + description
3. Carrega `user-story-to-tests.md` → substitui placeholders
4. `llmPrompt('main', system, user)` → CSV como string
5. Preview com `mdBox()` — aprovação do usuário
6. Invoca pipeline de criação existente (CSV → Xray)

#### 🔶 Fase 4 — Expansão

- **Analisar falhas**: parse de resultados de teste → LLM sugere causas raiz
- **Resumir execução**: resultado de teste → relatório legível para stakeholders
- **Classificar bugs**: descrição → severidade/área (tier small)
- **Traduzir planos**: PT-BR ↔ EN
- **Mais provedores**: Anthropic, Ollama (local), outras chaves open-source

### Config (`shared/config.ts` + `.env`)

```
LLM_API_KEY=sk-or-v1-...
LLM_MODEL=google/gemini-2.0-flash-exp          # default
LLM_BASE_URL=https://openrouter.ai/api/v1       # default
LLM_SMALL_API_KEY=AIza...
LLM_SMALL_MODEL=gemini-2.0-flash-lite           # default
```

### Arquivos envolvidos

| Arquivo                     | Ação                              |
| --------------------------- | --------------------------------- |
| `shared/llm-client.ts`      | Criar                             |
| `shared/llm-client.test.ts` | Criar                             |
| `shared/prompts/`           | Criar diretório + templates .md   |
| `shared/config.ts`          | Adicionar getters LLM             |
| `jira_management/main.ts`   | Adicionar handler + opção no menu |
| `.env.example`              | Adicionar vars LLM                |
| `BACKLOG.md`                | Este plano                        |
### 🔴 Fase 6 — Plano Detalhado (2026-05-25)

**Problema original:** Na Fase 4, `showSelect` foi reescrito para usar `readlineSync` + cards em vez de `@inquirer/select`. Isso quebrou:

- Paginação (menu ultrapassa tela)
- Navegação por setas ↑↓
- Comandos `/help`, `/back`, `/quit` não funcionam em `confirm()` e `onError()` (CancelError não propagado)
- `/back` no menu principal crasha

**Decisão (2026-05-25):** Reverter `showSelect` para `@inquirer/select` + consertar bugs de propagação de CancelError.

**Ordem de execução:** A → D → B → C → E → F

---

#### F6-A — Bugs P0: Comandos de navegação em TODAS as telas

**Arquivo:** `shared/prompt.ts`

| #   | Problema                                                                | Linhas                        | Ação                                                                       |
| --- | ----------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| A1  | `confirm()` usa `readlineSync.question()` direto, sem checar `NAV_CMDS` | 139-151                       | Adicionar `if (NAV_CMDS.includes(trimmed)) throw new CancelError(trimmed)` |
| A2  | `onError()` usa `readlineSync.question()` direto, sem checar `NAV_CMDS` | 416-466                       | Adicionar `if (NAV_CMDS.includes(trimmed)) throw new CancelError(trimmed)` |
| A3  | `/back` no menu principal crasha — `getUserChoice()` não tem try/catch  | `jira_management/main.ts:454` | Envolver `getUserChoice()` em try/catch CancelError                        |
| A4  | `/quit` não está em `NAV_CMDS`                                          | `shared/prompt.ts:157`        | Adicionar `'/quit'`                                                        |
| A5  | `/help` só funciona em `smartPrompt()`, não em `prompt()` direto        | `shared/prompt.ts:121-137`    | Adicionar `/help` ao `NAV_CMDS`                                            |

**Impacto A1:** 11 callsites (case01, case04, case07, case08, case13, case15, import-prep)
**Impacto A2:** 4 callsites (test-case-factory, issue-linker)
**Testes:** +5 testes

---

#### F6-B — Reverter `showSelect` para `@inquirer/select`

**Arquivo:** `shared/prompt.ts`

**Estado atual:** `showSelect` síncrono, `readlineSync` + cards, paginação customizada `/n` `/p`. `_loadInquirer()` removido.

**Estado desejado:** `showSelect` async. TTY → `@inquirer/select`. Não-TTY → fallback `readlineSync` + cards.

**Passos:**

1. **Restaurar `_loadInquirer()`** — lazy-load `@inquirer/select`, cache, fallback `false`:

```typescript
let _inquirerMod: unknown = null;
export function __setInquirerMod(mod: unknown): void {
    _inquirerMod = mod;
}
async function _loadInquirer(): Promise<unknown> {
    if (_inquirerMod !== null) return _inquirerMod;
    try {
        _inquirerMod = await import('@inquirer/select');
        return _inquirerMod;
    } catch {
        _inquirerMod = false;
        return false;
    }
}
```

2. **Reverter `showSelect()`** — usar `inquirerTheme` já existente (linhas 502-510):

```typescript
export async function showSelect(label: string, choices: SelectChoice[], options: SelectOptions = {}): Promise<string> {
    const flatChoices = choices
        .filter((c) => c.type !== 'separator' && !!c.name)
        .map((c) => ({ name: c.name, value: c.value ?? c.name }));

    // TTY → @inquirer/select
    const mod = await _loadInquirer();
    if (mod && isTTY()) {
        try {
            const answer = await mod.default({
                message: label,
                choices: flatChoices,
                pageSize: options.pageSize || Output.rows() - 5,
                loop: true,
                theme: inquirerTheme,
            });
            return answer as string;
        } catch {
            return '0';
        }
    }

    // Non-TTY → readlineSync + cards (código atual das Fases 4-5)
    const { sections, standaloneItems } = groupChoices(choices);
    // ... renderizar cards + prompt síncrono + números + aliases
}
```

3. **Remover código morto:** paginação customizada (`/n`, `/p`, `buildPage`, `renderPage`, `pages`, `pageIdx`, `MenuBlock`).
4. **Manter:** `visibleWidth` import, `console.clear()` (F5), `CancelError` (F4), fallback não-TTY com números e aliases (F5).

---

#### F6-C — Callers: síncrono → async

| #   | Arquivo                                   | Linha | Mudança                                                          |
| --- | ----------------------------------------- | ----- | ---------------------------------------------------------------- |
| C1  | `shared/entry-menu.ts`                    | 39    | `showSelect(...)` → `await showSelect(...)`                      |
| C2  | `jira_management/main.ts:getUserChoice()` | 409   | Assinatura: `async function getUserChoice(...): Promise<string>` |
| C3  | `jira_management/main.ts`                 | 436   | `return showSelect(...)` → `return await showSelect(...)`        |
| C4  | `jira_management/main.ts:runMainLoop()`   | 461   | `getUserChoice(...)` → `await getUserChoice(...)`                |
| C5  | `git_triggers/main.ts:_promptChoice()`    | 626   | Assinatura: `async function _promptChoice(...): Promise<string>` |
| C6  | `git_triggers/main.ts`                    | 645   | `return showSelect(...)` → `return await showSelect(...)`        |
| C7  | `git_triggers/main.ts`                    | 748   | `_promptChoice(...)` → `await _promptChoice(...)`                |
| C8  | `docs/help-docs.ts`                       | 81    | `showSelect(...)` → `await showSelect(...)`                      |

Nota: `showDocs()` em `jira_management/main.ts` é síncrona (F5 alterou). `runMainLoop` já trata async.

---

#### F6-D — Corrigir `tableView` margins

**Arquivo:** `shared/prompt.ts`, função `tableView()` (linhas 614-660)

| Item | Ação                                                              |
| ---- | ----------------------------------------------------------------- |
| D1   | Adicionar `'  '` (2 espaços) como prefixo em cada linha da tabela |
| D2   | Usar `palette.border` para bordas da tabela                       |
| D3   | Ajustar `colWidths` para considerar indentação                    |

---

#### F6-E — Atualizar testes

**Arquivo:** `shared/prompt.test.ts`

| Item | Ação                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1   | Restaurar testes TTY mode (`__setInquirerMod` + `isTTY=true`): "uses inquirer when TTY", "handles separators", "returns 0 on ExitPromptError", "re-throws non-ExitPromptError" |
| E2   | Manter testes fallback não-TTY (já existem: "selects by number", "handles separator", etc.)                                                                                    |
| E3   | Adicionar `confirm()` com `/back` → `toThrow(CancelError)`                                                                                                                     |
| E4   | Adicionar `onError()` com `/back` → `toThrow(CancelError)`                                                                                                                     |
| E5   | Adicionar `prompt()` com `/quit` → `toThrow(CancelError)`                                                                                                                      |
| E6   | Remover testes de paginação (não existem — só código não testado)                                                                                                              |
| E7   | Atualizar testes de `showSelect` para `async` (precisam de `await`)                                                                                                            |
| E8   | Atualizar testes de `getUserChoice` em `jira_management/main.test.ts` se necessário                                                                                            |

**Mock helper para `__setInquirerMod`:**

```typescript
const mockSelectModule = {
    default: jest.fn().mockResolvedValue('selected-value'),
};
beforeAll(() => {
    prompt.__setInquirerMod(mockSelectModule);
});
```

---

#### F6-F — BACKLOG.md update

Ao final, marcar Fase 6 como concluída e atualizar status.

---

#### Dependências entre fases

```
A (bugs P0) ──> D (tableView) ──> B (reverter) ──> C (callers) ──> E (testes) ──> F (backlog)
                                                                                       │
                                                                                       ▼
                                                                               DÉBITO-001 (OOM)
                                                                               próxima sprint
```

---

### Referência: Layout do OpenCode TUI

O OpenCode usa **OpenTUI** (`@opentui`) como engine de renderização com **SolidJS** para estado reativo. A TUI roda em um processo Node.js em `packages/opencode/src/cli/cmd/tui/`, comunicando com o backend via HTTP + SSE na porta 4096.

#### Stack tecnológico

| Camada     | Tecnologia                                          | Finalidade                                                       |
| ---------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Engine     | `@opentui` (OpenTUI)                                | Renderização de terminal, CLI renderer, eventos de teclado/mouse |
| UI         | SolidJS (JSX, signals)                              | Componentes reativos, reconciliação com OpenTUI                  |
| Layout     | Box, ScrollBox, Text, Container, Split, Overlay     | Estrutura visual                                                 |
| Conteúdo   | `<Markdown>`, `<Code>` (syntax highlight), `<Diff>` | Renderização de conteúdo                                         |
| Input      | `<Input>`, `<Textarea>`, `<Select>`, `<TabSelect>`  | Entrada do usuário                                               |
| Testes     | `testRender()`                                      | Snapshot + interação                                             |
| Roteamento | RouteProvider → rotas `home` e `session`            | Navegação entre telas                                            |

#### Como obter a informação

- **OpenTUI docs**: https://opentui.com/docs/bindings/solid
- **OpenTUI GitHub**: https://github.com/anomalyco/opentui
- **Código OpenCode TUI**: `packages/opencode/src/cli/cmd/tui/` (app.tsx → RouteProvider → home.tsx / session/index.tsx)
- **Layout primitives OpenCode (Go, archived)**: `internal/tui/layout/` — container.go, split.go, overlay.go, layout.go
- **Tutorial com diagramas**: https://github.com/markporter/opencode_tutorial/blob/alpha/docs/03-core-concepts/tui-interface-guide.md
- **Pacote Go (v0.0.55, archived)**: https://pkg.go.dev/github.com/opencode-ai/opencode/internal/tui/layout

#### Estrutura visual da TUI

````
┌────────────────────────────────────────────────┐
│ Header Bar: v1.x | Session: active | Agent     │
├────────────────────────────────────────────────┤
│                                                │
│ Chat Panel (ScrollBox + Markdown):             │
│   You: <input>                                 │
│                                                │
│   Agent (Build):                               │
│     [✓] Ação concluída                         │
│     → src/file.ts (line 42)                    │
│     ```código formatado```                     │
│                                                │
├────────────────────────────────────────────────┤
│ Status Bar: Ready | Files: 3 | Tokens: 1.2K   │
└────────────────────────────────────────────────┘
````

#### Componentes OpenTUI mais relevantes

- **`<Markdown>`** — renderiza markdown diretamente (code blocks, bold, links). É como opencode exibe respostas do agente. O QA Tools pode usar `marked` + `chalk` ou similar para emular.
- **`<Code>`** — syntax highlight via tree-sitter.
- **`<Select>`** — lista navegável com setas, similar ao `@inquirer/select`.
- **`<TabSelect>`** — seleção por abas (usado para alternar entre agentes Build/Plan).
- **`<ScrollBox>`** — área rolável com scrollbar.
- **`<Box>`** — container com bordas (estilos: rounded, thick, double, hidden), padding, cores.

#### Implicações para QA Tools

O QA Tools **não precisa** adotar OpenTUI — a stack atual (chalk + cli-table3 + @inquirer) é adequada para uma CLI de ferramentas. O que importa é:

1. **Consistência visual**: usar `palette.border` + padding consistente (como OpenTUI Box faz)
2. **Markdown**: se precisar renderizar markdown, usar `marked` ou similar com chalk (o OpenTUI faz nativo via `<Markdown>`)
3. **Select profissional**: `@inquirer/select` (que vamos restaurar na Fase 6) é o equivalente ao `<Select>` do OpenTUI
4. **Layout limpo**: seguir a mesma filosofia de header claro, conteúdo com padding, status bar informativa
5. **Navegação por teclado**: setas ↑↓, Tab, atalhos — mesma filosofia do OpenTUI/OpenCode
