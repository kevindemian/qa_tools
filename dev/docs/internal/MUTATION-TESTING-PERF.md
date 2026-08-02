# Mutation Testing — Estratégia, Segurança e CI Timeout

## Objetivo

Manter o job de mutation testing do CI dentro do `timeout-minutes` sem perder
cobertura de segurança do gate (score ≥60%) e **aumentar a segurança do gate**
eliminando falsos kills por erro de tipo.

**Estado (2026-08-02):** Rota B implementada — execução direta do Stryker com
`@stryker-mutator/typescript-checker` ativo. D e E migrados para a config
canônica. Estratégia B (split paralelo) permanece como plano futuro.

---

## Contexto (diagnóstico 2026-08-02)

| Run | Commit | Resultado do job mutation |
|-----|--------|---------------------------|
| `30716458448` | `f267f6c2` | Falha em 21s — `git diff failed: ambiguous argument 'main'` (corrigido por `442566bf`) |
| `30716904699` | `442566bf` | Falha REAL — `WEAK (58.47%, threshold 60%)`, Killed 442 / Survived 198 / No coverage 116, stage 792.8s |
| `30721175990` | `a43343c2` | **CANCELLED** — 22:27:23→22:42:39 = 15:16, excedeu `timeout-minutes: 15` |
| `30659043350` | main | Sucesso em 20s (push, base=HEAD~1, escopo minúsculo) |

Causa raiz do cancelamento: `timeout-minutes: 15` no job do mutation
(`.github/workflows/ci.yml`). `a43343c2` adicionou 291 linhas de teste que
ampliaram o escopo de mutação além de 15 min em `concurrency: 2`.

---

## Rota B — Stryker direto + typescript-checker ✅ implementado (2026-08-02)

### Decisão (autoridade: usuário — superioridade técnica e segurança apenas)

O orquestrador `tautest` foi removido e a mutação passou a rodar **diretamente
no Stryker core** com o checker de tipos ativo. Motivos técnicos (evidência no
código):

1. **`disableTypeChecks: true` era forçado** (`@tautest/core` base config) e
   **não sobreponível** (`mergeStrykerConfig` — base vence para escalares).
   Com isso, mutantes com erro de tipo eram EXECUTADOS; um teste que falhava
   por erro de tipo em runtime (ex.: `x.toUpperCase is not a function`)
   contava como **killed** → **score inflado por falso kill** → gate mais
   leniente que a verdade (§25.3: gate deve reportar verdade).
2. **O schema do tautest stripa chaves desconhecidas** (zod default): chaves
   `stryker.disableTypeChecks` e `stryker.vitest` no config eram **silenciosamente
   ignoradas** — configuradas mas sem efeito.
3. **`env` era descartado pelo Stryker**: a chave `env: { STRYKER_ACTIVE: 'true' }`
   do `userConfig` é opção desconhecida (warning) e nunca aplicada ao processo
   (`sandbox.js` usa `npmRunPathEnv()`; o vitest-runner não lê opção `env`).
   Logo o guard de determinismo do D (`isMutationRun`) **nunca ativava em CI** —
   em PRs, o `vitest-affected` ficava ATIVO durante a mutação (score não
   determinístico). **Correção: `STRYKER_ACTIVE: 'true'` agora é variável real
   no nível do job** (mecanismo verificado).
4. **Divergência de métrica**: o score do tautest incluía `compileError` no
   denominador (`scoreBase = killed+survived+noCoverage+timeout+runtimeError+compileError`),
   divergindo da métrica canônica do Stryker (mutation-testing-metrics), que
   **exclui** CompileError do denominador.
5. **Consistência sistêmica**: havia 3 fontes de verdade
   (`tautest.config.json` ativo, `tautest.config.ts` stale, `stryker.conf.json`
   órfão). Agora existe UMA: `stryker.conf.json`.

### Implementação

- **`stryker.conf.json`** (canônica): `checkers: ["typescript"]`,
  `appendPlugins: ["@stryker-mutator/typescript-checker"]`,
  `disableTypeChecks: false`, `typescriptChecker.prioritizePerformanceOverAccuracy:
  false` (máxima acurácia), `thresholds: { break: 60, high: 80, low: 60 }`,
  `coverageAnalysis: perTest`, `concurrency: 4`, `jsonReporter` →
  `reports/mutation/mutation-report.json`.
- **`scripts/mutation-scope.ts`**: replica o diff-scoping que o tautest fazia —
  `git diff --unified=0 --no-color <base> -- shared/ jira_management/ git_triggers/`,
  extrai linhas adicionadas por arquivo-fonte, emite padrões `path:inicio-fim`
  (exit 2 = nenhum escopo → CI pula).
- **CI (`mutation` job)**: `npx stryker run stryker.conf.json --mutate "$SCOPE"`;
  exit code via `thresholds.break`; upload do report de `reports/mutation/`.
- **Removidos**: `tautest` (devDep), `tautest.config.json`, `tautest.config.ts`,
  referências em `tsconfig.eslint.json` e `.gitignore`.

### Prova de segurança (verificação local 2026-08-02)

Run real com `--mutate "shared/date-utils.ts"`:
- 5 mutantes → **4 Killed + 1 CompileError** (score 100.00).
- O mutante inválido de tipo foi classificado `CompileError` pelo checker e
  **excluído do denominador** — não contou como falso kill nem como sobrevivente.
- Prova que o checker type-checks o projeto inteiro no dry-run: pegou erros de
  tipo reais em `scripts/mutation-scope.ts` durante a validação (corrigidos).

### Custo conhecido

- Dry run do Stryker roda a suite completa (~3 min, 6784 testes com
  `STRYKER_ACTIVE=true`) **uma única vez**, para construir o mapa de cobertura.
- **Por mutante NÃO roda a suite completa:** com `coverageAnalysis: perTest`,
  rodam apenas os testes que cobrem o mutante (subset do mapa de cobertura).
  Evidência (run real com `--mutate "shared/date-utils.ts"`):
  `Ran 27.60 tests per mutant on average` — não 6784. Fonte: tabela
  clear-text + `reports/mutation/mutation-report.json` do run local.
- O checker adiciona type-checking por grupo de mutantes (2 processos checker
  paralelos aos 2 de test runner) — estático, não executa suite.

---

## Estratégia D — Desacoplar `vitest-affected` da mutação ✅ migrado

### Problema

`vitest.config.ts` ativa `vitest-affected` quando `GITHUB_EVENT_NAME ===
'pull_request'`. Durante a mutação isso filtraria testes pelo diff →
**não determinístico** e com **falsos sobreviventes**.

### Correção

Gate `isPR && !isMutation` com `isMutation = STRYKER_ACTIVE === 'true'`.

- **CI PR normal:** `isPR=true`, `isMutation=false` → plugin ativo (selection
  por diff, rápido)
- **Dentro da mutação:** `STRYKER_ACTIVE=true` (job env) → plugin desativado →
  todos os testes que cobrem o mutante rodam (subset por cobertura,
  determinístico — **não** a suite completa)

**Importante:** o mecanismo antigo (chave `env` no tautest) era **não funcional** —
o Stryker descarta opções desconhecidas. Hoje `STRYKER_ACTIVE` é variável real
do job, verificada no run local.

---

## Estratégia E — `concurrency` 2 → 4 ✅ migrado

Stage de mutação do run `442566bf`: **792.8s** com `concurrency: 2`. Runner
`ubuntu-latest` tem 4 vCPU. `concurrency: 4` agora vive em `stryker.conf.json`.
Ganho é margem (~2x), não garantia — B será necessário à medida que o diff
crescer.

---

## Estratégia A — `timeout-minutes: 15` → `45` ⛔ fallback, NÃO implementado

Se o run do mutation ainda for cancelado por timeout (diff grande +
concurrency 4 + checker), escalar `timeout-minutes` para 45. Fallback — infla o
custo máximo de runaway.

---

## Estratégia B — Split paralelo por diretório 📋 plano futuro (confirmado 2026-08-02)

### Objetivo

Eliminar o timeout como restrição: cada job escopa um subconjunto de
diretórios e roda em paralelo.

### Viabilidade — agora NATIVA

O bloqueio documentado (ausência de flag de escopo por diretório no tautest)
**não existe mais**: com Stryker direto, `mutate` aceita padrões por diretório e
ranges de linha nativamente. O `scripts/mutation-scope.ts` pode aceitar um
filtro de diretório por job (ex.: `--dir shared`) e o CI usa matrix.

### Design proposto

`mutation` vira job matrix:

```yaml
mutation:
    name: Mutation Testing (${{ matrix.dir }})
    if: github.event_name == 'pull_request' || (github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/dev'))
    runs-on: ubuntu-latest
    needs: quality
    timeout-minutes: 15
    strategy:
        fail-fast: false
        matrix:
            dir: [shared, jira_management, git_triggers]
    env:
        STRYKER_ACTIVE: 'true'
    steps:
        - uses: actions/checkout@v5
          with: { fetch-depth: 0 }
        - uses: actions/setup-node@v6
          with: { node-version-file: .node-version, cache: npm }
        - run: npm ci
        - run: |
              MUTATE_SCOPE=$(npx tsx scripts/mutation-scope.ts --base "${BASE}" --dir "${{ matrix.dir }}") || exit 0
              npx stryker run stryker.conf.json --mutate "${MUTATE_SCOPE}"
```

### Consequências sistêmicas (analisar antes de executar)

- **Gate de merge:** required check muda de 1 job para 3 (ou job agregador)
- **Relatório:** upload separado por diretório (`mutation-report-${{ matrix.dir }}`)
- **Escopo vazio:** jobs sem arquivos alterados no diretório saem com sucesso
- **Determinismo do score:** provar equivalência score-splitted vs score-único
  (§10) antes da troca
- **Posteridade:** documentar que o job é derivado manualmente do template
  (G2 — ver nota abaixo)

### Aceite de B

1. prova de equivalência score-splitted vs score-único
2. ajuste do required check no GitHub (branch protection)

---

## Resumo de decisão

| Estratégia | Status | Objetivo |
|-----------|--------|----------|
| Rota B (Stryker direto + checker) | ✅ implementado | gate truthful + orquestração canônica |
| D | ✅ migrado | determinismo do score na mutação (segurança) |
| E | ✅ migrado | reduzir stage de mutação ~2x (margem) |
| A | ⛔ fallback | timeout 15→45 se necessário |
| B | 📋 plano futuro | split por diretório, limite duro de tempo |

---

## Nota G2 (ARCHITECTURE-CONTRACT)

O job `mutation` do `ci.yml` é **manual** (não gerado por
`setup/templates/github-ci.ts`), divergência pré-existente autorizada pelo
usuário (2026-08-02). O template gera apenas `qa-tools` + `post-process`; os
jobs `quality`, `test` e `mutation` deste repositório são derivados
manualmente. Mudanças de CI neste projeto seguem essa prática documentada.

---

## Registro de execução

- **2026-08-02:** diagnóstico (timeout = cancelador, não falha de código).
  Implementado D (`vitest.config.ts`), E (`concurrency: 4`). Documentados A e B.
- **2026-08-02 (Rota B):** correção do claim falso de `STRYKER_ACTIVE`
  (chave `env` era descartada). Migração para Stryker direto com
  typescript-checker. Config canônica `stryker.conf.json`, `scripts/mutation-scope.ts`,
  job de CI reescrito, remoção do tautest. Verificado localmente:
  checker ativo, CompileError classificado, dry-run 6784 testes ok.
- **2026-08-02 (Rota B, pós-refactor):** `mutation-scope.ts` corrigido para 0
  erros/warnings ESLint (threshold `lint-errors` = 0) — regex seguro,
  `GIT_BIN` absoluto, `cause` em re-throws, complexidade < 15, guard de
  importação para testabilidade. Adicionado
  `scripts/__tests__/mutation-scope.test.ts` (13 testes, fixture derivada de
  `git diff --unified=0` real). Correção do claim "suite completa por mutante"
  (era subset por cobertura — `perTest`). Nota per-mutant validada com evidência
  (`Ran 27.60 tests per mutant on average` no run `shared/date-utils.ts`).
- **Verificação pós-implantação (CI):** aguardando run do mutation no PR para
  confirmar score ≥60% dentro de 15 min com o checker ativo.
