# DataHub SSOT Enforcement — Migration & Prevention Plan

> **Criado:** 2026-07-09
> **Baseado em auditoria exaustiva de 35 consumidores em 28 arquivos de produção**
> **Objetivo:** Eliminar TODAS as fontes alternativas de dados — DataHub é a ÚNICA fonte de verdade (SSOT)
> **Status:** 🟢 PRONTO PARA IMPLEMENTAÇÃO

---

## SYSTEM MODEL

**Invariantes absolutos:**

1. DataHub é a **única interface** para operações de dados (leitura e escrita)
2. Consumidores NUNCA baixam, parseiam, calculam ou persistem dados por conta própria
3. `DataHub.computed.*` cobre TODAS as métricas — toda computação local é um bypass
4. `DataHubPersistence` será absorvido pelo DataHub — todo acesso direto a `MetricsStore`/`Store` é um bypass
5. Qualquer módulo que leia de `MetricsStore.runs`, `MetricsStore.coverageHistory`, `MetricsStore.failureClassifications` ou `Store` (fora de `shared/data-hub/`) viola SSOT
6. Qualquer módulo que faça chamada direta a API CI (GitHub/GitLab) fora dos `DataProvider`s viola SSOT
7. Nenhuma função de cálculo de métricas (`passed / total * 100`, `flaky`, `P95`) deve existir fora de `shared/data-hub/compute/`
8. `health-score.ts`, `quality-gate.ts`, `pr-report-core.ts` — DataHub é **obrigatório**, nunca opcional
9. Nenhum `catch` block pode retornar `undefined`/`null` sem logar. Todo `catch` DEVE usar `extractErrorMessage()` + `humanizeError()`. Erros silenciosos = defeito de segurança.
10. Nenhuma degradação graciosa ou tratamento eufêmico de falhas. Se uma operação falha, o consumidor DEVE ser notificado explicitamente. Never silently swallow errors.
11. `MetricsStore` será deletado — toda persistência passa pelo DataHub internamente.

**Regras para este plano:**

- Cada fase tem checkpoint **testável** (comando exato)
- Fase só é concluída quando checkpoint passa 100%
- Checkpoints incluem: `npx tsc --noEmit`, `npx vitest run`, `rg` de verificação
- Nenhum item pode ser marcado como ✅ sem evidência do checkpoint
- **Progresso NÃO é registrado no plano.** O agente deve verificar cada fase independentemente, sem confiar em marcadores. Marcadores de progresso criam falsa sensação de conclusão e impedem detecção de gaps.

---

## CONTEXTO E RACIONAL

### Por que DataHub é incondicional

DataHub não é uma "opção melhor". É a única arquitetura correta. Antes do DataHub, cada consumidor baixava, parseava e calculava dados por conta própria —resultando em 35 bypasses mapeados em 28 arquivos. O DataHub consolida toda essa lógica em um único lugar. Quando DataHub existe, ele É a fonte de verdade. Sem fallback. Sem "quando possível".

### Por que `dataHub?` é transitório

A assinatura `dataHub?: DataHub` existe porque 6 chamadores ainda não foram migrados:

- `jira_management/main.ts:344`
- `jira_management/commands/case26.ts:23`
- `jira_management/commands/case19.ts:70`
- `shared/cli_base.ts:220`
- `shared/pr-report-core.ts:487`
- `shared/quality-gate.ts:196`

Esses chamadores são consumidores silenciosos — o plano os lista na Fase 9.1. Quando todos forem migrados, `dataHub` pode (e deve) se tornar obrigatório. A opção `?` é uma necessidade transitória, não um design.

### Por que a Fase 8 deleta módulos

A Fase 8 deleta `ci-test-downloader`, `coverage-source`, `commit-log` — módulos que fazem download direto de artefatos CI, leitura de arquivos Istanbul, e chamadas diretas à API CI. O DataHub já faz tudo isso via `DataProvider`s. Manter esses módulos cria risco de bypass acidental. Deletar consolida a arquitetura.

### Por que precisamos construir infraestrutura antes de migrar consumidores

Atualmente, DataHub só pode ser criado via `DataHubImpl.create(providers)` — que precisa de provedores CI. Mas 23 arquivos usam `persistence.loadMetricsStore()` sem acesso a provedores. Esses callers não podem migrar para DataHub se DataHub não for acessível de seus contextos.

**Solução:** Construir infraestrutura (Fases 0.5-0.8) que permite:

1. Criar DataHub a partir de dados persistidos (`loadFromStore`)
2. DataHub salvar/carregar dados internamente (persistência integrada)
3. Qualquer caller obter um DataHub (`global-hub.ts`)
4. DataHub ser obrigatório (sem `persistence?` opcional)

Essas fases são PREREQUISITO para todas as migrações de consumidores.

### O que acontece se uma fase falhar

Não há rollback automático. Se uma fase falhar:

1. **Parar** — não pular para a próxima fase
2. **Diagnosticar** — qual checkpoint falhou e por quê
3. **Corrigir** — causa raiz, não workaround
4. **Reexecutar** — o checkpoint inteiro, não apenas o item que falhou

Nunca "contornar" um erro para fazer o checkpoint passar. Se o checkpoint falha, há um defeito real.

### Cadeia de dependências

```
Fase 0 (fundação) → Fase 0.5 (loadFromStore) → Fase 0.6 (persistência) → Fase 0.7 (global-hub)
→ Fase 0.8 (obrigatório) → Fase 1 (health-score) → Fase 2 (quality-gate) → Fase 3 (pr-report-core)
→ Fase 4 (git_triggers) → Fase 5 (error-handling) → Fase 6 (shared restantes)
→ Fase 7 (auditoria pós-migração) → Fase 8 (deletar fontes alternativas)
→ Fase 9 (consumidores silenciosos) → Fase 10 (ESLint enforcement)
```

Cada fase depende da anterior. Não é possível pular fases.

---

## ERROR HANDLING CONTRACT

**Padrão ouro:** `shared/data-hub/persistence.ts` — único módulo com tratamento completo.

### Regras Obrigatórias

| ID   | Regra                                                                                                  | Violação é...  |
| ---- | ------------------------------------------------------------------------------------------------------ | -------------- |
| EH-1 | Todo `catch` block DEVE: `const raw = extractErrorMessage(err)`                                        | BUG            |
| EH-2 | Seguido de: `const known = humanizeError(raw)` — sem isso, erros são incompreensíveis                  | BUG            |
| EH-3 | Seguido de: `rootLogger.warn/error` com a mensagem humanizada e contexto do módulo                     | BUG            |
| EH-4 | Se `humanizeError(raw)` retorna `null` (erro desconhecido), ampliar `prompt-errors.ts` ANTES de migrar | DÉBITO TÉCNICO |
| EH-5 | `handleError()` em `git-provider-error.ts` DEVE usar `extractErrorMessage` + `humanizeError`           | BUG            |
| EH-6 | `_getErrorMessage()` em `interactive-mode.ts` DEVE ser substituído por `formatErr()`                   | DÉBITO TÉCNICO |
| EH-7 | `bare catch { return null; }` DEVE ter pelo menos `rootLogger.warn(extractErrorMessage(err))`          | BUG            |
| EH-8 | Proibido `formatErr(err)` pattern — usar sempre `formatErr()`                                          | DÉBITO TÉCNICO |

### Padrão de Implementação

```typescript
// ❌ ERRADO — silencia o erro
catch { return null; }

// ❌ ERRADO — perde detalhes do Axios
catch (err) {
    rootLogger.error(`falha: ${(err as Error).message}`);
}

// ❌ ERRADO — não usa humanizeError
catch (err) {
    rootLogger.warn(`falha: ${String(err)}`);
}

// ✅ CORRETO — padrão completo
catch (err: unknown) {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    rootLogger.warn(`module-name: operação falhou — ${known ? known.msg : raw}`);
}
```

### humanizeError — Padrões Conhecidos (existentes em `shared/prompt-errors.ts`)

| #   | Regex Pattern                                                   | msg                          | hint                                                          |
| --- | --------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| 1   | `/rate limit\|too many requests/i`                              | "Rate limit atingido"        | "Aguarde alguns segundos e tente novamente."                  |
| 2   | `/issue type.*not found\|not a valid issue type/i`              | "Tipo de issue invalido"     | "Verifique se o tipo esta habilitado nas config. do projeto." |
| 3   | `/project.*not found/i`                                         | "Projeto nao encontrado"     | "Verifique se o nome do projeto esta correto."                |
| 4   | `/field.*not found\|unknown field/i`                            | "Campo nao encontrado"       | "Verifique se o campo existe no schema do projeto."           |
| 5   | `/permission\|forbidden\|403/i`                                 | "Sem permissao"              | "Verifique se seu token tem acesso a esta operacao."          |
| 6   | `/unauthorized\|401/i`                                          | "Token invalido ou expirado" | "Reconfigure: /setup ou edite o arquivo .env."                |
| 7   | `/econnreset\|econnrefused\|enotfound\|timeout\|econnaborted/i` | "Erro de conexao"            | "Verifique se a URL esta correta e acessivel."                |
| 8   | `/version.*not found/i`                                         | "Versao nao encontrada"      | "Verifique se o nome da versao esta correto."                 |
| 9   | `/already exists/i`                                             | "Item ja existe"             | "Escolha um nome diferente."                                  |

### humanizeError — Padrões NOVOS a Adicionar (antes de implementar Fase 3-5)

| #   | Regex Pattern                               | msg                                  | hint                                                          | Aparece em                    |
| --- | ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------- | ----------------------------- |
| 10  | `/EPIPE\|ECONNRESET.*GitHub/i`              | "Conexao com GitHub perdida"         | "Verifique sua conexao de rede e tente novamente."            | `data-hub/providers/`         |
| 11  | `/artifact.*expired\|not found.*artifact/i` | "Artefato CI expirado ou ausente"    | "O artefato pode ter expirado. Tente re-executar o pipeline." | `ci-test-downloader`, DataHub |
| 12  | `/invalid.*json\|unexpected.*token/i`       | "Arquivo de dados corrompido"        | "O arquivo de resultado parece estar corrompido. Re-execute." | `artifact-parser`, `schemas`  |
| 13  | `/ENOENT.*coverage\|ENOTDIR.*coverage/i`    | "Arquivo de coverage nao encontrado" | "Verifique se o pipeline gerou o relatorio de coverage."      | `coverage-source`             |
| 14  | `/rate.*limit.*github\|abuse.*detection/i`  | "Rate limit do GitHub"               | "Muitas requisicoes. Aguarde e tente novamente."              | `data-hub/providers/`         |
| 15  | `/ETIMEDOUT.*api\.github/i`                 | "Timeout na API do GitHub"           | "API do GitHub lenta. Tente novamente em alguns minutos."     | `data-hub/providers/`         |
| 16  | `/403.*github.*secondary.*rate/i`           | "Secondary rate limit GitHub"        | "GitHub bloqueou temporariamente. Aguarde 60s."               | `data-hub/providers/`         |
| 17  | `/invalid.*xml\|not well-formed/i`          | "Arquivo XML invalido"               | "O arquivo JUnit XML esta mal formatado."                     | `junit-xml-parser.ts`         |

### Arquivos com Erros Silenciosos em Produção (MUST FIX antes de Fase 7)

| Arquivo                 | Linha                  | Padrão                            | Ação                                                        |
| ----------------------- | ---------------------- | --------------------------------- | ----------------------------------------------------------- |
| `github-workflow.ts`    | 330-331                | `catch { return null; }`          | Adicionar `rootLogger.warn(extractErrorMessage(err))`       |
| `gitlab-workflow.ts`    | 210-211                | `catch { return null; }`          | Adicionar `rootLogger.warn(extractErrorMessage(err))`       |
| `interactive-mode.ts`   | 870-879                | `_getErrorMessage()` duplicado    | Substituir por `formatErr()` de `shared/errors.ts`          |
| `git-provider-error.ts` | todo                   | `handleError()` sem humanizeError | Atualizar para usar `extractErrorMessage` + `humanizeError` |
| `github-provider.ts`    | 102,118,127,141,187    | `String(err)`                     | Substituir por `extractErrorMessage(err)` + `humanizeError` |
| `gitlab-provider.ts`    | 96,113,122,135,161,181 | `String(err)`                     | Substituir por `extractErrorMessage(err)` + `humanizeError` |
| `coverage-provider.ts`  | 72                     | `String(err)`                     | Substituir por `extractErrorMessage(err)` + `humanizeError` |
| `cypress_resource.ts`   | 33                     | `axiosErr.message` manual         | Substituir por `extractErrorMessage(err)`                   |
| `incident-report.ts`    | 256                    | `formatErr(err)` needed           | Substituir por `formatErr(err)`                             |
| `suite-optimization.ts` | 213                    | `formatErr(err)` needed           | Substituir por `formatErr(err)`                             |
| `pipeline-jira.ts`      | 39                     | `formatErr(err)` needed           | Substituir por `formatErr(err)`                             |
| `artifact-parser.ts`    | 142                    | `typeof errObj['message']` manual | Substituir por `extractErrorMessage(err)`                   |

---

## TESTING DISCIPLINE

### Regras Obrigatórias

| ID    | Regra                                                                                           | Violação é...       |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------- |
| TD-1  | Test factories (`shared/test-utils/factories/`) são a ÚNICA fonte de dados de teste             | BADTESTING          |
| TD-2  | Mocks são STRICT — enumeram TODOS os métodos do tipo alvo, nunca `{}` ou partial                | BADTESTING          |
| TD-3  | Expected values vêm de REQUISITOS, nunca da saída atual do código                               | BUG (codifies bugs) |
| TD-4  | `expect(x).toBeDefined()` sozinho = BADTESTING — mínimo: `expect(x).toEqual(expectedShape)`     | BADTESTING          |
| TD-5  | Property-based tests obrigatórios para: validação, parsers, transformadores, cálculos numéricos | DÉBITO TÉCNICO      |
| TD-6  | Integration tests obrigatórios para: fluxos cross-camada, DataHub → Compute → Render            | DÉBITO TÉCNICO      |
| TD-7  | Unit tests para: lógica pura, funções helper, edge cases                                        | DÉBITO TÉCNICO      |
| TD-8  | `try/catch` em testes é PROIBIDO exceto para: cleanup em `afterEach` e expected-throw           | BADTESTING          |
| TD-9  | Testes que passam independente da implementação = teatro → deletar                              | BADTESTING          |
| TD-10 | `expect.hasAssertions()` obrigatório em todo arquivo de teste                                   | BADTESTING          |

### Hierarquia de Testes (obrigatório ter todos)

```
1. Property-Based Tests (PBT) — invariantes que valem para TODOS os inputs
   └── Obrigatório para: DataHub compute functions, parsers, validações
   └── Mínimo: 1 PBT por módulo compute
   └── Usar: fast-check (fc), expect.hasAssertions()

2. Integration Tests — fluxos cross-camada
   └── Obrigatório para: DataHub → Compute → Report, CommandHandler → DataHub → Render
   └── Mínimo: 1 integration test por consumidor migrado
   └── Padrão: FT-XXa, FT-XXb, isolamento com tmp dir

3. Unit Tests — lógica pura
   └── Obrigatório para: funções helper, edge cases, validações
   └── Mínimo: 1 unit test por função exportada
   └── Padrão: descrever/caso/it
```

### Test Data Source Hierarchy

| Prioridade  | Fonte                             | Quando usar                                    |
| ----------- | --------------------------------- | ---------------------------------------------- |
| 1 (highest) | `shared/test-utils/factories/`    | SEMPRE — factories tipadas com shapes corretas |
| 2           | `createTestHub()` (mock data-hub) | Para testes que precisam de DataHub mockado    |
| 3           | Fixtures inline                   | Apenas para valores literais simples           |
| ❌ Proibido | Copiar saída do código            | Nunca — codifica bugs como features            |

### Factory Registry

| Factory                              | Arquivo                                       | Cria                                 |
| ------------------------------------ | --------------------------------------------- | ------------------------------------ |
| `createMockJiraResource`             | `factories/jira-resource-factory.ts`          | `Mocked<JiraResource>` (20+ métodos) |
| `createMockLinkManager`              | `factories/link-manager-factory.ts`           | `Mocked<JiraLinkManager>`            |
| `createMockContext`                  | `factories/context-factory.ts`                | `Mocked<CommandContext>` (composite) |
| `createMockGitProvider`              | `factories/git-provider-factory.ts`           | `Mocked<GitProvider>` (22 métodos)   |
| `createMockConfig`                   | `factories/config-factory.ts`                 | `MockConfigStatic`                   |
| `createMockTestExecutionCreator`     | `factories/test-execution-creator-factory.ts` | `MockTestExecutionCreator`           |
| `createMockResponse`                 | `factories/response-factory.ts`               | `{ data: T }` wrapper                |
| `createFlatTest` / `createFlatTests` | `factories/flat-test-factory.ts`              | `FlatTest` objects                   |
| `createTestHub`                      | `shared/__mocks__/data-hub.ts`                | `DataHub` mockado com computedFields |

### BadTesting — Instâncias Encontradas (corrigir após Fase 4)

| Arquivo                                       | Linha | Problema                                           |
| --------------------------------------------- | ----- | -------------------------------------------------- |
| `jira_management/create_tests.test.ts`        | 671   | `expect(result).toBeDefined()` como única asserção |
| `jira_management/create_tests.test.ts`        | 687   | `expect(result).toBeDefined()` como única asserção |
| `jira_management/create_tests.test.ts`        | 702   | `expect(result).toBeDefined()` como única asserção |
| `jira_management/create_tests.test.ts`        | 719   | `expect(result).toBeDefined()` como única asserção |
| `jira_management/create_tests.test.ts`        | 836   | `expect(result).toBeDefined()` como única asserção |
| `jira_management/import-orchestrator.test.ts` | 189   | `expect(result).toBeDefined()` como única asserção |
| `jira_management/import-prep.test.ts`         | 199   | `expect(result).toBeDefined()` como única asserção |

**Ação:** Substituir por assertions de comportamento:

```typescript
// ❌ ERRADO
expect(result).toBeDefined();

// ✅ CORRETO
expect(result).toEqual(
    expect.objectContaining({
        key: expect.any(String),
        summary: expect.stringContaining('test'),
        status: 'Created',
    }),
);
```

---

## ATOMIC TASK BREAKDOWN

> **Padrão:** Cada tarefa segue RED → GREEN → Integração → Checkpoint → Commit.
> **RED:** Teste que FALHA contra código atual (expõe o bypass).
> **GREEN:** Correção no código para o teste passar.
> **Integração:** Verificar que consumidores existentes continuam funcionando.
> **Checkpoint:** Comandos exatos que devem passar.
> **Commit:** Mensagem atômica no padrão `refactor(data-hub): <descrição>`.

---

### FASE 0 — Foundation (3 tarefas)

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

---

## DATAHUB INFRASTRUCTURE

### Princípio

DataHub é o ÚNICO ponto de acesso a dados. Toda coleta, persistência e manipulação passa por ele. MetricsStore será absorvido/deletado. DataHubPersistence será absorvido/deletado.

### O que falta construir

Atualmente, DataHub só pode ser criado via `DataHubImpl.create(providers)` — que precisa de provedores CI. Mas existem 23 arquivos que usam `persistence.loadMetricsStore()` sem acesso a provedores. Esses callers precisam de uma forma de obter um DataHub.

**Solução:** Construir a infraestrutura para que DataHub seja acessível de qualquer contexto, sem depender de provedores CI.

### Cadeia de dependências (atualizada)

```
Fase 0 (fundação) → Fase 0.5 (loadFromStore) → Fase 0.6 (persistência) → Fase 0.7 (global-hub)
→ Fase 0.8 (obrigatório) → Fase 1 (health-score) → Fase 2 (quality-gate) → ...
```

---

### FASE 0.5 — DataHub Core: loadFromStore (1 tarefa)

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

1. Converter `MetricsRun[]` → `PipelineRun[]`:
    - `run.timestamp` → `created_at`
    - `run.project` → `head_branch` (ou `'unknown'`)
    - `run.total` → `total` (tests)
    - `run.passed` → `passed`
    - `run.failed` → `failed`
    - `run.skipped` → `skipped`
    - `run.duration` → `run_duration_ms`
    - `run.tests` → `tests` (FlatTest[] já é compatível)

2. Criar `RawData` com:
    - `runs`: PipelineRun[] (convertidos)
    - `jobs`: Map vazio (não persistido)
    - `artifacts`: Map vazio (não persistido)
    - `failureReasons`: Map vazio (não persistido)
    - `coverage`: converter `CoverageSnapshot[]` → `RawCoverage` (último snapshot)
    - `parsedArtifacts`: converter `MetricsRun[]` → `Map<number, ArtifactParseResult[]>` (opcional)

3. Chamar `DataHubImpl.computeMetrics(raw, { repo })` → `ComputedMetrics`

4. Retornar `new DataHubImpl(raw, computed, 'github', repo, persistence)`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
# Teste unitário: DataHub.loadFromStore cria hub com dados corretos
npx vitest run shared/data-hub/__tests__/hub.test.ts --reporter=verbose
# Esperado: novo teste passa
```

**Commit:** `feat(data-hub): add loadFromStore factory — create DataHub from persisted data`

---

### FASE 0.6 — DataHub Core: Persistência Interna (1 tarefa)

---

#### Tarefa 0.6.1 — Adicionar métodos de persistência ao DataHub

**Objetivo:** DataHub salva e recupera dados internamente. Consumidores não acessam `hub.persistence` diretamente.

**Interface adicional ao DataHub:**

```typescript
// Métodos de persistência:
save(): void;
saveRun(sha: string, run: MetricsRun): void;
saveCoverageSnapshot(snapshot: CoverageSnapshot): void;
saveFailureClassification(classification: FailureClassification): void;
flush(message: string): void;
```

**Implementação:**

Cada método delega para `this.persistence` internamente. Se `this.persistence` é `undefined`, lança erro claro.

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/data-hub/__tests__/hub.test.ts --reporter=verbose
# Esperado: testes de persistência passam
```

**Commit:** `feat(data-hub): add persistence methods — save, saveRun, flush`

---

### FASE 0.7 — DataHub Global: Acessibilidade (1 tarefa)

---

#### Tarefa 0.7.1 — Criar `shared/data-hub/global-hub.ts`

**Objetivo:** Qualquer caller pode obter um DataHub, não só `git_triggers`.

**Interface:**

```typescript
// shared/data-hub/global-hub.ts
export function getDataHub(): DataHub | undefined;
export function setDataHub(hub: DataHub): void;
export async function ensureDataHub(project: string, repo: string): Promise<DataHub | undefined>;
```

**Implementação:**

- `getDataHub()`: retorna hub global (ou undefined)
- `setDataHub(hub)`: define hub global
- `ensureDataHub(project, repo)`: se hub existe, retorna; senão, cria via `DataHub.loadFromStore()` usando dados persistidos

**Migrar `git_triggers/session-state.ts`:**

- `getDataHub()` e `setDataHub()` delegam para `shared/data-hub/global-hub.ts`
- `ensureDataHub()` usa `shared/data-hub/global-hub.ts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/data-hub/__tests__/global-hub.test.ts --reporter=verbose
npx vitest run git_triggers/__tests__/integration/session-state-ensureDataHub.integration.test.ts
# Esperado: todos passam
```

**Commit:** `feat(data-hub): add global-hub — accessible DataHub from any context`

---

### FASE 0.8 — DataHub Core: Obrigar Persistence (1 tarefa)

---

#### Tarefa 0.8.1 — Tornar persistence obrigatório no construtor

**Objetivo:** DataHub SEMPRE tem persistência. Sem `persistence?: DataHubPersistence | undefined`.

**Mudanças:**

1. `DataHubImpl` constructor: `persistence: DataHubPersistence` (sem `?`)
2. `DataHubImpl.create()`: `persistence` obrigatório (ou criar um default)
3. `DataHubImpl.loadFromStore()`: `persistence` obrigatório
4. Interface `DataHub`: `readonly persistence: DataHubPersistence` (sem `?`)

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros — erros de tipo onde persistence era opcional
# Corrigir todos os call sites que não passam persistence
npx vitest run --reporter=verbose | tail -10         # 100% pass
```

**Commit:** `refactor(data-hub): make persistence mandatory — no optional DataHubPersistence`

---

### FASE 1 — health-score.ts SSOT (4 tarefas)

---

#### Tarefa 1.1 — RED: Tests that expose health-score bypasses

**Preparação:**

```bash
cat shared/health-score.ts | grep -n "store\.\|coverageHistory\|_computeExpWeighted\|calculateFlakyTestRate"
# Mapear: L177 (flaky), L179-181 (executionRate), L200-208 (coverage)
```

**RED:**

```bash
# Criar test que FALHA: health-score.test.ts
# it('uses dataHub.computed.coverage when available', () => {
#   const dataHub = createTestHub({ computed: { coverage: 85 } });
#   const result = calculateHealthScore(store, { dataHub });
#   expect(result.dimensions.coverage.score).toBe(85);
# });
# Esperado: FALHA — health-score ignora dataHub.computed.coverage
```

**GREEN:** (próxima tarefa)

**Checkpoint:**

```bash
npx vitest run shared/__tests__/health-score.test.ts --reporter=verbose 2>&1 | grep "FAIL"
# Esperado: pelo menos 1 teste FALHA (expondo o bypass)
```

**Commit:** `test(health-score): add failing tests that expose DataHub bypasses (RED phase)`

---

#### Tarefa 1.2 — GREEN: Migrate health-score.ts to DataHub

**Preparação:**

```bash
cat shared/health-score.ts | grep -n "dataHub\?\|dataHub:"
# Mapear assinatura atual: calculateHealthScore(store, options?)
```

**GREEN:**

- `_resolveCoverage()` (L200-208): substituir `store.coverageHistory` por `dataHub.computed.coverage`
- `_computeExpWeighted()` (L179-181): substituir por `dataHub.computed.executionRate`
- `calculateFlakyTestRate(runs)` (L177): substituir por `dataHub.computed.flakyTestRate`
- Tornar `dataHub` obrigatório na assinatura: `dataHub: DataHub` em vez de `dataHub?: DataHub`

**Integração:**

```bash
npx vitest run shared/__tests__/health-score.test.ts --reporter=verbose
# Esperado: todos passam (incluindo os novos da tarefa 1.1)
npx vitest run shared/__tests__/health-score.property.test.ts --reporter=verbose
# Esperado: PBT passam
npx vitest run shared/integration/health-score.integration.test.ts --reporter=verbose
# Esperado: integration passa
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "store\.coverageHistory" shared/health-score.ts   # 0 ocorrências
rg "_computeExpWeighted" shared/health-score.ts      # 0 ocorrências
rg "calculateFlakyTestRate" shared/health-score.ts   # 0 ocorrências (usa dataHub.computed)
npx vitest run shared/__tests__/health-score*         # 100% pass
```

**Commit:** `refactor(health-score): enforce DataHub as mandatory — coverage, executionRate, flakyTestRate`

---

#### Tarefa 1.3 — Update health-score callers (4 arquivos)

**Preparação:**

```bash
grep -rn "calculateHealthScore" --include="*.ts" | grep -v "test\|node_modules\|shared/health-score.ts"
# Mapear: quality-gate.ts, pr-report-core.ts, cli_base.ts, main.ts, case26.ts, case19.ts, schedule-handler.ts, interactive-mode.ts
```

**RED:**

```bash
npx tsc --noEmit 2>&1 | grep "Argument.*not assignable"
# Esperado: callers que não passam DataHub agora falham na compilação
```

**GREEN:**

- `shared/cli_base.ts:220`: criar DataHub e passar
- `jira_management/main.ts:344`: usar `c.dataHub`
- `jira_management/commands/case26.ts:23`: usar `c.dataHub`
- `jira_management/commands/case19.ts:70`: usar `c.dataHub`
- Verificar que callers que já passam DataHub continuam funcionando

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/                               # 100% pass
npx vitest run jira_management/                      # 100% pass
```

**Commit:** `refactor(health-score): update all callers to pass DataHub (mandatory)`

---

#### Tarefa 1.4 — Error Handling: health-score.ts

**Preparação:**

```bash
grep -n "catch" shared/health-score.ts
# Mapear catch blocks existentes
```

**RED:**

```bash
# Teste que expõe: se DataHub.computed tem valor inválido (NaN), health-score deve logar
# it('logs warning when DataHub.computed has invalid values', () => { ... })
# Esperado: FALHA — health-score não valida/trata erros de DataHub
```

**GREEN:**

- Adicionar `extractErrorMessage` + `humanizeError` em catch blocks de health-score
- Validar que `dataHub.computed.*` não tem NaN antes de usar

**Checkpoint:**

```bash
rg "extractErrorMessage" shared/health-score.ts      # >= 1 ocorrência
rg "humanizeError" shared/health-score.ts             # >= 1 ocorrência
npx vitest run shared/__tests__/health-score*          # 100% pass
```

**Commit:** `fix(health-score): add proper error handling with humanizeError`

---

### FASE 2 — quality-gate.ts SSOT (3 tarefas)

---

#### Tarefa 2.1 — RED: Tests that expose quality-gate bypasses

**Preparação:**

```bash
grep -n "calculateFlakyTestRate\|calcTestDurationP95\|loadMetricsStore" shared/quality-gate.ts
# Mapear: L99-115 (flaky), L129-154 (suiteSpeed), L177-179 (loadMetricsStore)
```

**RED:**

```bash
# Criar test que FALHA:
# it('uses dataHub.computed.flakyTestRate instead of recalculating', () => {
#   const dataHub = createTestHub({ computed: { flakyTestRate: 5.2 } });
#   const result = runQualityGate({ dataHub });
#   expect(result.checks.find(c => c.name === 'flaky').actual).toBe(5.2);
# });
# Esperado: FALHA — quality-gate recalcula em vez de usar DataHub
```

**Commit:** `test(quality-gate): add failing tests that expose DataHub bypasses (RED phase)`

---

#### Tarefa 2.2 — GREEN: Migrate quality-gate.ts to DataHub

**GREEN:**

- `_flakyCheck()` (L99-115): substituir `calculateFlakyTestRate(runs)` por `dataHub.computed.flakyTestRate`
- `_suiteSpeedCheck()` (L129-154): substituir `calcTestDurationP95(runs)` por `dataHub.computed.testDurationP95`
- `runQualityGate()` (L173): tornar `dataHub` obrigatório
- Remover `createDataHubPersistence().loadMetricsStore()` (L177-179)

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" shared/quality-gate.ts        # 0 ocorrências
rg "calculateFlakyTestRate" shared/quality-gate.ts  # 0 ocorrências
rg "calcTestDurationP95" shared/quality-gate.ts     # 0 ocorrências
npx vitest run shared/__tests__/quality-gate*        # 100% pass
npx vitest run shared/integration/quality-gate*      # 100% pass
```

**Commit:** `refactor(quality-gate): enforce DataHub as mandatory — flaky, suiteSpeed, remove loadMetricsStore`

---

#### Tarefa 2.3 — Update quality-gate callers

**GREEN:**

- Verificar que todos os callers já passam DataHub (pr-report-core, interactive-mode, schedule-handler)
- Se algum não passa, atualizar

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/                               # 100% pass
```

**Commit:** `refactor(quality-gate): verify all callers pass DataHub`

---

### FASE 3 — pr-report-core.ts SSOT (4 tarefas)

---

#### Tarefa 3.1 — RED: Tests that expose pr-report-core bypasses

**Preparação:**

```bash
grep -n "readIstanbulCoverage\|parseTestResultsFile\|isQuarantined\|store\.runs\|calcMetricsTrends" shared/pr-report-core.ts
# Mapear: L389 (istanbul), L728 (ctrf), L190/200 (quarantine), L184/403/416/761 (store.runs)
```

**RED:**

```bash
# Criar test que FALHA:
# it('uses dataHub.computed.quarantineStatus instead of isQuarantined()', () => {
#   const dataHub = createTestHub({ computed: { quarantineStatus: { flakyCount: 3, quarantinedCount: 1 } } });
#   const result = await generatePrReport({ dataHub, ... });
#   expect(result.flakySection).toContain('1');
# });
# Esperado: FALHA — pr-report-core ainda chama isQuarantined() diretamente
```

**Commit:** `test(pr-report-core): add failing tests that expose DataHub bypasses (RED phase)`

---

#### Tarefa 3.2 — GREEN: Migrate pr-report-core.ts to DataHub

**GREEN:**

- `resolveCoverageForReport()` (L389): remover `readIstanbulCoverage()` fallback → usar `dataHub.computed.coverage`
- `buildFlakySection()` (L180): adicionar `dataHub?: DataHub` parâmetro → usar `dataHub.computed.flakinessEntries`
- `isQuarantined()` (L190, 200): substituir por `dataHub.computed.quarantineStatus`
- `store.runs` (L184, 403, 416, 761): substituir por `dataHub.computed.metricsRuns` ou `dataHub.raw.runs`
- `parseTestResultsFile()` (L728): substituir por `dataHub.raw.parsedArtifacts`
- `calcMetricsTrends(store.runs)` (L416): substituir por `dataHub.computed.metricsTrends`
- `generatePrReport()` (L472): tornar `dataHub` obrigatório

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "readIstanbulCoverage" shared/pr-report-core.ts   # 0 ocorrências
rg "parseTestResultsFile" shared/pr-report-core.ts   # 0 ocorrências
rg "isQuarantined" shared/pr-report-core.ts          # 0 ocorrências
rg "store\.runs" shared/pr-report-core.ts            # 0 ocorrências
npx vitest run shared/__tests__/pr-report-core*       # 100% pass
npx vitest run shared/__tests__/pr-report.test.ts     # 100% pass
```

**Commit:** `refactor(pr-report-core): enforce DataHub as mandatory — coverage, flaky, quarantine, trends`

---

#### Tarefa 3.3 — Error Handling: pr-report-core.ts

**GREEN:**

- Substituir `String(err)` por `extractErrorMessage(err)` em catch blocks
- Adicionar `humanizeError` com contexto `pr-report-core`
- Substituir `_getErrorMessage` por `formatErr` se existir

**Checkpoint:**

```bash
rg "extractErrorMessage" shared/pr-report-core.ts    # >= 1 ocorrência
rg "humanizeError" shared/pr-report-core.ts           # >= 1 ocorrência
rg "String(err)" shared/pr-report-core.ts             # 0 ocorrências
npx vitest run shared/__tests__/pr-report-core*        # 100% pass
```

**Commit:** `fix(pr-report-core): add proper error handling with humanizeError`

---

#### Tarefa 3.4 — PBT: pr-report-core invariants

**GREEN:**

- Criar `shared/__tests__/pr-report-core.property.test.ts` se não existe
- Propriedades: passRate ∈ [0,100], coverage ∈ [0,100], flakyRate ∈ [0,100]
- `expect.hasAssertions()` no topo

**Checkpoint:**

```bash
npx vitest run shared/__tests__/pr-report-core.property.test.ts --reporter=verbose
# Esperado: todos passam
```

**Commit:** `test(pr-report-core): add property-based tests for SSOT invariants`

---

### FASE 4 — Jira Command Handlers (6 tarefas)

---

#### Tarefa 4.1 — case12: Migrate to DataHub

**Preparação:**

```bash
grep -n "loadMetricsStore\|store\.runs\|store\.coverageHistory" jira_management/commands/case12.ts
```

**RED:**

```bash
# Criar test que FALHA:
# it('uses c.dataHub.computed.coverage instead of store.coverageHistory', () => {
#   const ctx = createMockContext({ dataHub: createTestHub({ computed: { coverage: 75 } }) });
#   await handler(ctx);
#   expect(ctx.print).toHaveBeenCalledWith(expect.stringContaining('75'));
# });
# Esperado: FALHA — case12 ainda lê store.coverageHistory
```

**GREEN:**

- Substituir `persistence.loadMetricsStore()` → `c.dataHub.computed.*`
- Substituir `store.runs` → `c.dataHub.computed.metricsRuns`
- Substituir `store.coverageHistory` → `c.dataHub.computed.coverage`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" jira_management/commands/case12.ts  # 0
npx vitest run jira_management/commands/case12.test.ts     # 100% pass
```

**Commit:** `refactor(case12): migrate to DataHub — coverage, metricsRuns`

---

#### Tarefa 4.2 — case17: Migrate to DataHub

**GREEN:**

- Substituir `store.runs` (L158, 218) → `c.dataHub.computed.metricsRuns`
- Substituir `resolveTestDataSource()` chamada → usar `c.dataHub.raw.parsedArtifacts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" jira_management/commands/case17.ts  # 0
npx vitest run jira_management/commands/case17.test.ts     # 100% pass
```

**Commit:** `refactor(case17): migrate to DataHub — metricsRuns, parsedArtifacts`

---

#### Tarefa 4.3 — case19: Migrate to DataHub + fix local calculation

**GREEN:**

- Substituir `(r.passed / (r.passed + r.failed)) * 100` (L21) → `calcRunPassRate(r)`
- Substituir `store.runs` (L14-68, 100) → `c.dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "passed /.*passed.*failed.*100" jira_management/commands/case19.ts  # 0
rg "loadMetricsStore" jira_management/commands/case19.ts              # 0
npx vitest run jira_management/commands/case19.test.ts                 # 100% pass
```

**Commit:** `refactor(case19): migrate to DataHub — replace local passRate calc with calcRunPassRate`

---

#### Tarefa 4.4 — case21 + case22 + case26: Migrate to DataHub

**GREEN:**

- case21: substituir `store.coverageHistory` → `c.dataHub.computed.coverage`
- case22: substituir `store.runs` → `c.dataHub.computed.flakinessEntries`
- case26: substituir `store.runs` → `c.dataHub.computed.metricsRuns` + passar `dataHub` para `calculateHealthScore`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" jira_management/commands/case21.ts  # 0
rg "loadMetricsStore" jira_management/commands/case22.ts  # 0
rg "loadMetricsStore" jira_management/commands/case26.ts  # 0
npx vitest run jira_management/commands/case21.test.ts     # 100% pass
npx vitest run jira_management/commands/case22.test.ts     # 100% pass
npx vitest run jira_management/commands/case26.test.ts     # 100% pass
```

**Commit:** `refactor(case21,case22,case26): migrate to DataHub — coverage, flaky, metricsRuns`

---

#### Tarefa 4.5 — BadTesting: Fix theater tests in case commands

**GREEN:**

- `jira_management/create_tests.test.ts` (L671, 687, 702, 719, 836): substituir `toBeDefined()` por assertions de comportamento
- `jira_management/import-orchestrator.test.ts` (L189): substituir
- `jira_management/import-prep.test.ts` (L199): substituir

**Checkpoint:**

```bash
rg "expect.*toBeDefined\(\)" jira_management/create_tests.test.ts  # 0 resultados solitários
npx vitest run jira_management/                                      # 100% pass
```

**Commit:** `test(jira): replace theater tests (toBeDefined-only) with behavioral assertions`

---

#### Tarefa 4.6 — Error Handling: Jira commands

**GREEN:**

- Substituir error handling pattern por `formatErr(err)` em todos os case handlers
- Adicionar `extractErrorMessage` + `humanizeError` em catch blocks

**Checkpoint:**

```bash
rg "formatErr" jira_management/commands/  # >= 1
rg "extractErrorMessage" jira_management/commands/                # >= 1
npx vitest run jira_management/                                    # 100% pass
```

**Commit:** `fix(jira-commands): standardize error handling with extractErrorMessage + humanizeError`

---

### FASE 5 — git_triggers Consumers (5 tarefas)

---

#### Tarefa 5.1 — interactive-mode.ts: Migrate store.runs

**GREEN:**

- L258-259: `loadMetricsStore()` → `dataHub.raw.runs`
- L347-349: `loadMetricsStore()` → `dataHub.raw.runs` + `dataHub.computed.*`
- L442-444: `loadMetricsStore()` → `dataHub.computed.metricsRuns`
- L854-856: `loadMetricsStore()` → `dataHub.computed.metricsRuns`
- Substituir `_getErrorMessage` (L870-879) por `formatErr` de `shared/errors.ts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/interactive-mode.ts  # 0
rg "_getErrorMessage" git_triggers/interactive-mode.ts  # 0
npx vitest run git_triggers/interactive-mode.test.ts     # 100% pass
```

**Commit:** `refactor(interactive-mode): migrate to DataHub — store.runs, error handling`

---

#### Tarefa 5.2 — schedule-handler.ts: Migrate store.runs

**GREEN:**

- L158-160: `loadMetricsStore()` → `dataHub.raw.runs` + `dataHub.computed.*`
- L210: `store.runs` → `dataHub.raw.runs`
- L255: `calculatePipelineCost(runs)` → passar `dataHub`
- L308-309: `loadMetricsStore()` → `dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/schedule-handler.ts  # 0
rg "store\.runs" git_triggers/schedule-handler.ts       # 0
npx vitest run git_triggers/schedule-handler.test.ts     # 100% pass
```

**Commit:** `refactor(schedule-handler): migrate to DataHub — store.runs, pipelineCost`

---

#### Tarefa 5.3 — batch-mode.ts: Migrate store.runs

**GREEN:**

- L212-213: `loadMetricsStore()` → `dataHub.raw.runs`
- L355-356: `loadMetricsStore()` → `dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/batch-mode.ts     # 0
npx vitest run git_triggers/batch-mode.test.ts        # 100% pass
```

**Commit:** `refactor(batch-mode): migrate to DataHub — store.runs`

---

#### Tarefa 5.4 — pipeline-jira.ts + session-context.ts: Migrate

**GREEN:**

- `pipeline-jira.ts` L22-30: `store.failureClassifications` → `dataHub.computed.*`
- `session-context.ts` L117-178: substituir `Store` class por `DataHubPersistence`
- `session-context.ts` L202: `fetchLatestTestRun()` → `dataHub.raw.parsedArtifacts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" git_triggers/pipeline-jira.ts   # 0
rg "new Store" shared/session-context.ts              # 0
npx vitest run shared/session-context.test.ts          # 100% pass
```

**Commit:** `refactor(pipeline-jira,session-context): migrate to DataHub — failureClassifications, parsedArtifacts`

---

#### Tarefa 5.5 — Error Handling: git_triggers

**GREEN:**

- `github-workflow.ts:330`: bare `catch { return null; }` → adicionar `rootLogger.warn(extractErrorMessage(err))`
- `gitlab-workflow.ts:210`: bare `catch { return null; }` → adicionar `rootLogger.warn(extractErrorMessage(err))`
- `github-provider.ts`: substituir `String(err)` por `extractErrorMessage(err)` em 5 catch blocks
- `gitlab-provider.ts`: substituir `String(err)` por `extractErrorMessage(err)` em 5 catch blocks
- `coverage-provider.ts:72`: substituir `String(err)` por `extractErrorMessage(err)`
- Atualizar `git-provider-error.ts`: `handleError()` → usar `extractErrorMessage` + `humanizeError`

**Checkpoint:**

```bash
rg "bare catch.*return null" git_triggers/            # 0
rg "String(err)" shared/data-hub/providers/           # 0
rg "extractErrorMessage" shared/data-hub/providers/   # >= 5
rg "humanizeError" git-provider-error.ts              # >= 1
npx vitest run git_triggers/                           # 100% pass
```

**Commit:** `fix(error-handling): eliminate silent errors in git_triggers and data-hub providers`

---

### FASE 6 — Shared Consumers Restantes (3 tarefas)

---

#### Tarefa 6.1 — cli_base.ts + coverage-gap.ts: Migrate

**GREEN:**

- `cli_base.ts:218`: criar DataHub e passar para `calculateHealthScore`
- `coverage-gap.ts:104`: substituir `store.coverageHistory` por `dataHub.computed.coverage`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "store\.coverageHistory" shared/coverage-gap.ts   # 0
npx vitest run shared/cli_base.test.ts               # 100% pass
npx vitest run shared/coverage-gap.test.ts            # 100% pass
```

**Commit:** `refactor(cli_base,coverage-gap): migrate to DataHub — coverage, healthScore`

---

#### Tarefa 6.2 — traceability-matrix.ts + smoke-pipeline.ts: Migrate

**GREEN:**

- `traceability-matrix.ts:52,54,79`: garantir que `metrics.runs` é `dataHub.computed.*`
- `e2e/smoke-pipeline.ts:111`: substituir `metrics.runs` por `dataHub.computed.metricsRuns`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/traceability-matrix.test.ts    # 100% pass
npx vitest run e2e/smoke-pipeline.test.ts            # 100% pass
```

**Commit:** `refactor(traceability-matrix,smoke-pipeline): migrate to DataHub`

---

#### Tarefa 6.3 — humanizeError: Add missing patterns (padrões 10-17)

**GREEN:**

- `shared/prompt-errors.ts`: adicionar padrões 10-17 (GitHub API, artifacts, XML, coverage)
- Verificar que `humanizeError` retorna msg+hint para cada novo padrão

**Checkpoint:**

```bash
grep -c "case\|/" shared/prompt-errors.ts            # >= 17 padrões
npx vitest run shared/__tests__/prompt-errors*         # 100% pass
```

**Commit:** `feat(prompt-errors): add 8 new error patterns for CI/GitHub/GitLab coverage`

---

### FASE 7 — Auditoria Pós-Migração (1 tarefa)

---

#### Tarefa 7.1 — Full Verification Audit

**Verificações:**

```bash
# A. Nenhum loadMetricsStore em produção (fora data-hub/)
rg "loadMetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# B. Nenhum readIstanbulCoverage em produção
rg "readIstanbulCoverage" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
# Esperado: 0 resultados

# C. Nenhum parseTestResultsFile em produção (fora data-hub/)
rg "parseTestResultsFile" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# D. Nenhum isQuarantined em produção (fora quarantine.ts)
rg "isQuarantined" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/quarantine.ts'
# Esperado: 0 resultados

# E. Nenhum import de store.ts em produção (fora data-hub/)
rg "from.*shared/store" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# F. Nenhum store.runs em produção (fora data-hub/)
rg "store\.runs" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
# Esperado: 0 resultados

# G. DataHub é obrigatório em health-score, quality-gate, pr-report-core
rg "dataHub\?: DataHub" shared/health-score.ts shared/quality-gate.ts shared/pr-report-core.ts
# Esperado: 0 resultados

# H. Type safety
npx tsc --noEmit
rg --pcre2 "as\s+any" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
rg "@ts-ignore|@ts-expect-error" --include="*.ts" -g '!__tests__' -g '!*.test.ts'

# I. Error handling
rg "bare catch.*return null" shared/ git_triggers/ jira_management/ --include="*.ts" -g '!test*'
rg "String(err)" shared/data-hub/providers/ --include="*.ts"

# J. Full suite
npx vitest run --reporter=verbose | tail -10
npx eslint . --max-warnings=0
```

**Checkpoint:** TODOS os comandos acima passam.

**Commit:** `audit(ssot): post-migration verification — zero bypasses confirmed`

---

### FASE 8 — Deletar Fontes Alternativas (2 tarefas)

---

#### Tarefa 8.1 — Delete alternative modules

**Preparação (OBRIGATÓRIA — executar ANTES de deletar):**

```bash
# Verificar que Fase 7 passou — executar os comandos de verificação da Fase 7 manualmente

# CRÍTICO: Verificar que NENHUM consumidor ainda importa os módulos a deletar
rg "ci-test-downloader|coverage-source|commit-log" --include="*.ts" \
  -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' -g '!docs' -g '!plans'
# Esperado: 0 resultados
# Se retornar resultados: PARAR. Migrar consumidores antes de deletar.
```

**GREEN:**

- Deletar `shared/ci-test-downloader.ts` + `shared/ci-test-downloader.test.ts`
- Deletar `shared/coverage-source.ts` + `shared/coverage-source.test.ts` + `shared/coverage-source.property.test.ts` + `shared/integration/coverage-source.integration.test.ts`
- Deletar `shared/commit-log.ts` + `shared/commit-log.test.ts`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run --reporter=verbose | tail -10         # 100% pass
rg "ci-test-downloader\|coverage-source\|commit-log" --include="*.ts" -g '!docs' -g '!plans'  # 0
```

**Commit:** `refactor(data-hub): delete alternative data sources (ci-test-downloader, coverage-source, commit-log)`

---

#### Tarefa 8.2 — Remove loadMetricsStore from public interface + ESLint

**GREEN:**

- `shared/types/data-hub.ts`: remover `loadMetricsStore()` e `saveMetricsStore()` da interface `DataHubPersistence`
- `shared/data-hub/persistence.ts`: manter implementação como privada
- Criar métodos públicos: `getRuns()`, `getCoverageHistory()`, `getFailureClassifications()`
- Adicionar ESLint `no-restricted-imports` para bloquear imports de módulos deletados

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" shared/types/data-hub.ts      # 0 (removido da interface)
npx eslint . --max-warnings=0                        # 0 violações
npx vitest run --reporter=verbose | tail -10         # 100% pass
```

**Commit:** `refactor(data-hub): remove loadMetricsStore from public interface + add ESLint enforcement`

---

### FASE 9 — Pegar Consumidores Silenciosos (1 tarefa variável)

---

#### Tarefa 9.1 — Fix silent consumers revealed by deletion

**Preparação:**

```bash
npx tsc --noEmit 2>&1 | rg "Cannot find module"
npx vitest run 2>&1 | rg "FAIL"
```

**GREEN:**

- Para cada erro: mapear arquivo → criar DataHub → migrar
- Repetir até 0 erros

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run --reporter=verbose | tail -10         # 100% pass
```

**Commit:** `fix(data-hub): migrate silent consumers revealed by source deletion`

---

### FASE 10 — Prevenção Final (2 tarefas)

---

#### Tarefa 10.1 — ESLint: Block loadMetricsStore externally

**GREEN:**

- Adicionar `no-restricted-syntax` rule para bloquear `loadMetricsStore` fora de `shared/data-hub/`

**Checkpoint:**

```bash
npx eslint . --max-warnings=0                        # 0 violações
```

**Commit:** `feat(eslint): add SSOT enforcement rule — block loadMetricsStore externally`

---

#### Tarefa 10.2 — Update TECHDOC.md + Final Verification

**GREEN:**

- Atualizar `docs/TECHDOC.md` com DataHub como SSOT obrigatório
- Documentar que nenhum módulo fora de `data-hub/` pode acessar MetricsStore/Store

**Checkpoint Final:**

```bash
echo "=== VERIFICAÇÃO FINAL SSOT ==="
echo "1. Compilação:" && npx tsc --noEmit && echo "   ✅"
echo "2. Lint:" && npx eslint . --max-warnings=0 && echo "   ✅"
echo "3. Testes:" && npx vitest run && echo "   ✅"
echo "4. Cobertura:" && npx vitest run --coverage && echo "   ✅"
echo "5. Nenhum loadMetricsStore fora do data-hub:" && \
  rg "loadMetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' | wc -l
echo "6. Nenhum store.runs fora do data-hub:" && \
  rg "store\.runs" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' | wc -l
```

**Commit:** `docs(techdoc): update SSOT architecture — DataHub as mandatory single source of truth`

---

## COMPLETE BYPASS INVENTORY

### Categoria A — DataHub.computed Available but Ignored (5 itens)

| ID  | Arquivo                    | Linha            | Campo DataHub Ignorado           | Fonte Atual                                    | Prioridade |
| --- | -------------------------- | ---------------- | -------------------------------- | ---------------------------------------------- | ---------- |
| A1  | `shared/health-score.ts`   | 200-208          | `dataHub.computed.coverage`      | `store.coverageHistory`                        | CRÍTICO    |
| A2  | `shared/health-score.ts`   | 179-181          | `dataHub.computed.executionRate` | `_computeExpWeighted()` local                  | CRÍTICO    |
| A3  | `shared/health-score.ts`   | 177              | `dataHub.computed.flakyTestRate` | `calculateFlakyTestRate(runs)` em MetricsStore | HIGH       |
| A4  | `shared/quality-gate.ts`   | via health-score | `coverage` (herdado)             | MetricsStore via health-score                  | CRÍTICO    |
| A5  | `shared/pr-report-core.ts` | 416              | `dataHub.computed.metricsTrends` | `calcMetricsTrends(store.runs)`                | HIGH       |

### Categoria B — Direct Filesystem Reads (5 itens)

| ID  | Arquivo                     | Linha    | Arquivo Lido                                            | DataHub Tem?                      | Prioridade |
| --- | --------------------------- | -------- | ------------------------------------------------------- | --------------------------------- | ---------- |
| B1  | `shared/coverage-source.ts` | 50, 53   | `coverage/coverage-summary.json`                        | SIM — `raw.coverage`              | MÉDIO      |
| B2  | `shared/pr-report-core.ts`  | 389      | Istanbul `readIstanbulCoverage()`                       | SIM — `raw.coverage`              | MÉDIO      |
| B3  | `shared/pr-report-core.ts`  | 728      | `reports/ctrf-report.json` via `parseTestResultsFile()` | SIM — parsed artifacts            | HIGH       |
| B4  | `shared/pr-report-core.ts`  | 190, 200 | `quarantine.json` via `isQuarantined()`                 | SIM — `computed.quarantineStatus` | MÉDIO      |
| B5  | `shared/session-context.ts` | 117-178  | `Store` class inteira (SHA cache, branch baseline)      | SIM — persistence layer           | CRÍTICO    |

### Categoria C — Direct CI API Calls Outside DataHub (3 itens)

| ID  | Arquivo                        | Linha  | API                                                          | DataHub Provider Faz Mesmo?                     | Prioridade |
| --- | ------------------------------ | ------ | ------------------------------------------------------------ | ----------------------------------------------- | ---------- |
| C1  | `shared/ci-test-downloader.ts` | 62-125 | GitHub/GitLab artifact download                              | SIM — `GitHubDataProvider`/`GitLabDataProvider` | CRÍTICO    |
| C2  | `git_triggers/test-results.ts` | 36-72  | `GitProvider.listPipelineArtifacts()` + `downloadArtifact()` | SIM — DataHub providers                         | HIGH       |
| C3  | `shared/commit-log.ts`         | 61-90  | GitHub/GitLab CI runs API                                    | SIM — `raw.runs[].head_commit`                  | MÉDIO      |

### Categoria D — MetricsStore Direct Access (18 sites em 12 arquivos)

| ID  | Arquivo                              | Linha                  | Dados Acessados                              | DataHub Tem? |
| --- | ------------------------------------ | ---------------------- | -------------------------------------------- | ------------ |
| D1  | `shared/cli_base.ts`                 | 218-219                | `store.runs`                                 | SIM          |
| D2  | `shared/coverage-gap.ts`             | 104-106                | `store.coverageHistory`                      | SIM          |
| D3  | `git_triggers/interactive-mode.ts`   | 258, 347-349, 442, 854 | `store.runs`, `store.failureClassifications` | SIM          |
| D4  | `git_triggers/schedule-handler.ts`   | 158-160, 210, 308-309  | `store.runs`, `store.failureClassifications` | SIM          |
| D5  | `git_triggers/batch-mode.ts`         | 212-213, 355-356       | `store.runs`                                 | SIM          |
| D6  | `git_triggers/pipeline-jira.ts`      | 22-30                  | `store.failureClassifications`               | SIM          |
| D7  | `jira_management/main.ts`            | 99-100, 343            | `store.coverageHistory`                      | SIM          |
| D8  | `jira_management/commands/case12.ts` | 86-88                  | `store.runs`, `store.coverageHistory`        | SIM          |
| D9  | `jira_management/commands/case17.ts` | 158-159, 218-219       | `store.runs`                                 | SIM          |
| D10 | `jira_management/commands/case19.ts` | 14-68, 100-101         | `store.runs` (todas as funções)              | SIM          |
| D11 | `jira_management/commands/case21.ts` | 43-44                  | `store.coverageHistory`                      | SIM          |
| D12 | `jira_management/commands/case22.ts` | 62-63                  | `store.runs`                                 | SIM          |
| D13 | `jira_management/commands/case26.ts` | 20-21                  | `store.runs`                                 | SIM          |
| D14 | `e2e/smoke-pipeline.ts`              | 111-113                | `metrics.runs`                               | SIM          |

### Categoria E — Arquivados Nunca Tocados pelo Phase 22 (3 itens)

| ID  | Arquivo                        | Commits Phase 22 | Status                             |
| --- | ------------------------------ | ---------------- | ---------------------------------- |
| E1  | `shared/ci-test-downloader.ts` | 0                | CI API direta — nunca migrado      |
| E2  | `shared/coverage-source.ts`    | 0                | Istanbul file read — nunca migrado |
| E3  | `shared/store.ts`              | 0                | Legacy persistence — nunca migrado |

### Categoria F — Dead Code / Compilation Errors (2 itens)

| ID  | Arquivo                                              | Linha | Problema                                                     | Prioridade |
| --- | ---------------------------------------------------- | ----- | ------------------------------------------------------------ | ---------- |
| F1  | `jira_management/commands/case17-test-utils.ts`      | 10    | TS2307: re-export de `git-artifact-downloader.ts` (deletado) | BLOCKER    |
| F2  | `shared/data-hub/extractors/test-count-extractor.ts` | todo  | Dead code — lógica duplicada em `hub.ts:338`                 | LOW        |

### Categoria G — Local Metric Computations Outside DataHub (1 item real)

| ID  | Arquivo                              | Linha | Calcula                                    | Bypass?                           |
| --- | ------------------------------------ | ----- | ------------------------------------------ | --------------------------------- |
| G1  | `jira_management/commands/case19.ts` | 21    | `(r.passed / (r.passed + r.failed)) * 100` | SIM — deve usar `calcRunPassRate` |

### Falsos Positivos (domínios diferentes — não são bypass)

| ID  | Arquivo                        | Linha | Calcula                         | Por que NÃO é bypass                      |
| --- | ------------------------------ | ----- | ------------------------------- | ----------------------------------------- |
| FP1 | `shared/coverage-gap-utils.ts` | 95    | `(covered / totalIssues) * 100` | Cobertura de issues Jira, não CI pipeline |
| FP2 | `shared/llm-benchmark.ts`      | 274   | `passCount / total`             | Avaliação de LLM, não pipeline de teste   |

---

## EXHAUSTIVE CONSUMER MATRIX

### health-score.ts — Consumer Map

| Caller                              | Arquivo               | Linha                   | Passa DataHub?    | Precisa Atualizar?     |
| ----------------------------------- | --------------------- | ----------------------- | ----------------- | ---------------------- |
| `calculateHealthScore(store, opts)` | `quality-gate.ts`     | 196                     | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store, opts)` | `pr-report-core.ts`   | 487                     | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store)`       | `cli_base.ts`         | 220                     | **NÃO**           | SIM                    |
| `calculateHealthScore(store, opts)` | `schedule-handler.ts` | 174, 213                | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store, opts)` | `interactive-mode.ts` | 378, 446, 496, 538, 856 | Sim (conditional) | Se DataHub obrigatório |
| `calculateHealthScore(store)`       | `main.ts`             | 344                     | **NÃO**           | SIM                    |
| `calculateHealthScore(store)`       | `case26.ts`           | 23                      | **NÃO**           | SIM                    |
| `calculateHealthScore(store)`       | `case19.ts`           | 70                      | **NÃO**           | SIM                    |

### quality-gate.ts — Consumer Map

| Caller                 | Arquivo               | Linha | Passa DataHub?    | Precisa Atualizar?     |
| ---------------------- | --------------------- | ----- | ----------------- | ---------------------- |
| `runQualityGate(opts)` | `pr-report-core.ts`   | 349   | Sim               | Se DataHub obrigatório |
| `runQualityGate(opts)` | `interactive-mode.ts` | 586   | Sim (conditional) | Se DataHub obrigatório |
| `runQualityGate(opts)` | `schedule-handler.ts` | 260   | Sim (conditional) | Se DataHub obrigatório |

### pr-report-core.ts — Consumer Map

| Caller                   | Arquivo                  | Linha | Passa DataHub?               | Precisa Atualizar?     |
| ------------------------ | ------------------------ | ----- | ---------------------------- | ---------------------- |
| `generatePrReport(opts)` | `pr-report-core.ts` main | 766   | Sim (via `tryCreateDataHub`) | Se DataHub obrigatório |
| `generatePrReport(opts)` | `batch-mode.ts`          | 113   | Sim (via param)              | Se DataHub obrigatório |

### session-context.ts — Consumer Map

| Caller                    | Arquivo                        | Linha | Precisa Atualizar?    |
| ------------------------- | ------------------------------ | ----- | --------------------- |
| `resolveTestDataSource()` | `case17.ts`                    | 339   | SIM (assinatura muda) |
| `resolveTestDataSource()` | `case15.ts`                    | 34    | SIM (assinatura muda) |
| `SessionContext` type     | `command-context.ts`           | 1     | SIM (assinatura muda) |
| `SessionContext` type     | `ui-helpers.ts`                | 10    | Tipo-only             |
| `SessionContext` type     | `session-state.ts`             | 7     | Tipo-only             |
| `SessionContext` type     | `handlers.test.ts`             | 37    | Teste                 |
| `SessionContext` type     | `_min-test.test.ts`            | 24    | Teste                 |
| `SessionContext` type     | `handlers-happy-paths.test.ts` | 47    | Teste                 |

### Jira Command Handlers — Consumer Map

| Case | Arquivo             | Bypass                                | DataHub no Context?              | Precisa Atualizar? |
| ---- | ------------------- | ------------------------------------- | -------------------------------- | ------------------ |
| 12   | `case12.ts:86`      | `store.runs`, `store.coverageHistory` | Não (CommandContext sem dataHub) | SIM                |
| 17   | `case17.ts:158,218` | `store.runs`                          | Não                              | SIM                |
| 19   | `case19.ts:100`     | `store.runs` + cálculo local          | Não                              | SIM                |
| 21   | `case21.ts:43`      | `store.coverageHistory`               | Não                              | SIM                |
| 22   | `case22.ts:62`      | `store.runs`                          | Não                              | SIM                |
| 26   | `case26.ts:20`      | `store.runs`                          | Não                              | SIM                |

---

## MIGRATION PLAN

### Fase 0 — Foundation (1 dia)

**Objetivo:** Desbloquear a migração — fixar TS2307, adicionar DataHub ao CommandContext.

#### 0.1 — Fix TS2307 Blocker

| Item  | Ação                                              | Arquivo                | Linha |
| ----- | ------------------------------------------------- | ---------------------- | ----- |
| 0.1.1 | Remover re-export de `git-artifact-downloader.ts` | `case17-test-utils.ts` | 10    |

`export { fetchGitHistory } from '../../shared/git-artifact-downloader.js'` — deletar linha. Nenhum consumidor importa `fetchGitHistory` deste módulo.

#### 0.2 — Dead Code Cleanup

| Item  | Ação                            | Arquivo                                                             |
| ----- | ------------------------------- | ------------------------------------------------------------------- |
| 0.2.1 | Deletar extractor nunca chamado | `shared/data-hub/extractors/test-count-extractor.ts`                |
| 0.2.2 | Deletar teste órfão             | `shared/data-hub/__tests__/extractors/test-count-extractor.test.ts` |

#### 0.3 — Add DataHub to CommandContext

| Item  | Ação                                                             | Arquivo                           |
| ----- | ---------------------------------------------------------------- | --------------------------------- |
| 0.3.1 | Adicionar `dataHub?: DataHub`                                    | `shared/types/command-context.ts` |
| 0.3.2 | Atualizar `jira_management/main.ts` para criar DataHub e injetar | `jira_management/main.ts`         |

**Checkpoint Fase 0:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "git-artifact-downloader" --include="*.ts" -g '!__mocks__'  # Só em mocks
rg "test-count-extractor" --include="*.ts"           # Só em plano/docs
npx vitest run --reporter=verbose                    # 100% pass
```

---

### Fase 0.5 — DataHub Core: loadFromStore (0.5 dia)

**Objetivo:** DataHub pode ser criado a partir de dados persistidos, sem provedores CI.

#### 0.5.1 — Adicionar factory method `loadFromStore()`

| Item  | Ação                                                       | Arquivo                                 |
| ----- | ---------------------------------------------------------- | --------------------------------------- |
| 0.5.1 | Adicionar `static loadFromStore()` ao `DataHubImpl`        | `shared/data-hub/hub.ts`                |
| 0.5.2 | Implementar conversão `MetricsRun[]` → `PipelineRun[]`     | `shared/data-hub/hub.ts`                |
| 0.5.3 | Implementar conversão `CoverageSnapshot[]` → `RawCoverage` | `shared/data-hub/hub.ts`                |
| 0.5.4 | Criar teste unitário para `loadFromStore`                  | `shared/data-hub/__tests__/hub.test.ts` |

---

### Fase 0.6 — DataHub Core: Persistência Interna (0.5 dia)

**Objetivo:** DataHub salva e recupera dados internamente. Consumidores não acessam `hub.persistence` diretamente.

#### 0.6.1 — Adicionar métodos de persistência ao DataHub

| Item  | Ação                                                  | Arquivo                                 |
| ----- | ----------------------------------------------------- | --------------------------------------- |
| 0.6.1 | Adicionar `save()`, `saveRun()`, `flush()` ao DataHub | `shared/data-hub/hub.ts`                |
| 0.6.2 | Cada método delega para `this.persistence`            | `shared/data-hub/hub.ts`                |
| 0.6.3 | Criar testes para métodos de persistência             | `shared/data-hub/__tests__/hub.test.ts` |

---

### Fase 0.7 — DataHub Global: Acessibilidade (0.5 dia)

**Objetivo:** Qualquer caller pode obter um DataHub, não só `git_triggers`.

#### 0.7.1 — Criar `shared/data-hub/global-hub.ts`

| Item  | Ação                                                        | Arquivo                                        |
| ----- | ----------------------------------------------------------- | ---------------------------------------------- |
| 0.7.1 | Criar `getDataHub()`, `setDataHub()`, `ensureDataHub()`     | `shared/data-hub/global-hub.ts`                |
| 0.7.2 | Migrar `session-state.ts` para delegar para `global-hub.ts` | `git_triggers/session-state.ts`                |
| 0.7.3 | Criar testes para `global-hub.ts`                           | `shared/data-hub/__tests__/global-hub.test.ts` |

---

### Fase 0.8 — DataHub Core: Obrigar Persistence (0.5 dia)

**Objetivo:** DataHub SEMPRE tem persistência. Sem `persistence?: DataHubPersistence | undefined`.

#### 0.8.1 — Tornar persistence obrigatório

| Item  | Ação                                                            | Arquivo                    |
| ----- | --------------------------------------------------------------- | -------------------------- |
| 0.8.1 | `DataHubImpl` constructor: `persistence` obrigatório            | `shared/data-hub/hub.ts`   |
| 0.8.1 | `DataHubImpl.create()`: persistence obrigatório                 | `shared/data-hub/hub.ts`   |
| 0.8.2 | Interface `DataHub`: `readonly persistence: DataHubPersistence` | `shared/types/data-hub.ts` |
| 0.8.3 | Corrigir call sites que não passam persistence                  | Vários arquivos            |

---

### Fase 1 — health-score.ts SSOT Enforcement (1-2 dias)

**Objetivo:** Todas as 5 dimensões do health score lêem de `dataHub.computed.*`. DataHub é obrigatório.

#### 1.1 — RED: Tests that expose health-score bypasses

**Objetivo:** Criar testes que FALHAM expondo os 3 bypasses em health-score.ts.

**Preparação:**

```bash
cat shared/health-score.ts | grep -n "store\.\|coverageHistory\|_computeExpWeighted\|calculateFlakyTestRate"
# Mapear: L177 (flaky), L179-181 (executionRate), L200-208 (coverage)
```

**RED:**

```bash
# Criar testes que FALHAM: shared/__tests__/health-score.test.ts
# 3 testes novos no bloco "DataHub SSOT enforcement":
# - coverage: store.coverageHistory vs dataHub.computed.coverage
# - executionRate: _computeExpWeighted vs dataHub.computed.executionRate
# - flakyPercentage: _computeFlakyRate vs dataHub.computed.flakyPercentage
# Cada teste deve:
#   1. Criar hub com valor DIFERENTE da store
#   2. Chamar calculateHealthScore(store, { dataHub: hub })
#   3. Asserir que o score reflete o valor do hub, NÃO da store
```

**Checkpoint:**

```bash
npx vitest run shared/__tests__/health-score.test.ts -t "DataHub SSOT" --reporter=verbose 2>&1 | grep "FAIL"
# Esperado: 3 testes FALHAM (expondo os bypasses)
```

**Commit:** `test(health-score): add failing tests that expose DataHub bypasses (RED phase)`

---

#### 1.2 — GREEN: Migrate health-score.ts to DataHub

**Objetivo:** Fazer os 3 testes RED passarem. DataHub incondicional — sem `hasCiRuns`.

**GREEN:**

- Remover `hasCiRuns` de `computeActualMetrics()` (L171)
- Substituir `_resolveCoverage(config, store)` por `dataHub !== undefined ? dataHub.computed.coverage : _resolveCoverage(config, store)` (L183)
- Substituir `_computeExpWeighted(runs, n, ...)` por `dataHub !== undefined ? dataHub.computed.executionRate : _computeExpWeighted(...)` (L179-181)
- Substituir `calculateFlakyTestRate(runs, config.minRuns)` / `_computeFlakyRate(runs, config)` por `dataHub !== undefined ? dataHub.computed.flakyPercentage ?? 0 : _computeFlakyRate(runs, config)` (L177)
- Substituir `calcTestDurationP95(runs)` / `_computeSuiteSpeed(runs)` por `dataHub !== undefined ? dataHub.computed.suiteSpeedP95 : _computeSuiteSpeed(runs)` (L185)
- Atualizar `_resolvePassRate` e `_resolveSuiteSpeed`: remover parâmetro `hasCiRuns`, usar `dataHub !== undefined`
- Remover imports não utilizados: `calcTestDurationP95`, `calculateFlakyTestRate`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/__tests__/health-score.test.ts -t "DataHub SSOT" --reporter=verbose
# Esperado: 3 testes PASSAM (GREEN)
rg "hasCiRuns" shared/health-score.ts               # 0 ocorrências
rg "store\.coverageHistory" shared/health-score.ts   # 0 ocorrências
```

**Commit:** `refactor(health-score): enforce DataHub as unconditional SSOT — coverage, executionRate, flaky, suiteSpeed`

---

#### 1.3 — Atualizar callers de health-score.ts

**Por que ANTES de tornar obrigatório:** Se tornarmos `dataHub` obrigatório antes de migrar callers, `tsc --noEmit` quebra imediatamente. A ordem correta é: migrar callers primeiro, depois tornar obrigatório.

**Caller Map:**

| Caller                                    | Arquivo                              | Passa DataHub? | Ação                                      |
| ----------------------------------------- | ------------------------------------ | -------------- | ----------------------------------------- |
| `cli_base.ts:220`                         | `shared/cli_base.ts`                 | NÃO            | Criar DataHub e passar                    |
| `main.ts:344`                             | `jira_management/main.ts`            | NÃO            | Usar `c.dataHub` (adicionado em Fase 0.3) |
| `case26.ts:23`                            | `jira_management/commands/case26.ts` | NÃO            | Usar `c.dataHub`                          |
| `case19.ts:70`                            | `jira_management/commands/case19.ts` | NÃO            | Usar `c.dataHub`                          |
| `quality-gate.ts:196`                     | `shared/quality-gate.ts`             | Condicional    | Manter condicional por ora — Fase 2 migra |
| `pr-report-core.ts:487`                   | `shared/pr-report-core.ts`           | Condicional    | Manter condicional por ora — Fase 3 migra |
| `schedule-handler.ts:174,213`             | `git_triggers/schedule-handler.ts`   | Condicional    | Manter condicional por ora — Fase 4 migra |
| `interactive-mode.ts:378,446,496,538,856` | `git_triggers/interactive-mode.ts`   | Condicional    | Manter condicional por ora — Fase 4 migra |

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
# Verificar que os 4 callers NÃO-condicionais agora passam DataHub:
grep -A2 "calculateHealthScore" shared/cli_base.ts jira_management/main.ts jira_management/commands/case26.ts jira_management/commands/case19.ts
```

**Commit:** `refactor(callers): migrate 4 non-conditional health-score callers to DataHub`

---

#### 1.4 — Tornar DataHub obrigatório na assinatura

**Dependência:** 1.3 completa (todos os callers NÃO-condicionais migrados).

| Item  | Assinatura Atual                        | Nova Assinatura                                               |
| ----- | --------------------------------------- | ------------------------------------------------------------- |
| 1.4.1 | `calculateHealthScore(store, options?)` | `calculateHealthScore(store, options & { dataHub: DataHub })` |

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "dataHub\?" shared/health-score.ts               # 0 (obrigatório)
```

---

#### 1.5 — Testes

| Item  | Teste                                                           | Ação                                  |
| ----- | --------------------------------------------------------------- | ------------------------------------- |
| 1.5.1 | `shared/__tests__/health-score.test.ts`                         | Atualizar mocks — DataHub obrigatório |
| 1.5.2 | `shared/__tests__/health-score.property.test.ts`                | Atualizar PBT — DataHub obrigatório   |
| 1.5.3 | `shared/__tests__/integration/health-score.integration.test.ts` | Atualizar integration test            |

**Checkpoint Fase 1:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/health-score.test.ts           # 100% pass
npx vitest run shared/__tests__/health-score.property.test.ts  # 100% pass
npx vitest run shared/integration/health-score.integration.test.ts  # 100% pass
rg "store.coverageHistory|store\.runs" shared/health-score.ts  # 0 ocorrências
rg "hasCiRuns" shared/health-score.ts               # 0 ocorrências
```

---

### Fase 2 — quality-gate.ts SSOT Enforcement (0.5 dia)

**Objetivo:** `runQualityGate()` usa `dataHub.computed.*` em vez de recalcular. DataHub obrigatório.

#### 2.1 — Migrar flakyCheck e suiteSpeedCheck

| Item  | Bypass               | Atual                                                             | Mudança                            |
| ----- | -------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| 2.1.1 | `_flakyCheck()`      | `calculateFlakyTestRate(runs, THRESHOLDS.flakyMinRuns)` (L99-115) | `dataHub.computed.flakyTestRate`   |
| 2.1.2 | `_suiteSpeedCheck()` | `calcTestDurationP95(runs)` (L129-154)                            | `dataHub.computed.testDurationP95` |

#### 2.2 — Remover loadMetricsStore() interno

| Item  | Linha   | Ação                                                                              |
| ----- | ------- | --------------------------------------------------------------------------------- |
| 2.2.1 | 177-179 | Remover `createDataHubPersistence().loadMetricsStore()` — usar `dataHub.raw.runs` |

#### 2.3 — Tornar DataHub obrigatório

| Item  | Assinatura Atual           | Nova Assinatura                                  |
| ----- | -------------------------- | ------------------------------------------------ |
| 2.3.1 | `runQualityGate(options?)` | `runQualityGate(options & { dataHub: DataHub })` |

#### 2.4 — Testes

| Item  | Teste                                                 | Ação                       |
| ----- | ----------------------------------------------------- | -------------------------- |
| 2.4.1 | `shared/quality-gate.test.ts`                         | Atualizar mocks            |
| 2.4.2 | `shared/integration/quality-gate.integration.test.ts` | Atualizar integration test |

**Checkpoint Fase 2:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/quality-gate.test.ts           # 100% pass
npx vitest run shared/integration/quality-gate.integration.test.ts  # 100% pass
rg "loadMetricsStore" shared/quality-gate.ts         # 0 ocorrências
```

---

### Fase 3 — pr-report-core.ts SSOT Enforcement (1 dia)

**Objetivo:** `generatePrReport()` usa exclusivamente DataHub. Nenhum fallback para file reads.

#### 3.1 — Migrar 5 bypasses

| Item  | Bypass                       | Linha Atual                           | Mudança                                  |
| ----- | ---------------------------- | ------------------------------------- | ---------------------------------------- |
| 3.1.1 | `resolveCoverageForReport()` | 389 `readIstanbulCoverage()` fallback | Usar `dataHub.computed.coverage`         |
| 3.1.2 | `store.runs` flaky           | 184                                   | Usar `dataHub.computed.metricsRuns`      |
| 3.1.3 | `store.runs` trends          | 416                                   | Usar `dataHub.computed.metricsTrends`    |
| 3.1.4 | `store.runs` HTML            | 761                                   | Usar `dataHub.raw.runs`                  |
| 3.1.5 | `isQuarantined()`            | 190, 200                              | Usar `dataHub.computed.quarantineStatus` |
| 3.1.6 | `parseTestResultsFile()`     | 728                                   | Usar `dataHub.raw.parsedArtifacts`       |

#### 3.2 — buildFlakySection() — adicionar DataHub

| Item  | Assinatura Atual                 | Nova Assinatura                                        |
| ----- | -------------------------------- | ------------------------------------------------------ |
| 3.2.1 | `buildFlakySection()` (0 params) | `buildFlakySection(project: string, dataHub: DataHub)` |

#### 3.3 — Tornar DataHub obrigatório

| Item  | Assinatura Atual             | Nova Assinatura                                    |
| ----- | ---------------------------- | -------------------------------------------------- |
| 3.3.1 | `generatePrReport(options?)` | `generatePrReport(options & { dataHub: DataHub })` |

#### 3.4 — Testes

| Item  | Teste                                                     | Ação      |
| ----- | --------------------------------------------------------- | --------- |
| 3.4.1 | `shared/__tests__/pr-report-core.test.ts`                 | Atualizar |
| 3.4.2 | `shared/__tests__/pr-report-core.property.test.ts`        | Atualizar |
| 3.4.3 | `shared/__tests__/pr-report-core.wiring.property.test.ts` | Atualizar |
| 3.4.4 | `shared/__tests__/pr-report-core.wiring.test.ts`          | Atualizar |
| 3.4.5 | `shared/__tests__/pr-report-core.main.test.ts`            | Atualizar |

**Checkpoint Fase 3:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/__tests__/pr-report-core*       # 100% pass
npx vitest run shared/__tests__/pr-report.test.ts     # 100% pass
rg "readIstanbulCoverage\|parseTestResultsFile\|isQuarantined" shared/pr-report-core.ts  # 0 ocorrências
rg "store\.runs" shared/pr-report-core.ts             # 0 ocorrências
```

---

### Fase 4 — Jira Command Handlers (1-2 dias)

**Objetivo:** Todos os 6 case handlers (case12, case17, case19, case21, case22, case26) usam `CommandContext.dataHub` em vez de `createDataHubPersistence().loadMetricsStore()`.

#### 4.1 — Migrar cada handler

| Case   | Bypass                                                                                      | Substituir por                                                                           |
| ------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| case12 | `persistence.loadMetricsStore()` → `store.runs`, `store.coverageHistory`                    | `c.dataHub.computed.metricsRuns`, `c.dataHub.computed.coverage`                          |
| case17 | `persistence.loadMetricsStore()` → `store.runs` (L158, 218)                                 | `c.dataHub.computed.metricsRuns`                                                         |
| case19 | `persistence.loadMetricsStore()` → `store.runs` (L100 + L14-68)                             | `c.dataHub.computed.metricsRuns`                                                         |
| case19 | `(r.passed / (r.passed + r.failed)) * 100` (L21)                                            | `calcRunPassRate(r)` (já disponível via import)                                          |
| case21 | `persistence.loadMetricsStore()` → `store.coverageHistory` (L43)                            | `c.dataHub.computed.coverage`                                                            |
| case22 | `persistence.loadMetricsStore()` → `store.runs` (L62)                                       | `c.dataHub.computed.flakinessEntries`                                                    |
| case26 | `persistence.loadMetricsStore()` → `store.runs` (L20) + `calculateHealthScore(store)` (L23) | `c.dataHub.computed.metricsRuns` + `calculateHealthScore(store, { dataHub: c.dataHub })` |

#### 4.2 — Testes

| Case | Arquivo de Teste                          |
| ---- | ----------------------------------------- |
| 12   | `jira_management/commands/case12.test.ts` |
| 17   | `jira_management/commands/case17.test.ts` |
| 19   | `jira_management/commands/case19.test.ts` |
| 21   | `jira_management/commands/case21.test.ts` |
| 22   | `jira_management/commands/case22.test.ts` |
| 26   | `jira_management/commands/case26.test.ts` |

**Checkpoint Fase 4:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run jira_management/commands/case12.test.ts  # 100% pass
npx vitest run jira_management/commands/case17.test.ts  # 100% pass
npx vitest run jira_management/commands/case19.test.ts  # 100% pass
npx vitest run jira_management/commands/case21.test.ts  # 100% pass
npx vitest run jira_management/commands/case22.test.ts  # 100% pass
npx vitest run jira_management/commands/case26.test.ts  # 100% pass
rg "loadMetricsStore" jira_management/commands/       # 0 ocorrências
```

---

### Fase 5 — git_triggers Consumers (2 dias)

**Objetivo:** interactive-mode, schedule-handler, batch-mode, pipeline-jira, session-context — todos usam DataHub em vez de MetricsStore direto.

#### 5.1 — interactive-mode.ts

| Item  | Linha   | Atual                                                                | Substituir                                |
| ----- | ------- | -------------------------------------------------------------------- | ----------------------------------------- |
| 5.1.1 | 258-259 | `loadMetricsStore()` → `store.runs`                                  | `dataHub.raw.runs`                        |
| 5.1.2 | 347-349 | `loadMetricsStore()` → `store.runs` + `store.failureClassifications` | `dataHub.raw.runs` + `dataHub.computed.*` |
| 5.1.3 | 442-444 | `loadMetricsStore()` → `store.runs`                                  | `dataHub.computed.metricsRuns`            |
| 5.1.4 | 854-856 | `loadMetricsStore()` → `store.runs`                                  | `dataHub.computed.metricsRuns`            |

#### 5.2 — schedule-handler.ts

| Item  | Linha   | Atual                                                                | Substituir                                |
| ----- | ------- | -------------------------------------------------------------------- | ----------------------------------------- |
| 5.2.1 | 158-160 | `loadMetricsStore()` → `store.runs` + `store.failureClassifications` | `dataHub.raw.runs` + `dataHub.computed.*` |
| 5.2.2 | 210     | `store.runs`                                                         | `dataHub.raw.runs`                        |
| 5.2.3 | 308-309 | `loadMetricsStore()` → `store.runs`                                  | `dataHub.computed.metricsRuns`            |
| 5.2.4 | 255     | `calculatePipelineCost(runs)` sem DataHub                            | Passar `dataHub`                          |

#### 5.3 — batch-mode.ts

| Item  | Linha   | Atual                               | Substituir                     |
| ----- | ------- | ----------------------------------- | ------------------------------ |
| 5.3.1 | 212-213 | `loadMetricsStore()` → `store.runs` | `dataHub.raw.runs`             |
| 5.3.2 | 355-356 | `loadMetricsStore()` → `store.runs` | `dataHub.computed.metricsRuns` |

#### 5.4 — pipeline-jira.ts

| Item  | Linha | Atual                                                             | Substituir                                  |
| ----- | ----- | ----------------------------------------------------------------- | ------------------------------------------- |
| 5.4.1 | 22-30 | `persistence.loadMetricsStore()` → `store.failureClassifications` | `dataHub.computed.*` ou persistence methods |

#### 5.5 — session-context.ts (refatoração maior)

| Item  | Linha | Atual                                       | Substituir                         |
| ----- | ----- | ------------------------------------------- | ---------------------------------- |
| 5.5.1 | 117   | `new Store(backend, projectName)`           | Usar `DataHubPersistence`          |
| 5.5.2 | 202   | `fetchLatestTestRun()` (ci-test-downloader) | Usar `DataHub.raw.parsedArtifacts` |
| 5.5.3 | 129   | `store.loadReport(sha)`                     | `DataHubPersistence.loadRun(sha)`  |
| 5.5.4 | 178   | `store.getBranch(branch)`                   | `DataHubPersistence` equivalent    |

#### 5.6 — Testes

| Item  | Arquivo de Teste                        |
| ----- | --------------------------------------- |
| 5.6.1 | `git_triggers/interactive-mode.test.ts` |
| 5.6.2 | `git_triggers/schedule-handler.test.ts` |
| 5.6.3 | `git_triggers/batch-mode.test.ts`       |
| 5.6.4 | `git_triggers/integration/`             |
| 5.6.5 | `shared/session-context.test.ts`        |

**Checkpoint Fase 5:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run git_triggers/                          # 100% pass
npx vitest run shared/session-context.test.ts         # 100% pass
npx vitest run shared/__tests__/integration/          # 100% pass (opcional)
rg "loadMetricsStore" git_triggers/                   # 0 ocorrências
rg "store\.runs" git_triggers/                        # 0 ocorrências
```

---

### Fase 6 — Shared Consumers Restantes (1 dia)

**Objetivo:** cli_base, coverage-gap, traceability-matrix, pipeline-cost, smoke-pipeline — todos migrados.

#### 6.1 — Migrar restantes

| Arquivo                                  | Bypass                                       | Substituir                             |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------- |
| `shared/cli_base.ts:218`                 | `store.runs` + `calculateHealthScore(store)` | Criar DataHub e passar                 |
| `shared/coverage-gap.ts:104`             | `store.coverageHistory`                      | `dataHub.computed.coverage`            |
| `shared/traceability-matrix.ts:52,54,79` | `metrics.runs` (parâmetro)                   | `dataHub.computed.*` (já tem fallback) |
| `e2e/smoke-pipeline.ts:111`              | `metrics.runs`                               | `dataHub.computed.metricsRuns`         |

**Checkpoint Fase 6:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/cli_base.test.ts               # 100% pass
npx vitest run shared/coverage-gap.test.ts           # 100% pass
npx vitest run shared/traceability-matrix.test.ts    # 100% pass
npx vitest run e2e/smoke-pipeline.test.ts            # 100% pass
rg "loadMetricsStore" shared/                         # Só em data-hub/persistence.ts
```

---

### Fase 7 — Auditoria Pós-Migração (1 dia)

**Objetivo:** Verificar que TODOS os bypasses conhecidos foram eliminados.

#### 7.1 — Verificações automáticas

```bash
# ===== A. Nenhum loadMetricsStore em produção (fora data-hub/) =====
rg "loadMetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!*.spec.ts' -g '!shared/data-hub/**'
if [ $? -eq 0 ]; then echo "FALHA: loadMetricsStore encontrado fora de data-hub/"; fi

# ===== B. Nenhum readIstanbulCoverage em produção =====
rg "readIstanbulCoverage" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
if [ $? -eq 0 ]; then echo "FALHA: readIstanbulCoverage encontrado"; fi

# ===== C. Nenhum parseTestResultsFile em produção (fora data-hub/) =====
rg "parseTestResultsFile" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
if [ $? -eq 0 ]; then echo "FALHA: parseTestResultsFile encontrado fora de data-hub/"; fi

# ===== D. Nenhum isQuarantined em produção (fora quarantine.ts) =====
rg "isQuarantined" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/quarantine.ts'
if [ $? -eq 0 ]; then echo "FALHA: isQuarantined encontrado fora de quarantine.ts"; fi

# ===== E. Nenhum import de store.ts em produção (fora data-hub/) =====
rg "from.*shared/store" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
if [ $? -eq 0 ]; then echo "FALHA: import de store.ts encontrado fora de data-hub/"; fi

# ===== F. Nenhum store.runs em produção (fora data-hub/) =====
rg "store\.runs" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**'
if [ $? -eq 0 ]; then echo "FALHA: store.runs encontrado fora de data-hub/"; fi

# ===== G. Nenhum MetricsStore em produção (fora data-hub/) =====
rg "MetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' -g '!shared/types/**'
if [ $? -eq 0 ]; then echo "FALHA: MetricsStore encontrado fora de data-hub/"; fi

# ===== H. DataHub é obrigatório em health-score, quality-gate, pr-report-core =====
rg "dataHub\?: DataHub" shared/health-score.ts shared/quality-gate.ts shared/pr-report-core.ts
if [ $? -eq 0 ]; then echo "FALHA: DataHub ainda é opcional"; fi

# ===== I. Type safety =====
npx tsc --noEmit
rg --pcre2 "as\s+any" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
rg "@ts-ignore\|@ts-expect-error" --include="*.ts" -g '!__tests__' -g '!*.test.ts'
```

#### 7.2 — Verificações manuais

```bash
npx vitest run --reporter=verbose                    # 100% pass
npx eslint . --max-warnings=0                        # 0 violações
```

**Checkpoint Fase 7:**
TODOS os comandos acima retornam zero resultados + `npx tsc --noEmit` = 0 erros.

---

### Fase 8 — Deletar Fontes Alternativas (2 dias)

**Objetivo:** Só executar SE Fase 7 passou 100%. Deletar fontes para que consumidores silenciosos apareçam.

#### 8.1 — Deletar módulos alternativos

| Item  | Deletar                                                  | Motivo                                            |
| ----- | -------------------------------------------------------- | ------------------------------------------------- |
| 8.1.1 | `shared/ci-test-downloader.ts`                           | CI API direta — DataHub providers têm equivalente |
| 8.1.2 | `shared/coverage-source.ts`                              | Istanbul file read — DataHub tem `raw.coverage`   |
| 8.1.3 | `shared/commit-log.ts`                                   | CI API direta — DataHub tem `raw.commitLog`       |
| 8.1.4 | `shared/coverage-source.test.ts`                         | Teste de módulo deletado                          |
| 8.1.5 | `shared/coverage-source.property.test.ts`                | Teste de módulo deletado                          |
| 8.1.6 | `shared/integration/coverage-source.integration.test.ts` | Teste de módulo deletado                          |
| 8.1.7 | `shared/ci-test-downloader.test.ts`                      | Teste de módulo deletado                          |
| 8.1.8 | `shared/commit-log.test.ts`                              | Teste de módulo deletado                          |

#### 8.2 — Remover `loadMetricsStore()` da interface pública

| Item  | Ação                                                                                          | Arquivo                          |
| ----- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| 8.2.1 | Mover `loadMetricsStore()` de `DataHubPersistence` para implementação privada                 | `shared/types/data-hub.ts`       |
| 8.2.2 | Criar métodos específicos: `getRuns()`, `getCoverageHistory()`, `getFailureClassifications()` | `shared/data-hub/persistence.ts` |
| 8.2.3 | Remover `saveMetricsStore()` da interface pública                                             | `shared/types/data-hub.ts`       |

#### 8.3 — ESLint: Bloquear imports de módulos deletados

Adicionar ao `eslint.config.mjs`:

```javascript
{
  name: 'ssot-enforcement',
  files: ['**/*.ts', '**/*.js'],
  ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: '../shared/ci-test-downloader.js', message: 'DELETED — Use DataHub' },
        { name: '../../shared/ci-test-downloader.js', message: 'DELETED — Use DataHub' },
        { name: '../shared/coverage-source.js', message: 'DELETED — Use DataHub.computed.coverage' },
        { name: '../../shared/coverage-source.js', message: 'DELETED — Use DataHub.computed.coverage' },
        { name: '../shared/commit-log.js', message: 'DELETED — Use DataHub.raw.commitLog' },
        { name: '../../shared/commit-log.js', message: 'DELETED — Use DataHub.raw.commitLog' },
      ],
    }],
  },
}
```

**Checkpoint Fase 8:**

```bash
npx tsc --noEmit                                    # 0 erros — sem consumidores quebrados
npx vitest run --reporter=verbose                    # 100% pass
npx eslint . --max-warnings=0                        # 0 violações
rg "ci-test-downloader\|coverage-source\|commit-log" --include="*.ts" -g '!docs' -g '!plans'  # Só em docs/plans
```

---

### Fase 9 — Pegar Consumidores Silenciosos (1-2 dias)

**Objetivo:** Só executar SE Fase 8 revelou quebras. Migrar consumidores que só apareceram após deleção.

#### 9.1 — Identificar quebras

```bash
npx tsc --noEmit 2>&1 | rg "Cannot find module"  # Erros de import
npx vitest run 2>&1 | rg "FAIL"                   # Testes falhando
```

#### 9.2 — Migrar cada consumidor quebrado

Para cada erro de compilação ou teste falhando:

1. Mapear arquivo e import quebrado
2. Criar DataHub no caller ou usar `CommandContext.dataHub`
3. Substituir chamada de função deletada por equivalente DataHub
4. Rodar `npx tsc --noEmit` e `npx vitest run` até 0 erros

**Checkpoint Fase 9:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run --reporter=verbose                    # 100% pass
```

---

### Fase 10 — Prevenção Final (1 dia)

**Objetivo:** Bloquear permanentemente novos bypasses.

#### 10.1 — ESLint: Bloquear loadMetricsStore externo

```javascript
{
  name: 'ssot-block-loadMetricsStore',
  files: ['**/*.ts', '**/*.js'],
  ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts', '**/data-hub/**'],
  rules: {
    'no-restricted-syntax': ['error', {
      selector: 'CallExpression[callee.name="loadMetricsStore"]',
      message: 'Use DataHub.computed.* instead of loadMetricsStore()',
    }, {
      selector: 'CallExpression[callee.property.name="loadMetricsStore"]',
      message: 'Use DataHub.computed.* instead of loadMetricsStore()',
    }],
  },
}
```

#### 10.2 — Atualizar TECHDOC.md

- DataHub como SSOT obrigatório
- Nenhum módulo fora de `data-hub/` pode acessar `MetricsStore`, `Store`, `loadMetricsStore`
- Padrão: `CommandContext.dataHub` é a fonte única para todos os handlers

#### 10.3 — Verificação final completa

```bash
echo "=== VERIFICAÇÃO FINAL SSOT ==="
echo "1. Compilação:" && npx tsc --noEmit && echo "   ✅"
echo "2. Lint:" && npx eslint . --max-warnings=0 && echo "   ✅"
echo "3. Testes:" && npx vitest run && echo "   ✅"
echo "4. Cobertura:" && npx vitest run --coverage && echo "   ✅"
echo "5. Nenhum loadMetricsStore fora do data-hub:" && \
  rg "loadMetricsStore" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' | wc -l
echo "6. Nenhum store.runs fora do data-hub:" && \
  rg "store\.runs" --include="*.ts" -g '!__tests__' -g '!*.test.ts' -g '!shared/data-hub/**' | wc -l
```

**Checkpoint Fase 10:**

```
✅ npx tsc --noEmit = 0 erros
✅ npx eslint . --max-warnings=0
✅ npx vitest run = 100% pass
✅ npx vitest run --coverage = threshold atingido
✅ zero loadMetricsStore fora de shared/data-hub/
✅ zero store.runs fora de shared/data-hub/
✅ zero type assertions em produção
✅ zero @ts-ignore/@ts-expect-error em produção
```

---

## RISK REGISTER

| ID  | Risco                                                                                                    | Impacto | Probabilidade | Mitigação                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------- | ------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| R1  | `session-context.ts` tem 9 consumidores — mudança de assinatura quebra muitos                            | Alto    | Média         | Manter wrapper de compatibilidade temporário                                                                      |
| R2  | `commit-log.ts` usado por providers DataHub internamente                                                 | Alto    | Baixa         | Migrar providers para `raw.commitLog` ANTES de deletar                                                            |
| R3  | `store.ts` usado internamente por `persistence.ts` — não pode deletar só bloquear                        | Alto    | Baixa         | Manter como implementação interna, só mudar visibilidade                                                          |
| R4  | Testes de integração quebram — mocks desatualizados                                                      | Médio   | Alta          | Atualizar mocks em paralelo com produção                                                                          |
| R5  | `tsconfig.json` tem `exactOptionalPropertyTypes` — mudanças de tipo quebram                              | Médio   | Média         | Testar cada mudança com `npx tsc --noEmit`                                                                        |
| R6  | Casos Jira têm lógica condicional complexa — migração pode introduzir bugs                               | Alto    | Média         | Migrar um case por vez, testar individualmente                                                                    |
| R7  | ESLint rules novas podem quebrar CI                                                                      | Baixo   | Alta          | Testar ESLint localmente antes do push                                                                            |
| R8  | Consumidores silenciosos na Fase 8 podem ser muitos                                                      | Médio   | Baixa         | Fase 1-6 migra 35 bypasses conhecidos — silenciosos serão poucos                                                  |
| R9  | `handleError()` em `git-provider-error.ts` não usa `humanizeError` — afeta ~15 catch blocks              | Alto    | Média         | Atualizar `handleError()` para usar `extractErrorMessage` + `humanizeError` antes de deletar `ci-test-downloader` |
| R10 | `bare catch { return null; }` em `github-workflow.ts:330` e `gitlab-workflow.ts:210` — erros silenciados | Alto    | Média         | Adicionar `rootLogger.warn` + `extractErrorMessage` em Fase 0                                                     |
| R11 | `humanizeError` não cobre padrões de erro do GitHub/GitLab — erros de conexão CI passam sem contexto     | Médio   | Média         | Adicionar padrões 10-17 antes de implementar Fase 3-5                                                             |
| R12 | BadTesting em `create_tests.test.ts` — 5 testes com `toBeDefined()` como única asserção                  | Médio   | Alta          | Corrigir após Fase 4 com asserções de comportamento                                                               |

## AUDIT TRAIL

| Data       | Decisão                                                                                   | Motivo                                                                   | Autor   |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------- |
| 2026-07-09 | Inverter ordem: migrar primeiro, deletar depois                                           | Menos traumático, eficiente, consumidores silenciosos aparecem em testes | Usuário |
| 2026-07-09 | Adicionar `dataHub?: DataHub` ao `CommandContext`                                         | Desbloqueia 6 case handlers de uma vez                                   | Plano   |
| 2026-07-09 | Manter `store.ts` como implementação interna do DataHub                                   | `persistence.ts` depende dele; não é bypass se for interno               | Plano   |
| 2026-07-09 | Tornar DataHub obrigatório (nunca opcional) em health-score, quality-gate, pr-report-core | Elimina caminhos de fallback que escondem bypasses                       | Plano   |
| 2026-07-09 | Checkpoint testável obrigatório para cada fase                                            | Evitar repetir o falso "✅" do Phase 22                                  | Usuário |
| 2026-07-09 | Zero erros silenciosos — catch blocks DEVE usar `extractErrorMessage` + `humanizeError`   | Erros silenciosos = defeito de segurança. Tratamento eufêmico é proibido | Usuário |
| 2026-07-09 | humanizeError DEVE cobrir padrões de erro de CI/GitHub/GitLab antes da migração           | Padrões insuficientes para o domínio DataHub                             | Plano   |
| 2026-07-09 | Test factories são ÚNICA fonte de dados de teste — copies de saída proibidas              | Copiar output = codificar bugs como features                             | Usuário |
| 2026-07-09 | Integration tests + PBT têm prioridade sobre unit tests para DataHub                      | DataHub é cross-camada — unit tests não cobrem o fluxo real              | Usuário |
| 2026-07-09 | BadTesting (`toBeDefined()` sozinho) = teatro → corrigir ou deletar                       | Testes que passam sem verificar comportamento são pior que sem teste     | Usuário |

---

## PROGRESS TRACKING

> **Status atual:** 🟢 PRONTO PARA IMPLEMENTAÇÃO
> **Início:** 2026-07-09
> **Previsão de conclusão:** 10-12 dias úteis
> **Contrato:** 10 invariantes (System Model) + 8 regras de erro (EH) + 10 regras de teste (TD)

| Fase | Descrição                               | Status      | Data | Checkpoint                                                     |
| ---- | --------------------------------------- | ----------- | ---- | -------------------------------------------------------------- |
| 0    | Foundation (TS2307 + CommandContext)    | 🔜 Pendente | —    | `npx tsc --noEmit` = 0                                         |
| 1    | health-score.ts SSOT                    | 🔜 Pendente | —    | `rg "store.coverageHistory\|store\.runs" health-score.ts` = 0  |
| 2    | quality-gate.ts SSOT                    | 🔜 Pendente | —    | `rg "loadMetricsStore" quality-gate.ts` = 0                    |
| 3    | pr-report-core.ts SSOT                  | 🔜 Pendente | —    | `rg "readIstanbulCoverage\|store\.runs" pr-report-core.ts` = 0 |
| 4    | Jira Command Handlers (6 cases)         | 🔜 Pendente | —    | `rg "loadMetricsStore" jira_management/commands/` = 0          |
| 5    | git_triggers Consumers (5 arquivos)     | 🔜 Pendente | —    | `rg "loadMetricsStore\|store\.runs" git_triggers/` = 0         |
| 6    | Shared Consumers Restantes (4 arquivos) | 🔜 Pendente | —    | `rg "loadMetricsStore" shared/` = só data-hub/                 |
| 7    | Auditoria Pós-Migração                  | 🔜 Pendente | —    | 9 verificações rg = 0                                          |
| 8    | Deletar Fontes Alternativas             | 🔜 Pendente | —    | `npx tsc --noEmit` = 0                                         |
| 9    | Pegar Consumidores Silenciosos          | 🔜 Pendente | —    | `npx tsc --noEmit` = 0                                         |
| 10   | Prevenção Final (ESLint + TECHDOC)      | 🔜 Pendente | —    | Verificação final completa                                     |
