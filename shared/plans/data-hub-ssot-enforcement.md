    # DataHub SSOT Enforcement — Migration & Prevention Plan

> **Criado:** 2026-07-09
> **Baseado em auditoria exaustiva de 35 consumidores em 28 arquivos de produção**
> **Objetivo:** Eliminar TODAS as fontes alternativas de dados — DataHub é a ÚNICA fonte de verdade (SSOT)
> **Status:** 🟢 PRONTO PARA IMPLEMENTAÇÃO

---

## CONTEXTO FUNDAMENTAL

### O que estamos fazendo

Estamos **construindo uma nova arquitetura** de dados. Não estamos mantendo uma existente. O DataHub é o novo ponto central que substituirá TODAS as fontes alternativas de dados (MetricsStore, acesso direto a APIs CI, cálculos locais).

### Por que estamos fazendo

O estado atual é caótico: 35 bypasses mapeados em 28 arquivos. Cada consumidor baixa, parseia e calcula dados por conta própria. Isso gera:

- Inconsistência (cálculos diferentes em lugares diferentes)
- Duplicação (mesma lógica implementada N vezes)
- Manutenção impossível (mudar um cálculo requer mudar N arquivos)
- Impossibilidade de escalar (cada novo consumidor duplica trabalho)

### Nosso objetivo final

**MetricsStore será deletado.** Toda persistência passa pelo DataHub internamente. Consumidores NÃO acessam persistence diretamente — chamam métodos do DataHub que encapsulam a persistência.

### Por que "manutenção de arquitetura" não é argumento válido

Estamos em **construção**, não manutenção. Argumentos como "isso quebra o padrão existente" ou "não há consumidores para essa função" são inválidos porque:

- O padrão existente É o problema que estamos resolvendo
- Funções sem consumidores são assim PORQUE estamos no meio da construção
- O fato de algo não existir hoje não é argumento para não construir

### Por que "consumidores não usam função" não é argumento para deleção

Se uma função existe no plano de arquitetura, ela existe por uma razão: consumidores a usarão quando a migração estiver completa. Argumentar para deletar uma função porque "ninguém a chama hoje" é sabotagem do plano que estamos executando. O custo de migração JÁ ESTÁ NO ORÇAMENTO do plano.

### Regra de decisão

**A ÚNICA justificativa para qualquer ação é SUPERIORIDADE TÉCNICA ou SEGURANÇA.** Não:

- "Manutenção de padrão"
- "Simplicidade"
- "Esforço de implementação"
- "Não há consumidores"
- "Custo de migração"

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
→ Fase 0.8 (obrigatório) → Fase 1 (health-score + quality-gate SSOT) → Fase 3 (pr-report-core)
→ Fase 4 (git_triggers) → Fase 5 (error-handling) → Fase 6 (shared restantes)
→ Fase 7 (auditoria pós-migração) → Fase 8 (deletar fontes alternativas)
→ Fase 9 (consumidores silenciosos) → Fase 10 (ESLint enforcement)
```

> **Nota (2026-07-10):** Fase 2 (quality-gate) absorvida pela Fase 1.

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

## FASES

> **Seção principal do plano.** Cada fase é sequencial e dependente da anterior.
> Fase 2 foi absorvida pela Fase 1 (quality-gate integrado ao health-score SSOT).

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

---

### FASE 0.6 — DataHub Core: Persistência Interna (SSOT) (1 tarefa)

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

---

### FASE 0.7 — DataHub Global: Acessibilidade e Resiliência (10 tarefas)

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

**Ação:** Atualizar措辞 do plano para refletir que MetricsStore é mantido internamente.

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

### FASE 0.8 — DataHub Core: Interface Expandida + Factory + Persistence (10 tarefas)

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

### FASE 1 — health-score.ts + quality-gate.ts SSOT + Dimension 5 Compliance (13 tarefas)

> **Atualizado:** 2026-07-10 — Expandido para incluir correção de TODOS os 28 gaps parciais da Dimensão 5.
> **Razão:** Auditoria Dimension 5 revelou 28 inconformidades parciais em 15 arquivos. Todas devem ser endereçadas.

#### Pré-requisitos verificados (2026-07-10)

- Fase 0.8 completa (interface expandida, factory, persistência obrigatória, consumidores migrados)
- NaN guards implementados em health-score.ts
- `runsEmpty` respeita DataHub
- `setDataHub()` chamado corretamente em pr-report-core.ts e batch-mode.ts
- VITEST guards em createCheckRun/getCheckRuns

#### Auditoria Dimension 5 — Resumo dos Gaps

| #   | Arquivo                    | Gap                                                                                         | Dimensão  | Severidade |
| --- | -------------------------- | ------------------------------------------------------------------------------------------- | --------- | ---------- |
| 1   | `quality-gate.ts`          | `_resolveFlakyPct` recalcula localmente em vez de usar `dataHub.computed.flakyPercentage`   | SSOT      | CRÍTICO    |
| 2   | `quality-gate.ts`          | `_suiteSpeedCheck` recalcula P95 localmente em vez de usar `dataHub.computed.suiteSpeedP95` | SSOT      | CRÍTICO    |
| 3   | `quality-gate.ts`          | `hub.loadMetricsStore()` carrega store bruto desnecessariamente                             | SSOT      | CRÍTICO    |
| 4   | `release-score.ts`         | Pesos (TASKS_W=0.25, HEALTH_W=0.3, COVERAGE_W=0.25, FLAKINESS_W=0.2) sem justificativa      | 5c.2      | Médio      |
| 5   | `release-score.ts`         | THRESHOLD=70 sem base documentada                                                           | 5c.6      | Médio      |
| 6   | `release-score.ts`         | Sem referências normativas                                                                  | 5d.1      | Médio      |
| 7   | `release-score.ts`         | Sem documentação de proveniência                                                            | 5e.1/5e.2 | Médio      |
| 8   | `requirement-score.ts`     | Pesos (0.5, 0.3, 0.2) sem justificativa                                                     | 5c.2      | Médio      |
| 9   | `requirement-score.ts`     | Thresholds de grade (90, 75, 60, 40) sem documentação                                       | 5c.6      | Médio      |
| 10  | `requirement-score.ts`     | Sem referência normativa                                                                    | 5d.1      | Médio      |
| 11  | `backlog-health.ts`        | Pesos (35, 30, 35) sem justificativa                                                        | 5c.2      | Médio      |
| 12  | `backlog-health.ts`        | Thresholds (80, 50) sem documentação                                                        | 5c.6      | Médio      |
| 13  | `backlog-health.ts`        | Sem referência normativa                                                                    | 5d.1      | Médio      |
| 14  | `silent-regression.ts`     | Thresholds de z-score (1, 2, 3, 5) sem base estatística documentada                         | 5c.6      | Médio      |
| 15  | `silent-regression.ts`     | Sem referência normativa                                                                    | 5d.1      | Médio      |
| 16  | `quality-metrics.ts`       | Threshold 2-sigma para drift detection sem referência                                       | 5d.1      | Baixo      |
| 17  | `cross-squad-benchmark.ts` | Sem referência normativa                                                                    | 5d.1      | Baixo      |
| 18  | `impact-alert.ts`          | Thresholds (70, 80) sem referência normativa                                                | 5d.1      | Baixo      |
| 19  | `health-score.ts`          | Sem trilha de auditoria de versão de cálculo                                                | 5e.3      | Baixo      |
| 20  | `health-score.ts`          | Sem testes de comparação com ferramentas externas                                           | 5f.3      | Baixo      |
| 21  | `health-score.ts`          | Sem tratamento explícito de outliers para coverage                                          | 5b.4      | Baixo      |
| 22  | `quality-gate.ts`          | Sem detecção de stale data                                                                  | 5e.4      | Baixo      |

#### Callers que NÃO passam DataHub (obrigatório migrar)

| Arquivo                              | Linha           | Chamada                            | Status            |
| ------------------------------------ | --------------- | ---------------------------------- | ----------------- |
| `jira_management/main.ts`            | 344             | `calculateHealthScore(store)`      | NÃO passa dataHub |
| `jira_management/commands/case26.ts` | 23              | `calculateHealthScore(store)`      | NÃO passa dataHub |
| `jira_management/commands/case19.ts` | 70              | `calculateHealthScore(store)`      | NÃO passa dataHub |
| `git_triggers/interactive-mode.ts`   | 374,441,491,533 | `calculateHealthScore(store, ...)` | ALGUNS NÃO passam |
| `shared/cli_base.ts`                 | 221             | `calculateHealthScore(store)`      | NÃO passa dataHub |

#### Callers que JÁ passam DataHub

| Arquivo                            | Linha   | Chamada                                                 | Status |
| ---------------------------------- | ------- | ------------------------------------------------------- | ------ |
| `git_triggers/schedule-handler.ts` | 173,213 | `calculateHealthScore(store, { dataHub })`              | OK     |
| `git_triggers/interactive-mode.ts` | 855     | `calculateHealthScore(store, { dataHub: hub })`         | OK     |
| `shared/pr-report-core.ts`         | 489     | `calculateHealthScore(store, healthConfig)`             | OK     |
| `shared/quality-gate.ts`           | 215     | `calculateHealthScore({ ...store, runs }, { dataHub })` | OK     |

---

#### Tarefa 1.1 — Tornar `dataHub` obrigatório em `calculateHealthScore`

**Objetivo:** Eliminar o caminho de fallback local. DataHub é a ÚNICA fonte de métricas.

**Mudança em `shared/health-score.ts`:**

```typescript
// ANTES:
export function calculateHealthScore(
    metricsStore: MetricsStore,
    options?: Partial<HealthScoreConfig> & { dataHub?: DataHub },
): HealthScoreResult {

// DEPOIS:
export function calculateHealthScore(
    metricsStore: MetricsStore,
    options: Partial<HealthScoreConfig> & { dataHub: DataHub },
): HealthScoreResult {
```

**Mudança em `computeActualMetrics`:**

```typescript
// ANTES:
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub?: DataHub): ActualMetrics {

// DEPOIS (Tarefa 1.1 — dataHub obrigatório):
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {

// DEPOIS (Tarefa 1.5 — store removido, DataHub é SSOT):
function computeActualMetrics(config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
```

**Efeito cascata:** Todos os callers que não passam `dataHub` agora falham na compilação.

**Checkpoint:**

```bash
npx tsc --noEmit 2>&1 | grep "not assignable"
# Esperado: ~8 erros de callers que não passam dataHub
```

**Commit:** `refactor(health-score): make dataHub mandatory in calculateHealthScore signature`

---

#### Tarefa 1.2 — Remover funções de cálculo local em health-score.ts

**Objetivo:** Eliminar TODA computação local. DataHub.computed é a ÚNICA fonte.

**Remover funções:**

- `_computeFlakyRate` (linha 129-136)
- `_computeExpWeighted` (linha 142-150)
- `_computeSuiteSpeed` (linha 156-163)
- `_resolveCoverage` (linha 199-208)
- `_resolvePassRate` (linha 220-227) — substituir por acesso direto
- `_resolveSuiteSpeed` (linha 229-236) — substituir por acesso direto

**Simplificar `computeActualMetrics`:**

```typescript
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
    const passRate = Number.isFinite(dataHub.computed.passRate) ? dataHub.computed.passRate : 0;
    const flakyPct = _normalizeFlakyPct(dataHub.computed.flakyPercentage);
    const coverage = Number.isFinite(dataHub.computed.coverage) ? dataHub.computed.coverage : 0;
    const executionRate = Number.isFinite(dataHub.computed.executionRate) ? dataHub.computed.executionRate : 0;
    const suiteSpeed = Number.isFinite(dataHub.computed.suiteSpeedP95) ? dataHub.computed.suiteSpeedP95 : 0;

    return { passRate, flakyPct, coverage, executionRate, suiteSpeed };
}
```

**Remover imports não utilizados:**

- `calcRunPassRate` (se não mais usado)

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "_computeExpWeighted" shared/health-score.ts      # 0 ocorrências
rg "_computeFlakyRate" shared/health-score.ts        # 0 ocorrências
rg "_computeSuiteSpeed" shared/health-score.ts       # 0 ocorrências
rg "_resolveCoverage" shared/health-score.ts         # 0 ocorrências
rg "_resolvePassRate" shared/health-score.ts         # 0 ocorrências
rg "_resolveSuiteSpeed" shared/health-score.ts       # 0 ocorrências
rg "store\.coverageHistory" shared/health-score.ts   # 0 ocorrências
npx vitest run shared/__tests__/health-score*         # 100% pass
```

**Commit:** `refactor(health-score): remove local computation — DataHub.computed is the only source`

---

#### Tarefa 1.3 — Tornar `dataHub` obrigatório em `runQualityGate` + Corrigir Dual Calculation (EXPANDIDO)

**Objetivo:** quality-gate.ts não recalcula nada — usa exclusivamente DataHub.computed.

**Mudança em `shared/quality-gate.ts`:**

```typescript
// ANTES:
export interface QualityGateOptions {
    project?: string;
    coverageOverride?: number | undefined;
    dataHub?: DataHub | undefined;
}

// DEPOIS:
export interface QualityGateOptions {
    project?: string;
    coverageOverride?: number | undefined;
    dataHub: DataHub; // obrigatório
}
```

**Remover de `runQualityGate`:**

- `hub.loadMetricsStore()` (linha 188) — não mais necessário
- `store.runs` — não mais passado para checks
- Fallback `getDataHub()` com catch — usar `options.dataHub` diretamente
- `let hub` local — usar `options.dataHub` diretamente

**Simplificar `_flakyCheck`:**

```typescript
// ANTES: recalcula localmente via calculateFlakyTestRate
function _flakyCheck(runs: MetricsRun[], dataHub?: DataHub): GateCheck {
    const flakyEntries = calcFlakinessEntries(runs, THRESHOLDS.flakyMinRuns);
    const flakyPct = _resolveFlakyPct(runs, dataHub, flakyEntries);
    // ...
}

// DEPOIS: usa DataHub.computed
function _flakyCheck(dataHub: DataHub): GateCheck {
    const flakyPct = dataHub.computed.flakyPercentage ?? 0;
    const status = flakyPct <= THRESHOLDS.maxFlakyPct ? 'pass' : 'fail';
    return {
        name: 'flaky-rate',
        status,
        score: Math.round(flakyPct),
        threshold: THRESHOLDS.maxFlakyPct,
        details: `Flaky: ${Math.round(flakyPct)}% (threshold: ${THRESHOLDS.maxFlakyPct}%)`,
    };
}
```

**Simplificar `_suiteSpeedCheck`:**

```typescript
// ANTES: recalcula P95 localmente via calcTestDurationP95
function _suiteSpeedCheck(health: HealthScoreResult, runs: MetricsRun[], dataHub?: DataHub): GateCheck {
    let p95: number;
    if (dataHub !== undefined && dataHub.raw.runs.length > 0) {
        p95 = calcTestDurationP95(runs);
    } else {
        // ... 20 linhas de recálculo local
    }
    // ...
}

// DEPOIS: usa DataHub.computed
function _suiteSpeedCheck(health: HealthScoreResult, dataHub: DataHub): GateCheck {
    const p95 = dataHub.computed.suiteSpeedP95;
    const thresholdMs = THRESHOLDS.maxSuiteSpeed * 1000;
    const status = p95 <= thresholdMs ? 'pass' : 'fail';
    return {
        name: 'suite-speed',
        status,
        score: health.dimensions.suiteSpeed.score,
        threshold: THRESHOLDS.maxSuiteSpeed,
        details: `Suite speed p95: ${p95}ms (threshold: ${THRESHOLDS.maxSuiteSpeed}s)`,
    };
}
```

**Remover `_resolveFlakyPct`** (função auxiliar não mais necessária).

**Remover imports não utilizados:**

- `calcFlakinessEntries`
- `calculateFlakyTestRate`
- `calcTestDurationP95`

**Adicionar error handling no catch block:**

O catch block de `runQualityGate` (linha ~226) usa `String(err)`. Deve usar `extractErrorMessage` + `humanizeError`:

```typescript
// ANTES (código real):
catch (err) {
    rootLogger.error(`quality-gate: falha — ${String(err)}`);
}

// DEPOIS:
catch (err: unknown) {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    rootLogger.error(`quality-gate: falha — ${known ? known.msg : raw}`);
}
```

Adicionar imports:

```typescript
import { extractErrorMessage } from './errors.js';
import { humanizeError } from './prompt-errors.js';
```

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore" shared/quality-gate.ts        # 0 ocorrências
rg "calculateFlakyTestRate" shared/quality-gate.ts  # 0 ocorrências
rg "calcTestDurationP95" shared/quality-gate.ts     # 0 ocorrências
rg "calcFlakinessEntries" shared/quality-gate.ts    # 0 ocorrências
rg "_resolveFlakyPct" shared/quality-gate.ts        # 0 ocorrências
rg "String\(err\)" shared/quality-gate.ts           # 0 ocorrências (catch block)
rg "extractErrorMessage" shared/quality-gate.ts     # >= 1 ocorrência
rg "humanizeError" shared/quality-gate.ts           # >= 1 ocorrência
npx vitest run shared/__tests__/quality-gate*        # 100% pass
npx vitest run shared/__tests__/integration/quality-gate*  # 100% pass
```

**Commit:** `refactor(quality-gate): make dataHub mandatory — remove loadMetricsStore and all local recalculation`

---

#### Tarefa 1.4 — Migrar callers que não passam DataHub

**Objetivo:** Todos os callers de `calculateHealthScore` e `runQualityGate` passam DataHub.

**Callers a migrar:**

| Arquivo                              | Linha           | Ação                                            |
| ------------------------------------ | --------------- | ----------------------------------------------- |
| `jira_management/main.ts`            | 344             | Criar DataHub no bootstrap, passar via contexto |
| `jira_management/commands/case26.ts` | 23              | Usar `c.dataHub` do CommandContext              |
| `jira_management/commands/case19.ts` | 70              | Usar `c.dataHub` do CommandContext              |
| `git_triggers/interactive-mode.ts`   | 374,441,491,533 | Passar `hub` (já disponível no escopo)          |
| `shared/cli_base.ts`                 | 221             | Criar DataHub via `getOrFetchDataHub`           |

**Callers de `runQualityGate` (verificar):**

| Arquivo                            | Linha | Ação                         |
| ---------------------------------- | ----- | ---------------------------- |
| `git_triggers/interactive-mode.ts` | 581   | Já passa dataHub — verificar |
| `git_triggers/schedule-handler.ts` | 259   | Já passa dataHub — verificar |
| `shared/pr-report-core.ts`         | 352   | Já passa dataHub — verificar |

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
npx vitest run shared/                               # 100% pass
npx vitest run jira_management/                      # 100% pass
npx vitest run git_triggers/                         # 100% pass
```

**Commit:** `refactor: update all callers to pass DataHub (mandatory)`

> **Nota: Fallback Tripartido em quality-gate.ts**
>
> `quality-gate.ts:173-187` implementa fallback de 3 níveis: `getDataHub()` → `options.dataHub` → `throw`. Esse padrão não está documentado em nenhuma fase e compete com `ensureDataHub()`.
>
> **Resolução:** Após Tarefa 1.3 (remoção de `loadMetricsStore`), o fallback será simplificado:
>
> ```typescript
> // ANTES (código real — fallback tripartido):
> try {
>     hub = getDataHub();
> } catch {
>     if (options?.dataHub) {
>         hub = options.dataHub;
>     } else {
>         throw new Error('DataHub not initialized...');
>     }
> }
>
> // DEPOIS (consolidado):
> const hub = options?.dataHub ?? getDataHub();
> if (!hub) throw new Error('DataHub not initialized — run setup first');
> ```
>
> `ensureDataHub()` é a função correta para inicialização. O fallback tripartido será consolidado em uma única chamada.

---

#### Tarefa 1.5 — Error Handling + Refatoração de Assinatura: health-score.ts + quality-gate.ts

**Objetivo:** Tratamento de erros explícito — nenhum erro silencioso. Refatorar `calculateHealthScore` para aceitar apenas `DataHub` como fonte.

**Adicionar em `shared/health-score.ts`:**

```typescript
import { extractErrorMessage } from './errors.js';
import { humanizeError } from './prompt-errors.js';
import { rootLogger } from './logger.js';
```

**Refatorar assinatura de `computeActualMetrics` — remover `store: MetricsStore`:**

A assinatura atual aceita ambos `MetricsStore` e `DataHub`. Isso viola SSOT — `MetricsStore` deve ser eliminado como parâmetro. `dataHub.raw.runs` substitui `metricsStore.runs`.

```typescript
// ANTES (plano original — incorreto):
function computeActualMetrics(store: MetricsStore, config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
    const runCount = store.runs.length;
    // ...
}

// DEPOIS (corrigido):
function computeActualMetrics(config: HealthScoreConfig, dataHub: DataHub): ActualMetrics {
    const runCount = dataHub.raw.runs.length;
    const c = dataHub.computed;
    if (!Number.isFinite(c.passRate) && !Number.isFinite(c.coverage) && !Number.isFinite(c.executionRate)) {
        rootLogger.warn('health-score: DataHub.computed has mostly invalid values — results may be unreliable');
    }
    // ... resto via c.passRate, c.coverage, c.executionRate
}
```

**Refatorar assinatura de `calculateHealthScore` — remover `metricsStore: MetricsStore`:**

```typescript
// ANTES:
export function calculateHealthScore(
    metricsStore: MetricsStore,
    options: Partial<HealthScoreConfig> & { dataHub: DataHub },
): HealthScoreResult {

// DEPOIS:
export function calculateHealthScore(
    options: Partial<HealthScoreConfig> & { dataHub: DataHub },
): HealthScoreResult {
```

**Efeito cascata:** Todos os callers de `calculateHealthScore` que passam `metricsStore` como primeiro argumento devem ser atualizados. Os callers já passam `dataHub` via options (Tarefa 1.4), então a mudança é: remover o primeiro argumento.

**Efeito em `_buildChecks` e funções auxiliares:** Todas as funções que recebem `MetricsStore` como parâmetro devem ser refatoradas para ler de `dataHub.raw.*` e `dataHub.computed.*`.

**Adicionar em `shared/quality-gate.ts`:**

```typescript
// No catch block de runQualityGate:
catch (err: unknown) {
    const raw = extractErrorMessage(err);
    const known = humanizeError(raw);
    rootLogger.error(`quality-gate: ${known ? known.msg : raw}`);
    // ...
}
```

**Checkpoint:**

```bash
rg "extractErrorMessage" shared/health-score.ts      # >= 1 ocorrência
rg "humanizeError" shared/health-score.ts             # >= 1 ocorrência
rg "MetricsStore" shared/health-score.ts              # 0 parâmetros de função (apenas imports se necessário)
rg "store\.runs" shared/health-score.ts               # 0 ocorrências (usar dataHub.raw.runs)
rg "extractErrorMessage" shared/quality-gate.ts      # >= 1 ocorrência
rg "humanizeError" shared/quality-gate.ts             # >= 1 ocorrência
npx vitest run shared/__tests__/health-score*          # 100% pass
npx vitest run shared/__tests__/quality-gate*          # 100% pass
```

**Commit:** `fix(health-score,quality-gate): remove MetricsStore param — DataHub is sole source + add error handling`

---

#### Tarefa 1.6 — Dimension 5: release-score.ts — Proveniência e Referências

**Objetivo:** Documentar proveniência, adicionar referências normativas, justificar pesos e thresholds.

**Mudanças em `shared/release-score.ts`:**

1. Adicionar PROVENANCE_DIMENSIONS (similar ao health-score.ts):

```typescript
const RELEASE_SCORE_PROVENANCE = {
    weights: {
        tasks: { value: 0.25, source: 'Product management best practice', standard: 'Internal' },
        health: { value: 0.3, source: 'Quality gate composite', standard: 'Internal' },
        coverage: { value: 0.25, source: 'ISO/IEC 25023:2016', standard: 'ISO/IEC 25023:2016' },
        flakiness: { value: 0.2, source: 'DORA State of DevOps 2025', standard: 'DORA' },
    },
    threshold: { value: 70, source: 'Release readiness industry standard', standard: 'Internal' },
};
```

2. Adicionar JSDoc com referências normativas
3. Validar pesos com `Number.isFinite` + soma = 1.0
4. Adicionar validação de threshold >= 0

**Checkpoint:**

```bash
rg "PROVENANCE\|standard:" shared/release-score.ts   # >= 1 ocorrência
rg "ISO\|DORA\|ISTQB" shared/release-score.ts        # >= 1 referência
npx vitest run shared/__tests__/release-score*         # 100% pass
```

**Commit:** `docs(release-score): add Dimension 5 provenance — weights, threshold, normative references`

---

#### Tarefa 1.7 — Dimension 5: requirement-score.ts — Proveniência e Referências

**Objetivo:** Documentar proveniência, adicionar referências normativas, justificar pesos e thresholds.

**Mudanças em `shared/requirement-score.ts`:**

1. Adicionar REQUIREMENT_SCORE_PROVENANCE:

```typescript
const REQUIREMENT_SCORE_PROVENANCE = {
    weights: {
        acceptance: { value: 0.5, source: 'AI acceptance rate importance', standard: 'Internal' },
        retention: { value: 0.3, source: 'Requirement retention metric', standard: 'Internal' },
        volume: { value: 0.2, source: 'Volume normalization factor', standard: 'Internal' },
    },
    gradeThresholds: {
        A: { min: 90, source: 'Industry standard grading', standard: 'Internal' },
        B: { min: 75, source: 'Industry standard grading', standard: 'Internal' },
        C: { min: 60, source: 'Industry standard grading', standard: 'Internal' },
        D: { min: 40, source: 'Industry standard grading', standard: 'Internal' },
    },
};
```

2. Adicionar JSDoc com referências
3. Validar pesos com `Number.isFinite` + soma = 1.0
4. Validar thresholds com `Number.isFinite` + ordem crescente

**Checkpoint:**

```bash
rg "PROVENANCE\|standard:" shared/requirement-score.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/requirement-score*         # 100% pass
```

**Commit:** `docs(requirement-score): add Dimension 5 provenance — weights, thresholds, normative references`

---

#### Tarefa 1.8 — Dimension 5: backlog-health.ts — Proveniência e Referências

**Objetivo:** Documentar proveniência, adicionar referências normativas.

**Mudanças em `shared/backlog-health.ts`:**

1. Adicionar BACKLOG_HEALTH_PROVENANCE:

```typescript
const BACKLOG_HEALTH_PROVENANCE = {
    weights: {
        stale: { value: 35, source: 'Backlog hygiene best practice', standard: 'Internal' },
        unassigned: { value: 30, source: 'Resource allocation importance', standard: 'Internal' },
        bugNoTest: { value: 35, source: 'Test coverage gap importance', standard: 'Internal' },
    },
    thresholds: {
        healthy: { value: 80, source: 'Backlog health target', standard: 'Internal' },
        warning: { value: 50, source: 'Backlog health warning', standard: 'Internal' },
    },
};
```

2. Adicionar JSDoc com referências
3. Validar pesos com `Number.isFinite`
4. Validar thresholds com `Number.isFinite`

**Checkpoint:**

```bash
rg "PROVENANCE\|standard:" shared/backlog-health.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/backlog-health*         # 100% pass
```

**Commit:** `docs(backlog-health): add Dimension 5 provenance — weights, thresholds, normative references`

---

#### Tarefa 1.9 — Dimension 5: silent-regression.ts — Proveniência e Referências

**Objetivo:** Documentar base estatística dos thresholds de z-score.

**Mudanças em `shared/silent-regression.ts`:**

1. Adicionar SILENT_REGRESSION_PROVENANCE:

```typescript
const SILENT_REGRESSION_PROVENANCE = {
    severityThresholds: {
        LOW: { zScore: 1, source: 'Statistical process control (1-sigma)', standard: 'ISO 3534-2' },
        MEDIUM: { zScore: 2, source: 'Statistical process control (2-sigma)', standard: 'ISO 3534-2' },
        HIGH: { zScore: 3, source: 'Statistical process control (3-sigma)', standard: 'ISO 3534-2' },
        CRITICAL: { zScore: 5, source: 'Extreme outlier detection (5-sigma)', standard: 'ISO 3534-2' },
    },
};
```

2. Adicionar JSDoc com referência ISO 3534-2
3. Validar thresholds com `Number.isFinite` + ordem crescente

**Checkpoint:**

```bash
rg "ISO 3534\|PROVENANCE" shared/silent-regression.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/silent-regression*         # 100% pass
```

**Commit:** `docs(silent-regression): add Dimension 5 provenance — z-score thresholds, ISO 3534-2 reference`

---

#### Tarefa 1.10 — Dimension 5: quality-metrics.ts — Proveniência

**Objetivo:** Documentar threshold 2-sigma para drift detection.

**Mudanças em `shared/quality-metrics.ts`:**

1. Adicionar DRIFT_DETECTION_PROVENANCE:

```typescript
const DRIFT_DETECTION_PROVENANCE = {
    sigmaThreshold: {
        value: 2,
        source: 'Statistical process control (2-sigma rule)',
        standard: 'ISO 3534-2',
    },
};
```

2. Adicionar JSDoc com referência

**Checkpoint:**

```bash
rg "ISO 3534\|PROVENANCE" shared/quality-metrics.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/quality-metrics*         # 100% pass
```

**Commit:** `docs(quality-metrics): add Dimension 5 provenance — drift detection threshold, ISO 3534-2`

---

#### Tarefa 1.11 — Dimension 5: cross-squad-benchmark.ts — Proveniência

**Objetivo:** Documentar metodologia de benchmark.

**Mudanças em `shared/cross-squad-benchmark.ts`:**

1. Adicionar BENCHMARK_PROVENANCE:

```typescript
const BENCHMARK_PROVENANCE = {
    methodology: {
        source: 'Cross-team benchmarking best practice',
        standard: 'DORA / Internal',
    },
};
```

2. Adicionar JSDoc com referência

**Checkpoint:**

```bash
rg "PROVENANCE\|DORA" shared/cross-squad-benchmark.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/cross-squad-benchmark*     # 100% pass
```

**Commit:** `docs(cross-squad-benchmark): add Dimension 5 provenance — benchmark methodology reference`

---

#### Tarefa 1.12 — Dimension 5: impact-alert.ts — Proveniência

**Objetivo:** Documentar thresholds de alerta.

**Mudanças em `shared/impact-alert.ts`:**

1. Adicionar IMPACT_ALERT_PROVENANCE:

```typescript
const IMPACT_ALERT_PROVENANCE = {
    thresholds: {
        low: { value: 70, source: 'Quality gate minimum threshold', standard: 'Internal' },
        high: { value: 80, source: 'Quality gate target threshold', standard: 'Internal' },
    },
};
```

2. Adicionar JSDoc com referência

**Checkpoint:**

```bash
rg "PROVENANCE" shared/impact-alert.ts   # >= 1 ocorrência
npx vitest run shared/__tests__/impact-alert*  # 100% pass
```

**Commit:** `docs(impact-alert): add Dimension 5 provenance — alert thresholds reference`

---

#### Tarefa 1.13 — Testes Dimension 5: PBT + Integration

**Objetivo:** Garantir que todos os novos PROVENANCE_DIMENSIONS são validados por testes.

**Novos testes:**

1. **release-score.property.test.ts** — PBT: pesos somam 1.0, thresholds >= 0
2. **requirement-score.property.test.ts** — PBT: pesos somam 1.0, thresholds em ordem crescente
3. **backlog-health.property.test.ts** — PBT: pesos >= 0, thresholds >= 0
4. **silent-regression.property.test.ts** — PBT: z-scores em ordem crescente
5. **integration/dimension5-validation.integration.test.ts** — Valida que TODOS os módulos têm PROVENANCE_DIMENSIONS

**Checkpoint:**

```bash
npx vitest run shared/__tests__/dimension5*              # 100% pass
npx vitest run shared/__tests__/integration/dimension5*  # 100% pass
```

**Commit:** `test(dimension5): add PBT and integration tests for all provenance documentation`

---

### Checkpoint Final da Fase 1

```bash
# 1. TypeScript
npx tsc --noEmit                                    # 0 erros

# 2. Sem bypasses em health-score.ts
rg "_computeExpWeighted|_computeFlakyRate|_computeSuiteSpeed|_resolveCoverage|store\.coverageHistory|_resolvePassRate|_resolveSuiteSpeed" shared/health-score.ts  # 0

# 3. Sem bypasses em quality-gate.ts
rg "loadMetricsStore|calculateFlakyTestRate|calcTestDurationP95|calcFlakinessEntries|_resolveFlakyPct" shared/quality-gate.ts  # 0

# 4. dataHub obrigatório
rg "dataHub\?" shared/health-score.ts               # 0 (era opcional, agora é obrigatório)
rg "dataHub\?" shared/quality-gate.ts               # 0 (era opcional, agora é obrigatório)

# 5. Error handling
rg "extractErrorMessage" shared/health-score.ts     # >= 1
rg "humanizeError" shared/health-score.ts            # >= 1

# 6. Dimension 5 Provenance
rg "PROVENANCE" shared/release-score.ts              # >= 1
rg "PROVENANCE" shared/requirement-score.ts          # >= 1
rg "PROVENANCE" shared/backlog-health.ts             # >= 1
rg "PROVENANCE" shared/silent-regression.ts          # >= 1
rg "PROVENANCE" shared/quality-metrics.ts            # >= 1
rg "PROVENANCE" shared/cross-squad-benchmark.ts      # >= 1
rg "PROVENANCE" shared/impact-alert.ts               # >= 1

# 7. Normative References
rg "ISO.*25023\|DORA\|ISTQB\|ISO 3534" shared/release-score.ts  # >= 1
rg "ISO.*25023\|DORA\|ISTQB\|ISO 3534" shared/requirement-score.ts  # >= 1

# 8. Testes
npx vitest run shared/__tests__/health-score*         # 100% pass
npx vitest run shared/__tests__/quality-gate*         # 100% pass
npx vitest run shared/__tests__/integration/quality-gate*  # 100% pass
npx vitest run shared/__tests__/dimension5*           # 100% pass
npx vitest run jira_management/                       # 100% pass
npx vitest run git_triggers/                          # 100% pass
```

---

### Fase 2 — quality-gate.ts SSOT (absorvida pela Fase 1)

> **Nota (2026-07-10):** A Fase 2 original (quality-gate.ts SSOT) foi **absorvida pela Fase 1, Tarefa 1.3**.
> As 3 tarefas originais da Fase 2 (RED, GREEN, callers) estão cobertas pela Tarefa 1.3.
> Nenhuma ação adicional necessária nesta fase.

---

### FASE 3 — pr-report-core.ts SSOT (4 tarefas)

---

#### Tarefa 3.1 — Remover CTRF de pr-report-core.ts

**Preparação:**

```bash
grep -n "readIstanbulCoverage\|parseTestResultsFile\|ctrf\|store\.runs" shared/pr-report-core.ts
# Mapear: L36 (istanbul import), L37 (parseTestResultsFile import), L38 (ParseResult type)
# L643 (ctrfPath CliOptions), L653 (ctrfPath default), L684-685 (--ctrf case)
# L745-748 (CTRF file check), L750-754 (CTRF parsing), L791-792 (store.runs diff)
# L795-801 (result.tests/stats from CTRF)
```

**GREEN:**

1. Remover `import { readIstanbulCoverage }` (L36)
2. Remover `import { parseTestResultsFile }` (L37)
3. Remover `ParseResult` do import type (L38) — manter `FlatTest`
4. Remover `ctrfPath: string` de `CliOptions` (L643)
5. Remover default `ctrfPath: 'reports/ctrf-report.json'` (L653)
6. Remover help text `--ctrf` (L673-674)
7. Remover case `--ctrf` em `parseArgs` (L684-685)
8. Remover `if (!fs.existsSync(opts.ctrfPath))` (L745-748)
9. Remover `parseTestResultsFile(opts.ctrfPath)` + error check (L750-754)
10. Substituir diff comparison: `store.runs` → `dataHub?.computed.metricsRuns` (L791-792)
11. Substituir `result.tests`/`result.stats` → extrair de `dataHub?.computed.metricsRuns[0]` (L795-801)

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "readIstanbulCoverage|parseTestResultsFile" shared/pr-report-core.ts  # 0
rg "ctrf" shared/pr-report-core.ts                 # 0
rg "store\.runs" shared/pr-report-core.ts          # 0
```

**Commit:** `refactor(pr-report-core): remove CTRF direct reads — use DataHub as SSOT`

---

#### Tarefa 3.2 — Migrar funções para DataHub

**GREEN:**

1. `resolveCoverageForReport()` (L393): substituir `return readIstanbulCoverage() ?? undefined` → `return undefined`
2. `buildFlakySection()` (L180-221):
    - Remover `isDataHubInitialized()`/`getDataHub()`/`hub.loadMetricsStore()`/`store.runs`
    - Nova assinatura: `buildFlakySection(dataHub?: DataHub): string`
    - Usar `dataHub?.computed.flakinessEntries ?? []`
3. `generateHtmlReportFile()` (L396-439):
    - Substituir `store: MetricsStore` por `dataHub?: DataHub`
    - L407: `calcFlakinessEntries(store.runs, ...)` → `dataHub?.computed.flakinessEntries ?? []`
    - L420: `calcMetricsTrends(store.runs)` → `dataHub?.computed.metricsTrends ?? []`
4. `generatePrReport()` (L494-551):
    - Remover `const store = hub?.loadMetricsStore() ?? { runs: [] }` (L501)
    - L530: `buildFlakySection()` → `buildFlakySection(dataHub)`
    - L534: `generateHtmlReportFile(..., store, ...)` → `generateHtmlReportFile(..., dataHub, ...)`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "loadMetricsStore|store\." shared/pr-report-core.ts  # 0
npx vitest run shared/__tests__/pr-report-core*     # 100% pass
```

**Commit:** `refactor(pr-report-core): migrate buildFlakySection, generateHtmlReportFile to DataHub`

---

#### Tarefa 3.3 — Atualizar ci-injector.ts (gerador de YAML)

**GREEN:**

1. Remover `const CTRF_DEFAULT` (L17)
2. Substituir `ctrfPath?: string` por `testReportPath: string` + `artifactName: string` em `PostProcessWorkflowOptions` (L23-28)
3. Substituir `ctrfPath` por `testReportPath` (L35)
4. Substituir input `ctrf-path` por `test-report-path` no YAML gerado (L49-53)
5. Adicionar input `artifact-name` no YAML gerado
6. Substituir step "Download CTRF report" por "Upload test report" — `actions/upload-artifact` com `name: ${{ inputs.artifact-name }}`, `path: ${{ inputs.test-report-path }}`
7. Remover shell check `if [ ! -f ... ]` e `--ctrf` no run command (L74-78)
8. Run simplificado: `npx tsx git_triggers/pr-report-entry.ts --project ${{ inputs.project-name }}`
9. Atualizar `generatePostProcessWorkflowFromContext` (L94-101) — usar `ctx.testReportPath` e `ctx.artifactName`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "ctrf" shared/ci-injector.ts                    # 0
npx vitest run shared/ci-injector.test.ts           # 100% pass
```

**Commit:** `refactor(ci-injector): replace CTRF with generic testReportPath + artifactName`

---

#### Tarefa 3.4 — Atualizar wizard (setup/main.ts + setup/context.ts)

**GREEN:**

1. `setup/context.ts`: substituir `ctrfReportPath: string` por `testReportPath: string`
2. `setup/context.ts`: adicionar `artifactName: string`
3. `setup/main.ts:63-65`: renomear pergunta para "Test report path" (default: detection.ctrfReportPath)
4. `setup/main.ts`: adicionar pergunta "Artifact name ['test-report']" (default: `test-report`)
5. `setup/main.ts:104-117`: atualizar return para incluir `testReportPath` e `artifactName`
6. `setup/config-writer.ts`: atualizar se referenciar `ctrfReportPath`

**Checkpoint:**

```bash
npx tsc --noEmit                                    # 0 erros
rg "testReportPath|artifactName" setup/context.ts  # >= 2
rg "ctrfReportPath" setup/context.ts               # 0
npx vitest run setup/main.test.ts                   # 100% pass
```

**Commit:** `refactor(wizard): replace ctrfReportPath with testReportPath + artifactName`

---

#### Tarefa 3.5 — Testes

**GREEN:**

| Item  | Teste                                                     | Mudanças principais                                                                            |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 3.5.1 | `shared/__tests__/pr-report-core.test.ts`                 | Remover mocks readIstanbulCoverage/parseTestResultsFile, mock DataHub com computed.metricsRuns |
| 3.5.2 | `shared/__tests__/pr-report-core.property.test.ts`        | Mesmo                                                                                          |
| 3.5.3 | `shared/__tests__/pr-report-core.wiring.property.test.ts` | Mesmo                                                                                          |
| 3.5.4 | `shared/__tests__/pr-report-core.wiring.test.ts`          | Remover parseTestResultsFile mock                                                              |
| 3.5.5 | `shared/__tests__/pr-report-core.main.test.ts`            | Reescrever — remover mocks CTRF, testar fluxo DataHub                                          |
| 3.5.6 | `shared/ci-injector.test.ts`                              | Atualizar para novos inputs (testReportPath, artifactName)                                     |
| 3.5.7 | `setup/main.test.ts`                                      | Atualizar mocks para testReportPath/artifactName                                               |

**Checkpoint:**

```bash
npx vitest run shared/__tests__/pr-report-core* shared/__tests__/pr-report.test.ts shared/ci-injector.test.ts setup/main.test.ts  # 100% pass
```

**Commit:** `test(pr-report-core, ci-injector, wizard): update mocks for DataHub SSOT`

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

### Fase 11 — Detecção de Reporter: AST/Híbrido (pesquisa + implementação)

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

| Data       | Decisão                                                                                   | Motivo                                                                   | Autor    |
| ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| 2026-07-09 | Inverter ordem: migrar primeiro, deletar depois                                           | Menos traumático, eficiente, consumidores silenciosos aparecem em testes | Usuário  |
| 2026-07-09 | Adicionar `dataHub?: DataHub` ao `CommandContext`                                         | Desbloqueia 6 case handlers de uma vez                                   | Plano    |
| 2026-07-09 | Manter `store.ts` como implementação interna do DataHub                                   | `persistence.ts` depende dele; não é bypass se for interno               | Plano    |
| 2026-07-09 | Tornar DataHub obrigatório (nunca opcional) em health-score, quality-gate, pr-report-core | Elimina caminhos de fallback que escondem bypasses                       | Plano    |
| 2026-07-09 | Checkpoint testável obrigatório para cada fase                                            | Evitar repetir o falso "✅" do Phase 22                                  | Usuário  |
| 2026-07-09 | Zero erros silenciosos — catch blocks DEVE usar `extractErrorMessage` + `humanizeError`   | Erros silenciosos = defeito de segurança. Tratamento eufêmico é proibido | Usuário  |
| 2026-07-09 | humanizeError DEVE cobrir padrões de erro de CI/GitHub/GitLab antes da migração           | Padrões insuficientes para o domínio DataHub                             | Plano    |
| 2026-07-09 | Test factories são ÚNICA fonte de dados de teste — copies de saída proibidas              | Copiar output = codificar bugs como features                             | Usuário  |
| 2026-07-09 | Integration tests + PBT têm prioridade sobre unit tests para DataHub                      | DataHub é cross-camada — unit tests não cobrem o fluxo real              | Usuário  |
| 2026-07-09 | BadTesting (`toBeDefined()` sozinho) = teatro → corrigir ou deletar                       | Testes que passam sem verificar comportamento são pior que sem teste     | Usuário  |
| 2026-07-10 | CTRF em pr-report é self-reference bug — remover, DataHub lê artifacts via API            | pr-report gerava relatório sobre si próprio, não sobre projeto externo   | Usuário  |
| 2026-07-10 | ci-injector gera YAML genérico — sem auto-referenciamento a qa_tools                      | Projeto gerenciado ≠ qa_tools; workflow deve ser genérico                | Usuário  |
| 2026-07-10 | Wizard pergunta testReportPath + artifactName — info explicitamente pedida ao usuário     | ci-injector precisa desses dados; wizard deve coletá-los                 | Usuário  |
| 2026-07-10 | ci-injector injeta upload de artifact no test job (Opção A) — fluxo completo e automático | External project não precisa configurar upload manualmente               | Usuário  |
| 2026-07-10 | loadMetricsStore() é bypass legítimo para dados raw — ELIMINAR, migrar 18 consumers       | loadMetricsStore expõe persistence diretamente, viola SSOT               | Usuário  |
| 2026-07-10 | CommandContext.dataHub DEVE ser obrigatório — eliminate 7 ocorrências de `?`              | `?` opcional herda optionality para todos os downstream                  | Usuário  |
| 2026-07-10 | Design Gaps 1-2 (Validação Zod + Provenance) planejados para esta sessão                  | Dados sem validação = metrics incorretas silenciosamente                 | Usuário  |
| 2026-07-10 | CtrfSource → TestReportSource — detector format-agnóstico, não CTRF-específico            | detector deve detectar "tem reporter?" sem assumir formato               | Usuário  |
| 2026-07-10 | Detecção de reporter: Fase 3 usa regex (renomeação); Fase 11 usa AST/híbrido              | regex é insuficiente para detecção confiável; AST é superior             | Usuário  |
| 2026-07-10 | Duas detecções separadas: capacidade (wizard) vs formato (parser) — não conflitar         | Wizard detecta de config; parser detecta de conteúdo                     | Pesquisa |
