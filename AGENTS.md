# TS Migration Instructions — QA Tools

## Credentials

- GitHub token está em `.env` na raiz do projeto (variável `GITHUB_TOKEN`).
- Usar `gh` CLI ou `curl -H "Authorization: Bearer $GITHUB_TOKEN"` para API calls.

## Layer Order (strict, bottom-up)

```
Layer 0: shared/types.ts                  — interfaces puras
Layer 1: shared/*.ts (7 arquivos)         — logger, prompt, cli_base, state, http-client, result_parser, tls
Layer 2: shared/session-context.ts        — depende de Layer 1
Layer 3: jira_management/ (5 arquivos)    — jira_resource, csv_resource, cypress_resource, jira_validator, cypress_test
Layer 4: jira_management/ (3 arquivos)    — jira_link_manager, package_version_manager, result_reporter
Layer 5: jira_management/commands/* (17)  — handlers + context + index
Layer 6: jira_management/create_tests.ts  — maior arquivo (732 linhas, 109 erros). QUEBRAR SRP.
Layer 7: jira_management/main.ts          — entry point
Layer 8: git_triggers/* (5 arquivos)      — github_manager, gitlab_manager, nivelar, main
```

Nunca pular layers. Nunca fazer duas layers no mesmo commit.

## Per-layer verification (R6) — mandatory

```bash
# 1. Type check — 0 errors
npx tsc --noEmit

# 2. Testes — 100% pass
npx jest --no-coverage

# 3. Regras automáticas
grep -rn "throw '" shared/ jira_management/ git_triggers/   # zero
grep -rn ".only(" **/*.test.*                                # zero
```

## R0 — Adversarial Iteration (avaliação Pareto)

Every solution or plan MUST be evaluated adversarially before presentation.

### Hierarquia de avaliação Pareto (estrita)

1. **Superioridade técnica** (ordenada, decrescente)
   1.1 **Correção** — comportamento determinístico, sem bugs conhecidos
   1.2 **Manutenibilidade** — clareza > concisão; SRP; baixo acoplamento
   1.3 **Testabilidade** — facilidade de cobrir com testes determinísticos
   1.4 **Previsibilidade** — comportamento explícito, sem side effects ocultos

2. **Esforço** — desempate quando duas soluções empatam em (1).
   Se a solução tecnicamente superior exigir >10× o esforço da segunda
   superior, a próxima considerada é a segunda superior (não a mais
   barata) — evita perfeccionismo sem abrir brecha para shortcut-driven
   architecture.

3. **Degradação tolerável** — piorar funcionalidade B para melhorar A
   é aceito apenas se B não retrocede em (1.1–1.4). Não-funcionais
   (legibilidade, tempo de compilação, consumo) seguem o mesmo critério:
   podem ser sacrificados desde que não piorem correção,
   manutenibilidade, testabilidade ou previsibilidade.

Iterate: identify weaknesses → fix → re-evaluate → stop when no further
Pareto-improvement is possible. Document the final trade-offs explicitly.

## Non-negotiables (R1-R8)

- **R1**: Every new .ts file MUST have a .test.ts file. Each public method ≥1 test (happy + error + edge case).
- **R2 (SRP)**: create_tests.ts MUST be broken into sub-classes (CsvImporter, TestCaseFactory, IssueLinker, TestExecutionCreator, PreconditionAssociator). Max 300 lines.
- **R2 (DIP)**: Handlers NEVER instantiate JiraResource/JiraLinkManager. Receive via constructor/parameter. Only entry points (main.ts) do `new`.
- **R3**: No `throw 'string'` or `throw "string"`. Always `throw new Error(...)`. Use `JiraResourceError extends Error` for API errors.
- **R4**: No `any`/`as any` without `// eslint-disable-next-line @typescript-eslint/no-explicit-any — <reason>`.
- **R4**: No `console.log` in production. Use `Logger` or `prompt.print()`.
- **R4**: Max 50 lines per function. Extract named helpers when exceeded.
- **R7**: Each layer = one atomic commit. Commit messages follow `feat(ts): migrate shared/ foundation modules (.js→.ts)` pattern.
- **R8**: Never start a layer you can't finish (check estimates in BACKLOG.md). Never commit a broken layer. Rollback immediately on failure (R8.3).

## Error handling pattern (R5)

| Flow            | Rule                                           |
| --------------- | ---------------------------------------------- |
| GET/search      | logError + return [] / null / {} — never throw |
| POST/PUT/DELETE | logError + throw new SpecificError()           |
| Handlers        | try/catch → printError() + return false        |

## Known pitfalls

1. `readline-sync` sem tipos → `declare module 'readline-sync'` em `shared/types/ambient.d.ts`
2. axios `Response<T>` → usar `this.axiosInstance.get<T>(url)` e `const { data } = response`
3. `require()` dinâmico anti-circular (session-context → prompt) → manter `require()` com `typeof import('./prompt').withSpinner`
4. `jest.mock()` com `.ts` → `jest.mock('../../shared/logger')` resolve sem extensão (ts-jest cuida)
5. `module.exports` vs `export` → manter `module.exports` pattern até o último commit (R7 configuração final). Só converter tudo no fim.
6. `override` keyword → usar `override` em métodos que sobrescrevem superclasse (target ES2020+)

## Project structure

```
shared/           → foundation modules (logger, prompt, http-client, etc.)
jira_management/  → Jira/Xray integration (resources, services, commands, main)
git_triggers/     → GitHub/GitLab automation (managers, main)
```

## Naming conventions

- `_` prefix for internal/private members not meant for external use (e.g., `_put`, `_configHint`, `_repoPath`).
- `_` prefix on test variables that exist solely to avoid unused-export warnings from ts-prune.

## Commit message pattern

```
feat(ts): add shared/types.ts with all interfaces
feat(ts): migrate shared/ foundation modules (.js→.ts)
feat(ts): migrate shared/session-context.ts
feat(ts): migrate jira_management/ resource layer
feat(ts): migrate jira_management/ service layer
feat(ts): migrate jira_management/commands
feat(ts): migrate jira_management/create_tests.ts (break into sub-classes)
feat(ts): migrate jira_management/main.ts
feat(ts): migrate git_triggers/
chore(ts): enable strict:true, remove allowJs
```
