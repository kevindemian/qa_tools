# Plano de Auditoria Funcional Integrada

> **Fusão de 3 registros do BACKLOG.md:**
>
> 1. Sprint Auditoria Sistêmica — 4 dimensões de avaliação (2026-06-14)
> 2. Feature Audit Framework — T1 a T20 (2026-06-13)
> 3. Feature Audit — Plano de Integração Funcional — 7 grupos (2026-06-14)
>
> **Regra absoluta:** uma feature por vez, sem workarounds, sem débitos, 100% cobertura para código novo.

---

## 1. Objetivo

Para cada feature do sistema, executar um ciclo completo de:

1. **Auditoria** (T1-T20 + 7 Dimensões)
2. **Correção de causa raiz** (zero workaround)
3. **Testes de integração funcional** (padrão FT-xx)

Entregando: 100% das features auditadas, 0 gaps, 0 workarounds, testes de integração funcionais para toda capability do sistema.

---

## 2. Escopo

**~90 features** organizadas em 7 grupos ordenados por dependência.

| Grupo | Escopo                                                              | Features | Status atual testes integração | Status atual auditoria |
| ----- | ------------------------------------------------------------------- | -------- | ------------------------------ | ---------------------- |
| **0** | Fundação: config, state, store, metrics, logger, temp-dir, fixtures | 8        | ✅ FT-01 a FT-08               | 🔜 Pendente            |
| **1** | Processamento: health-score, quality-gate, coverage, release-score  | 7        | ✅ FT-09 a FT-15               | 🔜 Pendente            |
| **2** | Relatórios HTML: 19 dashboards + PR report                          | 19       | ❌                             | 🔜 Pendente            |
| **3** | Test Impact: quarantine, regression, comparison                     | 6        | ❌                             | 🔜 Pendente            |
| **4** | Integrações Jira: 27 case commands                                  | 27       | ❌                             | 🔜 Pendente            |
| **5** | Integrações Git: 12 handlers                                        | 12       | ❌                             | 🔜 Pendente            |
| **6** | LLM + IA: 11 features                                               | 11       | ❌                             | 🔜 Pendente            |
| **7** | Infraestrutura: wizard, setup, prompts                              | 10       | ❌                             | 🔜 Pendente            |
| **V** | Auditoria final de conexão                                          | —        | ❌                             | 🔜 Pendente            |

**Features que já passaram por auditoria (não repetir):**

- PR Report (F1) — 17 gaps documentados, já corrigido
- feature-config (SA-2a) — isolamento OK

---

## 3. Workflow por Feature

Cada feature segue este pipeline, executado sequencialmente:

```
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 1 — Mapeamento                                            │
│ rg -l <FeatureKeyword> --include='*.ts' para achar todos        │
│ os arquivos que tocam a feature (fonte, teste, config,          │
│ wizard, CI, triggers, docs)                                     │
│ Lista final com path + papel de cada arquivo                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 2 — Auditoria T1-T20                                      │
│ Aplicar as 20 categorias do Feature Audit Framework.             │
│ Cada categoria: ✅ / ❌ + gap / N/A + justificativa              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 3 — Auditoria 7 Dimensões                                 │
│ Avaliar: Isolamento, Robustez, Boas Práticas,                   │
│ Implementação Ótima, Métricas, UX, Auditoria Profunda de Testes │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 4 — Registro de Gaps                                      │
│ Cada ❌ vira GAP com ID (G1, G2, ...)                           │
│ Classificar: Bug > Crítico > Alto > Médio > Doc                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 5 — Correção de Causa Raiz                                │
│ Corrigir na origem, sem workarounds, sem débitos,               │
│ sem bypass arquitetural                                          │
│ Proibido: compatibilidade reversa, shims, fallbacks,            │
│ supressão de erros, deslocamento de defeito entre camadas       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 6 — Testes de Integração (FT-xx)                          │
│ Criar/atualizar arquivo de teste seguindo padrão existente:     │
│ • shared/__tests__/integration/<feature>.integration.test.ts    │
│ • Isolamento total (tmp dir + cleanup)                          │
│ • Sub-testes FT-xxa, FT-xxb, ... por comportamento              │
│ • Fixtures realistas via integration-helpers.ts                 │
│ • Cobertura de gaps corrigidos                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 7 — Validação                                             │
│ tsc --noEmit → 0 erros                                          │
│ vitest run → 100% pass                                          │
│ lint → 0 violações                                              │
│ Se falhar: corrigir antes de avançar para próxima feature       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. As 7 Dimensões de Avaliação

### Dimensão 1 — Isolamento de Testes

| Item | O que verificar                                             |
| ---- | ----------------------------------------------------------- |
| 1.1  | Testes criam/deletam arquivos reais no project root?        |
| 1.2  | Usam `os.tmpdir()` ou `/tmp` como base?                     |
| 1.3  | Limpeza pós-execução (`afterEach`/`afterAll`)?              |
| 1.4  | `process.cwd()` é mockado quando necessário?                |
| 1.5  | Nenhum arquivo em `config/`, `data/`, `reports/` é afetado? |
| 1.6  | Operações fs estão em `vi.mock()` ou `vi.spyOn()`?          |

### Dimensão 2 — Robustez

| Item | O que verificar                                           |
| ---- | --------------------------------------------------------- |
| 2.1  | Contratos tipados (interfaces exportadas)?                |
| 2.2  | Schemas validados (Zod, type guards)?                     |
| 2.3  | Edge cases testados (vazio, null, undefined, boundary)?   |
| 2.4  | Error handling (try/catch com contexto, sem catch vazio)? |
| 2.5  | Entrada validada em todas as funções públicas?            |

### Dimensão 3 — Boas Práticas

| Item | O que verificar                                  |
| ---- | ------------------------------------------------ |
| 3.1  | Padrão Wizard → Config → Runtime (se aplicável)? |
| 3.2  | SRP (Single Responsibility)?                     |
| 3.3  | DIP (Dependency Injection / Inversão)?           |
| 3.4  | Dependency Wall (sem imports circulares)?        |
| 3.5  | Sem workarounds, shims, fallbacks, bypasses?     |
| 3.6  | Padrão consistente com o resto do sistema?       |

### Dimensão 4 — Implementação Ótima

| Item | O que verificar                               |
| ---- | --------------------------------------------- |
| 4.1  | Poderia ser mais simples?                     |
| 4.2  | Duplicação de código com outra feature?       |
| 4.3  | Acoplamento desnecessário?                    |
| 4.4  | Dead code presente?                           |
| 4.5  | Algoritmo/estrutura adequada para o problema? |

### Dimensão 5 — Métricas (Conformidade Normativa)

Esta dimensão avalia a **qualidade das métricas** que a feature produz, desde a conceituação até a implementação.

#### 5a — Inventário de Métricas

| Item | O que verificar                                        |
| ---- | ------------------------------------------------------ |
| 5a.1 | Quais métricas a feature expõe/calcula?                |
| 5a.2 | Cada métrica tem nome, descrição e unidade claros?     |
| 5a.3 | O propósito da métrica está documentado?               |
| 5a.4 | A métrica é útil para tomada de decisão? OU é vaidade? |

#### 5b — Metodologia de Medição

| Item | O que verificar                                                       |
| ---- | --------------------------------------------------------------------- |
| 5b.1 | Como os dados são coletados? (amostragem, censo, evento?)             |
| 5b.2 | Periodicidade da coleta é adequada?                                   |
| 5b.3 | Agregação (média, mediana, percentil?) é correta para o tipo de dado? |
| 5b.4 | Há tratamento de outliers?                                            |
| 5b.5 | A janela temporal é apropriada?                                       |

#### 5c — Fórmulas e Pesos (Mathematical Correctness)

| Item | O que verificar                                                |
| ---- | -------------------------------------------------------------- |
| 5c.1 | Decompor cada fórmula — operadores e operandos estão corretos? |
| 5c.2 | Pesos são justificados? Baseados em evidência ou arbitrários?  |
| 5c.3 | Denominador pode ser zero? Divisão por zero tratada?           |
| 5c.4 | Saturação/limites (clamp entre 0-100, 0-1 etc.) aplicados?     |
| 5c.5 | Precisão numérica adequada (inteiro vs float, arredondamento)? |
| 5c.6 | Thresholds têm fundamento normativo ou empírico?               |

#### 5d — Conformidade Normativa

Avaliar alinhamento com normas, padrões e boas práticas reconhecidas:

| Norma / Referência                                              | O que verificar                                                     | Aplicável a                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------- |
| **ISO/IEC 25010:2011** — Qualidade de produto de software       | Métricas de qualidade: confiabilidade, desempenho, manutenibilidade | Health Score, Quality Gate      |
| **ISO/IEC 25023:2016** — Measurement of system/software quality | Métricas de qualidade de sistema                                    | Health Score, Quality Gate      |
| **ISTQB** — Métricas de teste                                   | Pass rate, fail rate, coverage, defect density                      | Metrics, Coverage, Quality Gate |
| **DORA (DevOps Research & Assessment)**                         | Deployment frequency, lead time, MTTR, change fail rate             | Release Score, Pipeline Health  |
| **OWASP** — Métricas de segurança                               | Cobertura de segurança, severidade de vulnerabilidades              | (se aplicável)                  |
| **SEI / CMMI** — Métricas de processo                           | Estabilidade, maturidade do processo                                | Release Score                   |
| **Regras de domínio do projeto**                                | Definições próprias documentadas em TECHDOCs                        | Todas                           |

| Item | O que verificar                                             |
| ---- | ----------------------------------------------------------- |
| 5d.1 | A feature referencia alguma norma ou padrão?                |
| 5d.2 | O cálculo está alinhado com a definição da norma?           |
| 5d.3 | Thresholds e níveis de gravidade seguem padrão reconhecido? |
| 5d.4 | Se não segue norma: há justificativa explícita?             |

#### 5e — Proveniência e Rastreabilidade

| Item | O que verificar                                        |
| ---- | ------------------------------------------------------ |
| 5e.1 | Cada métrica tem origem documentada (fonte dos dados)? |
| 5e.2 | A transformação dados-brutos → métrica é rastreável?   |
| 5e.3 | Há auditoria de valores (quem/qual versão calculou)?   |
| 5e.4 | Cache ou stale data são detectáveis?                   |

#### 5f — Validação Empírica

| Item | O que verificar                                              |
| ---- | ------------------------------------------------------------ |
| 5f.1 | Os cálculos foram testados contra dados reais (não só mock)? |
| 5f.2 | Existe teste de sanidade para valores conhecidos?            |
| 5f.3 | Os resultados são consistentes com ferramentas externas?     |
| 5f.4 | Regressões métricas são detectáveis por testes?              |

### Dimensão 6 — Experiência do Usuário (UX)

Avalia a **experiência completa** do usuário com a feature, incluindo:

- **Interface** — CLI, menus, flags, outputs, relatórios gerados
- **Documentação** — arquivos de ajuda (--help), TECHDOCs, READMEs, guias de uso, mensagens de erro que orientam o usuário
- **Comportamento** — feedback, confirmações, navegação, consistência terminológica

Documentação **é parte da UX**: documentação incorreta, desatualizada, incompleta ou contraditória é um gap de UX, não N/A.

| Item | O que verificar                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------- |
| 6.1  | Mensagens de erro são acionáveis (dizem o que fazer, não só o que falhou)?                           |
| 6.2  | CLI `--help` e documentação textual são claros, completos e consistentes?                            |
| 6.3  | Output de relatórios é legível (formatação, cores, tabelas)?                                         |
| 6.4  | Feedback de progresso para operações longas?                                                         |
| 6.5  | Confirmação antes de ações destrutivas (sobrescrever, deletar)?                                      |
| 6.6  | Navegação consistente (menus, sub-comandos seguem padrão)?                                           |
| 6.7  | Terminologia consistente entre código, documentação, CLI e mensagens?                                |
| 6.8  | Silent mode / verbose mode disponíveis quando relevante?                                             |
| 6.9  | Documentação da feature (TECHDOC, README, guias) é precisa, completa e reflete o comportamento real? |

### Dimensão 7 — Auditoria Profunda de Testes (Deep Test Audit)

Avalia a **qualidade intrínseca dos testes** da feature — não apenas se existem, mas se são
corretos por propósito, rigorosos na detecção de defeitos e livres de anti-padrões que
criam falsa confiança.

Esta dimensão detecta seis categorias de problemas:

| Categoria                         | Descrição                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bad testing patterns**          | Asserções vagas (`toBeDefined`, `toBeTruthy` sem alvo real), `toThrow()` sem validação de mensagem/causa, testes sem nenhum `expect`, `.skip`/`.only` não documentados |
| **Oracle Problem**                | Valores esperados copiados do output do código atual em vez de derivados de requisitos; dual-implementation (teste reimplementa a mesma fórmula do código-fonte)       |
| **Mock discipline**               | Mocks com shape diferente do real (campos omitidos, `{}` genérico onde dados estruturados são esperados), mocks lenientes que escondem bugs                            |
| **Type/safety suppressions**      | `nullAs()`, `as any`, `as unknown as T`, `!`, `@ts-expect-error` / `@ts-ignore` em testes — contornam o sistema de tipos em vez de testar contratos reais              |
| **Testing discipline compliance** | Violações de Red-Green-Refactor, código escrito sem teste correspondente, PBT ausente em lógica crítica sem justificativa documentada                                  |
| **Determinismo**                  | Testes que dependem de estado global não resetado, ordem de execução, ou IO real sem mock (rede, filesystem)                                                           |

Referência: `AGENTS.md` (Rule 19 — Testing Discipline) e FUNCTIONAL-AUDIT-PROGRESS.md (Cross-cutting D7 — Anti-padrões).

| Item | O que verificar                                                                            |
| ---- | ------------------------------------------------------------------------------------------ |
| 7.1  | Testes usam `toBeDefined()` / `toBeTruthy()` / `toBeNull()` sem assert real?               |
| 7.2  | Testes têm zero `expect` calls (no-assert test)?                                           |
| 7.3  | Expected values vêm de requisitos, não de output atual do código (Oracle Problem)?         |
| 7.4  | Mocks são estritos (shape idêntico ao real, sem campos omitidos)?                          |
| 7.5  | Testes de erro validam mensagem/causa, não só `toThrow()` sem argumento?                   |
| 7.6  | `describe.skip` / `it.skip` / `test.skip` presentes sem documentação?                      |
| 7.7  | Test names descrevem comportamento, não implementação?                                     |
| 7.8  | Testes são determinísticos (sem dependência de estado global não resetado)?                |
| 7.9  | Type suppressions em testes (`as any`, `!`, `nullAs()`, `@ts-ignore`, `@ts-expect-error`)? |
| 7.10 | Dual-implementation detectada (teste replica fórmula do source em vez de invariante)?      |
| 7.11 | PBT obrigatório para lógica crítica foi omitido sem justificativa documentada?             |
| 7.12 | Test-first violado (código de implementação escrito sem teste correspondente)?             |

---

## 5. Checklist T1-T20 (Referência)

| #       | Categoria                 | O que procurar                                                                                    |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| **T1**  | Entry point               | A feature tem entry point claro? Acessível por CLI, trigger, ou CI?                               |
| **T2**  | Config model              | Schema de config? Validado por Zod? Interfaces espelham o schema?                                 |
| **T3**  | Config accessor           | Módulo de acesso com getters tipados e defaults sensíveis?                                        |
| **T4**  | Runtime lê config         | Runtime lê config em vez de depender só de CLI flags/env vars?                                    |
| **T5**  | Wizard entry              | O wizard tem entrada para configurar esta feature?                                                |
| **T6**  | Wizard detection          | O wizard detecta automaticamente o contexto relevante?                                            |
| **T7**  | Wizard output             | O wizard gera/configura os arquivos necessários?                                                  |
| **T8**  | Wizard prompts            | Perguntas são claras e completas? Cobrem sub-opções?                                              |
| **T9**  | Reconfig handler          | Handler para reconfigurar via git_triggers? Lê/escreve config?                                    |
| **T10** | CI integration            | Integrado nos templates CI? Workflows gerados estão corretos?                                     |
| **T11** | CI safety                 | Safety mechanisms ativos? Fallbacks seguros?                                                      |
| **T12** | Test coverage             | Cada módulo novo tem testes? Cobrem os novos caminhos?                                            |
| **T13** | Dead code                 | Código substituído mas não deletado?                                                              |
| **T14** | Suppression               | `as any`, `!`, `@ts-ignore`, eslint-disable, catch vazio?                                         |
| **T15** | Bidirectional consistency | Se A→B e B→A: dois caminhos fazem a mesma coisa?                                                  |
| **T16** | CLI interface             | Tem CLI? `--help` funciona? Unknown flags reportadas?                                             |
| **T17** | Env var dependency        | Depende de env vars? Estão em `.env.example` e no schema?                                         |
| **T18** | Error handling            | Erros logados com contexto? Fallbacks explícitos e documentados?                                  |
| **T19** | TECHDOC                   | Feature documentada? Tipo, interface, entry point, flags?                                         |
| **T20** | CI/Config Contract        | CI passa parâmetros corretos? Runtime resolve config? Contrato Action→CLI→config key consistente? |

---

## 6. Ordem de Execução

Os grupos são processados **na ordem**, respeitando dependências. Dentro de cada grupo, as features podem ser paralelizadas se não houver dependência entre elas.

### Grupo 0 — Fundação (features já com testes, sem auditoria formal)

| Ordem | ID    | Feature             | Módulo                                                | Testes integração existentes |
| ----- | ----- | ------------------- | ----------------------------------------------------- | ---------------------------- |
| 0.1   | FT-01 | Config Accessor     | `shared/config-accessor.ts`                           | ✅ 6 sub-testes              |
| 0.2   | FT-02 | Feature Config      | `shared/feature-config.ts`                            | ✅ 8 sub-testes              |
| 0.3   | FT-03 | Session State       | `shared/state.ts`                                     | ✅ 5 sub-testes              |
| 0.4   | FT-04 | Metrics Store       | `shared/metrics.ts`                                   | ✅ 7 sub-testes              |
| 0.5   | FT-05 | Logger              | `shared/logger.ts`                                    | ✅ 6 sub-testes              |
| 0.6   | FT-06 | Temp Dir            | `shared/temp-dir.ts`                                  | ✅ 6 sub-testes              |
| 0.7   | FT-07 | Store               | `shared/store.ts`                                     | ✅ 6 sub-testes              |
| 0.8   | FT-08 | Integration Helpers | `shared/__tests__/integration/integration-helpers.ts` | — (infra)                    |

**Trabalho:** Auditar (T1-T20 + 7 dim) → identificar gaps → corrigir → expandir testes se necessário.

### Grupo 1 — Processamento (features já com testes, sem auditoria formal)

| Ordem | ID    | Feature           | Módulo                        | Testes integração existentes |
| ----- | ----- | ----------------- | ----------------------------- | ---------------------------- |
| 1.1   | FT-09 | Health Score      | `shared/health-score.ts`      | ✅ 6 sub-testes              |
| 1.2   | FT-10 | Quality Gate      | `shared/quality-gate.ts`      | ✅ 4 sub-testes              |
| 1.3   | FT-11 | Coverage Source   | `shared/coverage-source.ts`   | ✅ 2 sub-testes              |
| 1.4   | FT-12 | Quality Metrics   | `shared/quality-metrics.ts`   | ✅ 6 sub-testes              |
| 1.5   | FT-13 | Quality Suggester | `shared/quality-suggester.ts` | ✅ 2 sub-testes              |
| 1.6   | FT-14 | Release Score     | `shared/release-score.ts`     | ✅ 5 sub-testes              |
| 1.7   | FT-15 | Benchmark Metrics | `shared/benchmark-metrics.ts` | ✅ 1 sub-teste               |

**Trabalho:** Auditar (T1-T20 + 7 dim, com ênfase na **Dimensão 5** pois são features de métricas) → gaps → correção → expandir testes se necessário.

### Grupo 2 — Relatórios HTML (features sem testes de integração)

| Ordem | ID    | Feature                 | Módulo                                 |
| ----- | ----- | ----------------------- | -------------------------------------- |
| 2.1   | FT-16 | PR Report               | `shared/pr-report-core.ts`             |
| 2.2   | FT-17 | HTML Report             | `shared/report-html.ts`                |
| 2.3   | FT-18 | Coverage Gap            | `shared/generate-coverage-gap-html.ts` |
| 2.4   | FT-19 | Flakiness Dashboard     | `shared/flakiness-dashboard.ts`        |
| 2.5   | FT-20 | Defect Trend            | `shared/defect-trend.ts`               |
| 2.6   | FT-21 | Defect Seasonality      | `shared/defect-seasonality.ts`         |
| 2.7   | FT-22 | Silent Regression       | `shared/silent-regression.ts`          |
| 2.8   | FT-23 | AI Effectiveness        | `shared/ai-effectiveness.ts`           |
| 2.9   | FT-24 | AI Comparison           | `shared/ai-comparison.ts`              |
| 2.10  | FT-25 | Cross-Squad Benchmark   | `shared/cross-squad-benchmark.ts`      |
| 2.11  | FT-26 | Suite Optimization      | `shared/suite-optimization.ts`         |
| 2.12  | FT-27 | Developer Profile       | `shared/developer-profile.ts`          |
| 2.13  | FT-28 | Backlog Health          | `shared/backlog-health.ts`             |
| 2.14  | FT-29 | Pipeline Cost           | `shared/pipeline-cost.ts`              |
| 2.15  | FT-30 | Impact Alert            | `shared/impact-alert.ts`               |
| 2.16  | FT-31 | Incident Report         | `shared/incident-report.ts`            |
| 2.17  | FT-32 | Requirement Score       | `shared/requirement-score.ts`          |
| 2.18  | FT-33 | Traceability Matrix     | `shared/traceability-matrix.ts`        |
| 2.19  | FT-34 | Release Score Rendering | `shared/release-score.ts`              |

**Trabalho:** Auditar (T1-T20 + 7 dim) → gaps → correção → **criar testes de integração**.

### Grupo 3 — Test Impact e Análise

| Ordem | ID    | Feature                  | Módulo                            |
| ----- | ----- | ------------------------ | --------------------------------- |
| 3.1   | FT-35 | Test Impact              | `shared/test-impact.ts`           |
| 3.2   | FT-36 | Quarantine               | `shared/quarantine.ts`            |
| 3.3   | FT-37 | Git Metrics Adapter      | `shared/git-metrics-adapter.ts`   |
| 3.4   | FT-38 | Coverage Verifier        | `shared/coverage-verifier.ts`     |
| 3.5   | FT-39 | Run Comparison           | `shared/run-comparison.ts`        |
| 3.6   | FT-40 | Cross-Squad (refatorado) | `shared/cross-squad-benchmark.ts` |

### Grupo 4 — Integrações Jira (27 cases)

| Ordem | ID    | Feature                     | Módulo               |
| ----- | ----- | --------------------------- | -------------------- |
| 4.1   | FT-41 | case01 — Import CSV → Tests | `commands/case01.ts` |
| 4.2   | FT-42 | case02 — View Versions      | `commands/case02.ts` |
| ...   | ...   | ...                         | ...                  |
| 4.27  | FT-68 | case-d — Dashboards Menu    | `commands/case-d.ts` |

### Grupo 5 — Integrações Git (12 handlers)

| Ordem | ID    | Feature        | Módulo              |
| ----- | ----- | -------------- | ------------------- |
| 5.1   | FT-69 | GitHub Manager | `github_manager.ts` |
| ...   | ...   | ...            | ...                 |
| 5.12  | FT-80 | CLI Dispatch   | `cli-dispatch.ts`   |

### Grupo 6 — LLM e IA (11 features)

| Ordem | ID    | Feature          | Módulo                    |
| ----- | ----- | ---------------- | ------------------------- |
| 6.1   | FT-81 | LLM Client       | `llm-client.ts`           |
| ...   | ...   | ...              | ...                       |
| 6.11  | FT-91 | Self Consistency | `llm-self-consistency.ts` |

### Grupo 7 — Infraestrutura (10 features)

| Ordem | ID     | Feature              | Módulo                         |
| ----- | ------ | -------------------- | ------------------------------ |
| 7.1   | FT-92  | Setup Wizard         | `setup/main.ts`                |
| ...   | ...    | ...                  | ...                            |
| 7.10  | FT-101 | Validation Framework | `shared/artifact-validator.ts` |

### V — Verificação Final (pós-grupos)

| ID   | Item                    | Critério                            |
| ---- | ----------------------- | ----------------------------------- |
| V-01 | `tsc --noEmit`          | 0 erros                             |
| V-02 | `vitest run`            | 100% pass                           |
| V-03 | lint                    | 0 violações                         |
| V-04 | Cobertura novos módulos | 100% statements                     |
| V-05 | Auditoria de conexão    | Toda feature → menu → exec → output |
| V-06 | Débitos novos           | 0                                   |
| V-07 | Workarounds             | 0                                   |
| V-08 | Catches vazios          | 0                                   |

---

## 7. Template de Saída por Feature

Cada feature auditada produz este registro no `BACKLOG.md`:

```markdown
### FT-xx — [Feature Name]

**Módulo:** `path/to/module.ts` (N linhas)
**Testes:** `shared/__tests__/integration/feature.integration.test.ts` (N sub-testes)

#### T1-T20

| #   | Categoria          | Status        | Gap               |
| --- | ------------------ | ------------- | ----------------- |
| T1  | Entry point        | ✅ / ❌ / N/A | (se ❌) descrição |
| T2  | Config model       | ✅ / ❌ / N/A | ...               |
| ... | ...                | ...           | ...               |
| T20 | CI/Config Contract | ✅ / ❌ / N/A | ...               |

#### 7 Dimensões

| Dimensão                        | Status             | Achados |
| ------------------------------- | ------------------ | ------- |
| 1. Isolamento Testes            | ✅ / ❌            | ...     |
| 2. Robustez                     | ✅ / ⚠️ / ❌       | ...     |
| 3. Boas Práticas                | ✅ / ⚠️ / ❌       | ...     |
| 4. Implementação Ótima          | ✅ / ⚠️ / ❌       | ...     |
| 5. Métricas                     | ✅ / ⚠️ / ❌ / N/A | ...     |
| 6. UX                           | ✅ / ⚠️ / ❌ / N/A | ...     |
| 7. Auditoria Profunda de Testes | ✅ / ⚠️ / ❌ / N/A | ...     |

#### Gaps

| ID  | Severidade | Descrição | Ação corretiva | Status |
| --- | ---------- | --------- | -------------- | ------ |
| G1  | Alto       | ...       | ...            | 🔜     |

#### Testes de Integração

| ID     | Sub-teste | O que cobre |
| ------ | --------- | ----------- |
| FT-xxa | ...       | ...         |
| FT-xxb | ...       | ...         |
```

---

## 8. Padrão de Testes de Integração

Todos os testes de integração seguem o padrão estabelecido em `shared/__tests__/integration/`:

### Estrutura do arquivo

```
shared/__tests__/integration/<feature>.integration.test.ts
```

### Template

```typescript
/**
 * Integration tests — [Feature Name] (FT-xx)
 *
 * [Descrição do que os testes validam]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let TEST_DIR: string;

describe('Integration: [Feature Name]', () => {
    beforeEach(() => {
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-<feature>-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch {
            /* best effort cleanup */
        }
    });

    describe('FT-xxa: [comportamento]', () => {
        it('...', () => {
            // test body
        });
    });
});
```

### Regras do padrão

1. **Isolamento total:** `fs.mkdtempSync` em `beforeEach`, `fs.rmSync` em `afterEach`
2. **Fixtures realistas:** usar `integration-helpers.ts` sempre que possível
3. **Sub-testes nomeados:** `FT-xxa`, `FT-xxb`, `FT-xxc`... — um `describe` por comportamento
4. **Sem mocks de filesystem:** o teste deve operar em diretório temporário real
5. **Sem dependência externa:** não depende de rede, serviços externos ou estado global
6. **Cada sub-teste testa UM comportamento** (SRP nos testes)

---

## 9. Validação por Grupo

Após cada grupo completo:

```bash
npx tsc --noEmit       # 0 erros
npx vitest run         # 100% pass
npm run lint           # 0 violações
```

Se qualquer validação falhar: **parar, corrigir causa raiz, revalidar** antes de avançar para o próximo grupo.

---

## 10. Priorização Interna (Dimensões 5 e 7)

**Dimensão 5 (Métricas):** Para features que produzem métricas, a Dimensão 5 tem precedência sobre as demais, pois erro em métrica corrompe a base de todo o sistema de qualidade.

**Dimensão 7 (Auditoria Profunda de Testes):** A Dimensão 7 aplica-se a **todas** as features, independentemente de tipo. Deve ser executada simultaneamente à auditoria T1-T20, pois anti-padrões de teste (Oracle Problem, mocks lenientes, suppressions) invalidam a confiança em toda a suíte de testes da feature.

**Features críticas para Dimensão 5 (auditar primeiro dentro de cada grupo):**

| Grupo | Features críticas                                                          |
| ----- | -------------------------------------------------------------------------- |
| 1     | health-score (FT-09), quality-gate (FT-10), release-score (FT-14)          |
| 2     | defect-trend (FT-20), silent-regression (FT-22), requirement-score (FT-32) |
| 3     | test-impact (FT-35), quarantine (FT-36)                                    |
| 6     | llm-metrics (FT-86), failure-analysis (FT-87)                              |

---

## 11. Glossário da Dimensão 5

| Termo                  | Definição                                                                 |
| ---------------------- | ------------------------------------------------------------------------- |
| **Métrica**            | Medida quantitativa usada para avaliação, comparação ou tomada de decisão |
| **Indicador**          | Métrica interpretada contra um threshold ou alvo                          |
| **Acreditação**        | Certificação por entidade reconhecida (ISO, INMETRO, ANSI, etc.)          |
| **Norma**              | Documento estabelecido por consenso que fornece regras/diretrizes         |
| **Proveniência**       | Origem e histórico dos dados que alimentam a métrica                      |
| **Validação empírica** | Verificação do cálculo contra dados reais, não apenas artificiais         |
| **Threshold**          | Valor limite que determina aprovação/reprovação                           |
| **Saturação**          | Limitação de uma métrica a um intervalo (ex: clamp 0-100)                 |

---

## 12. Regras Metodológicas Invioláveis

Estas regras têm **precedência absoluta** sobre qualquer outra instrução neste documento. Violação de qualquer regra abaixo invalida a solução completa e exige recomeço do passo.

### Código Disciplinar

| #      | Regra                                             | Descrição                                                                                                                                                                                                                                                                                                                                                                                                    | Consequência                                        |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| **R1** | **Dados fictícios estritos**                      | Todo novo teste deve usar **dados fictícios (mocks) explícitos**. Nunca copiar dados de produção, nunca usar output atual do código como fixture. O mock define o domínio do teste.                                                                                                                                                                                                                          | Teste inválido — refazer                            |
| **R2** | **Validação contra lógica de negócios**           | O valor esperado no assert deve vir da **especificação do domínio** (regra de negócio, norma, documentação), nunca do output atual do código. O código atual pode estar errado — o teste deve capturar isso.                                                                                                                                                                                                 | Teste inválido — refazer                            |
| **R3** | **Teste falhou = bug no código-fonte**            | Se um teste falha, a **causa raiz está no código-fonte**, nunca no teste. O teste é a especificação executável. A implementação deve ser corrigida para satisfazer o teste.                                                                                                                                                                                                                                  | Correção inválida — reverter e corrigir código      |
| **R4** | **Proibido alterar asserts em testes existentes** | É **expressamente proibido** alterar valores esperados (`expect`, `assert`, `toEqual`, `toBe`, etc.) em testes existentes para fazê-los passar. Se o teste falha, o código-fonte está errado — corrija o código, nunca o teste. Exceção: se o assert estiver comprovadamente errado segundo a lógica de negócios (R2), o teste deve ser corrigido **antes** de rodar, e o código ajustado para satisfazê-lo. | Correção inválida — reverter                        |
| **R5** | **Property-Based Testing (PBT)**                  | Sempre que aplicável, usar **Property-Based Testing** (ex: `fast-check`). Definir **propriedades invariantes** que devem valer para toda entrada válida, deixando o framework gerar os casos. Preferir PBT a exemplos fixos para validação de lógica de negócio.                                                                                                                                             | Omitir PBT sem justificativa documentada = violação |

### Hierarquia de Validação

```
1. R1-R5 (regras metodológicas) — ABSOLUTAS, não negociáveis
2. Lógica de negócio / especificação do domínio
3. Normas e padrões (ISO, DORA, ISTQB, etc.)
4. Contratos e tipos
5. Testes existentes (como validação de regressão)
6. Implementação atual (NUNCA como autoridade sobre o esperado)
```

### Fluxo de Correção Obrigatório

```text
1. Identificar discrepância entre teste e código
2. VERIFICAR o teste:
   ├── O assert reflete a lógica de negócios? (R2) → SIM: vá para 3
   └── O assert está errado? → corrigir teste (antes de rodar), depois vá para 3
3. CORRIGIR o código-fonte para satisfazer o teste  (R3)
4. NUNCA: alterar assert para match do código atual (R4)
5. NUNCA: usar dados reais como fixture (R1)
6. Validar: tsc --noEmit + vitest run + lint
```

### Nota sobre R4 — Exceção

A única exceção à R4 é quando o valor esperado no assert **viola a lógica de negócios** (R2). Neste caso:

1. O teste está incorreto — **corrigir o assert** para o valor correto segundo o domínio
2. **Corrigir o código-fonte** para produzir o valor correto
3. A correção deve ser feita **antes** de executar o teste

Esta exceção não pode ser usada para "fazer o teste passar rápido" — deve ser usada apenas quando o valor esperado está matematicamente ou logicamente errado segundo a especificação.
