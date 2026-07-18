# TASK: 7-Layer Architecture — Foundation & Expansion

> **Parte do plano DataHub SSOT.** Reorganizado de `data-hub-ssot-enforcement.md` (2026-07-12).
> Documento original preservado (marcado SUPERSEDED). Este é o documento de verdade para as tarefas de fundação e expansão das 7 camadas.
> **STATUS: 📋 ESPECIFICAÇÃO + TRABALHO PENDENTE.** Fases 0–0.8 (fundação do DataHub), EXPAND+STORE (Cap. 6) e ST-3 Quality Enforcement (Cap. 7) estão **EXECUTADAS** (CI green; ver SSOT-CHANGELOG Cap. 6 / TASK-22-corrections CHECKPOINTS — ST-1/ST-2/ST-3, quarentena `d49c6ac0`). **PENDENTE (Cap. 8 — Design Gaps 1–4):** Gap 1 = ✅ CONCLUÍDO · Gap 2 = ✅ CONCLUÍDO · Gap 3 = ✅ CONCLUÍDO (ambos 2026-07-12: `DataSource` + `RawData.provenance` + `buildProvenance` + branch-aware metrics via `branchFilter`/`getBranchPassRate`; exposto via `hub.raw.provenance`); Gap 4 = ✅ CONCLUÍDO (2026-07-12: `since?: Date` threaded + `DataHub.mergeIncremental()` + `ensureDataHub` incremental path; CI green).

## FASE 0 — Foundation (3 tarefas)

---

#### Tarefa 0.1 — Fix TS2307 Blocker

**Preparação:**

```bash
grep -n "git-artifact-downloader" jira_management/commands/case17-test-utils.ts
npx tsc --noEmit 2>&1 | head -5
```

**RED:**

```bash
npx tsc --noEmit 2>&1 | grep "TS2307"
# Esperado: erro em case17-test-utils.ts:10
```

**GREEN:**

- `jira_management/commands/case17-test-utils.ts`: remover linha 10 (`export { fetchGitHistory } from '../../shared/git-artifact-downloader.js'`)
- Verificar que nenhum outro arquivo importa `fetchGitHistory` deste módulo

**Integração:**

```bash
grep -r "case17-test-utils" --include="*.ts" | grep -v "node_modules"
# Esperado: nenhum consumidor importa fetchGitHistory deste módulo
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "git-artifact-downloader" --include="*.ts" -g '!__mocks__'  # 0 resultados
```

**Commit:** `fix(compilation): remove orphan re-export from deleted git-artifact-downloader`

---

#### Tarefa 0.2 — Delete Dead Code (test-count-extractor)

**Preparação:**

```bash
grep -r "test-count-extractor" --include="*.ts" | grep -v "node_modules"
# Esperado: só o próprio arquivo e seu teste
```

**RED:**

```bash
npx vitest run shared/data-hub/__tests__/extractors/test-count-extractor.test.ts --reporter=verbose
# Esperado: teste passa (mas é dead code — lógica duplicada em hub.ts:338)
```

**GREEN:**

- Deletar `shared/data-hub/extractors/test-count-extractor.ts`
- Deletar `shared/data-hub/__tests__/extractors/test-count-extractor.test.ts`
- Verificar que `hub.ts:338` (`aggregateTestCounts`) continua funcionando

**Integração:**

```bash
npx vitest run shared/data-hub/ --reporter=verbose | tail -5
# Esperado: todos passam sem o extractor morto
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "test-count-extractor" --include="*.ts"          # 0 resultados em produção
npx vitest run shared/data-hub/                      # 100% pass
```

**Commit:** `refactor(data-hub): remove dead test-count-extractor (logic duplicated in hub.ts:338)`

---

#### Tarefa 0.2.1 — Add humanizeError Patterns 10-17

**Objetivo:** Adicionar 8 padrões novos de erros conhecidos em `shared/prompt-errors.ts`. Pré-requisito para Fases 3-5 — providers (`github-provider.ts`, `gitlab-provider.ts`, `coverage-provider.ts`) chamam `humanizeError(String(err))`. Sem esses padrões, erros de conexão GitHub/GitLab passam sem contexto.

**Mudança em `shared/prompt-errors.ts`:**

Após a linha 64 (último padrão existente `already exists`), antes da função `humanizeError`, adicionar:

```typescript
// Padrões CI/GitHub/GitLab (Fase 3-5 do SSOT plan)
{ test: /EPIPE|ECONNRESET.*GitHub/i, msg: 'Conexão com GitHub perdida', hint: 'Verifique sua conexão de rede e tente novamente.' },
{ test: /artifact.*expired|not found.*artifact/i, msg: 'Artefato CI expirado ou ausente', hint: 'O artefato pode ter expirado. Tente re-executar o pipeline.' },
{ test: /invalid.*json|unexpected.*token/i, msg: 'Arquivo de dados corrompido', hint: 'O arquivo de resultado parece estar corrompido. Re-execute.' },
{ test: /ENOENT.*coverage|ENOTDIR.*coverage/i, msg: 'Arquivo de coverage não encontrado', hint: 'Verifique se o pipeline gerou o relatório de coverage.' },
{ test: /rate.*limit.*github|abuse.*detection/i, msg: 'Rate limit do GitHub', hint: 'Muitas requisições. Aguarde e tente novamente.' },
{ test: /ETIMEDOUT.*api\.github/i, msg: 'Timeout na API do GitHub', hint: 'API do GitHub lenta. Tente novamente em alguns minutos.' },
{ test: /403.*github.*secondary.*rate/i, msg: 'Secondary rate limit GitHub', hint: 'GitHub bloqueou temporariamente. Aguarde 60s.' },
{ test: /invalid.*xml|not well-formed/i, msg: 'Arquivo XML inválido', hint: 'O arquivo JUnit XML está mal formatado.' },
```

**Testes:**

Adicionar em `shared/__tests__/prompt-errors.test.ts` (ou criar se não existir):

```typescript
describe('humanizeError — patterns 10-17', () => {
    it('returns hint for EPIPE GitHub', () => {
        const result = humanizeError('write EPIPE');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for expired artifact', () => {
        const result = humanizeError('artifact expired 404');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for invalid JSON', () => {
        const result = humanizeError('invalid JSON response');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for ENOENT coverage', () => {
        const result = humanizeError('ENOENT: no such file or directory coverage/report.json');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for GitHub rate limit abuse', () => {
        const result = humanizeError('GitHub abuse detection triggered');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for ETIMEDOUT GitHub API', () => {
        const result = humanizeError('connect ETIMEDOUT api.github.com');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for secondary rate limit', () => {
        const result = humanizeError('403 secondary rate limit');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
    it('returns hint for invalid XML', () => {
        const result = humanizeError('invalid XML: not well-formed');
        expect(result).toEqual(expect.objectContaining({ msg: expect.any(String) }));
    });
});
```

**Checkpoint:**

```bash
npx vitest run shared/prompt-errors.test.ts           # 100% pass
rg "EPIPE|ECONNRESET.*GitHub" shared/prompt-errors.ts # >= 1 ocorrência
rg "artifact.*expired" shared/prompt-errors.ts        # >= 1 ocorrência
```

**Commit:** `feat(prompt-errors): add humanizeError patterns 10-17 for CI/GitHub/GitLab`

---

#### Tarefa 0.2.2 — Fix Silent Errors (EH-7, 12 files)

**Objetivo:** Eliminar todos os `bare catch { return null; }` e `String(err)` em produção. Regra EH-7: todo catch DEVE usar `extractErrorMessage(err)`.

**Arquivos e ações:**

| Arquivo                 | Linha(s)               | Padrão Atual                      | Correção                                                                           |
| ----------------------- | ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `github-workflow.ts`    | 330-331                | `catch { return null; }`          | `catch (err: unknown) { rootLogger.warn(extractErrorMessage(err)); return null; }` |
| `gitlab-workflow.ts`    | 210-211                | `catch { return null; }`          | `catch (err: unknown) { rootLogger.warn(extractErrorMessage(err)); return null; }` |
| `git-provider-error.ts` | `handleError()`        | `handleError()` sem humanizeError | Usar `extractErrorMessage(err)` + `humanizeError(raw)`                             |
| `github-provider.ts`    | 102,118,127,141,187    | `String(err)` (5×)                | `extractErrorMessage(err)`                                                         |
| `gitlab-provider.ts`    | 96,113,122,135,161,181 | `String(err)` (6×)                | `extractErrorMessage(err)`                                                         |
| `coverage-provider.ts`  | 72                     | `String(err)`                     | `extractErrorMessage(err)`                                                         |
| `cypress_resource.ts`   | 33                     | `axiosErr.message` manual         | `extractErrorMessage(err)`                                                         |
| `incident-report.ts`    | 256                    | `formatErr(err)` needed           | `formatErr(err)`                                                                   |
| `suite-optimization.ts` | 213                    | `formatErr(err)` needed           | `formatErr(err)`                                                                   |
| `pipeline-jira.ts`      | 39                     | `formatErr(err)` needed           | `formatErr(err)`                                                                   |
| `artifact-parser.ts`    | 142                    | `typeof errObj['message']` manual | `extractErrorMessage(err)`                                                         |

**Checkpoint:**

```bash
rg "catch \{" git_triggers/github-workflow.ts git_triggers/gitlab-workflow.ts  # 0 bare catches
rg "String\(err\)" shared/data-hub/providers/  # 0 resultados
rg "axiosErr\.message" shared/cypress_resource.ts  # 0 resultados
```

**Commit:** `fix: eliminate silent error catches — EH-7 compliance across 12 files`

---

#### Tarefa 0.3 — Add DataHub to CommandContext

**Preparação:**

```bash
grep -n "dataHub" shared/types/command-context.ts
# Esperado: nenhum resultado (campo não existe ainda)
grep -n "CommandContext" shared/types/command-context.ts | head -5
```

**RED:**

```bash
# Criar teste que expõe a ausência:
# shared/__tests__/command-context.datahub.test.ts
# expectTypeOf<CommandContext>().toHaveProperty('dataHub')
# Esperado: FALHA — dataHub não existe na interface
```

**GREEN:**

- `shared/types/command-context.ts`: adicionar `dataHub?: DataHub` ao `CommandContext`
- `jira_management/main.ts`: criar DataHub no bootstrap e injetar em `commandContext`
- Atualizar `shared/__tests__/command-context.datahub.test.ts` para verificar que `dataHub` existe

**Integração:**

```bash
npx vitest run jira_management/main.test.ts --reporter=verbose
# Esperado: main.test.ts passa com DataHub no contexto
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "dataHub" shared/types/command-context.ts        # 1 ocorrência (campo adicionado)
npx vitest run jira_management/                      # 100% pass
```

**Commit:** `feat(data-hub): add dataHub to CommandContext for Jira command handlers`

## FASE 0.5 — DataHub Core: loadFromStore (1 tarefa)

---

#### Tarefa 0.5.1 — Adicionar factory method `loadFromStore()` ao DataHub

**Objetivo:** Criar DataHub a partir de dados persistidos (MetricsStore + CoverageHistory + FailureClassifications), sem precisar de provedores CI.

**Interface:**

```typescript
// Em shared/data-hub/hub.ts:
static loadFromStore(
  store: MetricsStore,
  coverageHistory: CoverageSnapshot[],
  failureClassifications: FailureClassification[],
  repo: string,
  persistence?: DataHubPersistence,
): DataHubImpl;
```

**Implementação:**

1. **Adicionar campo `failureClassifications` ao `RawData`:**

    ```typescript
    interface RawData {
        // ... campos existentes
        failureClassifications?: FailureClassification[]; // NOVO
    }
    ```

2. **Mapear `MetricsRun[]` → `parsedArtifacts` (DIRETO, sem round-trip):**
    - Cada `MetricsRun` vira um `ArtifactParseResult` com:
        - `fileName: 'metrics-store'`
        - `data: { tests: m.tests, stats: { passed, failed, skipped, total, duration } }`
        - `format: 'ctrf'`
    - Armazenar em `Map<number, ArtifactParseResult[]>` com chave = índice

3. **Mapear `MetricsRun[]` → `PipelineRun[]` (só metadados):**
    - `m.timestamp` → `created_at` (timestamp ORIGINAL, não `new Date()`)
    - `m.project` → `head_branch` (ou `'unknown'`)
    - `conclusion`: `m.passed > m.failed ? 'success' : 'failure'`
    - `status: 'completed'` (dados históricos sempre completos)
    - NÃO adicionar campos inexistentes (`tests`, `run_duration_ms`)

4. **Mapear `CoverageSnapshot[]` → `RawCoverage`:**
    - Usar ÚLTIMO snapshot
    - `totalIssues` → `total`, `mappedIssues` → `covered`, `coveragePct` → `percentage`

5. **Mapear `FailureClassification[]` → `raw.failureClassifications`:**
    - Copiar array diretamente (preserva dados para `aggregateDefectTrends`/`aggregateDefectSeasonality`)

6. **Chamar `DataHubImpl.computeMetrics(raw, { repo })` → `ComputedMetrics`**

7. **Retornar `new DataHubImpl(raw, computed, 'github', repo, persistence)`**

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
# Teste unitário: DataHub.loadFromStore cria hub com dados corretos
npx vitest run shared/data-hub/__tests__/hub.test.ts --reporter=verbose
# Esperado: novo teste passa
```

**Commit:** `feat(data-hub): add loadFromStore factory — create DataHub from persisted data`

## FASE 0.6 — DataHub Core: Persistência Interna (SSOT) (1 tarefa)

---

#### Tarefa 0.6.1 — Remover `persistence` da interface `DataHub`

**Objetivo:** `persistence` NÃO pode estar exposto na interface. Consumidores não podem acessar diretamente.

**Mudança em `shared/types/data-hub.ts`:**

```typescript
// ANTES:
interface DataHub {
    readonly raw: RawData;
    readonly computed: ComputedMetrics;
    readonly persistence?: DataHubPersistence | undefined; // ← REMOVER
    readonly timestamp: Date;
    readonly provider: 'github' | 'gitlab';
    readonly repo: string;
}

// DEPOIS:
interface DataHub {
    readonly raw: RawData;
    readonly computed: ComputedMetrics;
    readonly timestamp: Date;
    readonly provider: 'github' | 'gitlab';
    readonly repo: string;
}
```

---

#### Tarefa 0.6.2 — Adicionar métodos de persistência à interface `DataHub`

**Objetivo:** Consumidores chamam `hub.saveRun()`, não `hub.persistence.saveRun()`.

**Mudança em `shared/types/data-hub.ts`:**

```typescript
interface DataHub {
    // ... propriedades existentes ...

    // Operações de persistência (SSOT)
    saveRun(sha: string, run: MetricsRun): void;
    saveCoverageSnapshot(snapshot: CoverageSnapshot): void;
    saveFailureClassification(classification: FailureClassification): void;
    flush(message: string): void;
}
```

---

#### Tarefa 0.6.3 — Implementar métodos em `DataHubImpl`

**Objetivo:** Cada método delega para `this.persistence`. Se `persistence` é `undefined`, lança erro (NUNCA no-op silencioso).

**Mudança em `shared/data-hub/hub.ts`:**

```typescript
class DataHubImpl implements DataHub {
    // persistence é PRIVADO — não exposto
    private readonly persistence?: DataHubPersistence;

    saveRun(sha: string, run: MetricsRun): void {
        if (this.persistence == null) {
            throw new Error('DataHub: persistence not configured');
        }
        this.persistence.saveRun(sha, run);
    }

    saveCoverageSnapshot(snapshot: CoverageSnapshot): void {
        if (this.persistence == null) {
            throw new Error('DataHub: persistence not configured');
        }
        this.persistence.saveCoverageSnapshot(snapshot);
    }

    saveFailureClassification(classification: FailureClassification): void {
        if (this.persistence == null) {
            throw new Error('DataHub: persistence not configured');
        }
        this.persistence.saveFailureClassification(classification);
    }

    flush(message: string): void {
        if (this.persistence == null) {
            throw new Error('DataHub: persistence not configured');
        }
        this.persistence.flush(message);
    }
}
```

---

#### Tarefa 0.6.4 — Corrigir testes

**Problema:** Apenas 1 teste acessa `hub.persistence` diretamente (`shared/data-hub/__tests__/hub.test.ts:384`).

**Solução:** Reescrever teste para verificar comportamento dos métodos, não acesso à propriedade.

---

#### Tarefa 0.6.5 — Testes SSOT

| Teste                                                    | Verifica  |
| -------------------------------------------------------- | --------- |
| `saveRun()` lança erro sem persistence                   | SEGURANÇA |
| `saveRun()` delega para persistence                      | CORREÇÃO  |
| `saveCoverageSnapshot()` lança erro sem persistence      | SEGURANÇA |
| `saveCoverageSnapshot()` delega para persistence         | CORREÇÃO  |
| `saveFailureClassification()` lança erro sem persistence | SEGURANÇA |
| `saveFailureClassification()` delega para persistence    | CORREÇÃO  |
| `flush()` lança erro sem persistence                     | SEGURANÇA |
| `flush()` delega para persistence                        | CORREÇÃO  |

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/data-hub/__tests__/hub.test.ts --reporter=verbose
# Esperado: todos os testes passam
```

**Commit:** `feat(data-hub): add SSOT persistence methods — encapsulate persistence in DataHub`

> **Nota sobre `loadMetricsStore()`:** A interface `DataHub` expõe `loadMetricsStore()` como operação pública (linha ~410 do contrato). Isso contradiz a intenção de Tarefa 0.6.1 ("consumidores NUNCA acessam persistence diretamente"). `loadMetricsStore()` é essencialmente `persistence.loadMetricsStore()` exposto via alias público.
>
> **Resolução:** `loadMetricsStore()` será removido em Fase 1 (Tarefa 1.3.1) quando `health-score.ts` e `quality-gate.ts` passarem a ler exclusivamente de `DataHub.raw.*` e `DataHub.computed.*`. Até lá, `loadMetricsStore()` permanece como ponte documentada — seu uso é restrito a `quality-gate.ts:188` e `health-score.ts` (assinatura híbrida).

## FASE 0.7 — DataHub Global: Acessibilidade e Resiliência (10 tarefas)

---

#### Contexto — Gaps Encontrados na Análise do Código

Durante a análise do código, identificamos **8 gaps**. Cada um foi documentado com análise e decisão.

#### Gap #1: Cache Duplicado (`_dataHub` vs `_cache`)

**Problema identificado:** Dois caches parecem existir:

- `_dataHub` em `session-state.ts` (linha 33)
- `_cache` em `cache.ts` (linha 21)

**Análise:**

- `_dataHub` = referência ao projeto atual (session-scoped)
- `_cache` = cache de todos os projetos (multi-project cache)
- Propósitos diferentes: um é "projeto atual", outro é "cache de múltiplos projetos"

**Decisão:** NÃO É PROBLEMA

**Justificativa:** São camadas diferentes com propósitos distintos. `_dataHub` é uma conveniência para acesso rápido ao projeto atual. `_cache` é o armazenamento persistente multi-projeto. Coexistência é intencional.

**Ação:** Nenhuma necessária.

---

#### Gap #2: `loadFromStore` Não Usado

**Problema identificado:** `DataHub.loadFromStore()` existe mas não é chamado por ninguém.

**Análise:**

- É um factory interno para futura migração
- `ensureDataHub()` chama `getOrFetchDataHub()` (CI API) — não `loadFromStore()`
- `loadFromStore()` será usado quando migração para persistence estiver completa

**Decisão:** OK — CÓDIGO VÁLIDO

**Justificativa:** É uma factory para uso futuro. Manter código morto é aceitável quando há um caso de uso planejado.

**Ação:** Nenhuma necessária.

---

#### Gap #3: Persistence Opcional

**Problema identificado:** `DataHub.persistence` é opcional (`persistence?: DataHubPersistence | undefined`).

**Análise:**

- Fase 0.6 adicionou `saveRun()`, `saveCoverageSnapshot()`, `saveFailureClassification()`
- Todos os métodos lançam exceção se `persistence` é undefined
- Fase 0.8 planejada para tornar `persistence` obrigatório

**Decisão:** TRANSITÓRIO — RESOLVER NA FASE 0.8

**Justificativa:** A opção intencional permite migração incremental. Fase 0.8 resolve.

**Ação:** Fase 0.8 tornará `persistence` obrigatório.

---

#### Gap #4: Race Condition no Prefetch

**Problema identificado:** `prefetchAllDataHubs()` usa `Promise.allSettled()` para buscar múltiplos projetos. Se o cache não é atômico, fetches duplicados podem ocorrer.

**Análise:**

- `Promise.allSettled()` inicia todas as buscas simultaneamente
- Se cache é verificado antes da busca, mas busca é lenta, outro chamador pode iniciar busca paralela
- Resultado: múltiplas buscas para o mesmo projeto

**Decisão:** CORRIGIR

**Justificativa:** Race condition é bug real. Pode causar requisições HTTP desnecessárias e consumo de recursos.

**Ação:** Criar `getOrFetchWithLock()` — mutex pattern.

---

#### Gap #5: TTL Fixo vs Freshness

**Problema identificado:** Cache expira após 5 minutos fixos (`CACHE_TTL_MS`). Se dados mudaram antes de 5 minutos, usa dados desatualizados.

**Análise:**

- `isCacheValid()` retorna true se idade < 5 minutos
- Não verifica se dados reais mudaram
- Se CI atualizou dados, cache ainda é "válido"

**Decisão:** CORRIGIR

**Justificativa:** Usar dados desatualizados viola o princípio de SSOT. O cache deve ser invalidado quando dados mudam, não apenas quando tempo expira.

**Ação:** Adicionar `hasDataChanged()` ao `ensureDataHub()`.

---

#### Gap #6: `loadRun` Sempre Retorna null

**Problema identificado:** `DataHubPersistence.loadRun(sha)` existe mas sempre retorna null.

**Análise:**

- Interface declara: `loadRun(sha: string): MetricsRun | null`
- Implementação em `persistence.ts`: retorna null sempre
- Código morto — ninguém chama este método

**Decisão:** CORRIGIR

**Justificativa:** Código morto confunde desenvolvedores. Se o método não tem implementação, não deve existir na interface.

**Ação:** Remover `loadRun` da interface e implementação.

---

#### Gap #7: Cache Sem Disco

**Problema identificado:** Cache em memória (`_cache`) não persiste entre execuções CLI.

**Análise:**

- CLI é execução curta (segundos)
- Cache em memória é suficiente para sessão
- Persistência entre sessões é responsabilidade de `MetricsStore` (interno)
- Re-fetch a cada execução CLI é aceitável (CI API é rápida)

**Decisão:** NÃO É PROBLEMA

**Justificativa:** Cache em memória é suficiente para CLI. Persistência entre sessões não é requisito.

**Ação:** Nenhuma necessária.

---

#### Gap #8: Contradições no Plano

**Problema identificado:** Plano original diz:

- "MetricsStore será deletado" (linha 28)
- Mas Fase 0.8 "só remove interface" (remove `loadRun`, `persistence`)

**Análise:**

- Plano original promete deletar MetricsStore completamente
- Mas Fase 0.8 mantém MetricsStore como implementação interna
- Contradição: "deletado" vs "mantido internamente"

**Decisão:** CORRIGIR O PLANO

**Justificativa:** Transparência é mais importante quepromessas ambíguas. O plano deve refletir a realidade.

**Ação:** Atualizar do plano para refletir que MetricsStore é mantido internamente.

---

#### Resumo das Decisões

| Gap                        | Decisão            | Ação                 | Tarefa      |
| -------------------------- | ------------------ | -------------------- | ----------- |
| #1 Cache duplicado         | NÃO É PROBLEMA     | Nenhuma              | —           |
| #2 loadFromStore não usado | OK — CÓDIGO VÁLIDO | Nenhuma              | —           |
| #3 Persistence opcional    | TRANSITÓRIO        | Fase 0.8 resolve     | —           |
| #4 Race condition          | CORRIGIR           | Criar mutex          | 0.7.3-0.7.4 |
| #5 TTL fixo                | CORRIGIR           | Adicionar freshness  | 0.7.5-0.7.6 |
| #6 loadRun null            | CORRIGIR           | Remover código morto | 0.7.7-0.7.8 |
| #7 Cache sem disco         | NÃO É PROBLEMA     | Nenhuma              | —           |
| #8 Contradições no plano   | CORRIGIR           | Atualizar措辞        | 0.7.1-0.7.2 |

---

#### Tarefa 0.7.1 — Criar `shared/data-hub/global-hub.ts` (RED)

**Gap atacado:** #8 — Contradições no plano

**Objetivo:** Qualquer caller pode obter um DataHub, não só `git_triggers`. Usa injeção de dependência para flexibilidade.

**Interface:**

```typescript
// shared/data-hub/global-hub.ts
export function getDataHub(): DataHub | undefined;
export function setDataHub(hub: DataHub | undefined): void;
export async function ensureDataHub(fetchFn: () => Promise<DataHub | undefined>): Promise<DataHub | undefined>;
```

**RED — Testes que FALHAM:**

```typescript
// shared/data-hub/__tests__/global-hub.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDataHub, setDataHub, ensureDataHub } from '../global-hub.js';

describe('GlobalHub', () => {
    beforeEach(() => {
        setDataHub(undefined); // limpa estado entre testes
    });

    it('getDataHub returns undefined initially', () => {
        expect(getDataHub()).toBeUndefined();
    });

    it('setDataHub stores hub', () => {
        const mockHub = { raw: {}, computed: {} } as any;
        setDataHub(mockHub);
        expect(getDataHub()).toBe(mockHub);
    });

    it('setDataHub(undefined) clears hub', () => {
        const mockHub = { raw: {}, computed: {} } as any;
        setDataHub(mockHub);
        setDataHub(undefined);
        expect(getDataHub()).toBeUndefined();
    });

    it('ensureDataHub calls fetchFn when no hub exists', async () => {
        const mockHub = { raw: {}, computed: {} } as any;
        const fetchFn = vi.fn().mockResolvedValue(mockHub);

        const result = await ensureDataHub(fetchFn);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(mockHub);
    });

    it('ensureDataHub returns cached hub without calling fetchFn', async () => {
        const mockHub = { raw: {}, computed: {} } as any;
        setDataHub(mockHub);
        const fetchFn = vi.fn();

        const result = await ensureDataHub(fetchFn);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result).toBe(mockHub);
    });

    it('ensureDataHub returns undefined when fetchFn fails', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error('network error'));

        const result = await ensureDataHub(fetchFn);

        expect(result).toBeUndefined();
    });

    it('ensureDataHub stores hub when fetchFn succeeds', async () => {
        const mockHub = { raw: {}, computed: {} } as any;
        const fetchFn = vi.fn().mockResolvedValue(mockHub);

        await ensureDataHub(fetchFn);

        expect(getDataHub()).toBe(mockHub);
    });
});
```

---

#### Tarefa 0.7.2 — Criar `shared/data-hub/global-hub.ts` (GREEN)

**Gap atacado:** #8 — Contradições no plano

**Implementação:**

```typescript
// shared/data-hub/global-hub.ts
import type { DataHub } from '../types/data-hub.js';

/** Global hub instance — session-scoped. */
let _dataHub: DataHub | undefined;

/**
 * Get the global DataHub instance.
 * @returns Cached DataHub or undefined if not initialized.
 */
export function getDataHub(): DataHub | undefined {
    return _dataHub;
}

/**
 * Set the global DataHub instance.
 * @param hub - DataHub to cache, or undefined to clear.
 */
export function setDataHub(hub: DataHub | undefined): void {
    _dataHub = hub;
}

/**
 * Ensure a DataHub exists, fetching if necessary.
 *
 * Uses dependency injection: caller provides fetchFn that knows how to
 * obtain a DataHub (from CI API, persistence, or mock).
 *
 * @param fetchFn - Function to fetch DataHub when not cached.
 * @returns Cached or freshly fetched DataHub, or undefined on failure.
 */
export async function ensureDataHub(fetchFn: () => Promise<DataHub | undefined>): Promise<DataHub | undefined> {
    if (_dataHub) return _dataHub;

    try {
        const hub = await fetchFn();
        if (hub) {
            _dataHub = hub;
        }
        return _dataHub;
    } catch {
        return undefined;
    }
}
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/data-hub/__tests__/global-hub.test.ts --reporter=verbose
# Esperado: 7 testes passam
```

---

#### Tarefa 0.7.3 — Adicionar `getOrFetchWithLock` ao cache (RED)

**Gap atacado:** #4 — Race Condition no Prefetch

**Objetivo:** Prevenir race conditions no prefetch.

**RED — Testes que FALHAM:**

```typescript
// shared/data-hub/__tests__/cache.test.ts — ADICIONAR
describe('getOrFetchWithLock', () => {
    it('returns cached hub if exists', async () => {
        const mockHub = { repo: 'test' } as any;
        setCachedHub('test', mockHub);

        const fetchFn = vi.fn();
        const result = await getOrFetchWithLock('test', fetchFn);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result).toBe(mockHub);
    });

    it('calls fetchFn on cache miss', async () => {
        const mockHub = { repo: 'test' } as any;
        const fetchFn = vi.fn().mockResolvedValue(mockHub);

        const result = await getOrFetchWithLock('test', fetchFn);

        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(mockHub);
    });

    it('prevents duplicate concurrent fetches', async () => {
        const mockHub = { repo: 'test' } as any;
        let fetchCount = 0;
        const fetchFn = vi.fn().mockImplementation(async () => {
            fetchCount++;
            await new Promise((r) => setTimeout(r, 50));
            return mockHub;
        });

        // inicia duas chamadas simultâneas
        const [result1, result2] = await Promise.all([
            getOrFetchWithLock('test', fetchFn),
            getOrFetchWithLock('test', fetchFn),
        ]);

        expect(fetchFn).toHaveBeenCalledTimes(1); // apenas uma busca
        expect(result1).toBe(mockHub);
        expect(result2).toBe(mockHub);
    });

    it('allows fetch after lock released', async () => {
        const mockHub1 = { repo: 'test', v: 1 } as any;
        const mockHub2 = { repo: 'test', v: 2 } as any;
        const fetchFn = vi.fn().mockResolvedValueOnce(mockHub1).mockResolvedValueOnce(mockHub2);

        await getOrFetchWithLock('test', fetchFn);
        clearRepoCache('test');
        const result = await getOrFetchWithLock('test', fetchFn);

        expect(fetchFn).toHaveBeenCalledTimes(2);
        expect(result).toBe(mockHub2);
    });
});
```

---

#### Tarefa 0.7.4 — Adicionar `getOrFetchWithLock` ao cache (GREEN)

**Gap atacado:** #4 — Race Condition no Prefetch

**Implementação em `shared/data-hub/cache.ts`:**

```typescript
/** Active fetch locks — prevents duplicate concurrent fetches. */
const _locks = new Map<string, Promise<DataHub | undefined>>();

/**
 * Get cached hub or fetch with lock to prevent race conditions.
 *
 * If cache hit, returns immediately.
 * If cache miss, acquires lock and calls fetchFn.
 * Concurrent calls for same repo wait on existing lock.
 *
 * @param repo - Repository identifier.
 * @param fetchFn - Function to fetch hub on cache miss.
 * @returns Cached or freshly fetched DataHub.
 */
export async function getOrFetchWithLock(
    repo: string,
    fetchFn: () => Promise<DataHub | undefined>,
): Promise<DataHub | undefined> {
    const cached = getCachedHub(repo);
    if (cached) return cached;

    const existingLock = _locks.get(repo);
    if (existingLock) return existingLock;

    const lock = fetchFn()
        .then((hub) => {
            if (hub) setCachedHub(repo, hub);
            return hub;
        })
        .finally(() => {
            _locks.delete(repo);
        });

    _locks.set(repo, lock);
    return lock;
}
```

**Atualizar barrel:**

```typescript
// shared/data-hub/index.ts
export { getCachedHub, setCachedHub, clearCache, isCacheValid, getOrFetchWithLock } from './cache.js';
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/data-hub/__tests__/cache.test.ts --reporter=verbose
# Esperado: todos os testes passam (incluindo novos)
```

---

#### Tarefa 0.7.5 — Adicionar freshness check ao `ensureDataHub` (RED)

**Gap atacado:** #5 — TTL Fixo vs Freshness

**Problema:** Cache expira após 5 minutos fixos. Se dados mudaram antes de 5 minutos, usa dados desatualizados.

**Solução:** `ensureDataHub` deve verificar `hasDataChanged()` quando cache existe.

**RED — Testes que FALHAM:**

```typescript
// shared/data-hub/__tests__/global-hub.test.ts — ADICIONAR
describe('ensureDataHub with freshness check', () => {
    it('re-fetches when data changed', async () => {
        const hubV1 = makeMockHub({ repo: 'test-v1' });
        const hubV2 = makeMockHub({ repo: 'test-v2' });
        setDataHub(hubV1);

        const fetchFn = vi.fn().mockResolvedValue(hubV2);
        const hasDataChanged = vi.fn().mockReturnValue(true);

        const result = await ensureDataHub(fetchFn, { hasDataChanged, cachedHub: hubV1 });

        expect(hasDataChanged).toHaveBeenCalledWith(hubV1, hubV2.raw);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toBe(hubV2);
    });

    it('does not re-fetch when data unchanged', async () => {
        const hubV1 = makeMockHub({ repo: 'test' });
        setDataHub(hubV1);

        const fetchFn = vi.fn();
        const hasDataChanged = vi.fn().mockReturnValue(false);

        const result = await ensureDataHub(fetchFn, { hasDataChanged, cachedHub: hubV1 });

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result).toBe(hubV1);
    });
});
```

---

#### Tarefa 0.7.6 — Implementar freshness check (GREEN)

**Gap atacado:** #5 — TTL Fixo vs Freshness

**Implementação em `shared/data-hub/global-hub.ts`:**

```typescript
interface FreshnessOptions {
    hasDataChanged: (cached: DataHub, newRaw: RawData) => boolean;
    cachedHub: DataHub;
}

export async function ensureDataHub(
    fetchFn: () => Promise<DataHub | undefined>,
    options?: FreshnessOptions,
): Promise<DataHub | undefined> {
    if (_dataHub) {
        // Se opções de freshness fornecidas, verificar se dados mudaram
        if (options?.hasDataChanged && options?.cachedHub) {
            try {
                const freshHub = await fetchFn();
                if (freshHub && options.hasDataChanged(options.cachedHub, freshHub.raw)) {
                    _dataHub = freshHub;
                    return _dataHub;
                }
                // Dados não mudaram, manter cache
                return _dataHub;
            } catch {
                // Fetch falhou, manter cache existente
                return _dataHub;
            }
        }
        return _dataHub;
    }

    // Cache miss — buscar dados
    try {
        const hub = await fetchFn();
        if (hub) {
            _dataHub = hub;
        }
        return _dataHub;
    } catch {
        return undefined;
    }
}
```

---

#### Tarefa 0.7.7 — Remover `loadRun` da interface (RED)

**Gap atacado:** #6 — `loadRun` Sempre Retorna null

**Problema:** `DataHubPersistence.loadRun(sha)` existe mas sempre retorna null. Código morto.

**RED — Testes que FALHAM:**

```typescript
// shared/data-hub/__tests__/persistence.test.ts — VERIFICAR
// Testes que usam loadRun devem falhar após remoção
```

---

#### Tarefa 0.7.8 — Remover `loadRun` da interface (GREEN)

**Gap atacado:** #6 — `loadRun` Sempre Retorna null

**Mudanças:**

1. `shared/types/data-hub.ts`: Remover `loadRun(sha: string): MetricsRun | null` da interface
2. `shared/data-hub/persistence.ts`: Remover implementação de `loadRun`

---

#### Tarefa 0.7.9 — Migrar `git_triggers/session-state.ts` (RED)

**Gap atacado:** #8 — Contradições no plano + 3 stores sobrepostos (violação SRP)

**Análise de Arquitetura (2026-07-09):**

- `session-state._dataHub` duplica `global-hub._dataHub` — mesmas semânticas, sem sincronização
- `prefetchAllProjects` linhas 96-104 é **no-op**: `getOrFetchDataHub` internamente chama `getCachedHub`, retorna mesmo objeto → `hasDataChanged(same, same.raw)` sempre `false`
- Race condition: `Promise.allSettled` sem `getOrFetchWithLock`
- `hasDataChanged` importado mas não funcional no contexto de prefetch

**RED — Testes que FALHAM (verificam delegação):**

```typescript
// git_triggers/__tests__/integration/session-state-ensureDataHub.integration.test.ts — ADICIONAR

import { getDataHub as getGlobalHub } from '../../../shared/data-hub/global-hub.js';

describe('Global-hub delegation', () => {
    it('setDataHub in session-state affects global-hub', () => {
        const hub = makeMockHub();
        setDataHub(hub); // session-state re-export
        expect(getGlobalHub()).toBe(hub); // global-hub source of truth
    });

    it('ensureDataHub delegates to global-hub with fetchFn', async () => {
        setManager(createMockProvider());
        setCurrentProjectName('test');
        const result = await ensureDataHub();
        expect(result).toBeDefined();
        expect(getGlobalHub()).toBe(result);
    });
});
```

---

#### Tarefa 0.7.10 — Migrar `git_triggers/session-state.ts` (GREEN)

**Gap atacado:** #8 — Contradições no plano + correção de bugs latentes

**Mudanças em `session-state.ts`:**

1. **Adicionar import de global-hub:**

```typescript
import {
    getDataHub as _getDataHub,
    setDataHub as _setDataHub,
    ensureDataHub as _ensureDataHub,
} from '../shared/data-hub/global-hub.js';
```

2. **REMOVER:** `let _dataHub: DataHub | undefined;` (linha 33)

3. **Substituir funções:**

```typescript
export function setDataHub(hub: DataHub | undefined): void {
    _setDataHub(hub);
}

export function getDataHub(): DataHub | undefined {
    return _getDataHub();
}

export async function ensureDataHub(): Promise<DataHub | undefined> {
    if (!manager || !currentProjectName) return undefined;
    return _ensureDataHub(async () => {
        const { getOrFetchDataHub } = await import('../shared/ci-data.js');
        return getOrFetchDataHub(manager!, currentProjectName!);
    });
}
```

4. **Simplificar `prefetchAllProjects`:** Remover branch de cache-hit redundante (linhas 96-104),
   remover import de `hasDataChanged`, usar `getOrFetchWithLock` para corrigir race condition.

5. **Atualizar `_resetForTest`:** Chamar `_setDataHub(undefined)` em vez de limpar `_dataHub` local.

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "_dataHub" git_triggers/session-state.ts         # 0 resultados
rg "hasDataChanged" git_triggers/session-state.ts   # 0 resultados
npx vitest run git_triggers/                         # 100% pass
npx vitest run shared/__tests__/integration/         # 100% pass
npx eslint git_triggers/session-state.ts             # 0 erros
```

**Commit:** `refactor(data-hub): migrate session-state to delegate to global-hub`

---

## FASE 0.8 — DataHub Core: Interface Expandida + Factory + Persistence (10 tarefas)

> **Revisado:** 2026-07-09 — Expansão da interface + factory centralizado em vez de tornar persistence obrigatório diretamente.
>
> **Achados da auditoria:**
>
> - `DataHub` interface expõe 4 de 11 métodos de `DataHubPersistence`
> - 30+ call sites criam `createDataHubPersistence()` separadamente porque `DataHub` não expõe `loadMetricsStore()`
> - `quality-metrics.ts` tem persistence dead code — `setQualityMetricsPersistence()` nunca foi chamado, drift detection nunca funcionou
> - `createEmpty()` tem 0 call sites em produção — não precisa de persistence
> - O plano original (tornar persistence obrigatório) ignora os 30+ bypasses — correção parcial

**Decisão:** Expandir `DataHub` interface para TODOS os 11 métodos → criar factory `createDataHub()` → migrar consumers → tornar persistence obrigatório no final.

#### Lições aprendidas (fases 0.5-0.7)

1. **Mapeamento direto > conversão** — Round-trips (MetricsRun → PipelineRun → MetricsRun) perdem dados. Mapeamento direto preserva timestamps, campos e metadados originais.
2. **Contratos de tipo são imutáveis** — `PipelineRun` não tem `duration` nem `tests`. Não inventar campos que não existem no tipo.
3. **Documentar decisões arquiteturais** — O porquê de uma decisão é tão importante quanto a decisão em si.
4. **ESLint hooks são rigorosos** — Três rodadas de correção antes do commit: `@typescript-eslint/unbound-method`, `vitest/prefer-strict-equal`, `vitest/valid-title`. Padrão aceito: `satisfies MockPersistence` + `as DataHubPersistence`.
5. **Behavior testing > Property testing** — Testar `hub.saveRun()` delega corretamente é melhor que testar `hub.persistence === mockPersistence`.
6. **Erros silenciosos são ALWAYS violations** — Cada método lança erro explícito quando persistence não está configurado. Zero no-ops.
7. **Questionar antes de assumir** — "Cache duplicado" não é duplicação se serve propósitos diferentes (`_dataHub` = projeto atual, `_cache` = todos os projetos).
8. **Plano deve refletir realidade** — Contradições no plano causam confusão. Plano deve ser preciso.
9. **Injeção de dependência > acoplamento** — `ensureDataHub(fetchFn)` é mais testável e flexível que `ensureDataHub()` com closure.
10. **TDD é obrigatório** — Escrever testes ANTES da implementação garante que o código atende aos requisitos.
11. **Race conditions são reais** — `Promise.allSettled` com cache não atômico causa fetches duplicados. Mutex simples resolve.

---

#### Tarefa 0.8.1 — Expandir `DataHub` interface (RED)

**Gap atacado:** Interface incompleta força 30+ bypasses

**RED — Testes que FALHAM:**

```typescript
// shared/data-hub/__tests__/hub.test.ts — ADICIONAR
describe('DataHub expanded persistence interface', () => {
    it('loadMetricsStore delegates to persistence', async () => {
        const mockStore: MetricsStore = {
            runs: [
                {
                    sha: 'abc',
                    timestamp: new Date().toISOString(),
                    passed: 10,
                    failed: 1,
                    skipped: 0,
                    duration: 1000,
                    tests: [],
                },
            ],
        };
        const mockPersistence = createMockPersistence({ loadMetricsStore: vi.fn().mockReturnValue(mockStore) });
        const { hub } = await DataHubImpl.create([], { repo: 'test' }, mockPersistence);
        expect(hub.loadMetricsStore()).toBe(mockStore);
    });
    it('saveParseResult delegates and returns MetricsRun', async () => {
        const mockRun: MetricsRun = {
            sha: 'abc',
            timestamp: new Date().toISOString(),
            passed: 10,
            failed: 0,
            skipped: 0,
            duration: 500,
            tests: [],
        };
        const mockPersistence = createMockPersistence({ saveParseResult: vi.fn().mockReturnValue(mockRun) });
        const { hub } = await DataHubImpl.create([], { repo: 'test' }, mockPersistence);
        const result = hub.saveParseResult('project', {
            stats: { total: 10, passed: 10, failed: 0, skipped: 0, duration: 500 },
            tests: [],
        });
        expect(result).toBe(mockRun);
    });
    it('throws when persistence not configured', async () => {
        const { hub } = await DataHubImpl.create([], { repo: 'test' });
        expect(() => hub.loadMetricsStore()).toThrow('persistence not configured');
    });
});
```

---

#### Tarefa 0.8.2 — Implementar delegates em `DataHubImpl` (GREEN)

**Gap atacado:** Interface incompleta

**Mudanças:**

1. `shared/types/data-hub.ts` — Adicionar 7 métodos à interface `DataHub`
2. `shared/data-hub/hub.ts` — Implementar 7 delegates + import `ParseResult`

**Checkpoint:**

```bash
npx tsc --noEmit    # 0 erros
npx vitest run shared/data-hub/__tests__/hub.test.ts  # 100% pass
```

---

#### Tarefa 0.8.3 — Criar `createDataHub()` factory (RED)

**Gap atacado:** 30+ call sites criam persistence separadamente

**RED — Testes que FALHAM:**

```typescript
// shared/data-hub/__tests__/factory.test.ts — NOVO
describe('createDataHub factory', () => {
    it('creates hub with persistence injected', async () => { ... });
    it('retries on transient failure', async () => { ... });
    it('throws after maxRetries exhausted', async () => { ... });
    it('returns cached hub on subsequent calls', async () => { ... });
});
```

---

#### Tarefa 0.8.4 — Implementar factory com retry + backoff (GREEN)

**Gap atacado:** Criação centralizada + resiliência

**Novo arquivo:** `shared/data-hub/factory.ts`

**Checkpoint:**

```bash
npx vitest run shared/data-hub/__tests__/factory.test.ts  # 100% pass
```

---

#### Tarefa 0.8.5 — Migrar `ci-data.ts` para factory

**Mudança:** `getOrFetchDataHub()` chama `createDataHub()` em vez de `DataHubImpl.create()` diretamente.

---

#### Tarefa 0.8.6 — Migrar `quality-metrics.ts` (remover dead code, ativar drift)

**Achado:** `setQualityMetricsPersistence()` nunca foi chamado. Drift detection nunca funcionou.

**Mudança:** Remover padrão paralelo, injetar via DataHub persistence.

---

#### Tarefa 0.8.7 — Migrar 30+ consumers em cascata

Cada consumer que chama `createDataHubPersistence().loadMetricsStore()` passa a chamar `hub.loadMetricsStore()`.

---

#### Tarefa 0.8.8 — Atualizar testes (mocks)

Mecânico — adicionar mock persistence onde necessário.

---

#### Tarefa 0.8.9 — Tornar persistence obrigatório

**Agora seguro** — todos passam via factory. Sem bypasses restantes.

---

#### Tarefa 0.8.10 — Remover `createDataHubPersistence` exports

Não é mais necessário externamente.

---

**Checkpoint Final:**

```bash
npx tsc --noEmit                                    # 0 erros
npx eslint shared/data-hub/ git_triggers/           # 0 erros
npx vitest run                                      # 100% pass
rg "createDataHubPersistence" --include='*.ts'      # 0 resultados em produção
```

**Commit:** `refactor(data-hub): expand interface, add factory, migrate 30+ consumers to DataHub SSOT`

---

## FASE EXPAND + STORE — Extração Máxima + Persistência Quality-Gated (2026-07-11)

**Mandato (decisão do usuário):** extrair a **última gota** de **toda ferramenta conectada**, quality-gate por provenance/confidence/validação, **persistir** (store JSON + migração não-destrutiva) e expor para consumo pelas features. Baixa qualidade → rotulada, nunca dropada. Toda informação é valor agregado; o único filtro é **boa qualidade**.

### Inventário de ferramentas (verificado no código)

| Ferramenta   | Conexão atual                                                       | "Last drop" a extrair                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub**   | `github-provider.ts`, `github-check-run.ts`, `github-pr-comment.ts` | CI runs/jobs/attempts/`usage`(custo real)/timing; Check Run annotations (todos níveis, file:line+stack); artifacts CTRF/JUnit/Mochawesome/Playwright; **Issues**; **PRs/reviews**; **Security**: code-scanning/secret-scanning/Dependabot; **Deployments/Environments/Releases** (→ DORA) |
| **GitLab**   | `gitlab-provider.ts`                                                | pipelines/jobs/`failure_reason`/`queued_duration`/`source`; `test_report`+`test_report_summary`(stack_trace); coverage; **Issues**; **MRs/approvals**; **Security**: SAST/dependency/container/secret (pipeline reports); **DORA** `/dora/metrics`; Environments                          |
| **Jira**     | `jira-client.ts` (`JiraResourceLike`)                               | Issues enriquecidos: components, priority, fixVersions, **sprint**, issueLinks, epic/parent, storyPoints, statusCategory, labels, assignee/reporter                                                                                                                                       |
| **Xray**     | `xray-cloud-client.ts` + `types/xray.ts`                            | Test Plans, Test Executions, Test Runs, cobertura de requisitos, defects linkados                                                                                                                                                                                                         |
| **Coverage** | `coverage-provider.ts`                                              | Istanbul/Cobertura/JaCoCo → por arquivo: lines/branches/functions                                                                                                                                                                                                                         |

> Sonar: apenas `sonar-project.properties` (sem client vivo) — **fora do escopo**.

### Dimensões transversais (extração obrigatória em TODA ferramenta)

| Dimensão        | O que extrair (last drop)                                                                                                                                                                                                   | Categoria de destino                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **QUALIDADE**   | Test results (pass/fail/skip/total), `FailureRecord` (file/line/stack/categoria), coverage (lines/branches/functions), flakiness/quarantine, failure-classification, test-retries/flaky (CTRF), requirement coverage (Xray) | `parsedArtifacts`, `failureRecords`, `coverage.files`, `flakinessEntries`, `xrayData`                              |
| **SEGURANÇA**   | SAST, DAST, dependency-scanning, container-scanning, secret-detection, code-scanning, Dependabot/renovate, license compliance                                                                                               | `securityFindings` (por ferramenta)                                                                                |
| **PERFORMANCE** | CI pipeline duration, queue/wait, runner utilization, billable minutes/custo real (`usage`), per-test duration (P95/P95 de `testDurationMap`), suite speed, build cache                                                     | `perRunCosts`/`pipelineCost`, `testDurationP95`/`testDurationMap`, `suiteSpeedP95`, `timing`, `performanceMetrics` |

### EIXO A — EXPAND (por ferramenta, "last drop")

**FASE LA — Versionadores (`CDH-LA1`–`LA5`)**

- **LA-1** Camada 3: `CheckRunAnnotation` (`ci-cd.ts`) estendido p/ `end_line, start_column, end_column, title, raw_details, blob_href`; `getCheckRuns` traz esses campos; `fromAnnotations` (`failure-classifier.ts`) mapeia todos os níveis → `FailureRecord` CTRF/Allure `{ status(failed|broken), message, trace:raw_details, file, line, column, level, category, confidence:'high', source:'check-run-annotation' }`; `classifyFailures` faz **merge** de fontes (não first-wins). Desbloqueia parte do `CDH-L4X1` (file:line) sem acesso a FS.
- **LA-2** Camada 1: `GET /actions/runs/{id}/usage` → minutos faturáveis reais (precisão `pipelineCost`/`perRunCosts`); fallback estimativa se 404 (nunca NaN); `attempts` → re-run detection → `retries`/`flaky`.
- **LA-3** Camada 6 (GitLab): `test_report_summary` (rápido) p/ counts; `test_report` completo → `stack_trace`/`system_output` em `FailureRecord.trace`; DORA `/dora/metrics` → `doraMetrics` (guard de tier ULTIMATE; ausência explícita).
- **LA-4** Camada 2: CTRF `flaky/retries/environment.userAgent/tool.name/version/calculations`; Playwright `file/line` por teste.
- **LA-5** Camada 5: reporter-prediction (ler workflow CI → detectar jest-junit/vitest json/pytest junitxml → prever artifact) + **Security** nativa (GitHub/GitLab) + **Performance** (queue/duration/runner) + **Deployments/Environments/Releases** (→ DORA) + **PRs/MRs** (reviews/approvals).

**FASE PM — Gerenciadores (`CDH-PM0`–`PM4`)**

- **PM-0** Contrato `ProjectManagerProvider` (espelho de `DataProvider`); `RawData.pmIssues` genérico + `RawIssue` canônico.
- **PM-1** Jira (FECHA GAP profundidade): `mapIssue` + components/priority/fixVersions/sprint/issueLinks/epic/parent/storyPoints/statusCategory; paginação `startAt`; guards p/ campos ausentes (`undefined` explícito).
- **PM-2** GitHub Issues (token existente): `GET /repos/{o}/{r}/issues` → `RawIssue`; vincular issues↔PRs↔runs.
- **PM-3** GitLab Issues (token existente): `GET /projects/:id/issues` (epic/iteration).
- **PM-4** Composição em `composite-provider.ts` (CI + PMs em paralelo, merge c/ provenance).

**FASE XR — Xray (`CDH-XR1`–`XR2`)**

- Extrair Test Plans/Executions/Runs + cobertura de requisitos + defects → `RawData.xrayData` (com provenance/confidence).

**FASE COV — Coverage detalhado (`CDH-COV`)**

- Por arquivo/branch/function → `coverage.files`.

### EIXO B — STORE (persistência quality-gated) — fundação

**FASE STORE (`CDH-ST1`–`ST3`)**

- **ST-1** Estender `RawData` + `DataHubPersistence` p/ todas as categorias: `failureRecords, securityFindings, deployments, releases, doraMetrics, prs/mrs, pmIssues(github/gitlab), xrayData, coverageFiles, performanceMetrics`.
- **ST-2** Camada de Qualidade `validateAndScore(rawCategory)`: schema validation (JSON Schema já usado no export); NaN/empty guards (AGENTS §24.1); confidence por fonte (estruturado=`high`, regex log=`low`, manual=`medium`); dedup por chave natural; provenance obrigatória. Baixa qualidade → `quality:{valid,issues}` tag, não drop.
- **ST-3** Migração não-destrutiva do `MetricsStore` atual; novas categorias adicionadas; dados históricos preservados.

### EIXO C — SERVE (consumo)

- Features (health-score, quality-gate, traceability, flakiness, failure-analysis, bug-report, pr-report) consomem do modelo único armazenado, cientes de `confidence`/`quality`.
- `DataHub` expõe acessores tipados por categoria (sem acesso direto a persistence).

### Ordem de execução

`ST-1 → ST-2 → ST-3` (fundação) → `L4` → `LA-1` → `LA-2/3/4/5` → `PM-0..4` → `XR` → `COV`. Commits granulares por fase.

### Invariantes

SEM NaN · ZERO silenciamento · sem `instanceof`/`typeof==='object'`/`toThrow()` sem msg · `preserve-caught-error`/`only-throw-error` · **Test-First** (property p/ NaN; integração p/ shape real; mocks estritos) · migração não-destrutiva.

### Checkpoints por fase

```bash
npx tsc --noEmit
npx vitest run shared/data-hub/__tests__ shared/__tests__/integration
rg "NaN" shared/data-hub shared/data-hub/providers   # 0
npm run lint                                        # 0 errors
```

---

## FASE ST-3 — Quality Enforcement nas Fronteiras de Confiança

> **Executada:** 2026-07-12
> **Escopo:** Wire da camada de qualidade (ST-2 `validateAndScore`) nas DUAS fronteiras de
> confiança do DataHub — ingest (modelo em memória servido) e store (modelo durável) — de forma
> que a invariante "SEM NaN · ZERO silenciamento · quality tag, não drop" valha de fato.
> **Autorização:** usuário (build mode) — implementar tudo conforme planejado, sem deferir.

### Decisão arquitetural (avaliação adversarial)

A alternativa ingênua "gate no `saveXxx` do Hub" foi **rejeitada** por análise adversarial:

1. `DataHubImpl.create` NUNCA chama `saveXxx` — provider data flui
   `fetchFromProviders → mergeRawData (in-memory) → computeMetrics` e é servido via
   `hub.raw` / `hub.computed`. Os únicos callers de `saveXxx` são testes. Logo, gatear `saveXxx`
   protege um caminho frio; o modelo servido (`hub.raw`) continuaria ungated → NaN/inválidos
   alcançariam `hub.computed` e os consumidores. Viola "SEM NaN".
2. Mesmo para o store, `saveXxx` é opcional e dependente de caller → não é funil.

O modelo de fato SSOT e servido é o **`hub.raw` em memória**, construído em 3 pontos
(`create`/`fetchFromProviders`, `loadFromStore`, `createFromParseResult`). O funil real é a
construção do `raw`. Solução tecnicamente superior (defesa em profundidade, AGENTS §5/§8):

- **Gate de ingest** (`gateRawData` em `quality.ts`): funnel obrigatório; `hub.raw` e `hub.computed`
  tornam-se NaN-free, dedup, normalizado e provenance-checado NA ORIGEM (AGENTS §4).
- **Gate de store** (backstop em `persistence.ts`): toda escrita em `persistence.saveXxx` aplica
  `validateAndScoreXxx` antes de armazenar. Como `hub.persistence` é público e é a fronteira
  durável, garante que NENHUMA escrita (features futuras, migrações, `saveXxx`) produza dado
  inválido no store. Mesmo módulo → zero duplicação; dois pontos de enforcement independentes.
- **Tag, não drop:** inválido/baixa-qualidade é armazenado + taggeado (`quality` report), nunca
  descartado (AGENTS §25).
- **Sem dessincronia:** o `quality` report é derivado/guardado no hub (não duplicado no store);
  `getQuality(category)` o expõe. Recomputável, sem segunda fonte de verdade.
- **Autoridade de dedup:** `mergeCategoryArrays` faz merge entre providers (reconciliação de
  campos); `validateAndScore` faz o dedup estrutural autoritativo na fronteira de confiança,
  rodando sobre o `merged` já fundido → complementares, sem divergência.

### Itens implementados

| ID     | Item                                                                                                                  | Arquivo                                                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-3.1 | `gateRawData(raw)`, `QualityCategory`, `QualityCategoryMap`                                                           | `shared/data-hub/quality.ts` (NOVO)                                                                                                                            |
| ST-3.2 | `create`/`loadFromStore`/`createFromParseResult`/`createEmpty` aplicam `gateRawData`; `getQuality` no hub + interface | `shared/data-hub/hub.ts`, `shared/types/data-hub.ts`                                                                                                           |
| ST-3.3 | `persistence.saveXxx` (8 categorias) aplicam `validateAndScoreXxx` (backstop)                                         | `shared/data-hub/persistence.ts`                                                                                                                               |
| MOCK   | `getQuality` adicionado aos mocks centrais + 3 mocks inline de teste                                                  | `shared/test-utils/factories/data-hub-mock.ts`, `session-state.test.ts`, `session-state-ensureDataHub.integration.test.ts`, `health-score.integration.test.ts` |

### Testes (Test-First, mocks estritos)

- `shared/data-hub/__tests__/quality.test.ts` — `validateAndScore` por categoria (schema, NaN,
  dedup, provenance, confidence-by-source); objetos nullable.
- `shared/data-hub/__tests__/quality-ingest.test.ts` — `gateRawData` (NaN normalizado, dedup,
  inválido taggeado, provenance faltante, campos não-gateados preservados, mapa de 8 chaves).
- `shared/data-hub/__tests__/hub-ingest-gate.test.ts` — `DataHubImpl.create` gateia provider raw
  antes de `computeMetrics` (fim-a-fim: provider → merge → gate → compute → hub); `createEmpty`
  também gateado.
- `shared/data-hub/__tests__/persistence-st3.test.ts` — backstop de store (NaN normalizado,
  dedup, inválido armazenado taggeado; objeto nullable).

### Checkpoints (por fase)

```
npx tsc --noEmit                                   # 0 erros  ✓
npx vitest run shared/data-hub shared/__tests__/integration   # 111 files / 832 tests  ✓
rg "NaN" shared/data-hub shared/data-hub/providers  # 0 em dados servidos
  (matches restantes são guards defensivos isNaN e comentários — corretos, não vazamento)
npm run lint                                       # 0 errors nos arquivos ST-3  ✓
```

### Condição de "done"

`quality.ts` deixa de ser dead code; `hub.raw`/`hub.computed` servidos são quality-gated na
origem; o store é backstop não-contornável; consumidores leem qualidade via `getQuality`.
Invariante "SEM NaN / ZERO silenciamento / quality tag, não drop" válida de fato.

---

## Design Gaps — Not Covered by Existing Phases (2026-07-10)

> **Origin:** Code analysis during gap assessment. These are design deficiencies that
> neither the SSOT enforcement plan nor the layered architecture plan address.
> Each gap compromises DataHub solidity independently.

### Gap 1 — Input Validation on Provider Output (RawData)

**Problem:** `RawData` has no Zod schema. Provider output flows directly into compute
functions without validation. If GitHub/GitLab API response shape changes (field rename,
removal, type change), the data enters compute silently and produces wrong metrics.

**Current state:** `schemas.ts` validates `MetricsRun` and `MetricsStore` (output/storage),
but NOT `RawData` or `PipelineRun` (input from CI APIs).

**Impact:** Silent wrong metrics. No error, no warning, no detection.

**Fix:** Add `RawDataSchema` and `PipelineRunSchema` Zod schemas. Validate at provider
boundary (`fetchRawData` return). Reject malformed data explicitly.

| #    | Task                                               | Est. |
| ---- | -------------------------------------------------- | ---- |
| G1.1 | Create `PipelineRunSchema` Zod in `schemas.ts`     | 1h   |
| G1.2 | Create `RawDataSchema` Zod in `schemas.ts`         | 2h   |
| G1.3 | Validate in `GitHubDataProvider.fetchRawData()`    | 1h   |
| G1.4 | Validate in `GitLabDataProvider.fetchRawData()`    | 1h   |
| G1.5 | Tests: malformed API responses rejected explicitly | 1h   |

> **Gap 1 — ✅ CONCLUÍDO (2026-07-12).**
>
> - `PipelineRunSchema` (G1.1) já existia em `shared/data-hub/schemas.ts` e já era aplicado por ambos os providers (`github-provider.ts` `validateRuns` → `parsePipelineRun`; `gitlab-provider.ts` loop). Confirmado, não duplicado.
> - **G1.2 — `RawDataSchema` adicionado** em `schemas.ts`. `runs: z.array(PipelineRunSchema)` (validação completa da saída primária da API); campos Map/array derivados validados estruturalmente (`z.map(z.number(), z.unknown())` / `z.array(z.unknown())`) via `.loose()`. Deep-validation dos tipos internos derivados está fora de escopo (originam de `GitProvider` já tipado, não de JSON de API cru).
> - **G1.3/G1.4 — boundary validation** em `fetchRawData` de ambos os providers: objeto montado passa por `validateRawDataOrThrow(...)`; dados malformados são REJEITADOS EXPLICITAMENTE (throw), nunca silenciosamente.
> - **G1.5 — testes** em `shared/data-hub/__tests__/rawdata-schema.test.ts` (8 testes): aceita `RawData` válido; REJEITA `runs` ausente / não-array / item com campo de tipo errado (mudança de tipo de API); `failureReasons` com valor não-`string[]`; `validateRawDataOrThrow` lança; `parseRawData` retorna null (variante leniente).
> - Verificação: `tsc --noEmit` limpo; `eslint` dos 3 arquivos alterados limpo; `529/529` testes de `shared/data-hub` passam (regressão zero).
> - NOTA DE ESCOPO: `PipelineRunSchema` é `.loose()` com todos os campos opcionais, logo não detecta run vazio `{foo:'bar'}` (aceito, porém inertizado pelo `parseRunId == null → continue` no provider). Detecta SIM mudanças de TIPO em campos presentes (ex.: `id` objeto → rejeitado). Isso atende o intento do Gap ("type change") sem falso-positivo em runs parciais legítimos.

### Gap 2 — Data Provenance & Confidence Metadata

**Problem:** Computed metrics don't indicate which data source produced them or how
reliable that source is. Coverage from CTRF artifact (100% confidence) is treated
identically to coverage from job log regex (60% confidence). Quality-gate decisions
based on low-confidence data are risky.

**Current state:** No provenance tracking. `RawCoverage` has no `source` field.
`ComputedMetrics` has no `confidence` or `provenance` fields.

**Impact:** Quality-gate pass/fail decisions based on unreliable data with no way
for consumers to assess risk.

**Fix:** Add `DataSource` type and `provenance` map to `RawData`. Each metric
computed from a specific source carries metadata: source name, confidence level,
timestamp of extraction.

| #    | Task                                                  | Est. |
| ---- | ----------------------------------------------------- | ---- |
| G2.1 | Define `DataSource` type (source, confidence, ts)     | 0.5h |
| G2.2 | Add `provenance?: Map<string, DataSource>` to RawData | 0.5h |
| G2.3 | Populate provenance in `GitHubDataProvider`           | 1h   |
| G2.4 | Populate provenance in `GitLabDataProvider`           | 1h   |
| G2.5 | Expose `provenance` on `DataHub` interface            | 0.5h |
| G2.6 | Tests: provenance tracked for each data source        | 1h   |

> **Gap 2 — ✅ CONCLUÍDO (2026-07-12).**
>
> - **G2.1** `DataSource` interface (`{ source, confidence, timestamp }`) já existe em `shared/types/data-hub.ts:48` — confirmado, não duplicado.
> - **G2.2** `RawData.provenance?: Map<string, DataSource>` já existe em `data-hub.ts:83` — confirmado.
> - **G2.3/G2.4** ambos os providers já populaam `provenance` via `buildProvenance()`: `github-provider.ts:95-105` (`runs`→github-api/1, `coverage`→github-actions-artifacts/0.9, `framework`→local-detection/0.8); `gitlab-provider.ts:79-93` (idem + `testReport`→gitlab-api/1). Confirmado, não reimplementado (AGENTS §6 — imutabilidade de contrato).
> - **G2.5** `DataHub` interface expõe `raw: RawData` (`data-hub.ts:602`); como `RawData.provenance` existe, a provenance está acessível via `hub.raw.provenance`. Satisfeito sem nova superfície de API.
> - **G2.6** testes adicionados em `github-provider.test.ts` e `gitlab-provider.test.ts`: `result.provenance` definido; entrada `runs` com `source`/`confidence`/`timestamp` corretos por provider (github-api / gitlab-api, confidence 1).
> - Verificação: `tsc --noEmit` limpo; eslint dos arquivos alterados limpo; `12/12` testes de provider passam (regressão zero em `529/529` data-hub).

### Gap 3 — Branch-Aware Metrics

**Problem:** `raw.runs` mixes all branches. `calcPipelinePassRate` computes a global
average. If `main` has 99% pass rate and `feature-x` has 50%, the consumer receives
~75% which represents neither branch accurately.

**Current state:** No branch filtering in compute functions. `FetchOptions` has
`branch?: string` but it's not used for filtering — it's passed to the API for
fetching (different semantics).

**Impact:** Misleading metrics for projects with heterogeneous branch health.
Quality-gate decisions based on cross-branch averages.

**Fix:** Add `branchFilter` to `FetchOptions`. Compute functions accept optional
branch parameter. `RawData` carries branch metadata per run. Consumers can request
metrics for a specific branch or the default branch.

| #    | Task                                                 | Est. |
| ---- | ---------------------------------------------------- | ---- |
| G3.1 | Add `branch` field to `PipelineRun` (if not present) | 0.5h |
| G3.2 | Add `branchFilter?: string` to `FetchOptions`        | 0.5h |
| G3.3 | Filter in `GitHubDataProvider` by branch             | 1h   |
| G3.4 | Filter in `GitLabDataProvider` by branch             | 1h   |
| G3.5 | Add `branch` param to `calcPipelinePassRate`         | 1h   |
| G3.6 | Add `branch` param to `calcFlakyFromPipelineRuns`    | 1h   |
| G3.7 | Expose branch-filtered view on `DataHub`             | 1h   |
| G3.8 | Tests: branch filtering for each compute function    | 2h   |

**Status: ✅ CONCLUÍDO (2026-07-12).**

Implementação (sem duplicação — `calcBranchBreakdown` já existia; verificado):

- G3.1: `PipelineRun` já carrega `head_branch`/`ref` — sem mudança (verificado em ambos os providers).
- G3.2: `branchFilter?: string` adicionado a `FetchOptions` (`shared/types/data-hub.ts:329`).
- G3.3/G3.4: filtro de branch em `fetchRawData` via helper `rawRunBranch()` (early-return, sem ternary aninhado) em `github-provider.ts` e `gitlab-provider.ts`. Respeita `branchFilter ?? options.branch`.
- G3.5: `calcPipelinePassRate(runs, branch?)` filtra por `rawRunBranch` em `compute/pass-rate.ts`.
- G3.6: `calcFlakyFromPipelineRuns(runs, jobsMap, branch?)` filtra por `rawRunBranch` em `compute/flaky-rate.ts`.
- G3.7: `DataHub.getBranchPassRate(branch)` adicionado à interface e implementado em `hub.ts` (`calcPipelinePassRate(this.raw.runs, branch)`).
- G3.8: testes adicionados — `github-provider.test.ts`/`gitlab-provider.test.ts` (branchFilter), `pass-rate.test.ts` (branch + `toBeCloseTo`), `flaky-rate.test.ts` (branch, correção de lógica: 1 run não é flaky), `hub.test.ts` (`getBranchPassRate`).
- Mocks `DataHub` atualizados (1 fonte: `data-hub-mock.ts` + 3 mocks inline) para implementar `getBranchPassRate`.
- Verificação: `npx tsc --noEmit` limpo · 59/59 testes Gap 3 passam · `npm run lint` (gate CI) PASSED (exit 0). Débito N2-B documentado em `hub.ts` (4 `detect-object-injection` pré-existentes, severity-1).

### Gap 4 — Incremental Updates

> **Gap 4 — ✅ CONCLUÍDO (2026-07-12).**

**Problem:** `DataHubImpl.create()` fetches ALL data from scratch every time.
For projects with 30+ runs, this is slow and wastes CI API quota.

**Current state (pre-fix):** Cache (`cache.ts`) stores the final DataHub but doesn't support
delta updates. `hasDataChanged()` detects changes but doesn't enable partial fetch.

**Impact:** Slow DataHub creation for large projects. Unnecessary API calls.
Potential rate limiting.

**Fix (executed):** Add `since?: Date` parameter to provider fetch (fetch only runs since last known
run). Merge new runs into existing `RawData` via `DataHub.mergeIncremental()`. Recompute only affected metrics.
`ensureDataHub()` now refreshes the cached hub incrementally (passes the existing hub to `getOrFetchDataHub`).

| #    | Task                                                   | Est. | Status |
| ---- | ------------------------------------------------------ | ---- | ------ |
| G4.1 | Add `since?: Date` to `FetchOptions` (already existed) | 0.5h | ✅     |
| G4.2 | Pass `since` to GitHub API (`created >=`)              | 1h   | ✅     |
| G4.3 | Pass `since` to GitLab API (`created_after`)           | 1h   | ✅     |
| G4.4 | Add `mergeIncremental()` to `DataHub`/`DataHubImpl`    | 2h   | ✅     |
| G4.5 | Update `ensureDataHub` to use incremental path         | 1h   | ✅     |
| G4.6 | Tests: incremental merge preserves existing data       | 2h   | ✅     |
| G4.7 | Tests: incremental merge adds new runs correctly       | 1h   | ✅     |

---

### Dependency Order

```
Gap 1 (validation) → Gap 2 (provenance) → Gap 3 (branch) → Gap 4 (incremental)
```

- Gap 1 is prerequisite: validation must exist before provenance can be attached
- Gap 2 is prerequisite: provenance metadata needed for branch-aware confidence
- Gap 3 depends on Gap 1: branch filtering requires validated input
- Gap 4 depends on all: incremental updates merge into validated, provenance-tracked, branch-aware data

### Total Estimate

| Gap       | Est.    |
| --------- | ------- |
| 1         | 6h      |
| 2         | 5h      |
| 3         | 8h      |
| 4         | 8h      |
| **Total** | **27h** |
