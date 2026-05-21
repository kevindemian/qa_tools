# Backlog - QA Tools

Apenas itens com valor futuro condicional. Os demais foram arquivados (custo > benefício em qualquer cenário).

---

### ~~[TITLE-001] Criar Test Execution automaticamente~~ ✅ Concluído
**Implementado em:** `create_tests.js:createTestExecution()` + `main.js` case 13 + prompt pós-opção 1.
**Detalhes:** Usa `POST /rest/api/2/issue` com descoberta dinâmica de issue type ("Test Execution") e custom field (`testexec-tests-custom-field`). Raven API indisponível neste servidor. Payload auto-descoberto, portável entre instâncias.

---

### [TITLE-006] Testes de integração contra Jira real em CI
**Gatilho:** Quando houver projeto Jira staging disponível.
**Descrição:** Criar pipeline que executa o `jira_validator.test.js` contra um ambiente de staging Jira + Xray, garantindo que mudanças no código não quebram a comunicação.
**Próximos passos:**
  - Configurar projeto Jira de staging com Xray
  - Adicionar script de CI que executa validação com .env de staging

---

### [TITLE-010] Migrar para Jira Cloud (ADF)
**Gatilho:** Quando houver decisão de migrar para Jira Cloud.
**Descrição:** Adaptar código para suportar Jira Cloud, que exige ADF (Atlassian Document Format) no campo `description` em vez de texto plano.
**Pró-requisitos:**
  - Decisão de migrar para Cloud
  - Biblioteca ADF builder
**Próximos passos:**
  - Criar módulo `shared/adf.js`
  - Adicionar flag `JIRA_CLOUD=true` no .env

---

### [TITLE-011] Migrar para TypeScript
**Gatilho:** Se bugs de tipo frequentes ou time crescer.
**Descrição:** Substituir `// @ts-check` + JSDoc por `.ts` + `tsconfig.json`. Benefícios: tipos reais, interfaces formais, elimina `@ts-check` espalhados.
**Esforço estimado:** 3h (rename + ajustes de import)
**Pró-requisito:** Nenhum (JSDoc já cobre ~95%)

---

### [UX-P2-001] Polimento de acentuação pt-BR
**Gatilho:** Quando houver revisão geral de mensagens.
**Descrição:** Mensagens em pt-BR têm acentuação inconsistente (ex: "concluida" vs "concluída", "operacao" vs "operação"). ~15 arquivos afetados.
**Esforço:** 30 min (busca + substituição guiada por diffs).
**Impacto:** Baixo (cosmético).

---

### [UX-P2-002] Unificar definições de menu (displayMenu vs buildMenuChoices)
**Gatilho:** Quando houver adição de nova opção de menu.
**Descrição:** `displayMenu` (texto) e `buildMenuChoices` (TUI) em `jira_management/main.js` já têm pequenas divergências (ex: contagem inline). Extrair definição central.
**Esforço:** 20 min.
**Impacto:** Médio (manutenibilidade futura).

---

### [UX-P2-003] Wizard de primeira execução
**Gatilho:** Quando onboarding for priorizado.
**Descrição:** Novo usuário não tem guia interativo. Detectar `.env` ausente e oferecer wizard de configuração guiada.
**Esforço:** 45 min.
**Impacto:** Alto (reduz barreira de entrada).

---

### [UX-P2-004] Paginação no preview de CSV
**Gatilho:** Quando houver relato de overflow visual com muitos testes.
**Descrição:** Preview de criação de testes (CSV) pode ocupar tela inteira com dezenas de itens sem paginação.
**Esforço:** 30 min.
**Impacto:** Médio (polimento).

---

### [UX-P2-005] Notificação visual de estado corrompido
**Gatilho:** Próxima alteração em `state.js`.
**Descrição:** Quando `state.json` está corrompido, recupera de `.bak` mas só loga em arquivo (`rootLogger.warn`). Adicionar `warn()` no console.
**Esforço:** 5 min.
**Impacto:** Médio (evita confusão).

---

### [UX-P2-006] Feedback incremental no polling de pipeline
**Gatilho:** Quando houver relato de "pipeline travada".
**Descrição:** `pollPipeline` só mostra spinner sem tempo decorrido. Adicionar elapsed time: `Aguardando pipeline #42 (30s)...`.
**Esforço:** 10 min.
**Impacto:** Médio (reduz ansiedade).
