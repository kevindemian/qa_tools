# DataHub SSOT — Índice Mestre e Contratos

> **Propósito:** Ponto de entrada único para o plano de enforcement de SSOT do DataHub.
> **Criado:** 2026-07-09 (a partir de auditoria de 35 consumidores em 28 arquivos)
> **Reorganizado:** 2026-07-12 (consolidação de `data-hub-ssot-enforcement.md` em documentos por tarefa)
> **Status:** 🟢 ÍNDICE MESTRE ATIVO (revisado 2026-07-12). Cada documento dedicado carrega seu próprio STATUS no topo. Reorganização concluída; os 6 docs de tarefa + este índice foram revisados. Trabalho pendente vivo: Fase 11 Reporter (`TASK-7layer-reporter.md`, pendente). WS2 ✅ CONCLUÍDO · WS3 ✅ RESOLVIDO (débito N2-B documentado) · Gap 1 ✅ CONCLUÍDO (boundary validation Zod) · Gap 2 ✅ CONCLUÍDO (provenance/confidence via `hub.raw.provenance`) · Gap 3 ✅ CONCLUÍDO (branch-aware metrics via `branchFilter`/`getBranchPassRate`) · Gap 4 ✅ CONCLUÍDO (Incremental Updates — `since` threaded + `mergeIncremental` + `ensureDataHub` incremental).

> **Documento original preservado:** `data-hub-ssot-enforcement.md` (marcado SUPERSEDED no topo). Este índice é a fonte de navegação; os documentos dedicados são a fonte de verdade por tarefa.

---

## §1 — Invariantes e Contratos (Referência Compartilhada)

Estas seções são **contratos de referência** que governam TODAS as tarefas. Não são fases executáveis — são regras absolutas.

### 1.1 CONTEXTO FUNDAMENTAL

#### O que estamos fazendo

Estamos **construindo uma nova arquitetura** de dados. Não estamos mantendo uma existente. O DataHub é o novo ponto central que substituirá TODAS as fontes alternativas de dados (MetricsStore, acesso direto a APIs CI, cálculos locais).

#### Por que estamos fazendo

O estado atual é caótico: 35 bypasses mapeados em 28 arquivos. Cada consumidor baixa, parseia e calcula dados por conta própria. Isso gera:

- Inconsistência (cálculos diferentes em lugares diferentes)
- Duplicação (mesma lógica implementada N vezes)
- Manutenção impossível (mudar um cálculo requer mudar N arquivos)
- Impossibilidade de escalar (cada novo consumidor duplica trabalho)

#### Nosso objetivo final

**MetricsStore será deletado.** Toda persistência passa pelo DataHub internamente. Consumidores NÃO acessam persistence diretamente — chamam métodos do DataHub que encapsulam a persistência.

#### Por que "manutenção de arquitetura" não é argumento válido

Estamos em **construção**, não manutenção. Argumentos como "isso quebra o padrão existente" ou "não há consumidores para essa função" são inválidos porque:

- O padrão existente É o problema que estamos resolvendo
- Funções sem consumidores são assim PORQUE estamos no meio da construção
- O fato de algo não existir hoje não é argumento para não construir

#### Por que "consumidores não usam função" não é argumento para deleção

Se uma função existe no plano de arquitetura, ela existe por uma razão: consumidores a usarão quando a migração estiver completa. Argumentar para deletar uma função porque "ninguém a chama hoje" é sabotagem do plano que estamos executando. O custo de migração JÁ ESTÁ NO ORÇAMENTO do plano.

#### Regra de decisão

**A ÚNICA justificativa para qualquer ação é SUPERIORIDADE TÉCNICA ou SEGURANÇA.** Não:

- "Manutenção de padrão"
- "Simplicidade"
- "Esforço de implementação"
- "Não há consumidores"
- "Custo de migração"

### 1.2 SYSTEM MODEL

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

### 1.3 CONTEXTO E RACIONAL

#### Por que DataHub é incondicional

DataHub não é uma "opção melhor". É a única arquitetura correta. Antes do DataHub, cada consumidor baixava, parseava e calculava dados por conta própria — resultando em 35 bypasses mapeados em 28 arquivos. O DataHub consolida toda essa lógica em um único lugar. Quando DataHub existe, ele É a fonte de verdade. Sem fallback. Sem "quando possível".

#### Por que `dataHub?` é transitório

A assinatura `dataHub?: DataHub` existe porque 6 chamadores ainda não foram migrados:

- `jira_management/main.ts:344`
- `jira_management/commands/case26.ts:23`
- `jira_management/commands/case19.ts:70`
- `shared/cli_base.ts:220`
- `shared/pr-report-core.ts:487`
- `shared/quality-gate.ts:196`

Esses chamadores são consumidores silenciosos — o plano os lista na Fase 9.1. Quando todos forem migrados, `dataHub` pode (e deve) se tornar obrigatório. A opção `?` é uma necessidade transitória, não um design.

#### Por que a Fase 8 deleta módulos

A Fase 8 deleta `ci-test-downloader`, `coverage-source`, `commit-log` — módulos que fazem download direto de artefatos CI, leitura de arquivos Istanbul, e chamadas diretas à API CI. O DataHub já faz tudo isso via `DataProvider`s. Manter esses módulos cria risco de bypass acidental. Deletar consolida a arquitetura.

#### Por que precisamos construir infraestrutura antes de migrar consumidores

Atualmente, DataHub só pode ser criado via `DataHubImpl.create(providers)` — que precisa de provedores CI. Mas 23 arquivos usam `persistence.loadMetricsStore()` sem acesso a provedores. Esses callers não podem migrar para DataHub se DataHub não for acessível de seus contextos.

**Solução:** Construir infraestrutura (Fases 0.5-0.8) que permite:

1. Criar DataHub a partir de dados persistidos (`loadFromStore`)
2. DataHub salvar/carregar dados internamente (persistência integrada)
3. Qualquer caller obter um DataHub (`global-hub.ts`)
4. DataHub ser obrigatório (sem `persistence?` opcional)

Essas fases são PREREQUISITO para todas as migrações de consumidores.

#### O que acontece se uma fase falhar

Não há rollback automático. Se uma fase falhar:

1. **Parar** — não pular para a próxima fase
2. **Diagnosticar** — qual checkpoint falhou e por quê
3. **Corrigir** — causa raiz, não workaround
4. **Reexecutar** — o checkpoint inteiro, não apenas o item que falhou

Nunca "contornar" um erro para fazer o checkpoint passar. Se o checkpoint falha, há um defeito real.

#### Cadeia de dependências

```
Fase 0 (fundação) → Fase 0.5 (loadFromStore) → Fase 0.6 (persistência) → Fase 0.7 (global-hub)
→ Fase 0.8 (obrigatório) → Fase 1 (health-score + quality-gate SSOT) → Fase 3 (pr-report-core)
→ Fase 4 (git_triggers) → Fase 5 (error-handling) → Fase 6 (shared restantes)
→ Fase 7 (auditoria pós-migração) → Fase 8 (deletar fontes alternativas)
→ Fase 9 (consumidores silenciosos) → Fase 10 (ESLint enforcement)
```

> **Nota (2026-07-10):** Fase 2 (quality-gate) absorvida pela Fase 1.

Cada fase depende da anterior. Não é possível pular fases.

### 1.4 ERROR HANDLING CONTRACT

**Padrão ouro:** `shared/data-hub/persistence.ts` — único módulo com tratamento completo.

#### Regras Obrigatórias

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

#### Padrão de Implementação

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

#### humanizeError — Padrões Conhecidos (existentes em `shared/prompt-errors.ts`)

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

#### humanizeError — Padrões NOVOS a Adicionar (antes de implementar Fase 3-5)

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

#### Arquivos com Erros Silenciosos em Produção (MUST FIX antes de Fase 7)

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

### 1.5 TESTING DISCIPLINE

#### Regras Obrigatórias

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

#### Hierarquia de Testes (obrigatório ter todos)

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

#### Test Data Source Hierarchy

| Prioridade  | Fonte                             | Quando usar                                    |
| ----------- | --------------------------------- | ---------------------------------------------- |
| 1 (highest) | `shared/test-utils/factories/`    | SEMPRE — factories tipadas com shapes corretas |
| 2           | `createTestHub()` (mock data-hub) | Para testes que precisam de DataHub mockado    |
| 3           | Fixtures inline                   | Apenas para valores literais simples           |
| ❌ Proibido | Copiar saída do código            | Nunca — codifica bugs como features            |

#### Factory Registry

| Factory                              | Arquivo                                       | Cria                                 |
| ------------------------------------ | --------------------------------------------- | ------------------------------------ |
| `createMockJiraResource`             | `factories/jira-resource-factory.ts`          | `Mocked<JiraResource>` (20+ métodos) |
| `createMockLinkManager`              | `factories/link-manager-factory.ts`           | `Mocked<JiraLinkManager>`            |
| `createMockContext`                  | `factories/context-factory.ts`                | `Mocked<CommandContext>` (composite) |
| `createMockGitProvider`              | `factories/git-provider-factory.ts`           | `Mocked<GitProvider>` (22 métodos)   |
| `createMockConfig`                   | `factories/config-factory.ts`                 | `ConfigStatic`                       |
| `createMockTestExecutionCreator`     | `factories/test-execution-creator-factory.ts` | `MockTestExecutionCreator`           |
| `createMockResponse`                 | `factories/response-factory.ts`               | `{ data: T }` wrapper                |
| `createFlatTest` / `createFlatTests` | `factories/flat-test-factory.ts`              | `FlatTest` objects                   |
| `createTestHub`                      | `shared/__mocks__/data-hub.ts`                | `DataHub` mockado com computedFields |

#### BadTesting — Instâncias Encontradas (corrigir após Fase 4)

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

## §2 — Mapa Mestre de Tarefas

| ID  | Tarefa                                             | Documento Dedicado              | Status   |
| --- | -------------------------------------------------- | ------------------------------- | -------- |
| T1  | Fase 22 — Consumer Migration (SSOT)                | `TASK-22-consumer-migration.md` | VEJA DOC |
| T2  | 7-Layer — Foundation + EXPAND+STORE + ST-3         | `TASK-7layer-foundation.md`     | VEJA DOC |
| T3  | 7-Layer — Layer 4 Log Parser (L4)                  | `TASK-7layer-logparser.md`      | VEJA DOC |
| T4  | 7-Layer — Reporter Detection (AST/Hybrid)          | `TASK-7layer-reporter.md`       | VEJA DOC |
| T5  | Fase 22 — Corrections (Retomada/Reescopo/Re-audit) | `TASK-22-corrections.md`        | VEJA DOC |
| T6  | Registros Históricos (auditoria/status)            | `SSOT-CHANGELOG.md`             | VEJA DOC |

Cada documento dedicado contém o status detalhado de suas sub-tarefas.

---

## §3 — Grafo de Dependências

```
T2 (Foundation 7-Layer: Fase 0, EXPAND+STORE, ST-3)
  └─> T3 (Layer 4 Log Parser)       [depende de T2: log-parser é Camada 4]
  └─> T4 (Reporter Detection)       [depende de T2: parser de reporters]
  └─> T1 (Fase 22 Consumer Migration: Fase 0.5-0.8 infra precede Fase 1-10)
        └─> T5 (Fase 22 Corrections) [correções descobertas durante T1]
T6 (Histórico) — referência passiva, sem dependências
```

---

## §4 — Referências

- `data-hub-ssot-enforcement.md` — documento original (SUPERSEDED, preservado para auditoria)
- `data-hub-layered-architecture.md` — design de arquitetura das 7 camadas (referência de design)
- `PROGRESS-LAYERED-ARCH.md` — changelog de progresso de implementação das 7 camadas
- `TASK-22-consumer-migration.md` — Fases 1, 3, 4, 5, 6, 7, 8, 9, 10 + pendências do Layered-Arch
- `TASK-7layer-foundation.md` — Fase 0, EXPAND+STORE (LA/PM/XR/COV/ST), ST-3 + Design Gaps 1-4
- `TASK-7layer-logparser.md` — ⚠️ CONTEÚDO REAL = Fase L4 "Extração Profunda + Xray" (providers Xray/ST-1/PM-1/LA-1/XR-1/PM-4/ST-3/MENU/WIRE), já executada. A tarefa de robustez do `log-parser.ts` (L4.0–L4.7, L4-G1..G9) está em `TASK-22-corrections.md` (seção "FASE L4 — Robustez da Camada 4"). Ver disparidade de nomenclatura documentada no topo de `TASK-7layer-logparser.md`.
- `TASK-7layer-reporter.md` — Fase 11 / FASE D (AST/hybrid)
- `TASK-22-corrections.md` — Retomada, Reescopo, Re-auditoria + WS2/WS3/Store
- `SSOT-CHANGELOG.md` — inventário de bypasses, matriz de consumidores, riscos, audit trail
