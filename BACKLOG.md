# Backlog - QA Tools

Apenas itens com valor futuro condicional. Os demais foram arquivados (custo > benefício em qualquer cenário).

---

### [TITLE-001] Criar Test Execution automaticamente
**Gatilho:** Quando houver demanda por fluxo ponta-a-ponta CSV → Jira completo.
**Descrição:** Após criar testes via opção 1 (CSV), criar automaticamente um Test Execution e adicionar os testes criados.
**Próximos passos:**
  - Descobrir endpoint Xray para Test Execution
  - Validar se issue type "Test Execution" existe no projeto
  - Decidir fonte do nome da execução

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
