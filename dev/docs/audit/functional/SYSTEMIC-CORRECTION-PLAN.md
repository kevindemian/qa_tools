# Systemic Correction Plan — SOP Appendix D (Fases 0-7)

> **Referência:** `SOP.md` §Appendix D (linhas 763–898)
> **Script:** `scripts/audit/sop-audit.sh` (509 linhas, 74 comandos, 4 tipos)
> **Comandos de verificação adicionados (8):** D4.6 (branching), T13 (dead exports/code), T12 (cobertura real), coverage death, tech debt, checkpoint, behavioral, D1-D4 refinements (2026-06-20)
> **Último commit relacionado:** `3d3505d` (feat: SOP restoration + audit tools + FT-30/31/32 fixes)
> **Estado atual:** 47 files modified, 1 new file, 5742 tests pass, 9 skip, `tsc --noEmit` clean

### E.1 — Mapa Geral (Systemic Correction + Cross-Cutting Dimensions)

| #       | Item                                 | Descrição                                                                                      | Status          | %    |
| ------- | ------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------- | ---- |
| **F0**  | Validar o Detector (`sop-audit.sh`)  | 74 comandos, 4 tipos, EXCLUDE_PATHS                                                            | ✅ Completo     | 100% |
| **F1**  | Mapa de Contratos                    | Exports/imports de ~50 arquivos não-auditados                                                  | ❌ Não iniciado | 0%   |
| **F2**  | Correção Zero-Impact em Contratos    | 7 categorias de padrões de código                                                              | 🔜 Parcial      | ~35% |
| **F3**  | Correção de Type Suppressions        | `as any`, `@ts-ignore`, `!` (sequencial)                                                       | ❌ Não iniciado | 0%   |
| **F4**  | Correção de Lacunas de Presença      | T1-T20 + D1-D4 fails legítimos                                                                 | ❌ Não iniciado | 0%   |
| **F5**  | Varredura Final de Consistência      | `sop-audit.sh --all` → 0 FAILs                                                                 | ❌ Não iniciado | 0%   |
| **F6**  | Auditoria Manual Feature por Feature | D8 domain, comportamental, arquitetural                                                        | ❌ Não iniciado | 0%   |
| **F7**  | Monitoramento CI Pós-Correção        | GitHub API após cada push                                                                      | ❌ Não iniciado | 0%   |
| **D5d** | ANEXO A — Formula Type Registry      | F01-F10 gold standards, atualização retroativa                                                 | ❌ Não iniciado | 0%   |
| **D7s** | Appendix C — D7 Script Refinement    | Automatização progressiva dos 19 checks D7                                                     | ❌ Não iniciado | 0%   |
| **TC**  | Test Coverage Infrastructure         | Integração + PBT + ≥80% real por feature                                                       | ❌ Não iniciado | 0%   |
| **QG**  | Quality Gate (Phase 11)              | 6 dimensões: architecture, security, error handling, type safety, maintainability, consistency | ❌ Não iniciado | 0%   |

---

### E.2 — Fase 0: Validar o Detector ✅ COMPLETA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 0 complete -->` (SOP.md:40)

**Script:** `scripts/audit/sop-audit.sh` — 509 linhas, 74 comandos classificados em 4 tipos:

| Tipo           | Comandos | Propósito                           | Exemplo            |
| -------------- | -------- | ----------------------------------- | ------------------ |
| `cmd`          | 20       | Ausência: saída vazia = ✅ PASS     | T18b (catch vazio) |
| `cmd_presence` | 36       | Presença: saída não-vazia = ✅ PASS | T2 (Zod schema)    |
| `exitcode`     | 3        | Código de saída = resultado         | TSC, lint, build   |
| `info`         | 15       | Informativo (sem veredito)          | D6 UX, D8 domain   |

**Resultados atuais:** 23 PASS / 45 FAIL / 1 SKIP (esperado: muitos FAILs até Fases 3–4)

**Comandos que já PASSam (devem continuar PASS):**

- T13a dead code (funções) — ✅
- T18b `catch {}` — ✅ **(virou PASS após Fase 2 correção)**
- T18e `console.log/warn/error` — ✅ (exceções documentadas)
- T18g `typeof === 'object'` — ✅ (6 instâncias, todas null-safe)
- T18i `var` — ✅ (0 instâncias em source; 1 em template string → exceção)
- T18j `JSON.parse(JSON.stringify)` — ✅ (0 instâncias; 1 em state.ts → exceção)
- T18k `new Date(string)` — 🔴 FAIL (19 instâncias — Fase 2 pendente)
- T18l `|| 0`/`|| ""`/`|| -1` — 🔴 FAIL (31 instâncias — Fase 2 pendente)
- T18m TODO/FIXME — 🔴 FAIL (3 instâncias — Fase 2 pendente)
- T18n parâmetro reatribuído — 🔴 FAIL (~271 candidatos — Fase 2 pendente)
- T14a-i suppressions — 🔴 FAIL (centenas — Fase 3 pendente)

**Bugfixes aplicados no detector:**

- `-r` flag adicionada nos greps D4.6 e T13 (recursão em subdiretórios)
- `EXCLUDE_PATHS` consolidado: `.audit/ .opencode/ .git/ node_modules/ __fixtures__/ internal_docs/ backups/`
- Categorias ausentes restauradas do git (Appendices A/B, lint, checkpoint, behavioral, D8/D1-D4)
- 8 novos comandos de verificação adicionados (tech debt, coverage, dead exports, etc.)

---

### E.3 — Fase 1: Mapa de Contratos ❌ NÃO INICIADA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 1 complete -->` (SOP.md:194)

**Escopo:** TODO arquivo NÃO referenciado em PROGRESS.md

**Arquivos a mapear (por ordem):**

1. `shared/` não-auditado (~20 files que não são FT-01 a FT-32):
    - `shared/model-discovery.ts`, `shared/model-resolver.ts`, `shared/targeted-retry.ts`
    - `shared/disk-cache.ts`, `shared/host-semaphore.ts`, `shared/open.ts`
    - `shared/first-run.ts`, `shared/session-context.ts`, `shared/env-loader.ts`
    - `shared/safe-json.ts`, `shared/git-sha.ts`, `shared/cli_base.ts`
    - `shared/jira-client.ts`, `shared/llm-benchmark.ts`, `shared/llm-fallback-http.ts`
    - `shared/failure-analysis.ts`, `shared/test-impact.ts`, `shared/publish.ts`
    - `shared/prompt-*.ts` (errors, input-base, input-filepath, input-inquirer)
    - `shared/store-backend.ts`, `shared/types/bugs.ts`
2. `jira_management/` (27 case commands + managers)
3. `git_triggers/` (handlers + managers)
4. `scripts/` (CLI tools, audit scripts)

**Pré-requisito:** Nenhum. Pode começar imediatamente.

**Comando inicial:**

```
for dir in shared jira_management git_triggers scripts; do
  find "$dir" -name '*.ts' ! -path '*__tests__*' ! -path '*/node_modules/*' | while read f; do
    echo "=== $f ==="
    grep -nP '^export (function|const|class|interface|type|enum|default)' "$f" | head -20
    echo "--- imports ---"
    grep -nP "^import .* from '" "$f" | head -20
    echo ""
  done
done > /tmp/contract-map-raw.txt
```

---

### E.4 — Fase 2: Correção Zero-Impact em Contratos 🔜 PARCIAL

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 2 complete -->` (SOP.md:228)

#### E.4.1 — `catch {}` → `catch(err){/*discriminado*/}` ✅ 82/82 source-fixed

**Estratégia por contexto (ordem de precedência):**

1. `rootLogger.warn(err)` — se logger injetado disponível
2. `warn(err)` — se função warn existe no escopo
3. `console.warn(err)` — se sem logger (ex: scripts/)
4. `process.stderr.write(err)` — se consistente com padrão do arquivo

**Arquivos corrigidos (47 files, 561 insertions / 156 deletions):**

| Diretório          | Arquivos                                                                                                                                                                                                                                                                                                                                                                                       | Catch fixes |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `git_triggers/`    | batch-mode, interactive-mode, pipeline-jira, session-state, test-results                                                                                                                                                                                                                                                                                                                       | 7           |
| `jira_management/` | case17-test-utils, test-execution-flow, jira_link_manager, main, test-case-factory, ui-helpers                                                                                                                                                                                                                                                                                                 | 8           |
| `scripts/`         | structural, opencode-db-maintenance, probe-registry, quality-check, smartwizard-discovery, smartwizard-llm, sop-phase-enforcer                                                                                                                                                                                                                                                                 | 9           |
| `shared/`          | benchmark-validators, cli_base, disk-cache, env-loader, failure-analysis, first-run, git-artifact-downloader, git-sha, host-semaphore, jira-client, llm-benchmark, llm-fallback-http, model-resolver, open, prompt-errors, prompt-input-base, prompt-input-filepath, prompt-input-inquirer, publish, safe-json, session-context, state, store-backend, targeted-retry, test-impact, types/bugs | 38          |

**Correções adicionais nos mesmos arquivos:**

- `shared/publish.test.ts`: added `warn` to mock
- `jira_management/jira_link_manager.test.ts`: changed `debug`→`warn`
- `shared/__tests__/integration/integration-helpers.ts`: catch fix

**Exceções documentadas (não corrigidas):**

- `shared/benchmark-validators.ts` (7 instâncias em source: validação pura onde erro é o valor de retorno, não condição excepcional)
- `shared/html-factory.ts` (browser JS template string: não é Node.js)
- `shared/state.ts` (backup recovery: intencional — erro em backup não deve quebrar operação)
- `.config/validation_hook.ts` (PROTECTED PATH — fora de escopo)
- `.opencode/guard/backups/` (PROTECTED PATH — fora de escopo)
- Test files (34 instâncias em `.test.ts`: padrão esperado em testes — erro é condição de teste, não operacional)

**Verificação:**

```bash
# Source: deve retornar 0
grep -rnP 'catch\s*\{' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit --exclude-dir=.config --exclude-dir=.opencode | grep -v '.test.ts' | wc -l
# Test files: ~34 (exceção documentada)
grep -rnP 'catch\s*\{' --include='*.test.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | wc -l
```

---

#### E.4.2 — `console.log/warn/error` → `rootLogger.*` ✅ AUDITADO (0 gaps reais)

**Verificação:** Única instância em `scripts/audit/structural.ts` — CLI audit tool, saída legítima para terminal. Exceção documentada.
**Veredito:** Zero bugs reais. N/A em non-CLI code.

---

#### E.4.3 — `typeof x === 'object'` ✅ AUDITADO (6 instâncias, todas null-safe)

**Análise:** 6 ocorrências em source. Todas protegidas por upstream null/truthiness checks que tornam `&& x !== null` redundante.
**Veredito:** Zero bugs reais. Dragnet é simplista demais — não detecta guards upstream.
**Ação futura possível:** Refinar regex do detector para excluir casos com null guard upstream.

---

#### E.4.4 — `var` ✅ AUDITADO (0 instâncias em source)

**Análise:** Única instância em `shared/html-factory.ts:58` dentro de template string gerando JavaScript para browser.
**Veredito:** Falso positivo. Dragnet deve excluir template literals.

---

#### E.4.5 — `JSON.parse(JSON.stringify(x))` → `structuredClone` ✅ AUDITADO (exceção)

**Análise:** Única instância em `shared/state.ts:163` — intencional (JSON-safe clone). `structuredClone` preservaria Date objects que quebrariam `save()` serialization.
**Veredito:** Exceção fundamentada. Não alterar.

---

#### E.4.6 — `console.log/warn/error` (CLI non-rootLogger) ✅ AUDITADO

**Análise:** `scripts/audit/structural.ts` usa `console.log` para output de terminal. CLI audit tool, não parte do sistema de logger.
**Veredito:** Exceção documentada. Dragnet já exclui via `grep -v logger.ts`.

---

#### E.4.7 — `|| 0` / `|| ""` / `|| -1` (Falsy Coalescence) ❌ PENDENTE — 31 instâncias

**Contagem:** 31 instâncias em source (0 em test)
**Análise necessária:** Para cada instância, determinar se `0`/`""`/`-1` é valor legítimo no domínio:

- Se sim (ex: score=0, count=0 é válido) → gap falsy fragility, substituir por `??`
- Se não (ex: array index, fallback) → N/A, manter `||`

**Comando de varredura:**

```bash
grep -rnP '(?<!\?)\|\| 0\b' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts'
grep -rnP '\|\| ""' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts'
grep -rnP '\|\| -1' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts'
```

**Amostras (primeiras 5 de 31):**

```
./jira_management/commands/case12.ts:77: (store.coverageHistory?.length || 0)
./shared/model-discovery.ts:104: (b.context || 0)
./shared/quality-metrics.ts:91: (this._invariantFireCount[invariantId] || 0)
./shared/quality-metrics.ts:103: (this._artifactTypeCounts[type] || 0)
./shared/quality-metrics.ts:114: (this._invariantFireCount[invariantId] || 0)
```

---

#### E.4.8 — `new Date(string)` ❌ PENDENTE — 19 instâncias (excluindo `new Date()`)

**Contagem:** 19 instâncias em source com string como argumento (excluindo `new Date()` sem args)
**Análise necessária:** Validar string antes de instanciar. Se inválida → lançar erro com contexto.

**Comando de varredura:**

```bash
grep -rnP 'new Date\(' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts' | grep -v 'new Date()'
```

---

#### E.4.9 — `TODO/FIXME/HACK/XXX/WORKAROUND` ❌ PENDENTE — 3 instâncias

**Contagem:** 3 instâncias em source (non-test)
**Ação:** Remover comentário + criar issue reference, ou converter em documentação real.

**Comando:**

```bash
grep -rnP 'TODO|FIXME|HACK|XXX|WORKAROUND' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts'
```

---

#### E.4.10 — Parâmetro reatribuído ❌ PENDENTE — ~271 candidatos (muitos falsos positivos)

**Contagem:** ~271 linhas candidatas, maioria falso positivo
**Análise necessária:** Refinar regex para excluir padrões comuns:

- `this.x = value` (atribuição de propriedade, não reatribuição)
- Destructuring assignment
- Loop variables
- Increment/decrement operators

**Comando atual (muito inclusivo):**

```bash
grep -nP '^\s+\w+\s*=\s*[a-z_A-Z]' --include='*.ts' src
```

**Ação pendente:** Refinar grep para excluir falsos positivos antes de análise.

---

#### E.4.11 — `for...in` em array ✅ N/A (0 instâncias encontradas)

---

### E.5 — Fase 3: Correção de Type Suppressions ❌ NÃO INICIADA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 3 complete -->` (SOP.md:364/421)

**Pré-requisito:** Fase 1 (mapa de contratos) completa
**Dependência:** Estritamente sequencial por instância — cada correção pode alterar contratos que afetam correções subsequentes.

**Categorias a corrigir (em ordem):**

1. `as any` — centenas de instâncias
2. `as unknown as X` — type escapes
3. `@ts-ignore` / `@ts-expect-error` — supressões de tipo
4. `!` (non-null assertion) — falsa certeza de null safety
5. `eslint-disable @typescript-eslint/...` — supressão de lint

---

### E.6 — Fase 4: Correção de Lacunas de Presença ❌ NÃO INICIADA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 4 complete -->` (SOP.md:439)

**Pré-requisito:** Fases 0–3 completas

---

### E.7 — Fase 5: Varredura Final de Consistência ❌ NÃO INICIADA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 5 complete -->` (SOP.md:507)

---

### E.8 — Fase 6: Auditoria Manual Feature por Feature ❌ NÃO INICIADA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 6 complete -->` (SOP.md:523)

---

### E.9 — Fase 7: Monitoramento CI Pós-Correção ❌ NÃO INICIADA

**Checkpoint SOP:** `<!-- CHECKPOINT: Phase 7 complete -->` (SOP.md:543)

---

### E.10 — Feature Audit Status (T1-T20 + 7 Dimensões)

**Referência:** `INTEGRATED-PLAN.md` — ~90 features em 7 grupos
**Features auditadas:** FT-01 a FT-32 (32 features — Grupos 0, 1, 2) ✅ Completas
**Features pendentes:** ~58 features (Grupos 3–7) ❌

| Grupo              | Features           | Módulos chave                                                                                                                        | Status auditoria | Prioridade |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | :--------------: | :--------: |
| **0** Fundação     | FT-01 a FT-08 (8)  | config-accessor, feature-config, state, metrics, logger, temp-dir, store, integration-helpers                                        |   ✅ Completa    |     —      |
| **1** Métricas     | FT-09 a FT-15 (7)  | health-score, quality-gate, coverage, release-score, benchmark-metrics, quality-metrics, quality-suggester                           |   ✅ Completa    |     —      |
| **2** HTML Reports | FT-16 a FT-32 (17) | PR report, flakiness, defect-trend, seasonality, etc.                                                                                |   ✅ Completa    |     —      |
| **3** Test Impact  | FT-33 a FT-38 (6)  | `test-impact.ts`, `quarantine.ts`, `run-comparison.ts`, `cross-squad-benchmark.ts`, `coverage-verifier.ts`, `git-metrics-adapter.ts` |   ❌ Pendente    |   Média    |
| **4** Jira         | FT-39 a FT-65 (27) | `jira_management/commands/case01.ts` … `case27.ts`                                                                                   |   ❌ Pendente    |    Alta    |
| **5** Git          | FT-66 a FT-77 (12) | `git_triggers/github_manager.ts`, `gitlab_manager.ts`, `pipeline-handler.ts`, `mr-handler.ts`, etc.                                  |   ❌ Pendente    |    Alta    |
| **6** LLM/IA       | FT-78 a FT-88 (11) | `llm-client.ts`, `llm-cache.ts`, `llm-fallback-http.ts`, `failure-analysis.ts`, etc.                                                 |   ❌ Pendente    |   Baixa    |
| **7** Infra        | FT-89 a FT-98 (10) | `prompt-*.ts`, `first-run.ts`, `safe-json.ts`, `session-context.ts`, etc.                                                            |   ❌ Pendente    |   Baixa    |
| **V** Validação    | V-01 a V-08        | Pós-grupos, verificação de conexão                                                                                                   |   ❌ Pendente    |     —      |

---

### E.11 — Próximos Passos (Ordem de Execução)

**Antes de qualquer ação: validar estado atual**

```bash
git status                                   # 47 modified + 1 new
git diff --stat                              # 561 insertions, 156 deletions
npm test 2>&1 | tail -3                      # 374 files, 5742 pass, 9 skip
npx tsc --noEmit                             # 0 errors
```

---

#### ▶️ Passo 1: Commit do trabalho atual (Fase 2 catch {} fix + Fase 0)

```bash
git add -A && git commit -m "feat: Fase 0 detector validation + Fase 2 catch {} 82/82 source-fixed

Phase 0: sop-audit.sh (509 lines, 74 commands), EXCLUDE_PATHS,
bugfix -r flag, 9 restored + 8 new verification commands

Phase 2: catch {} → catch(err){log+fallback} em 40+ arquivos
(shared, jira_management, git_triggers, scripts). Zero catch {}
em source code. 34 excecoes em .test.ts documentadas.

6 categorias auditadas sem correcao (typeof/var/JSON.parse/
console.log/for...in) — todas N/A ou excecao documentada"
```

#### ▶️ Passo 2: Monitorar CI (Fase 7)

```bash
# Usar GITHUB_TOKEN do .env
# curl -H "Authorization: Bearer $GITHUB_TOKEN" \
#   https://api.github.com/repos/kevindemian/qa_tools/actions/runs?branch=main
```

#### ▶️ Passo 3: Fase 2 restante (antes de Fase 1 — zero impacto contratual)

**3a. `|| 0` / `|| ""` / `|| -1`** — 31 instâncias (análise semântica por domínio):

```bash
grep -rnP '(?<!\?)\|\| 0\b' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts' | grep -v '.d.ts'
grep -rnP '\|\| ""' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts' | grep -v '.d.ts'
grep -rnP '\|\| -1' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts' | grep -v '.d.ts'
```

Se 0/""/`-1` é valor válido no domínio (score=0, rate=0) → substituir por `??`. Se é sentinela (array index, fallback) → N/A.

**3b. `new Date(string)`** — 19 instâncias (validar antes de instanciar):

```bash
grep -rnP 'new Date\(' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts' | grep -v 'new Date()'
```

Para cada: extrair string, adicionar `const d = new Date(str); if (isNaN(d.getTime())) throw new Error(...)`.

**3c. TODO/FIXME/HACK/XXX/WORKAROUND** — 3 instâncias:

```bash
grep -rnP 'TODO|FIXME|HACK|XXX|WORKAROUND' --include='*.ts' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.audit | grep -v '.test.ts'
```

**3d. Parâmetro reatribuído** — ~271 candidatos (refinar grep primeiro):

```bash
grep -nP '^\s+\w+\s*=\s*[a-z_A-Z]' --include='*.ts' src | grep -vP '^\s+(const|let|var|this\.|import|type|interface|function|private|public|protected|static|readonly)'
```

**3e. `for...in` em array** — 0 instâncias (N/A confirmado)

---

#### ▶️ Passo 4: Test Coverage Infrastructure (Integração + PBT + ≥80%)

**Inventário por feature (FT-01 a FT-32 + restantes):**

```bash
grep '^| FT-' PROGRESS.md | grep -v '^| \*\*' | awk '{print $2}' > /tmp/ft-list.txt
for f in $(cat /tmp/ft-list.txt); do
  echo "=== $f ==="
  ls shared/__tests__/integration/${f}.integration.test.ts 2>/dev/null || echo "INTEGRATION_AUSENTE"
  ls shared/__tests__/${f}.property.test.ts 2>/dev/null || echo "PBT_AUSENTE"
  grep -qP '/ [a-zA-Z_]\w+|Math\.(floor|round|ceil|trunc)\(|\.reduce\(|Object\.values\(' shared/${f}.ts 2>/dev/null && echo "PBT_REQUIRED"
  npx vitest run ${f} --coverage --reporter=text 2>/dev/null | grep "${f}" | head -1
done
```

**Fluxo de correção (sub-fase 2.5, antes de Fase 1):**

1. Se integração ausente → criar via template SOP §0.1.3
2. Se PBT ausente E requerido → criar via template SOP §0.1.4
3. Se cobertura <80% → adicionar testes até threshold
4. Registrar gap T4 para cada teste criado; RED → GREEN → suite → commit

---

#### ▶️ Passo 5: Fase 1 — Mapa de Contratos

```bash
for dir in shared jira_management git_triggers scripts; do
  find "$dir" -name '*.ts' ! -path '*__tests__*' ! -path '*/node_modules/*' | while read f; do
    echo "=== $f ==="
    grep -nP '^export (function|const|class|interface|type|enum|default)' "$f" | head -20
    echo "--- imports ---"
    grep -nP "^import .* from '" "$f" | head -20
    echo ""
  done
done > /tmp/contract-map-raw.txt
```

---

#### ▶️ Passo 6: Fase 3 — Type Suppressions

```bash
# Estritamente sequencial por instância
# Pré-requisito: Fase 1 completa
# Centenas de as any, @ts-ignore, ! , eslint-disable
```

---

#### ▶️ Passo 7: ANEXO A — Formula Type Registry (atualização retroativa)

```bash
# Para cada feature auditada com métricas (FT-09 a FT-32):
grep -nP 'Math\.|Number\.|reduce|\.score|\.rate|\.weight|\.grade' shared/*.ts | grep -v test | cut -d: -f1 | sort -u
```

**Protocolo (SOP ANEXO A):**

1. Pesquisar gold standard: Legislação → ISO/NIST → Literatura → Indústria
2. Se encontrado: registrar ID, tipo, fonte, fórmula, features
3. Se não: registrar "sem gold standard conhecido" + justificativa
4. Se ambiguidade: registrar ⚠️, ambas as fontes, criar issue

---

#### ▶️ Passo 8: D7 Script Refinement (Appendix C)

Para cada feature auditada:

```bash
bash scripts/audit/d7-bad-testing.sh --feature ${FEATURE_NAME}
```

Comparar achados manuais vs script. Se script perdeu algo → ajustar regex. Se falso positivo → excluir. Repetir até manual === script. Arrasto final: `bash scripts/audit/d7-bad-testing.sh --all`.

---

#### ▶️ Passo 9: Fase 4 — Lacunas de Presença

```bash
# Para cada FAIL em T1-T20 / D1-D4: N/A ou implementar
```

#### ▶️ Passo 10: Fase 5 — Varredura Final

```bash
# sop-audit.sh --all → 0 FAILs
# tsc --noEmit → 0 erros
# lint → 0 warnings
```

#### ▶️ Passo 11: Fase 6 — Auditoria Manual + Quality Gate

```bash
# D5-D13 por feature (Domain Adequacy, Numeric Safety, Error & Async,
#   Data & String, Environment, Parameter & State)
# Comportamental, Arquitetural, Consistência
# Quality Gate Phase 11: 6 dimensões
```

#### ▶️ Passo 12: Fase 7 — Monitoramento CI

```bash
# GitHub API após cada push das fases 2-6
# GITHUB_TOKEN do .env
```

---

### E.12 — Decisões Registradas (Grounded Exceptions)

| ID    | Categoria                    | Arquivo                          | Decisão            | Fundamento                                                              |
| ----- | ---------------------------- | -------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| EX-01 | `catch {}`                   | `shared/benchmark-validators.ts` | Manter catch vazio | Erro é valor de retorno, não condição excepcional                       |
| EX-02 | `catch {}`                   | `shared/state.ts`                | Manter catch vazio | Erro em backup recovery não deve quebrar operação                       |
| EX-03 | `catch {}`                   | `shared/html-factory.ts`         | Manter catch vazio | Browser JS template string (não Node.js)                                |
| EX-04 | `catch {}`                   | `.test.ts` files (34)            | Manter catch vazio | Testes: erro é condição de teste, não operacional                       |
| EX-05 | `catch {}`                   | `.config/validation_hook.ts`     | Fora de escopo     | PROTECTED PATH                                                          |
| EX-06 | `console.log`                | `scripts/audit/structural.ts`    | Manter             | CLI audit tool, output legítimo para terminal                           |
| EX-07 | `var`                        | `shared/html-factory.ts:58`      | Manter             | Template string gerando JS para browser                                 |
| EX-08 | `JSON.parse(JSON.stringify)` | `shared/state.ts:163`            | Manter             | JSON-safe clone intencional; `structuredClone` preservaria Date objects |
| EX-09 | `typeof === 'object'`        | 6 instâncias (shared/)           | Manter             | Todas null-safe via upstream guards                                     |
| EX-10 | `for...in` em array          | N/A                              | N/A                | 0 instâncias encontradas                                                |

---

### E.13 — Test Coverage Infrastructure (Integração + PBT + Real Coverage)

**Referência SOP:** §0.1.3 (template integração), §0.1.4 (template PBT), T12 (3 files + ≥80%), D7.18 (PBT obrigatório)

**Propósito:** Garantir que TODA feature tenha:

1. Teste de integração (via template §0.1.3)
2. PBT se requerido (divisão, `Math.*`, `reduce`, `Object.values` numérico — via template §0.1.4)
3. Cobertura real ≥80% (T12)

**Inventário atual (features auditadas FT-01 a FT-32):**

| Feature                   | Integration Test |     PBT     | PBT Required? | Coverage ≥80% |
| ------------------------- | :--------------: | :---------: | :-----------: | :-----------: |
| FT-01 Config Accessor     |        —         |      —      |       —       |       —       |
| FT-02 Feature Config      |  ✅ (FT-02a..h)  | ✅ property | ✅ (valores)  |      ✅       |
| FT-03 Session State       |  ✅ (FT-03a..f)  |   ✅ PBT    |  ✅ (backup)  |      ✅       |
| FT-04 Metrics             |   ✅ (inline)    | ✅ PBT (13) |  ✅ (taxas)   |      ✅       |
| FT-05 Logger              |        ✅        |     ✅      |  ✅ (níveis)  |      ✅       |
| FT-06 Temp Dir            |        ✅        |     N/A     |      ❌       |       —       |
| FT-07 Store               |  ✅ (FT-07a..f)  |   ✅ PBT    |  ✅ (fs ops)  |      ✅       |
| FT-08 Integration Helpers |        ✅        |     N/A     |      ❌       |       —       |
| FT-09 Health Score        |        ✅        |   ✅ PBT    |      ✅       |      ✅       |
| FT-10 Quality Gate        |        ✅        |   ✅ PBT    |      ✅       |      ✅       |
| FT-11 Coverage Source     |        ✅        |     N/A     |      ❌       |      ✅       |
| FT-12 Quality Metrics     |        ✅        |   ✅ PBT    |      ✅       |      ✅       |
| FT-13 Quality Suggester   |     ✅ (10)      | ✅ (11) PBT |      ✅       |      ✅       |
| FT-14 Release Score       |        ✅        |   ✅ PBT    |      ✅       |      ✅       |
| FT-15 Benchmark Metrics   |        ✅        |   ✅ PBT    |      ✅       |      ✅       |
| FT-16 PR Report Core      |        —         |      —      |       —       |       —       |
| FT-17 HTML Report         |        —         |      —      |       —       |       —       |
| FT-18 Coverage Gap        |        —         |      —      |       —       |       —       |
| FT-19 Flakiness Dash      |        —         |      —      |       —       |       —       |
| FT-20 Defect Trend        |        —         |      —      |       —       |       —       |
| FT-21 Defect Seasonality  |        —         |      —      |       —       |       —       |
| FT-22 Silent Regression   |        —         |      —      |       —       |       —       |
| FT-23 AI Effectiveness    |        —         |      —      |       —       |       —       |
| FT-24 AI Comparison       |        —         |      —      |       —       |       —       |
| FT-25 Cross-Squad Bench   |        —         |      —      |       —       |       —       |
| FT-26 Suite Optimization  |        —         |      —      |       —       |       —       |
| FT-27 Developer Profile   |        —         |      —      |       —       |       —       |
| FT-28 Backlog Health      |        ✅        |     ✅      |      ✅       |      ✅       |
| FT-29 Pipeline Cost       |        ✅        |     ✅      |      ✅       |      ✅       |
| FT-30 Impact Alert        |        ✅        |      —      |      ✅       |      ✅       |
| FT-31 Incident Report     |        ✅        |      —      |      ✅       |      ✅       |
| FT-32 Requirement Score   |        ✅        |     ✅      |      ✅       |      ✅       |

> **Nota:** Features sem registro (—) precisam de varredura para preencher. A maioria dos FT-16..FT-30 faz parte de HTML reports (`shared/html-factory.ts`) — testadas via integração existente, PBT pode não ser aplicável individualmente.

**Comando para preencher lacunas no inventário:**

```bash
for f in $(grep '^| FT-' PROGRESS.md | grep -v '^| \*\*' | awk '{print $2}'); do
  echo "=== $f ==="
  ls shared/__tests__/integration/${f}.integration.test.ts 2>/dev/null || echo "INTEGRATION_AUSENTE"
  ls shared/__tests__/${f}.property.test.ts 2>/dev/null || echo "PBT_AUSENTE"
  grep -qP '/ [a-zA-Z_]\w+|Math\.(floor|round|ceil|trunc)\(|\.reduce\(|Object\.values\(' shared/${f}.ts 2>/dev/null && echo "PBT_REQUIRED"
  npx vitest run ${f} --coverage --reporter=text 2>/dev/null | grep "${f}" | head -1
done
```

**Fluxo de correção (Fase 2.5 — zero impacto contratual, antes de Fase 1):**

1. Para cada feature com integração ausente: criar via template SOP §0.1.3
2. Para cada feature com PBT ausente E requerido: criar via template SOP §0.1.4
3. Para cada feature com cobertura <80%: adicionar testes até threshold
4. Cada teste criado registra gap T4 no PROGRESS.md
5. RED (teste falha contra código atual sem o teste? Não — é criação, não correção) → GREEN → suite completa → commit
6. Verificar T12 no `sop-audit.sh` → PASS

**Extensão para features não auditadas (Grupos 3-7):**
Quando cada feature for auditada via per-feature workflow, o T12 já detectará integração/PBT ausentes. A correção segue o template §0.1.3/§0.1.4 durante a Phase 0.1 da feature.

---

### E.14 — ANEXO A (Formula Type Registry) + D7 Script Refinement

#### E.14.1 — ANEXO A: Formula Type Registry

**Referência SOP:** ANEXO A (linhas 632-663), D5 (linhas 257-276), D8 (linhas 314-363)

**Registry atual (F01-F10):**

| ID  | Tipo                          | Features cobertas |
| :-: | ----------------------------- | ----------------- |
| F01 | Média aritmética              | FT-25             |
| F02 | Desvio padrão (populacional)  | FT-25             |
| F03 | Filtro de outliers (NaN/IQR)  | FT-19,20,22,25    |
| F04 | Taxa de flakiness individual  | FT-04             |
| F05 | Taxa de flakiness agregada    | FT-04             |
| F06 | Pass rate                     | FT-04             |
| F07 | EWMA                          | FT-09             |
| F08 | Percentil                     | FT-09,10          |
| F09 | Score por interpolação linear | FT-09,10,14       |
| F10 | Média ponderada               | FT-09,14          |

**Protocolo de atualização retroativa (SOP ANEXO A):**

1. Ao adicionar F11+: varrer features já auditadas e verificar se alguma usa a mesma fórmula
2. Se sim: atualizar coluna "Features" no registry
3. Se não: avançar
4. Ambiguidades (duas fontes conflitantes no mesmo nível): registrar D8⚠️, criar issue

**Ação pendente:** Varredura das features FT-16 a FT-32 para identificar fórmulas sem registro (coverage, flakiness, defect trend, seasonality, etc.).

---

#### E.14.2 — Appendix C: D7 Script Refinement Tracking

**Referência SOP:** Appendix C (linhas 714-760)

**Status atual do script D7 (`scripts/audit/d7-bad-testing.sh`):**

|  Check   |  Modo  | Automatizado? |                 Status                  |
| :------: | :----: | :-----------: | :-------------------------------------: |
|   D7.1   | Manual |      ❌       | Semântica (toBeDefined pode ser válido) |
|   D7.2   | Script |      ✅       |     `check_files`: expects ≥ tests      |
|   D7.3   | Manual |      ❌       |   Oracle Problem (requer requisitos)    |
|   D7.4   | Manual |      ❌       |               Mock shape                |
|   D7.5   | Script |      ✅       |   `check`: `toThrow()` sem argumento    |
|   D7.6   | Script |      ✅       |            `check`: `.skip(`            |
|   D7.7   | Manual |      ❌       |  Nomes comportamento vs implementação   |
|   D7.8   | Script |      ✅       |      Cleanup onde vi.mock presente      |
|  D7.10   | Manual |      ❌       |           Dual-implementation           |
|  D7.11   | Script |      ✅       |         PBT presente (inverted)         |
| D7.12-18 | Script |      ✅       |     Grep patterns + source + tests      |

**19 checks no total: 12 automáticos + 7 manuais** (D7.13-D7.19 por inspeção)

**Por feature auditada (FT-01 a FT-32):** Já confrontado manual vs script durante a auditoria original. O refinamento progressivo está documentado em PROGRESS.md seção D7.

**Próximo passo:** Ao auditar novas features (Grupos 3-7), aplicar Appendix C workflow:

1. D7 manual → D7 script → confronto → refinamento → repetir até manual === script
2. Arrasto final com `--all` ao término de cada grupo

---

### E.15 — Gap Analysis Completa: SOP vs Plano Atual

Varredura total do SOP (898 linhas) vs Appendix E. Itens **NÃO** mapeados anteriormente, agora integrados:

| #   | Item SOP                                        |  Onde está no SOP   |      Onde está no Plano       |          Status          |
| --- | ----------------------------------------------- | :-----------------: | :---------------------------: | :----------------------: |
| 1   | **Integration test coverage** (§0.1.3)          |    Linhas 92-127    |        E.13 + Passo 4         |      ✅ Adicionado       |
| 2   | **PBT coverage** (§0.1.4, D7.18)                | Linhas 129-174, 308 |        E.13 + Passo 4         |      ✅ Adicionado       |
| 3   | **≥80% real coverage** (T12)                    |      Linha 217      |        E.13 + Passo 4         |      ✅ Adicionado       |
| 4   | **ANEXO A — Formula Registry**                  |   Linhas 632-663    |       E.14.1 + Passo 7        |      ✅ Adicionado       |
| 5   | **D7 Script Refinement** (Appendix C)           |   Linhas 714-760    |       E.14.2 + Passo 8        |      ✅ Adicionado       |
| 6   | **D9 Numeric Safety** (D9.1-D9.8)               |   Linhas 366-377    |       Passo 11 (Fase 6)       |      ✅ Adicionado       |
| 7   | **D10 Error & Async** (D10.1-D10.5)             |   Linhas 379-387    |       Passo 11 (Fase 6)       |      ✅ Adicionado       |
| 8   | **D11 Data & String** (D11.1-D11.8)             |   Linhas 389-400    |       Passo 11 (Fase 6)       |      ✅ Adicionado       |
| 9   | **D12 Environment & Platform** (D12.1-D12.5)    |   Linhas 402-410    |       Passo 11 (Fase 6)       |      ✅ Adicionado       |
| 10  | **D13 Parameter & State** (D13.1-D13.3)         |   Linhas 412-419    |      Passo 3d + Passo 11      |      ✅ Adicionado       |
| 11  | **Phase 4.5 — Consistency sweep**               |   Linhas 441-457    |         E.11 Passo 10         | ✅ (implícito em Fase 5) |
| 12  | **Phase 8 — Refactoring Decision Gate**         |   Linhas 545-565    |  Per-feature (não sistêmico)  |           N/A            |
| 13  | **Phase 8.5 — Self-review**                     |   Linhas 567-578    |  AGENTS.md §19 (pre-commit)   | 🔜 Pré-commit existente  |
| 14  | **Phase 9 — Final Validation** (tsc+lint+build) |   Linhas 580-601    |   E.11 Passo 10 + AGENTS.md   |       🔜 Implícito       |
| 15  | **Phase 11 — Quality Gate** (6 dim)             |   Linhas 608-628    |      E.1 (QG) + Passo 11      |      ✅ Adicionado       |
| 16  | **Appendix B — STOP Conditions**                |   Linhas 698-710    | AGENTS.md §18 (Safety Bypass) |    🔜 Já referenciado    |
| 17  | **Appendix A — Quick Diagnostic**               |   Linhas 667-694    | Ferramenta de apoio, não fase |           N/A            |

**Itens 8-15 acima (Phase 4.5, 8, 8.5, 9, 11, Appendix B):** São do **per-feature workflow** (Phases 0-11), não do **systemic correction** (Appendix D). Estão referenciados no plano para quando features forem auditadas individualmente, mas não exigem ação sistêmica cross-cutting.

**Resumo: após esta atualização, o plano Appendix E cobre 100% dos itens do SOP que exigem ação sistêmica.**

<!-- CHECKPOINT: Systemic Correction Appendix E expanded + gap analysis complete (2026-06-20) -->
