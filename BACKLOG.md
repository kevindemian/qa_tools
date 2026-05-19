# Backlog - QA Tools

## Propostas

### [TITLE-001] Criar Test Execution automaticamente
**Data:** 2026-05-19
**Origem:** Validação de viabilidade do fluxo CSV -> Jira
**Descrição:** Após criar testes via opção 1 (CSV), criar automaticamente
  um Test Execution e adicionar os testes criados.
**Status:** ⏸️ Pendente
**Próximos passos:**
  - Descobrir endpoint Xray para Test Execution
  - Validar se issue type "Test Execution" existe no projeto
  - Decidir fonte do nome da execução

---

### [TITLE-002] Modo Dry-run na criação de testes
**Data:** 2026-05-19
**Origem:** Necessidade de validar CSV contra Jira sem criar issues
**Descrição:** Adicionar modo de validação prévia na opção 1 que executa
  todos os GETs necessários (projeto, issue types, pre-conditions,
  linked issues) sem criar nenhuma issue. Exibir relatório de validação
  antes de perguntar "Criar estes testes?".
**Status:** ⏸️ Pendente
**Observação:** A validação já existe como teste Jest isolado
  (`jira_validator.test.js`). Faltaria integrar como feature
  interativa no `main.js`.
**Próximos passos:**
  - Avaliar se o teste atual já cobre a necessidade
  - Decidir se vale o esforço de integrar no fluxo interativo

---

### [TITLE-003] Suporte a argumentos CLI no main.js
**Data:** 2026-05-19
**Origem:** Necessidade de automação via opencode/scripts
**Descrição:** Adicionar parser de argumentos CLI (`--project`, `--csv`,
  `--labels`) para executar operações sem interação.
**Status:** ⏸️ Pendente
**Observação:** Solução atual usa env vars (`CSV_PATH`, `CSV_LABELS`,
  `AUTO_CONFIRM`, `JIRA_PROJECT`, `AUTO_CHOICE`) via `main.js`.
  CLI args seriam mais intuitivos, mas exigem parser adicional.
**Próximos passos:**
  - Avaliar se env vars já atendem
  - Se necessário, adicionar `yargs` ou parser manual

---

### [TITLE-004] Separar smartPrompt do /help e criar fluxo de confirmação unificado
**Data:** 2026-05-19
**Origem:** Durante refatoração UX, identificou-se que `/help`, `/back`,
  `/menu`, `/exit` têm implementações duplicadas entre `smartPrompt`
  e `handleSpecialInput`
**Descrição:** Unificar o tratamento de comandos especiais numa única
  camada, evitando duplicação de lógica entre `smartPrompt()` e
  `handleSpecialInput()`.
**Status:** ⏸️ Pendente
**Próximos passos:**
  - Mapear todos os pontos de entrada de texto
  - Extrair handler único para comandos especiais

---

### [TITLE-005] i18n opcional (inglês/português)
**Data:** 2026-05-19
**Origem:** Discussão sobre acentuação e compatibilidade de terminal
**Descrição:** Adicionar suporte a idiomas (pt-BR como padrão, en como
  alternativa) via variável de ambiente `LANG=pt-BR` ou `LANG=en`.
  Mensagens centralizadas num arquivo de tradução.
**Status:** ⏸️ Pendente
**Próximos passos:**
  - Levantar todas as strings de UI
  - Criar módulo `shared/i18n.js`
  - Decidir entre arquivo JSON ou função gettext-like

---

### [TITLE-006] Testes de integração contra Jira real em CI
**Data:** 2026-05-19
**Origem:** Validação contínua da comunicação com Jira
**Descrição:** Criar pipeline que executa o `jira_validator.test.js`
  contra um ambiente de staging Jira + Xray, garantindo que mudanças
  no código não quebram a comunicação.
**Status:** ⏸️ Pendente
**Próximos passos:**
  - Configurar projeto Jira de staging com Xray
  - Adicionar script de CI que executa validação com .env de staging

---

### [TITLE-007] Logging estruturado (parcial)
**Data:** 2026-05-19
**Origem:** Depuração de erros em produção
**Descrição:** Substituir `console.log`/`console.error` por logger
  estruturado com níveis (debug, info, warn, error) e formato
  máquina-parseável (JSON).
**Status:** ⏸️ Pendente (parcial: logger.js existe, state.js migrado)
**Realizado:**
  - `shared/logger.js` criado com níveis e saída para arquivo
  - `shared/state.js` migrado de `console.error` para `rootLogger`
**Próximos passos:**
  - Migrar `prompt.js` para usar `rootLogger` em vez de `console.*`
  - Definir formato JSON para saída de arquivo

---

### [TITLE-008] Mover readline-sync para readline nativo
**Data:** 2026-05-19
**Origem:** Auditoria de dependências
**Descrição:** Substituir `readline-sync` (último update 2019) pelo
  módulo nativo `readline` do Node. Elimina dependência externa.
**Status:** ⏸️ Pendente
**Observação:** Requer reescrever todos os prompts de síncrono para
  async/await. Mudança de alto impacto.
**Próximos passos:**
  - Avaliar custo x benefício
  - Se decidir implementar, refatorar `shared/prompt.js` completamente

---

### [TITLE-009] Injeção de dependências nos Resources
**Data:** 2026-05-19
**Origem:** Milestone 3 - Refactoring
**Descrição:** Tornar `JiraResource`, `CsvResource`,
  `PackageVersionManager` injetáveis nos consumers (main.js) em vez
  de instanciados internamente. Facilita testes e substituição de
  implementações.
**Status:** ⏸️ Pendente
**Próximos passos:**
  - Analisar dependências atuais
  - Propor interface/contrato para cada Resource

---

### [TITLE-010] Migrar para Jira Cloud (ADF)
**Data:** 2026-05-19
**Origem:** Restrição atual de Jira Server
**Descrição:** Adaptar código para suportar Jira Cloud, que exige
  ADF (Atlassian Document Format) no campo `description` em vez de
  texto plano.
**Status:** ⏸️ Pendente
**Pré-requisitos:**
  - Decisão de migrar para Cloud
  - Biblioteca ADF builder
**Próximos passos:**
  - Criar módulo `shared/adf.js`
  - Adicionar flag `JIRA_CLOUD=true` no .env

---

### [TITLE-011] Migrar para TypeScript
**Data:** 2026-05-19
**Origem:** Debate arquitetural pós-auditoria
**Descrição:** Substituir `// @ts-check` + JSDoc por `.ts` +
  `tsconfig.json`. Benefícios: tipos reais, interfaces formais,
  elimina 18 comentários `@ts-check` espalhados.
**Status:** ⏸️ Pendente
**Esforço estimado:** 3h (rename + ajustes de import)

---

### [TITLE-012] Separação de camadas (cli/domain/infra)
**Data:** 2026-05-19
**Origem:** Debate arquitetural pós-auditoria
**Descrição:** Reorganizar monorepo plano em `src/cli/`, `src/domain/`,
  `src/infrastructure/`. Menu, orquestração e estado saem de `main.js`.
**Status:** ⏸️ Pendente
**Pré-requisito:** TITLE-011 (TypeScript)

---

### [TITLE-013] Testes de integração com msw
**Data:** 2026-05-19
**Origem:** Debate arquitetural pós-auditoria
**Descrição:** Adicionar testes que simulam Jira/Xray/Cypress API via
  msw, executando comandos completos (import-csv, release) sem
  dependência de ambiente real. Complementa TITLE-006.
**Status:** ⏸️ Pendente

---

### [TITLE-014] Type safety audit concluída
**Data:** 2026-05-19
**Origem:** Auditoria pós-refatoração
**Descrição:** `tsc --strictNullChecks --noImplicitReturns` rodado sobre
  todos os `.js` com `@ts-check`. 35 erros corrigidos (env vars sem tipo,
  `catch` sem guard, API responses sem interface, `string|undefined`
  fluindo onde `string` esperado).
**Status:** ✅ Concluída
**Realizado:**
  - `tsconfig.json` adicionado com `checkJs`, `strictNullChecks`,
    `noImplicitReturns` (sem `strict` para evitar ruído de tipos implícitos)
  - `"typecheck": "tsc"` no `package.json`
  - `typescript` mantido como devDependency
  - 0 erros no `tsc`, 84/84 testes passando
**Próximos passos:**
  - Rodar `npm run typecheck` antes de commits (manual ou pre-commit hook)
  - Ao evoluir o código, manter `@ts-check` nos arquivos existentes
  - TITLE-011 (full TS migration) pode usar este tsconfig como base
