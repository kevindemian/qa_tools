# Backlog — Débitos Técnicos

Issues registradas durante refatorações, postergadas por escopo.

## Critério de prioridade

- **P0**: Bloqueia CI ou funcionalidade crítica
- **P1**: Impacto alto em manutenibilidade, risco médio
- **P2**: Melhoria desejável, baixo risco
- **P3**: Nice-to-have, oportunidade futura

---

## Dívida técnica

### ARC-001 — Centralizar configuração (process.env → Config) (P2) ← **PRÓXIMO**

- **Contexto**: 150+ referências a `process.env.XXX` espalhadas por 15+ arquivos. Dificulta testar, rastrear e tipar. Testes precisam mutar `process.env` globalmente.
- **Ação**: Criar `shared/config.ts` com classe `Config` que lê env vars uma vez. Substituir `process.env.JIRA_BASE_URL` por `Config.jiraBaseUrl`, etc.
- **Impacto**: Testes podem mockar `Config` em vez de poluir `process.env`. Reduz acoplamento global. Facilita tipagem centralizada.
- **Estimativa**: 1-2h.

### ARC-011 — JiraResource coverage (Lote 4, CONCLUÍDO)

- **Ação**: Criado `jira_resource.test.ts` com 74 testes cobrindo todos os 17 métodos públicos (feliz + erro + edge case).
- **Resultado**: 100% dos métodos cobertos, 0 erros de tipo.

### ARC-003 — Unificar sleep() (P3)

- **Contexto**: Após ARQ-006, `sleep()` de `shared/http-client.ts` substituiu `delay()` nos módulos principais. Verificar se não há `new Promise(resolve => setTimeout(resolve, ms))` residual.
- **Ação**: Remover implementações duplicadas de sleep.

### ARC-004 — Typo: "Variaveis" → "Variáveis" (P3)

- **Contexto**: Acentos PT-BR inconsistentes em strings de UI. Ex: "Variaveis", "criar-versão" (com acento) vs outros sem.
- **Arquivos**: `git_triggers/main.ts`, `qatools.sh:72-74`, `jira_management/main.ts`

---

## Resolvidos

### TS-001 — Migrar de JSDoc para TypeScript (.ts) (CONCLUÍDO)

- **Ação**: 8 camadas incrementais (bottom-up) convertendo 74 arquivos de `.js` para `.ts`. `strict: true`, `allowJs: false`, `tsc --noEmit` = 0 erros, 322/322 testes passando.
- **Commits**: 12 commits + merge em `main`.
- **Lições**: `jest.mock()` em `.js` test files sem Babel NÃO é hoisted. Solução: colocar `jest.mock` antes do `require`.

---