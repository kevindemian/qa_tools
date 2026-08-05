# E2E Run — Case18 contra ECSPOL-918

**Data:** 2026-08-05
**Branch:** `feature/associate-te-cli`
**Target:** ECSPOL-918 (Jira Cloud, projeto ECSPOL)
**Modo:** Interativo verbose (`npm run jira` → menu 18)

---

## 0. Decisões

| ID | Decisão | Valor |
|----|---------|-------|
| D1 | User story | ECSPOL-918 |
| D2 | Pre-conditions | Criadas somente após aprovação do artefato (arquitetura atual) |
| D3 | Modelo main | `LLM_MODEL` explícito no `.env.local` |
| D4 | LLM judge | Fora do escopo desta run (dormant, requer calibração κ>0.6) |
| D5 | Modo de execução | Interativo verbose (`npm run jira`) |

---

## 1. Objetivo

Rodar a feature de geração de test cases (case18) em produção real — Jira ECSPOL Cloud + LLM real via OpenRouter — sem mocks, sem emulações. Usar o floor determinístico (`evaluateCase18`) para avaliar a qualidade da geração e coletar artefatos para calibração do prompt (`user-story-to-tests.md`) e schema (`TestCaseArraySchema`).

---

## 2. Pré-requisitos

### 2.1 Credenciais (`.env.local`)

| Variável | Requerido | Verificação |
|----------|-----------|-------------|
| `JIRA_BASE_URL` | Sim | Jira Cloud ECSPOL |
| `JIRA_PERSONAL_TOKEN` | Sim | Bearer token válido |
| `JIRA_PROJECT` | Sim | Valor: `ECSPOL` |
| `JIRA_MODE` | Sim | Valor: `cloud` |
| `XRAY_MODE` | Sim | Valor: `cloud` |
| `LLM_PROVIDER` | Sim | Valor: `openrouter` |
| `LLM_API_KEY` | Sim | Chave OpenRouter (`sk-or-v1-...`) |
| `LLM_MODEL` | Sim | **Explicito** (D3) — ex: `google/gemini-2.0-flash-exp` |
| `LLM_REVIEW_API_KEY` | Não | Não necessário para esta run (judge dorme) |

### 2.2 Suíte e typecheck

- `npx vitest run` → 100% verde (7636/7636)
- `npm run typecheck` → verde

### 2.3 Working tree

- Alterações não commitadas do case18-quality existem — **não commitar** antes do e2e
- `.env.example` modificado (gerado) — não relevante para a run

---

## 3. Fluxo de Execução

1. `npm run jira` → menu principal
2. Selecionar **18 — Gerar testes via User Story (IA)**
3. Fornecer ECSPOL-918 como issue source
4. Fornecer user story + critérios de aceitação de ECSPOL-918
5. `case18.ts` → `llmPrompt({tier:'main',...})` → LLM real gera test cases
6. `evaluateCase18()` (floor determinístico) avalia:
   - coverage (25%)
   - stepConcreteness (20%)
   - preconditionSpecificity (15%)
   - BVA (15%)
   - EP (10%)
   - evidenceCitations (10%)
   - redundancy (5%)
7. Score/grade exibidos; métricas com falha listadas
8. Usuário aprova → pre-conditions criadas no Jira ECSPOL (após aprovação, conforme D2)
9. Artefatos salvos em `reports/<date>/`
10. Registro persistido em `ai-feedback.json`

---

## 4. Artefatos Esperados

| Artefato | Local | Propósito |
|----------|-------|-----------|
| Test cases gerados | `reports/<date>/llm-generated-tests.json` | SSOT dos test cases |
| Relatório de qualidade | `reports/<date>/case18-quality-evaluation.html` | Score/grade visual |
| Tabela de cobertura | `reports/<date>/case18-coverage-table.json` + `.html` | Cobertura por critério |
| Registro de geração | `~/.local/state/qa-tools/feedback/ai-feedback.json` | Alimenta `requirement-score` |

---

## 5. Pós-Run: Calibração

1. Analisar score/grade + métricas com falha
2. Identificar dimensões recorrentemente fracas
3. Ajustar `shared/prompts/user-story-to-tests.md` para reforçar dimensões falhas
4. Ajustar `TestCaseArraySchema` se necessário
5. Re-run E2E → comparar scores → iterar

---

## 6. Fora do Escopo

- LLM judge (dormant, calibração futura separada)
- Outras user stories (próximas runs)
- Benchmark sintético (`npm run benchmark:case18`)
- Bug report (case20)

---

## 7. Riscos

- Rate limit Jira (~2-3 req/min) — pre-conditions criadas após aprovação, não em lote
- LLM pode gerar test cases inválidos — floor detecta e reporta
- ECSPOL-918 pode não ter user story completa — verificar antes da run
