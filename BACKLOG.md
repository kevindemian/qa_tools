# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

_Nenhum débito técnico pendente no momento._

---

## Resolvidos

### TS-001 — Migrar de JSDoc para TypeScript (.ts) (CONCLUÍDO)

- **Ação**: 8 camadas incrementais (bottom-up) convertendo 74 arquivos de `.js` para `.ts`. `strict: true`, `allowJs: false`, `tsc --noEmit` = 0 erros, 322/322 testes passando.
- **Commits**: 12 commits + merge em `main`.
- **Lições**: `jest.mock()` em `.js` test files sem Babel NÃO é hoisted. Solução: colocar `jest.mock` antes do `require`.

### ARC-001 — Centralizar configuração (process.env → Config) (CONCLUÍDO)

- **Ação**: Criado `shared/config.ts` com classe `Config`. 151 referências a `process.env` substituídas por `Config.xxx`.
- **Impacto**: Testes podem mockar `Config` via `jest.mock`. `dotenv.config()` centralizado.

### ARC-011 — JiraResource coverage (CONCLUÍDO)

- **Ação**: Criado `jira_resource.test.ts` com 74 testes cobrindo todos os 17 métodos públicos.
- **Resultado**: 100% dos métodos cobertos, 0 erros de tipo.

### ARC-003 — Unificar sleep() (CONCLUÍDO)

- **Ação**: Verificado. Único `new Promise(resolve => setTimeout(...))` é a própria definição de `sleep()` em `http-client.ts`. Nada a remover.

### ARC-004 — Typo: "Variaveis" → "Variáveis" (CONCLUÍDO)

- **Ação**: Corrigidos 58 acentos PT-BR em 17 arquivos (`nao`→`não`, `Variaveis`→`Variáveis`, `Ate logo`→`Até logo`, etc).

---