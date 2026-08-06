# Count-Driven Import Mode (Task 2) — Plan

Autoridade: AGENTS.md §27 (plan-driven execution). Task 2 do fluxo de import CSV no
menu interativo (`jira_management/commands/case01.ts`).

## Contexto

O menu "Importar CSV" (case01) perguntava o modo de importação como
`1 = criar novo | 2 = atualizar existente | 3 = híbrido` (adicionado no Task 1 como
passo intermediário). Task 2 substitui esse prompt por um fluxo **count-driven**:
o usuário declara QUANTAS issues serão atualizadas; a ferramenta deriva o
`importMode` e valida a existência de cada chave Jira informada.

## Decisões (D1–D6)

### D1 — Pré-leitura do CSV para obter o total

Antes de qualquer prompt de quantidade, ler o CSV uma vez via
`csvResource.readBulkCsvWithMeta(csvPath)` para conhecer `total`.

- Double-read aceitável (arquivo local); contrato de `createTestsFromCsv` inalterado.
- Falhas distinguíveis (`empty` / `missing` / `read-error`) → `describeCsvFailure`
  + `warn` + `pushHistory('csv-import', detail, 'error')` + `lastOperation` + return
  (mesmo caminho do pipeline de falha). Nunca silenciar (§25).
- Necessário adicionar `readBulkCsvWithMeta` ao mock de csvResource em
  `shared/test-utils/factories/context-factory.ts` (mock shape-faithful §26).

### D2 — Prompt N: default 0 / Enter = criar todas (aprovado pelo usuário)

`ask('Quantas issues serão atualizadas?', { hint, default: '0' })`.

- Hint textual explícito (aprovado): `tecle Enter para não atualizar (criar todas as N)`
  | `N = atualizar todas` | `1..N-1 = atualizar parte`.
- Enter/`0` → `targetKeys = []`, `importMode = 'create'`.
- Rationale: retrocompatível com o default histórico `'create'` (prompt antigo
  `default: '1'`, `prepareTestRun` default `'create'`); Enter nunca dispara ação
  destrutiva (§5/§24).

### D3 — importMode derivado do count; atalho de config REMOVIDO (aprovado)

- `N === 0` → `'create'`; `N === total` → `'update'`; senão → `'hybrid'`.
- O atalho `Config.get('importMode')` deixa de existir — **sempre** pergunta N.
  Fonte única de verdade (N → keys → importMode), sem contradição de autoridade (§16).
- Automação não afetada: caminho headless (`main.ts`) continua lendo/escrevendo
  `Config` via CLI (main.ts:99, 537, 573).

### D4 — Safeguards de contagem (§24)

Loop com re-ask até entrada válida:

- `N` não-inteiro ou `<= 0` (exceto Enter/`0`) → `warn` + re-ask (`Number.isInteger`).
- `N > total` → `warn` + re-ask.
- Prompt de keys: `Informe as N chaves Jira (separadas por vírgula)`, ordem = ordem
  dos testes no CSV.
- Contagem declarada ≠ keys informadas → `warn` + **volta ao prompt de N** com hint
  das keys já coletadas (`keysHint`).

### D5 — Safeguard de existência de chave; skip preserva posição

Para cada key (na ordem), verificar `jiraResource.getJiraResource('issue/'+key)`:

- Sucesso → `info('Chave encontrada ...')` (com summary quando presente).
- Falha → `onError('Chave X não encontrada no Jira', err, { retry: true })` →
  `[R]etry` / `[S]kip` / `[A]bort`.
  - retry → repete verificação da mesma key.
  - skip → **mantém a key na lista** (integridade posicional `targetKeys[i]` ↔ teste
    CSV `i`; a factory já skipa o test case inteiro quando a key não existe).
  - abort → `warn` + `pushHistory('csv-import', 'cancelada pelo usuário', 'error')`
    + return.
- Após import com sucesso (ao final): `warn` listando keys ignoradas por não existirem.

### D6 — Config e passagem explícita ao pipeline

- `Config.set('targetKeys', keys.join(','))` e `Config.set('importMode', importMode)`
  ANTES dos prompts de labels (a factory lê `Config.get('targetKeys')`).
- Passar `targetKeys` + `importMode` explicitamente a `createTestsFromCsv` quando
  `targetKeys.length > 0` (evita o re-prompt manual "Mapear por chave Jira?" do
  orchestrator `resolveTargetKeys`).
- `N === 0`: o prompt manual "Mapear por chave Jira?" permanece como hoje (não
  alterado; nenhum teste o afirma).

## Arquivos

- `jira_management/commands/case01.ts` — fluxo count-driven.
- `shared/test-utils/factories/context-factory.ts` — mock `readBulkCsvWithMeta`.
- `jira_management/commands/__tests__/case01.test.ts` — testes unit (RED→GREEN).
- `jira_management/commands/__tests__/case01.integration.test.ts` — testes de
  integração do fluxo (mock csvResource com `readBulkCsvWithMeta`).

## Critérios de aceite

- Enter/`0` → `importMode='create'`, `targetKeys=[]`, sem prompts de keys.
- `N===total` → `'update'`; `1<=N<total` → `'hybrid'`; N>total re-ask; N inválido re-ask.
- Mismatch de contagem → volta ao prompt de N com hint.
- Key inexistente → `[R]/[S]/[A]`; skip mantém posição + warn final; abort cancela.
- Falha de leitura CSV → mensagem distinguível (empty/missing/read-error).
- Suite completa + cobertura (floors) + typecheck + lint verdes.

## Sequência de execução

1. Test-first (§19.13): testes RED.
2. Implementar `case01.ts` (GREEN).
3. Verificação (suite, cobertura, tsc, lint).
4. Commit Task 2.
