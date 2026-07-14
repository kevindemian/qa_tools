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

## Plano Consolidado (2026-07-14) — Isolate-first + AST-fallback

**Decisão 11.1 (pesquisa de viabilidade):** Avaliação adversarial concluiu que a abordagem
recomendada anteriormente (híbrido expandido + stripping de comentários por regex, **sem AST**)
é **inferior** sob as métricas Superioridade Técnica ∩ Segurança:

- **Execução no host** (`vm`/`import()` dinâmico do config) = **RCE real** → rejeitada.
  O Node `vm` **não é** limite de segurança (escape via `this.constructor` → `Function`).
- **Regex + stripping de comentários** = falso-positivo em string-literal que contém `/*`,
  não resolve identificadores dinâmicos, e não cobre `jest+JUnit` declarado em
  `package.json["jest"]` → rejeitada (o falso-positivo é risco de segurança downstream no wizard/ci-injector).
- **AST (ts-morph)** = segurança **incondicional** (não executa), precisão alta-porém-limitada.
- **Isolate WASM (QuickJS, zero host bindings)** = precisão **máxima** + segurança **condicional**
  ao wiring correto; é o teto sob as métricas.

**Arquitetura adotada:** `executeConfigInIsolate` (QuickJS-WASM, zero host) → em qualquer
falha, `extractReportersAst` (ts-morph/typescript). AST é a rede de segurança incondicional.

### Princípios de segurança (não negociáveis)

- Zero host bindings no isolate: sem `process`, `require`, `import`, `fs`, `child_process`, `fetch`, `globalThis` com acesso a host.
- Só dado **serializável** cruza a fronteira (isolate devolve JSON de `reporters`).
- Módulos de framework stubados como **identidade** (`defineConfig = (x)=>x`).
- Fallback AST é salvaguarda estrutural (não executa nada).

### Fase A — I/O determinístico e seguro

- Remover `process.cwd()` defaulting interno (`detector.ts:85/:129/:151`); API exige `projectRoot`/`packageJsonPath` explícitos.
- Migrar `fs.readFileSync`/`existsSync` → `fs.promises` (async; varredura paralela de monorepo).
- `MAX_CONFIG_BYTES = 1 MiB`: arquivo maior → "unreadable" (skip), sem DoS.
- Contenção de symlink: `fs.realpath` do arquivo resolvido e checar que está sob `projectRoot`; rejeitar escape.

### Fase B — Análise estruturada de package.json

- `detectFromPkg`: framework por `dependencies`/`devDependencies` + **detecção de pacote de reporter** (CTRF/JUnit/Mochawesome) em deps.
- **+** blocos inline: `pkg.jest?.reporters`, `pkg.vitest?.test?.reporters`.

### Fase C — Executor Isolate (QuickJS-WASM)

`executeConfigInIsolate(path, content)`:

1. Transpile (`.ts`/`.mts`/`.cts`) via `ts.transpileModule` (pacote `typescript` já presente) → JS; `.js`/`.mjs`/`.cjs` direto; `.json` via `JSON.parse`.
2. Runtime QuickJS com **globais vazias**; injetar `module`/`exports` sandboxed + stubs de `vitest/config`, `vite`, `@playwright/test`, `jest`, `@jest/*`, `cypress` como identidade; `process.env` congelado `{}`, `__dirname`/`__filename`/`import.meta` fake.
3. Avaliar; capturar default export / `module.exports`.
4. Dentro do isolate, extrair `reporters` (`config.test?.reporters` | `config.reporters` | jest `config.reporters`) → `JSON.stringify` → string.
5. **Timeout duro** (~500ms, `Promise.race`/interrupt) → em throw/timeout/unsupported → sinaliza fallback AST.
6. Host `JSON.parse` → nomes.

### Fase D — Fallback AST (ts-morph / typescript API)

`extractReportersAst(path/content)`: ts-morph cria source file; traversa `reporters` (array literal) e **resolve identificadores** via import/require no mesmo arquivo → nomes. Usado quando isolate falha ou para `.json`/formatos não suportados.

### Fase E — Reporter Registry + Orquestração

- `REPORTER_REGISTRY: Record<string, {framework, format}>` (ex.: `ctrf`, `@d2t/vitest-ctrf*`, `vitest-ctrf*`, `junit`, `@d2t/vitest-junit`, `jest-junit`, `mochawesome`). Substitui `REPORTER_PATTERNS`.
- `detectTestReporter(projectRoot)` varre **vitest/vite/jest/cypress/playwright** × extensões + bloco inline em package.json; isolate → reporters, senão AST → reporters; casa contra `REPORTER_REGISTRY`.
- `detectFramework` roteia **todos** os frameworks por `detectTestReporter`. `testReportSource`: `config-file` se achou; senão `cli-flag`/`missing`.

### Fase F — Testes (inclui segurança)

- Isolate path: cada framework × formato; import/require dinâmico resolvido.
- AST fallback path: mesmos cenários.
- Negativos: reporter em comment/string → sem falso positivo (ambos modos).
- **Segurança:** config malicioso (`process.exit`, `fs.readFileSync('/etc/passwd')`, `require('child_process').exec`) **não escapa**; symlink fora de `projectRoot` rejeitado; arquivo > 1 MiB skip; **determinismo de cwd** (chamadas com caminhos explícitos em paralelo corretas).
- Integração: wizard → CI escrita com reporter correto.
- Checkpoints: `npx tsc --noEmit` = 0; `npx vitest run setup/` = 0 falhas.

### Fase G — Documentação

- Registrar decisão 11.1 no plano (acima) e flipar STATUS `⏳ PENDENTE` → `✅` + checkpoint de reconciliação.

### Dependências a adicionar

- `quickjs-emscripten` (isolate WASM) — **novo**.
- `ts-morph` (AST fallback) — **novo**.
- `typescript` — **já presente** (transpile TS→JS; sem `esbuild`).

### Limitações residuais (documentadas)

- Configs que registram reporter **só via plugin/hook de runtime** (não no array `reporters` estático) não são detectados por nenhum modo (exigiria carregar o plugin = mais superfície). Aceitável e documentado.
- Segurança do isolate é **condicional** ao correto wiring de zero-host-bindings; se o lib/wiring falhar → RCE. Mitigado por: só dado serializável cruza, sem módulos host, timeout, fallback AST.

<!-- CHECKPOINT: Plano Consolidado registrado (2026-07-14) — Isolate-first + AST-fallback -->
