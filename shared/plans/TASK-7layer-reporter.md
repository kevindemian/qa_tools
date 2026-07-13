# TASK: 7-Layer — Reporter Detection (AST/Híbrido)

> **Parte do plano DataHub SSOT.** Reorganizado de `data-hub-ssot-enforcement.md` (2026-07-12).
> Documento original preservado (marcado SUPERSEDED). Este é o documento de verdade para a detecção de reporter.
> **STATUS: ⏳ PENDENTE — tarefa não executada.** Fase 11 (detecção de reporter AST/híbrido) ainda não iniciada. Requer pré-requisito Fase 3 (renomeação `detectConfigCtrf`→`detectTestReporter`, `CtrfSource`→`TestReportSource`) conforme dependência documentada.

## Fase 11 — Detecção de Reporter: AST/Híbrido (pesquisa + implementação)

**Objetivo:** Substituir a detecção regex-only por uma abordagem superior que combine package.json dependency check, config file analysis e (opcionalmente) AST parsing para detecção confiável de reporters de teste.

**Problema:** A detecção atual (`detectConfigCtrf` / `detectTestReporter`) usa apenas regex em arquivos de config. Limitações:

- Falsos positivos em comments/strings
- Só verifica vitest/vite configs (não jest, cypress, playwright)
- Não verifica package.json dependencies
- Só detecta CTRF, não JUnit/Mochawesome

**NOTA:** Antes de implementar, fazer pesquisa compreensiva sobre:

1. Viabilidade de AST parsing em TypeScript (ts-morph, jscodeshift, esbuild)
2. Custo-benefício vs package.json + regex expandida
3. Se há bibliotecas prontas para detecção de reporters
4. Se o hybrid (package.json deps + regex configs) é suficiente ou se AST é necessário

**Abordagem recomendada (hipótese a validar na pesquisa):**

- **Nível 1 (package.json):** Verificar se reporter está em `devDependencies`/`dependencies`
- **Nível 2 (config files):** Verificar se reporter é importado/configurado em config files
- **Nível 3 (AST):** Se necessário, usar AST parsing para entender a estrutura real do config

**Dependência:** Fase 3 (renomeação de `detectConfigCtrf` → `detectTestReporter` e `CtrfSource` → `TestReportSource`)

#### 11.1 — Pesquisa

| Item       | Detalhe                                                         |
| ---------- | --------------------------------------------------------------- |
| Escopo     | Viabilidade de AST parsing, package.json check, regex expandida |
| Entregável | Documento de decisão: qual abordagem implementar e por quê      |
| Checkpoint | Decisão documentada no plano                                    |

#### 11.2 — Implementação (depende da pesquisa)

| Item       | Detalhe                                                 |
| ---------- | ------------------------------------------------------- |
| Escopo     | Substituir `detectTestReporter` por abordagem escolhida |
| Frameworks | Todos: vitest, jest, cypress, playwright, generic       |
| Formatos   | CTRF, JUnit, Mochawesome (e futuros)                    |
| Checkpoint | `npx vitest run setup/detector.test.ts` = 0 falhas      |

#### 11.3 — Testes

| Item        | Detalhe                                                            |
| ----------- | ------------------------------------------------------------------ |
| Unit        | Testar detecção para cada framework + cada formato                 |
| Integration | Testar fluxo completo wizard → config escrita com reporter correto |
| Checkpoint  | `npx vitest run setup/` = 0 falhas                                 |

**Checkpoint Fase 11:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run setup/                               # 0 falhas
# Detecção funciona para: vitest+CTRF, vitest+JUnit, jest+JUnit, cypress+CTRF, playwright+CTRF
# package.json check: reporter em devDependencies → detectado
# config check: reporter em vitest.config → detectado
# Falsos positivos em comments → eliminados
```

## FASE D — Phase 11 Reporter Detection (G16)

**D1 — Pesquisa de viabilidade**

- Ação: avaliar AST (ts-morph/jscodeshift/esbuild) × package.json deps × regex expandida; documentar decisão.
- Checkpoint: decisão registrada no plano.

**D2 — Implementar detecção híbrida**

- Ação: `setup/detector.ts` — package.json (devDeps) + config files + AST opcional; frameworks vitest/jest/cypress/playwright; formatos CTRF/JUnit/Mochawesome.
- Checkpoint:
    ```bash
    npx tsc --noEmit
    npx vitest run setup/                                        # 0 falhas
    ```
- Commit: `feat(setup): hybrid reporter detection (package.json + config + AST)`
