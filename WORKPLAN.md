# Work Plan — QA Tools Visual Design

## Context

- Projeto 100% migrado para TS (`strict: true`, 0 erros)
- 750 testes, 94.89% cobertura
- ESLint + Prettier + Husky ativos
- TUI foundation implementada (`palette.ts`, `box.ts`, `markdown.ts`, `chalk` + `cli-table3` em `prompt.ts`)
- Design docs criados: `TUI_STYLE.md`, `WEB_STYLE.md`

## Próximas Fases

---

### Fase 0 — Integração (1 commit)

Trazer os artefatos da branch `ts-migration` para o `main`.

- [ ] Restaurar `TUI_STYLE.md` e `WEB_STYLE.md` do stash
- [ ] Aplicar configs do `opencode.json`:
  - `experimental.batch_tool: true`
  - `formatter: true`
- [ ] Atualizar `~/.config/opencode/opencode.jsonc` com `lsp: true`
- [ ] Atualizar `AGENTS.md` — trocar foco de "TS Migration" para "Visual Design"

**Commit:** `chore(docs): add style guides + update tooling config`

---

### Fase 1 — TUI Completion (3-4 dias)

Implementar o que falta do `TUI_STYLE.md`:

#### 1.1 — Spinners (`ora`)

- [ ] `npm i ora`
- [ ] Substituir spinners customizados em `prompt.ts`/`session-context.ts` por `ora`

#### 1.2 — Progress bars (`cli-progress`)

- [ ] `npm i cli-progress`
- [ ] Substituir progress bar custom em `prompt.ts` por `cli-progress`

#### 1.3 — Banner / Splash (`figlet` + `gradient-string`)

- [ ] `npm i figlet @types/figlet gradient-string @types/gradient-string`
- [ ] Criar `shared/splash.ts` — gera banner "QA TOOLS" com gradiente
- [ ] Chamar splash no início de `jira_management/main.ts` e `git_triggers/main.ts`

#### 1.4 — Menu com seções em caixas

- [ ] Usar `box()` nos grupos de menu (TESTES, RELEASES, CONFIG, UTILITARIOS)
- [ ] Navegação visualmente mais rica com `showSelect` do `@inquirer/select`

#### 1.5 — Error dialogs com `box()` double/red

- [ ] `printError()` usar `box(lines, { border: 'double', color: 'red' })`

**Commit (por pacote):**
```
feat(ux): add ora spinners replacing custom spinner
feat(ux): add cli-progress bars replacing custom progress
feat(ux): add figlet splash screen with gradient branding
feat(ux): wrap menu sections with box() cards
feat(ux): enhance error dialogs with double-border red box
```

---

### Fase 2 — Web UI (7-10 dias)

Implementar a camada web conforme `WEB_STYLE.md`.

#### 2.1 — Server layer

- [ ] `npm i express @types/express`
- [ ] `web/server.ts` — Express bootstrap, CORS, port management, auto-open browser
- [ ] `web/api-router.ts` — rotas `/api/*` que chamam os handlers existentes
- [ ] `web/adapter.ts` — adaptador que intercepta `console.log`/`prompt()` e converte para JSON

#### 2.2 — Frontend SPA

- [ ] `web/public/index.html` — shell
- [ ] `web/public/style.css` — design tokens + layout
- [ ] `web/public/app.js` — SPA router

**Commit:**
```
feat(web): add HTTP server + API router
feat(web): add frontend SPA (dashboard, menu, forms)
feat(web): add charts + result visualization
```

---

### Fase 3 — Polimento (2-3 dias)

- [ ] Testes da camada web
- [ ] Dark mode refinado
- [ ] Responsividade
- [ ] Documentação de uso
- [ ] CI workflow com testes web

---

## Timeline Estimada

| Fase | Dias | Commits | Complexidade |
|------|------|---------|-------------|
| Fase 0 | <1 | 1 | Muito Baixa |
| Fase 1 | 3-4 | 5 | Baixa |
| Fase 2 | 7-10 | 3 | Média |
| Fase 3 | 2-3 | 2 | Baixa |
| **Total** | **12-18** | **11** | |

## Decisões Pendentes

1. **Ordem**: Fase 1 (TUI) antes da Fase 2 (Web)? Ou paralelo?
2. **TUI vs Web**: Foco primário em qual?
3. **Branch**: Trabalhar em `feat/visual-design` ou direto no `main` com commits atômicos?
