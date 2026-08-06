# Issue Link Service — Plano de Implementação

**Data**: 2026-08-05
**Branch**: `feature/associate-te-cli`
**Status**: Implementação concluída — gate verde (ver §8.1)
**Plano-fonte**: este documento (regra §27 AGENTS.md — plan-driven execution)

---

## 1. Contexto e Motivação

### 1.1 O defeito (Test Coverage invertida)

Jira Cloud Xray preenche o campo **Test Coverage** de uma User Story quando o link
é criado na direção `inward=US, outward=TEST` (link type `Tests`: inward = "is
tested by", outward = "tests").

O código atual tem **duas funções com direções OPOSTAS** sob o mesmo nome de
parâmetro `sourceKey` (`jira_management/link-operations.ts`):

| Função | Payload | Direção |
|---|---|---|
| `linkIssues(sourceKey, [...])` | `inward=sourceKey, outward=li.key` | INVERTIDA p/ Test Coverage |
| `createIssueLink(sourceKey, targetKey)` | `inward=targetKey, outward=sourceKey` | CORRETA p/ Test Coverage |

Consequência: o fluxo CSV/JSON import (`import-loop.ts:206` → `linkIssues`) cria
Test Coverage **invertida** — é o defeito que motivou este plano.

### 1.2 Violação de arquitetura

Duas funções com contrato de direção conflitante = **parallel implementation**
(§3 AGENTS.md — forbidden transformation). A correção é **na origem**: eliminar a
duplicação e unificar num único serviço com direção explícita no modelo de dados.

### 1.3 Perda de direção no snapshot

`LinkSnapshot {id, targetKey, linkType}` (`shared/types/clean-slate.ts:23-27`)
não preserva inward/outward. `snapshotLinks` captura `targetKey =
outward??inward` (`link-operations.ts:57,74`), e rebuild/restore reconstrói via
`linkIssues` (direção invertida). O restore de links de `Tests` fica infiel.

---

## 2. Objetivo

1. Criar serviço centralizado de issue links em `jira_management/services/` com
   **direção explícita** no modelo de dados e **operações semânticas** (o usuário
   escolhe o tipo de link; o serviço decide inward/outward).
2. Corrigir a Test Coverage invertida no import CSV/JSON.
3. Preservar a direção no snapshot/restore (corrigir `LinkSnapshot`).
4. Migrar TODOS os consumidores de `linkIssues`/`createIssueLink` para o serviço
   (§7 system consistency — sem estado misto).
5. case18: criar testes no Jira + linkar à US de origem (direção correta).

---

## 3. Decisões de Design (autorizadas)

| Decisão | Resposta | Autoridade |
|---|---|---|
| Pasta `jira_management/services/` | Aceita | usuário (serviços centralizados futuros) |
| Apagar `linkIssues`, absorver `createIssueLink` | Aceito | usuário + §3 (não-paralelo) |
| UX do alvo da issue | **Digitação livre + GET issue/KEY + confirmação com summary** (sem auto-complete) | usuário (tens de paginação ~2000 issues) |
| Link type | Menu `showSelect` de `issueLinkTypes` (conjunto finito); direção sempre derivada pelo serviço | usuário |
| Correção do snapshot | **Mesmo plano** | usuário |
| case18 criar + linkar | **Mesmo plano** | usuário |
| Erro em key inexistente | warn explícito + continue (sem hard-fail), preserva retomada | §18/§24/§25 |

---

## 4. Arquitetura Alvo

```
jira_management/services/
├── issue-link.service.ts     # Motor: modelo com direção + operações semânticas
└── issue-picker.ts           # UX: digitação + GET + confirmação (menu linkType)

shared/types/
└── clean-slate.ts            # LinkSnapshot ganha inwardKey/outwardKey (corrigir)
```

### 4.1 Motor — `issue-link.service.ts`

- **Modelo de leitura**: `IssueLink { id, linkType, inwardKey, outwardKey }`.
- **Primitivo**: `createLink({ linkType, inwardKey, outwardKey })` — resolve id,
  posta `issueLink`, idempotência (duplicado → warn + skip).
- **Leitura**: `getIssueLinks(issueKey): IssueLink[]` (preserva direção).
- **Limpeza**: `clearIssueLinksByType(issueKey, linkType)`.
- **Operações semânticas** (direção codificada UMA vez):
  - `linkTestsToRequirement(requirementKey, testKeys[])` → `Tests`:
    `inward=requirement, outward=test` (Test Coverage correta).
  - `linkTestToTestExecution(teKey, testKeys[])` → `Tests`:
    `inward=te, outward=test`.
  - `linkRelated(sourceKey, targetKeys[])` → `Relates` (simétrico).
  - `linkPreCondition(testKey, pcKeys[])` → `Pre-Condition`.
- **Safeguards §24/§25**: validação de args (empty/null), NaN não aplicável a
  strings mas exige `Number.isFinite` em thresholds — sem threshold aqui; 404 →
  warn explícito com causa + forma de correção + capacidade de retomada
  (skip/abort), nunca silenciar.

### 4.2 UX — `issue-picker.ts`

1. Menu de link type via `showSelect` (reutiliza `JiraLinkManager.getIssueLinkTypes`).
2. Input livre da issue key (ou keys separadas por vírgula).
3. `GET issue/KEY?fields=summary,issuetype` → valida existência.
4. Exibe `KEY — "summary" (issuetype)` + confirmação `s/N`.
5. `issue-picker` NUNCA escolhe direção — delega a operação semântica ao serviço.

---

## 5. Migração de Consumidores (§7)

| Arquivo | Chamada atual | Nova chamada |
|---|---|---|
| `jira_management/issue-linker.ts:210-272` | `linkManager.linkIssues(issueKey, linkedIssues)` | `linkManager.linkRelated`/`linkTestsToRequirement` (dir. semântica) |
| `jira_management/import-loop.ts:206` | `linker.linkIssues(createdKey, test)` | via `IssueLinker` refatorado |
| `jira_management/test-execution-creator.ts:199,372` | `createIssueLink(test,te,'Tests')` + `linkIssues` | `linkTestToTestExecution` / `linkRelated` |
| `jira_management/result_reporter.ts:189` | `createIssueLink(m.key, te.key, 'Tests')` | `linkTestToTestExecution` |
| `shared/report/bug-report.ts:429` | `linkManager.linkIssues(key, report.linkedIssues)` | `linkManager.linkRelated(key, keys)` |
| `jira_management/issue-snapshot.ts:161-174,419,518` | `linkOps.getIssueLinksByType` + `linkIssues` | `getIssueLinks` + `createLink` (direção preservada) |
| `jira_management/jira_link_manager.ts:40-45,64` | `linkIssues`/`createIssueLink` wrappers | wrappers do serviço |

### 5.1 Interface `JiraLinkManagerLike` (`shared/types/jira.ts:91-94`)

Substituir `linkIssues(...)` por `linkRelated(sourceKey, targetKeys)`. Manter G3:
`shared/` continua importando apenas tipo, sem dependência de runtime.

---

## 6. case18 — criar + linkar

Após `convertTestCases`/`writeTestOutput` (JSON), adicionar passo opcional:
1. Perguntar se deseja **criar os testes no Jira**.
2. Reusar `createTestsFromTestCases` (`import-orchestrator.ts:427`) para criação.
3. Selecionar a US de origem via `issue-picker` (digitação + confirmação).
4. `linkTestsToRequirement(usKey, createdTestKeys)` — Test Coverage correta.

---

## 7. Testes (RED primeiro — §19)

1. **Repro bug**: teste que cria link Test Coverage via serviço e assere payload
   `inward=US, outward=TEST` (falha no código atual).
2. **Unit serviço**: direção de cada operação semântica, idempotência, 404 warn,
   args inválidos (empty/null).
3. **Unit picker**: key inexistente (warn), confirmação negada (não cria), multi-keys.
4. **Unit snapshot**: `LinkSnapshot` com direção; rebuild preserva inward/outward.
5. **e2e nock**: import CSV com `linkedIssues` → payload correto; TE creation;
   bug-report `linkRelated`.
6. **Mocks strict §26**: atualizar `__mocks__/jira_link_manager.ts` e afins para
   novo shape (sem mock-teatro).
7. Migrar testes existentes que assertam `linkIssues`/`createIssueLink` direto.

---

## 8. Verificação (gate)

1. `npm run typecheck` — 0 erros.
2. `npm run lint` — 0 violações (ratchet respeitado).
3. `npm test` — suíte completa 100% verde.
4. `npm run test:coverage` — floors mantidos.
5. `npm run depcruise`, `npm run no-swallow`, `npm run audit-suppressions`.
6. **Re-prova empírica (requer VPN)**: ECSPOL-731 — criar link dir correta,
   conferir Test Coverage na US, remover. (Bloqueado até VPN.)

### 8.1 Resultado do gate (2026-08-06)

| Gate | Resultado |
|---|---|
| `npm run typecheck` | ✅ 0 erros |
| `npm run lint` (`quality-check.ts`) | ✅ all quality checks passed |
| `npm test` | ✅ 554 arquivos / 7679 testes verdes |
| `npm run test:coverage` | ✅ Statements 90.39 / Branches 80.94 / Functions 93.58 / Lines 91.8 (floors 90/80/91/90) |
| `npm run depcruise` | ✅ 985 módulos, 3957 dependências — 0 violações |
| `npm run no-swallow` | ✅ nenhuma supressão no diff |
| `npm run audit-suppressions` | ⚠️ não executável localmente (`audit/suppressions.yaml` ausente — artefato de CI) |
| Verificação empírica ECSPOL-731 | ⛔ bloqueada (VPN OFF) — passo condicional, §9 |

## 9. Fora de Escopo

- Auto-complete JQL por tecla (rejeitado: paginação/rate-limit).
- Verificação empírica ECSPOL-731 (bloqueada por VPN; passo condicional).

---

## 10. Auditoria Final da Fase

- Confirmar funções conectadas ao menu/interfaces (§ auditoria).
- Confirmar E2E executável: case18 gera → cria no Jira → linka à US.
- Registrar resultado no `PROGRESS.md`/commit log conforme padrão do repo.
