# UPGRADE — Visão de Consumo e Apresentação (TUI + SPA + Insights)

> **Status:** 🟡 RASCUNHO (amadurecimento em aberto — **não aprovado**, não é fonte de verdade de execução)
> **Data de criação:** 2026-08-06
> **Origem:** Consultoria do usuário sobre o "Sprint TUI — Terminal User Interface com Ink (P2)" e sua relação com a reestruturação de consumo/presentação de dados.
> **Autoridade:** Usuário — "crie um documento chamado UPGRADE com essas ideias iniciais bem como os documentos de consulta. vamos amadurecer a ideia."
> **Relação com planos vigentes:** NÃO substitui `dev/docs/plans/context-graph-insights-plan.md` (APROVADO 2026-08-05, em execução). Este documento explora a evolução dos **canais** de consumo/presentação sobre a camada de dados que o plano aprovado está saneando.

---

## 0. Propósito

Maturar a ideia de evoluir **como** o usuário consome e apresenta os dados e informações do QA Tools — terminal (CLI/TUI), web (SPA), relatórios HTML (push) — sobre a nova camada de **insights + grafo de contexto** do plano aprovado.

Decisões tomadas aqui NÃO autorizam execução. Execução continua sendo governada pelo plano aprovado (Regra 27). Este documento acumula contexto, ideias e decisões de autoridade do usuário conforme amadurecer.

---

## 1. Documentos de consulta

| Documento | Caminho | Extrair |
|---|---|---|
| Plano aprovado (Path B) | `dev/docs/plans/context-graph-insights-plan.md` | Reestruturação de dados/presentação: F0 (deletar 9 artefatos hub-first, podar orquestradores), F1 (insights), F2 (grafo), F3 (SPA React), F4 (search condicional). Decisões vinculantes D1–D7. Contratos UX-1..UX-8. Modos de consumo §1.2 (Push/SPA/API). |
| Progresso do plano | `dev/docs/plans/context-graph-insights-PROGRESS.md` | Estado de execução (F0.4 completa; F0.5 próxima). |
| Análise de capacidades 1 | `dev/docs/archive/lixo/CAPABILITIES-ANALYSIS.md` | Inventário de capacidades; 10 capacidades ocultas; TOP 20 oportunidades por ROI; 3 movimentos (gates → dashboards → automação de decisão). |
| Análise de capacidades 2 | `dev/docs/archive/lixo/CAPABILITIES-ANALYSIS-2.md` | QA Tools como plataforma de inteligência; TOP 20 funcionalidades; visão "The Brain → The Historian → The Advisor". |
| Sprint TUI (Ink) | `dev/docs/archive/lixo/BACKLOG_sanitize.md` §958 | Plano TUI Ink (2026-06-06): `IUserInterface` port (TU-1..TU-4), `TuiAdapter` (TU-5..TU-8), integração/testes (TU-9..TU-11), WebAdapter (TU-12, Fastify+Alpine). |
| Workplan visual design | `dev/docs/archive/lixo/WORKPLAN.md` | TUI foundation concluído (`palette.ts`, `box.ts`, `markdown.ts`, chalk + cli-table3); Fase 2 web histórica (Express + vanilla SPA) — NÃO escolhida; plano aprovado optou por React+Vite. |
| Contrato arquitetural | `dev/docs/internal/ARCHITECTURE-CONTRACT.md` | G1–G5: entry point único do pr-report; CI `*.yml` 100% gerado; `shared/` NÃO importa `git_triggers/`; zero scripts em entry points; mecanismos de segurança não são documentação. |

---

## 2. Ideias iniciais (consultoria 2026-08-06)

### 2.1 Veredito de ROI do Sprint TUI Ink (como redigido em 2026-06-06)

Concebido **antes** do plano aprovado. Cinco evidências de conflito/risco:

| # | Conflito/Risco | Evidência |
|---|---|---|
| C1 | **WebAdapter (Alpine) contradiz o SPA aprovado (React).** TU-12 prevê "Fastify + Alpine.js"; o plano aprovado escolhe React+Vite. O argumento "port/adapter barateia o WebAdapter futuro" perde força — o destino web real é React. | `BACKLOG_sanitize.md:1001`; `context-graph-insights-plan.md` F3 / §1.2 |
| C2 | **TU-4/TU-9 migram exatamente o código que F0.5 vai podar** (handlers dos 9 deletados no menu e schedule). Migração agora = churn + estado transitório (Regra 7). | `context-graph-insights-plan.md` F0.5; `interactive-mode.ts:702-723`, `schedule-handler.ts:216-296` |
| C3 | **TUI renderizaria artefatos deletados** (traceability, flakiness, pipeline-health…). Anti-goal UX: "sem dashboard por dashboard adicionado ao menu". | `context-graph-insights-plan.md` §0.3, §1.5 |
| C4 | **Custo do TUI ≥ custo do plano inteiro.** TU-1..TU-11 ≈ 21 dias de tarefa vs F0–F3 ≈ 68h. E o TUI não corrige defeito de dados (causa raiz real). | `BACKLOG_sanitize.md:971-995`; `context-graph-insights-plan.md:1233` |
| C5 | **A base terminal já cobre o essencial** (Output, palette, box, theme, spinner, splash, markdown ANSI, @inquirer, `entry-menu` com interface `MenuUI` já existente em `entry-menu.ts:62-69`). Incremento do Ink é estreito. | `shared/ui/` (explorado 2026-08-06) |

### 2.2 Recomendação: reconciliar, não duplicar

O instinto arquitetural do TUI (port/adapter) **sobrevive — mas na fronteira certa**: a borda `/api` (contrato JSON de insights/grafo), não `prompt/showSelect`.

| Caminho | Quando | Escopo | Custo | ROI |
|---|---|---|---|---|
| **A — Terminal-lite (pós-F0.5)** | Agora, após podar o menu | Melhorar o terminal existente: menu podado, preview markdown inline, atalhos, error dialogs — **sem nova dependência Ink**, reusando `Output`/`palette`/`box` | ~2–3d | Imediato, zero risco |
| **B — TUI Ink como cliente do `/api`** | Após F2 (grafo) | `TuiAdapter` consumindo os **mesmos** `/api/graph` + `/api/insights` do `git_triggers/ui.ts` (F3.0). Um contrato HTTP, dois adapters (SPA React + TUI terminal) | ~5–7d | Positivo, coerente com o plano |

**Convergência:** uma camada de dados/insights (F0–F2), múltiplos canais (HTML push, SPA, TUI, CLI JSON) — todos sobre a mesma API. É a "plataforma de inteligência" dos CAPABILITIES-ANALYSIS, com a correção de causa raiz imposta pelo plano aprovado.

### 2.3 Respostas diretas da consultoria

- **"O planejamento é interessante em ROI?"** — TUI Ink full, em paralelo, agora: baixo-marginal (C1–C4). TUI como cliente do `/api` após F2: positivo. Terminal-lite agora: positivo imediato.
- **"Estou no caminho certo?"** — O plano aprovado (grafo + insights): sim. O Sprint TUI Ink como redigido em 06-06: parcialmente não (WebAdapter conflita; migração de handlers toca código em poda).
- **"Deveria alterar?"** — Sim, no faseamento e na fronteira, não na ideia. Port/adapter vale — na borda `/api`.

---

## 3. Decisões em aberto (autoridade do usuário — não inferir)

| # | Pergunta | Opções | Decisão | Data | Autoridade |
|---|---|---|---|---|---|
| Q1 | O terminal é um canal estratégico próprio (persona que vive no terminal) ou secundário ao SPA? | (a) estratégico; (b) secundário | | | |
| Q2 | O driver do TUI é o "pipeline monitor em tempo real" (TU-7) ou o menu persistente? | (a) pipeline monitor; (b) menu persistente | | | |
| Q3 | O TUI deve ser alinhado ao SPA (mesma `/api`, reusando `git_triggers/ui.ts`) ou independente do grafo? | (a) alinhado; (b) independente | | | |
| Q4 | Emoji-free (GOLDEN-REFERENCE §1) vale também no terminal? | (a) sim; (b) não | | | |

---

## 4. Evolução (amadurecimento)

| Data | Ação | Decisão/Registro |
|---|---|---|
| 2026-08-06 | Documento criado com ideias iniciais + documentos de consulta | Rascunho aberto. Execução segue o plano aprovado. |
