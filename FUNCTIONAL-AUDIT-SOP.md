# FUNCTIONAL-AUDIT-SOP — Executable Specification

> Checklist linear para auditar FT-xx.
> Cada seção = comando exato + critério binário + checkpoint.
> Regras de execução (formato de cabeçalho, sequencialidade, proibições) em AGENTS.md §22.
> Se qualquer passo falhar: PARAR. Reportar. Não continuar.

**Pré-requisito:** antes de cada Phase, ler `${SOURCE}`, `${TEST_FILE_UNIT}`, `${TEST_FILE_INTEGRATION}`, `${TEST_FILE_PBT}`, `${FEATURE_NAME}`, `${CONSUMERS}` dos metadados da feature no PROGRESS.md.

<!-- Phase 0: lines 14-60 -->

## Phase 0 — Preparação

### P0.1 — Identificar feature

`grep -n 'still pending\|Próximo' FUNCTIONAL-AUDIT-PROGRESS.md`
✅ found FT-XX / ❌
Fallback: `grep -n '### FT-' FUNCTIONAL-AUDIT-PROGRESS.md | tail -1`
Fallback2: `grep -n 'FT-' FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md | grep 'pending\|still' | head -5`
Extrair FEATURE_NAME e FT-ID da linha encontrada (ex: `FT-09 Metrics Adapter` → ID=09, FEATURE_NAME=metrics-adapter).
Registrar: `**Início:** $(date +%Y-%m-%d)` no PROGRESS.md

### P0.2 — Carregar definições

`grep -A 10 "\bFT-${ID}\b" FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md`
Extrair: módulo, grupo, ordem. Registrar no PROGRESS.md.

### P0.3 — Encontrar source, tests, consumers

```
find . -name "${FEATURE_NAME}.ts" -not -path '*/node_modules/*'
find . -path "*__tests__/${FEATURE_NAME}.test.ts" -not -path '*/node_modules/*'
find . -path "*__tests__/integration/${FEATURE_NAME}.integration.test.ts" -not -path '*/node_modules/*'
find . -path "*__tests__/${FEATURE_NAME}.property.test.ts" -not -path '*/node_modules/*'
```

`wc -l ${SOURCE}` — contar linhas do source
`grep -rl "'${FEATURE_NAME}'" shared/ --include='*.ts' | grep -v test | grep -v node_modules` — consumers
`npx vitest run ${FEATURE_NAME} --reporter=verbose 2>&1 | grep 'Tests'` — contagem de testes

### P0.4 — Registrar metadados

Escrever no PROGRESS.md:

```markdown
**Metadados FT-XX:**

- FEATURE_NAME:
- MODULE_NAME:
- SOURCE:
- TEST_FILE_UNIT:
- TEST_FILE_INTEGRATION:
- TEST_FILE_PBT:
- CONSUMERS:
- DOCS:
```

`<!-- CHECKPOINT: Phase 0 complete -->`

<!-- Phase 0.1: lines 62-103 -->

## Phase 0.1 — Deep read & pre-scan

### 0.1.1 — Ler source

`cat ${SOURCE}`
Para cada função, verificar e registrar tabela no PROGRESS.md (colunas: # | Categoria | Local | Descrição):
| # | Pergunta | ❌ registra |
|---|----------|-------------|
| 1 | Nome revela o que faz? | gap clareza |
| 2 | `unknown` / parsing sem validação? | gap tipo |
| 3 | `as`, `!`, `@ts-ignore`, `eslint-disable`? | gap T14 |
| 4 | `Object.entries(objeto)` propaga `any`? | gap typesafety |
| 5 | I/O sem try/catch? | gap error handling |
| 6 | catch vazio ou `(err as Error).message`? | gap T14e/b |
| 7 | Error handler chama módulo de volta? | gap segurança |
| 8 | Getter com side effect? | gap arquitetura |
| 9 | Mensagem de erro diz o que fazer? | gap UX |
| 10 | Importa lib externa sem DepWall? | gap DepWall |
| 11 | Estado mutável compartilhado? | gap isolamento |
| 12 | Constantes mágicas? | gap manutenibilidade |

### 0.1.2 — Ler testes

`cat ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
Para cada describe/it, verificar:
| # | Pergunta | ❌ registra |
|---|----------|-------------|
| T1 | Nome descreve comportamento? | gap naming |
| T2 | `as`, `!`, `@ts-ignore`? | gap T14 |
| T3 | Mock shape idêntico ao real? | gap mock |
| T4 | Expected value de requirements ou de output copiado? | gap Oracle |
| T5 | Testa uma coisa ou várias asserts? | gap coesão |
| T6 | `.skip`, `.only`, `.todo`? | gap |
| T7 | `toBeDefined()` sem assert real? | gap weak assertion |
| T8 | Estado compartilhado entre describes? | gap isolamento |
| T9 | beforeEach/afterEach limpam estado? | gap |

### 0.1.3 — Registrar pre-scan

Escrever no PROGRESS.md: `**Pre-scan achados (Phase 0.1):` com #, categoria, local, descrição.

`<!-- CHECKPOINT: Phase 0.1 complete -->`

<!-- Phase 1: lines 105-140 -->

## Phase 1 — Mapeamento

### 1.1 — Exports

`grep -oP '^export (function|const|class|interface) \K\w+' ${SOURCE}`
✅ lista de exports / ❌ sem exports públicos

### 1.2 — Consumers

Para CADA export E encontrado em 1.1:
`grep -rl --include='*.ts' "(from ['\"']\\.\\.?/${FEATURE_NAME}|from ['\"']\\.\\./${FEATURE_NAME}|import\\s*\\{\\s*'${E}'\\s*\\} )" .`
✅ lista de paths (excluindo tests + node_modules) / ❌

### 1.3 — TECHDOC

`grep -n "${FEATURE_NAME}" docs/TECHDOC.md`
✅ encontrado / ❌ gap T19-1

### 1.4 — Consumer test run

Para CADA CONSUMER na lista de 1.2:
`npx vitest run $(basename $(dirname ${C})) --reporter=verbose 2>&1 | tail -5`

Registrar lista de CONSUMERS no PROGRESS.md (para uso em Phase 7).

`<!-- CHECKPOINT: Phase 1 complete -->`

<!-- Phase 2: lines 142-245 -->

## Phase 2 — T1-T20

Para cada T: executar comando, registrar ✅/❌. Se ❌: criar gap (não corrigir ainda).
Registrar tabela no PROGRESS.md (ID | comando | status | observação).

### T1: Entry point

`grep '^export function\|^export const\|^export class\|^export default' ${SOURCE}`
✅ exports públicos / ❌

### T2: Config model

`grep -n 'interface\|type\|z\.object\|z\.string\|z\.number\|zod' ${SOURCE} | head -10`
✅ interfaces + schema / ⚠️ sem schema / ❌ sem interface

### T3: Config accessor

`grep -n 'config-accessor\|Config\b\|config\.get\|configAccessor' ${SOURCE} | head -5`
✅ / ❌ N/A

### T4: Runtime lê config

`grep -n 'config\|process\.env\|\.env\|xdgStateHome' ${SOURCE} | head -10`
✅ / ❌ N/A

### T5: Wizard entry

`grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | head -5`
✅ / ❌ N/A

### T6: Wizard detection

`grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | grep -i 'detect\|auto' | head -5`
✅ / ❌ N/A

### T7: Wizard output

`grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | grep -i 'write\|generate\|create\|output' | head -5`
✅ / ❌ N/A

### T8: Wizard prompts

`grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | grep -i 'prompt\|question\|ask\|input' | head -5`
✅ / ❌ N/A

### T9: Reconfig handler

`grep -rn "${FEATURE_NAME}" git_triggers/ --include='*.ts' 2>/dev/null | grep -i 'reconfig\|reconfigure\|handler' | head -5`
✅ / ❌ N/A

### T10: CI integration

`grep -rn "${FEATURE_NAME}\|${MODULE_NAME}" .github/ --include='*.yml' --include='*.yaml' 2>/dev/null | head -5`
✅ / ⚠️ / ❌ N/A

### T11: CI safety

`grep -n 'try\|catch\|fallback\|catch' ${SOURCE} | head -10`
✅ safety mechanisms ativos / ⚠️ / ❌

### T12: Test coverage

`npx vitest run ${FEATURE_NAME} --reporter=verbose 2>&1 | grep -E 'Tests|Test Files'`
✅ unit + integration + PBT (quando aplicável) / ❌ missing coverage

### T13: Dead code

```
grep -oP '^function \K\w+' ${SOURCE} | while read fn; do count=$(grep -cP "\b${fn}\b" ${SOURCE}); if [ "$count" -le 1 ]; then echo "POSSIVELMENTE MORTO: $fn (refs: $count)"; fi; done
grep -oP '^const \K\w+' ${SOURCE} | grep -vP '^export' | while read cn; do count=$(grep -cP "\b${cn}\b" ${SOURCE}); if [ "$count" -le 1 ]; then echo "POSSIVELMENTE MORTO: $cn (refs: $count)"; fi; done
```

✅ zero mortos / ❌

### T14: Suppressions (sub-checks)

Definir: `FILES="${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT}"`
Para CADA sub-check: executar o comando. 0 hits = ✅, hits = ❌ gap.
| Código | Comando |
|--------|---------|
| T14a | `grep -P 'as any\|as unknown' $FILES 2>/dev/null` |
| T14b | `grep -nP '[a-zA-Z0-9)\]>]\s*!\s*[);,}\]]' $FILES 2>/dev/null` |
| T14c | `grep -P '@ts-ignore\|@ts-expect-error' $FILES 2>/dev/null` |
| T14d | `grep -P 'eslint-disable' $FILES 2>/dev/null` |
| T14e | `grep -A1P 'catch\s*\{' $FILES 2>/dev/null \| grep -P '^\s*\}'` |
| T14f | `grep -nP 'JSON\.parse\(.*\) as [A-Z]\w+' $FILES 2>/dev/null` |
| T14g | `grep -nP 'as never' $FILES 2>/dev/null` |
| T14h | `grep -nP 'as (string\|number\|boolean)\b' $FILES 2>/dev/null` |
| T14i | `grep -nP 'Object\.entries\(' $FILES 2>/dev/null` |

T14i pós-grep: inspecionar MANUALMENTE cada match. Se `Object.entries()` usado só como `for (const [key])` → não é gap. Se `any` propagado (ex: `val` em expressão tipada) → ❌ gap.

### T15: Bidirectional consistency

`grep -rl "${FEATURE_NAME}" --include='*.ts' . | grep -v 'test\|node_modules' | sort -u`
✅ unidirecional ou consistente / ❌

### T16: CLI interface

`grep -rn "${FEATURE_NAME}\|${MODULE_NAME}" --include='*.ts' . | grep -i 'cli\|arg\|command\|--help\|program\|dispatch' | head -5`
✅ / ❌ N/A

### T17: Env var dependency

`grep -n 'process\.env' ${SOURCE} | head -10`
✅ nenhuma / ⚠️ usa mas não documentada / ✅ documentada

### T18: Error handling

Comandos individuais (executar 4, consolidar status):

1. `grep -nP '^\s*(try|catch)\s*\{' ${SOURCE}`
2. `grep -nP 'throw\s+(new\s+)?[A-Z]\w*(Error)?' ${SOURCE}`
3. `grep -nP 'rootLogger\.(warn|error|info)\(' ${SOURCE} | grep -vP 'Error|error'`
4. `grep -nP 'return \[\]|return null|return {}|catch' ${SOURCE} | head -10`
   ✅ I/O com try/catch, throw new Error, logs com contexto, fallbacks / ⚠️ catch vazio / ❌ I/O sem try/catch

### T19: TECHDOC presente

`grep -n "${MODULE_NAME}" docs/TECHDOC.md`
✅ / ❌

### T20: CI/Config contract

`grep -rn "${FEATURE_NAME}" .github/ --include='*.yml' --include='*.yaml' 2>/dev/null`
✅ parâmetros consistentes entre CI args, CLI flags e config keys / ❌ N/A

`<!-- CHECKPOINT: Phase 2 complete -->`

<!-- Phase 3: lines 247-330 -->

## Phase 3 — D1-D7

### D1: Isolamento de Testes

`head -80 ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null | grep -n 'beforeEach\|afterEach\|vi\.mock\|vi\.clearAllMocks\|vi\.resetAllMocks\|vi\.restoreAllMocks'`
D1.1✅ cleanup beforeEach/afterEach / D1.2✅ vi.mock / D1.3✅ sem estado compartilhado / D1.4✅ limpeza de recursos

### D2: Robustez

`grep -nP '^(export )?function \w+\(.*:.*\)' ${SOURCE} | head -15`
D2.1✅ input validation (verificar se parâmetros têm null/undefined/default) / D2.2✅ guard clauses / D2.3✅ fallbacks I/O / D2.4✅ timeout
Pelo menos 3/4 ✅

### D3: Boas Práticas

`wc -l ${SOURCE}`
`grep -nP "^import .* from '" ${SOURCE} | grep -vP "\.js|\.json" | grep -v "shared/deps"`
D3.1✅ SRP (cada função, uma responsabilidade) / D3.2✅ DepWall (sem imports diretos de libs externas) / D3.3✅ sem bypass/workaround / D3.4✅ sem duplicação / D3.5✅ nomes claros
Pelo menos 4/5 ✅

### D4: Implementação

`grep -n 'for\|while\|map\|filter\|reduce\|forEach' ${SOURCE} | head -20`
D4.1✅ complexidade adequada / D4.2✅ sem cópias desnecessárias / D4.3✅ sem constantes mágicas / D4.4✅ early returns / D4.5✅ sem dead code
Pelo menos 4/5 ✅

### D5: Métricas

`grep -n 'saveMetrics\|loadMetrics\|MetricsRun\|FailureClassification' ${SOURCE} | head -5`
✅ produz métricas persistidas / ❌ N/A

### D6: UX

```
find docs/ -name '*.md' -exec grep -l "${FEATURE_NAME}" {} \; 2>/dev/null
grep -nP '"(error|warn|info|Usage|Error|Warning):' ${SOURCE} | head -15
grep -nP 'rootLogger\.(warn|error|info)' ${SOURCE} | head -15
```

D6.1✅ mensagens acionáveis (causa + ação) / D6.2✅ documentação existe e reflete comportamento / D6.3✅ terminologia consistente
D6.1+D6.2+D6.3 obrigatórios ✅

### D7: Deep Test Audit

Definir: `TEST_FILES="${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT}"`
Comandos individuais para CADA sub-check:

1. `grep -P 'toBeDefined|toBeTruthy|toBeNull' $TEST_FILES 2>/dev/null` — ✅ 0 hits ou cada hit tem assert real após / ❌
2. `grep -cP '^\s*(it|test)\(' $TEST_FILES 2>/dev/null` e `grep -cP 'expect\(' $TEST_FILES 2>/dev/null` — ✅ expects >= tests / ❌
3. `grep -nP 'expect\(.*\)\.toBe\(|expect\(.*\)\.toEqual\(|expect\(.*\)\.toStrictEqual\(' $TEST_FILES 2>/dev/null` — inspecionar cada match: ✅ de requisitos / ❌ Oracle Problem
4. `grep -P 'vi\.fn|mockReturnValue|mockImplementation' $TEST_FILES | head -10` — ✅ mocks com shape real / ❌ leniente
5. `grep -P 'toThrow\(\s*\)' $TEST_FILES 2>/dev/null` — ✅ 0 hits / ❌ toThrow() sem argumento
6. `grep -P '\.skip\(' $TEST_FILES 2>/dev/null` — ✅ 0 hits ou documentado / ❌ .skip sem doc
7. `grep -P '^\s*(it|test)\("' $TEST_FILES 2>/dev/null` — ✅ nomes de comportamento / ❌ nomes de implementação
8. `grep -P 'beforeEach|afterEach|vi\.(clear|reset|restore)AllMocks' $TEST_FILES | head -5` — ✅ cleanup presente / ❌
9. `grep -P 'as any|@ts-ignore|@ts-expect-error|nullAs\(' $TEST_FILES 2>/dev/null` — ✅ 0 hits / ❌ suppression
10. Inspecionar expects: ✅ invariantes / ❌ dual-implementation (teste replica fórmula do source)
11. `ls ${TEST_FILE_PBT} 2>/dev/null && echo 'EXISTS'` — ✅ PBT presente / ❌ PBT ausente (para lógica crítica)
12. Coverage suppressors (istanbul/c8/v8/nyc):
    `grep -rnP '/\*\s*istanbul\s+ignore|c8\s+ignore|v8\s+ignore|nyc\s+(disable|ignore)|coverage-disable' ${SOURCE} ${TEST_FILES} 2>/dev/null`
    — ✅ 0 hits / ❌ coverage suppression
13. Testes vazios (corpo `{}` sem conteúdo):
    `grep -nP '(it|test)\s*\(\s*['"'"'`][^'"'"'`]+['"'"'`]\s*,\s*(async\s*)?\s*\(\s*\)\s*=>\s*\{\s*\}' ${TEST_FILES} 2>/dev/null`
    — ✅ 0 hits / ❌ empty test body
14. Assertions triviais/tautológicas:
    `grep -nP 'expect\(true\)\.toBe\(true\)|expect\(false\)\.toBe\(false\)|expect\.assertions\(\s*0\s*\)|expect\(([a-zA-Z_]\w*)\)\.to(?:Be|Equal|StrictEqual)\(\s*\1\s*\)' ${TEST_FILES} 2>/dev/null`
    — ✅ 0 hits / ❌ trivial/tautological assertion
15. Catch silenciando falha de teste:
    `grep -Pz '(?s)catch\s*\([^)]*\)\s*\{\s*//\s*(ignore|skip|suppress|swallow|silence|test\s+fail)' ${TEST_FILES} 2>/dev/null`
    — ✅ 0 hits / ❌ catch suppression
16. Oracle Problem — adaptação expected ao output (commits recentes):
    `git log --oneline -20 2>/dev/null | grep -Pi 'update.*expected.*(match|reflect).*(actual|current|new)|change.*assertion.*to match.*actual|(adjust|fix|update).*test.*to match.*(returns|outputs)'` — ✅ 0 hits / ❌ Oracle adaptation
17. `--updateSnapshot` proposto como fix (sem review):
    `grep -rnP 'jest\s+(--updateSnapshot|-u)(?![^;]*after\s+(review|inspect|check|verify))' ${SOURCE} ${TEST_FILES} 2>/dev/null` — ✅ 0 hits / ❌ blind snapshot update
18. Atualização de snapshot como fix (commit message):
    `git log --oneline -20 2>/dev/null | grep -Pi 'update\s+snapshot|fix\s+test.*snapshot|snapshot.*update'`
    — ✅ 0 hits / ❌ snapshot update as test fix
19. N/A para features existentes (não é código novo)

`<!-- CHECKPOINT: Phase 3 complete -->`

<!-- Phase 3.5: lines 329-420 -->

## Phase 3.5 — Domain Adequacy (D8)

### D8.0 — Catalogar tipos de cálculo

Identificar toda operação aritmética, estatística ou transformação numérica que produz métrica de domínio **para a qual existe gold standard formal** na hierarquia de fontes.

Hierarquia de fontes (ordem absoluta):

1. **Legislação** — leis, regulamentos, normas jurídicas
2. **Acreditação** — ISO, NIST, ABNT, IEC, institutos oficiais
3. **Literatura** — livros, journals, proceedings revisados por pares
4. **Indústria** — práticas estabelecidas sem autoridade formal

Teste binário para cada operação:

1. Existe fórmula matemática/estatística formal para esta operação?
2. Essa fórmula tem fonte na hierarquia?
3. → SIM: D8 se aplica. NÃO: D8 não se aplica (verificar só corretude via testes).

Registrar no PROGRESS.md:

```markdown
**D8 — Tipos de cálculo identificados:**
| Operação | Fonte | ID Registry |
|----------|-------|-------------|
| averageScore | NIST/SEMATECH §2.3.1 | F01 |
| stdDev | NIST/SEMATECH §2.3.6 | F02 |
```

### D8.1 — Pesquisar gold standard

Para cada tipo de cálculo **não catalogado**:

1. Pesquisar gold standard na hierarquia
2. Se encontrado: adicionar ao **Formula Type Registry** (ver ANEXO A)
3. Se NÃO encontrado: operação é verificada apenas por corretude, não adequação. Registrar como "sem gold standard conhecido".

```
Comandos:
grep -F "[F" SOP.md | grep "|"   # listar tipos existentes no registry
```

Ao adicionar novo tipo ao registry, varrer features já auditadas que contenham o mesmo tipo e verificar retroativamente.

### D8.2 — Verificar derivação (3 camadas)

Para CADA tipo de cálculo, confrontar a fórmula da fonte com a implementação:

| Camada                                    | O que verifica                                                                    | Evidência         |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ----------------- |
| **1 — Expressão de referência**           | A fórmula matemática extraída da fonte (ex: σ = √(Σ(xi−μ)²/N))                    | Fonte citada      |
| **2 — Núcleo da implementação**           | A expressão do código reduzida à sua essência matemática (ignorando flow control) | Código reduzido   |
| **3 — Análise de cada desvio estrutural** | TODO if/else/early-return/filter catch que afeta o resultado                      | Tabela de desvios |

Registrar no PROGRESS.md:

```markdown
**D8.2 — stdDev (F02):**
| Camada | Expressão | Match? |
|--------|-----------|--------|
| Referência | σ = √(Σ(xi−μ)² / N) | — |
| Núcleo code | sqrt(variance) onde variance = sum((s-avg)²)/n | ✅ |
```

### D8.3 — Analisar desvios estruturais

Para cada desvio entre a fórmula de referência e a implementação:

| Desvio            | Código              | Justificativa              | Impacto        | Status |
| ----------------- | ------------------- | -------------------------- | -------------- | ------ |
| Guard n < 1       | if (n < 1) return 0 | Input vazio inválido       | Só empty input | ✅     |
| Guard n === 1     | stdDev = 0          | N=1 → σ=0 por definição    | Só n=1         | ✅     |
| Filter pre-filter | N = len(filtered)   | NaN removido (ISO 16269-4) | N reduzido     | ✅     |

### D8.4 — Ambiguidade entre fontes do mesmo nível

Se duas fontes no mesmo nível conflitam:

1. Registrar "D8⚠️ ambiguidade" com ambas as fontes citadas
2. Analisar divergência PRATICAMENTE: as fórmulas produzem resultados diferentes para dados reais?
    - Se mesmo resultado → não é conflito real
    - Se divergem → documentar sob quais condições
3. Se divergem e não há fonte superior:
    - A implementação atual permanece
    - Registrar no ANEXO A e no TECHDOC como "pendente de padronização"
    - Criar issue para buscar fonte de nível superior
4. Ambiguidade só resolvida quando fonte de nível SUPERIOR for encontrada

### D8.5 — Aplicabilidade

Verificar se a aplicação da fórmula é apropriada para o domínio e os dados.

| Pergunta                                 | Evidência necessária                       |
| ---------------------------------------- | ------------------------------------------ |
| A fórmula pressupõe população completa?  | Requisito documenta que dados = população? |
| A fórmula pressupõe distribuição normal? | Dados suportam essa premissa?              |
| Outliers foram tratados?                 | Critério de exclusão documentado?          |
| A escala é adequada?                     | Linear vs log vs percentil documentado?    |

Se aplicabilidade não verificável por falta de evidência nos requisitos:

- Registrar gap de **requisito**, não de implementação
- A implementação atual permanece
- Issue criada para documentar o requisito ausente
- ANEXO A registra: "Não foi possível verificar — requisito não especifica [premissa]. Issue #XX."

### D8.6 — Gaps

Gaps de D8 seguem o fluxo normal:

1. Entram na tabela de gaps (Phase 4)
2. RED (testes que expõem o gap) + GREEN (correção)
3. Se gap de requisito (D8.5): issue criada, gap registrado, mas implementação não alterada sem autorização de domínio.

`<!-- CHECKPOINT: Phase 3.5 complete -->`

<!-- Phase 4: lines 447-480 -->

## Phase 4 — Registro de Gaps

### 4.1 — Consolidar

Reunir todos ❌ e ⚠️ de Phases 2 e 3. Cada gap vira uma linha:

```markdown
| ID  | Severidade | Descrição | Local     | Origem (T/D) |
| --- | ---------- | --------- | --------- | ------------ |
| G1  | Alto       | ...       | ${F}:${L} | T14          |
```

Proibido: omitir gap, minimizar severidade, justificar como N/A sem evidência.

### 4.2 — Priorizar

Ordem de correção: T14 (suppressions) → TSC check → T12 (testes) → D7 → T11+T18 → demais T → D1-D6

`<!-- CHECKPOINT: Phase 4 complete -->`

<!-- Phase 4.5: lines 353-380 -->

## Phase 4.5 — Varredura de consistência

### 4.5.1 — Identificar categoria

| Categoria     | Exemplos                                    |
| ------------- | ------------------------------------------- |
| Cast          | `as`, `!`, `@ts-ignore`, `@ts-expect-error` |
| DepWall       | import direto de lib externa                |
| ErrorHandling | catch vazio, `(err as Error).message`       |
| UX            | mensagem não acionável                      |
| TestIsolation | estado compartilhado, falta cleanup         |
| TestCoverage  | PBT ausente, teste faltando                 |
| TypeSafety    | `Object.entries(objeto)` propaga `any`      |

### 4.5.2 — Varrer arquivo completo

Para CADA gap na tabela, extrair o caminho do arquivo da coluna `Local` (${F}:${L}). Agrupar por arquivo único, depois:
`cat ${CAMINHO_DO_ARQUIVO}` — ler o arquivo completo
Para CADA ocorrência da MESMA categoria (não só no diff):

- Se nova: registrar gap adicional na tabela
- Corrigir junto com gaps originais (Phase 6)

### 4.5.3 — Verificação

`git diff --stat` — diff deve cobrir TODAS ocorrências. Se alguma não aparecer: PARAR.

`<!-- CHECKPOINT: Phase 4.5 complete -->`

<!-- Phase 5: lines 395-418 -->

## Phase 5 — RED (Testes que expõem gaps)

### 5.1 — Criar testes

Para cada gap de T12 (cobertura): criar test que reproduz comportamento esperado.

- Teste deve FALHAR (RED) contra código atual
- Expected values de requisitos, NUNCA de output atual
- Mock shape IDÊNTICO ao real

### 5.2 — Verificar Oracle Problem

Para cada `expect.*toBe\|toEqual\|toStrictEqual` suspeito:

- ✅ veio de requisito / ❌ veio de output do código
- Se ❌: criar NOVO teste com valor correto. Teste antigo não alterado.

### 5.3 — Run

`npx vitest run ${FEATURE_NAME} --reporter=verbose`
Ao menos 1 bug-fix test em RED para avançar.

Exceção — código já corrigido (re-auditoria): se o código fonte já foi corrigido em sessão anterior e os testes RED foram convertidos para GREEN e estão no histórico de commits, documentar os testes como prevenção de regressão e avançar. Não recriar RED tests artificiais.

Proibido modificar SOURCE em Phase 5. Apenas arquivos de teste.

`<!-- CHECKPOINT: Phase 5 complete -->`

<!-- Phase 6: lines 420-443 -->

## Phase 6 — GREEN (Correção)

### 6.1 — Corrigir source

Para cada teste RED: corrigir SOURCE para satisfazer o teste.
Ordem: remover T14 → `npx tsc --noEmit` → corrigir tipos → demais gaps.
Proibido: alterar expected values, workaround, bypass, correção temporária.

### 6.2 — Verificar

`npx vitest run ${FEATURE_NAME} --reporter=verbose`
Se falhar: voltar 6.1. Se passar: avançar.

### 6.3 — Corrigir gaps não-testáveis

Para gaps sem teste (D2, D6, T18⚠️): aplicar correção diretamente no SOURCE.
Proibido: ignorar, registrar tech debt, postergar.
`npx vitest run ${FEATURE_NAME} --reporter=verbose` — confirmar que nada quebrou.

`<!-- CHECKPOINT: Phase 6 complete -->`

<!-- Phase 7: lines 445-478 -->

## Phase 7 — Integração

### 7.1 — Testar consumidores

Para CADA CONSUMER (lista de 1.2):
`npx vitest run $(basename $(dirname ${C})) --reporter=verbose 2>&1 | tail -5`
✅ consumidores intactos / ❌ quebrou → reverter

### 7.1b — Revisão comportamental

`git diff HEAD -- ${SOURCE} | head -80`
✅ sem mudança comportamental / ⚠️ com mudança → precisa autorização

### 7.2 — Full suite

`npx vitest run --reporter=verbose 2>&1 | tail -10`
✅ sem regressões
⚠️ full suite: ~375 files, ~5700 tests — usar timeout $\ge$ 300s no tool call

### 7.3 — Docs pós-correção

`find docs/ -name '*.md' -exec grep -l "${FEATURE_NAME}\|${MODULE_NAME}" {} \;`
✅ docs consistentes com código / ❌ gap

`<!-- CHECKPOINT: Phase 7 complete -->`

<!-- Phase 8: lines 464-490 -->

## Phase 8 — Refatoração (Decisão)

### 8.0 — Gate

| Condição                           | Ação           |
| ---------------------------------- | -------------- |
| Duplicação estrutural (D3.4 > 0)   | 🔴 Refatorar   |
| Nomes confusos/enganosos           | 🔴 Refatorar   |
| Complexidade > 5                   | 🔴 Refatorar   |
| Funções impuras misturadas com I/O | 🟡 Recomendado |
| Nenhuma das acima                  | 🟢 Skip        |

Se SKIP: registrar `**Refatoração:** Nenhuma necessária.` no PROGRESS.md. Pular para Phase 9.

### 8.1 — Refatorar (se 🔴 ou 🟡)

Extrair funções puras, renomear, remover duplicação, adicionar JSDoc.
Não alterar: exports públicos, assinaturas, tipos, comportamento observável.

### 8.2 — Verificar

`npx vitest run ${FEATURE_NAME} --reporter=verbose`
✅ todos passam

`<!-- CHECKPOINT: Phase 8 complete -->`

<!-- Phase 8.5: lines 492-512 -->

## Phase 8.5 — Self-review

### 8.5.1 — Ler diff

`git diff HEAD -- ${SOURCE} ${TEST_FILES} 2>/dev/null || git diff --cached -- ${SOURCE} ${TEST_FILES}`
Ler linha por linha. Atenção a padrões que Phase 4.5 pode ter perdido.

### 8.5.2 — 4 perguntas

| #   | Pergunta                                  | Se SIM            |
| --- | ----------------------------------------- | ----------------- |
| Q1  | Violação de tipo/cast/assert introduzida? | PARAR e corrigir  |
| Q2  | Violação pré-existente ignorada?          | Voltar Phase 4.5  |
| Q3  | Causa raiz ou sintoma?                    | Se sintoma: PARAR |
| Q4  | Mensagem de erro acionável?               | Se não: corrigir  |

Registrar respostas no PROGRESS.md.

`<!-- CHECKPOINT: Phase 8.5 complete -->`

<!-- Phase 9: lines 514-539 -->

## Phase 9 — Validação Final

### 9.1 — TypeScript

`npx tsc --noEmit`
✅ 0 erros / ❌

### 9.2 — Lint

`npm run lint`
✅ All quality checks passed / ❌

### 9.3 — Batelada final

`npx tsc --noEmit && npm run lint && npx vitest run ${FEATURE_NAME} --reporter=verbose`
✅ todos passam
⚠️ `npx tsc --noEmit && npm run lint` é suficiente para validação rápida. Full suite (Phase 7.2) requer timeout $\ge$ 300s.

### 9.4 — Git diff audit

`git diff --stat` — verificar escopo
`git diff HEAD` — inspecionar diffs
✅ apenas arquivos esperados / ✅ sem alteração acidental em config / ✅ diff cobre todos os gaps

`<!-- CHECKPOINT: Phase 9 complete -->`

<!-- Phase 10: lines 541-548 -->

## Phase 10 — Atualizar PROGRESS.md

Escrever sumário da auditoria: gaps encontrados, corrigidos, mantidos, status final das fases, contagem de testes.
Registrar em seção dedicada da feature no PROGRESS.md.

`<!-- CHECKPOINT: Phase 10 complete -->`

<!-- Phase 11: lines 550-569 -->

## Phase 11 — Quality Gate + Self-Audit

### 11.1 — Quality Gate

Verificar e registrar cada dimensão (✅/❌):
| Dimensão | Itens |
|----------|-------|
| Architecture | SRP, DepWall, zero duplicação |
| Security | Path traversal, sem eval, sem secrets |
| Error handling | zero catches vazios, discriminados, fallbacks |
| Type safety | casts com guard, zero `!`, zero suppressions |
| Maintainability | nomes claros, <400L, baixa complexidade |
| Consistency | checkpoints completos, testes passam |

Registrar resultado no PROGRESS.md.

### 11.2 — Self-Audit (checkpoints)

`grep -c 'CHECKPOINT: Phase' FUNCTIONAL-AUDIT-PROGRESS.md`
✅ 16 checkpoints (0, 0.1, 1, 2, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 8.5, 9, 10, 11) / ❌ faltando → PARAR

`<!-- CHECKPOINT: Phase 11 complete -->`

---

## ANEXO A — Formula Type Registry

Registro central de tipos de fórmula. Cada tipo é pesquisado uma vez contra a hierarquia de fontes (legislação > acreditação > literatura > indústria) e reutilizado por todas as features que o implementam.

### Estrutura

| ID  | Tipo                          | Fonte                                                     | Fórmula                               | Features                        | Status |
| --- | ----------------------------- | --------------------------------------------------------- | ------------------------------------- | ------------------------------- | ------ |
| F01 | Média aritmética              | NIST/SEMATECH e-Handbook §2.3.1                           | μ = Σx/N                              | FT-25, ...                      | ✅     |
| F02 | Desvio padrão (populacional)  | NIST/SEMATECH e-Handbook §2.3.6                           | σ = √(Σ(x−μ)²/N)                      | FT-25, ...                      | ✅     |
| F03 | Filtro de outliers (NaN/IQR)  | ISO 16269-4:2017                                          | Exclusão de NaN por Number.isFinite   | FT-19, FT-20, FT-22, FT-25, ... | ✅     |
| F04 | Taxa de flakiness individual  | ISO/IEC 25010:2011 §4.2.1; NIST/SEMATECH §2.1 (proporção) | p(falha) = falhas / (passes + falhas) | FT-04                           | ✅     |
| F05 | Taxa de flakiness agregada    | Indústria CI/CD (prática universal)                       | flaky / qualifying × 100              | FT-04                           | ✅     |
| F06 | Pass rate (trend)             | ISO/IEC 25010:2011 §4.2.1                                 | passed / (passed + failed) × 100      | FT-04                           | ✅     |
| F07 | Média exponencial ponderada   | NIST/SEMATECH e-Handbook §6.4.4 (EWMA control charts)     | μₜ = α·xₜ + (1−α)·μₜ₋₁                | FT-09                           | ✅     |
| F08 | Percentil (p95)               | ISO 16269-4:2017                                          | Valor na posição ⌈p·n/100⌉ ordenada   | FT-09, FT-10                    | ✅     |
| F09 | Score por interpolação linear | ISO/IEC 25020:2019 Annex D                                | v = m·x + b por faixa                 | FT-09, FT-10, FT-14             | ✅     |
| F10 | Média ponderada               | NIST/SEMATECH e-Handbook §2.3.1                           | μ = Σ(wᵢ·xᵢ) / Σwᵢ                    | FT-09, FT-14                    | ✅     |

### Protocolo de inclusão

1. Pesquisar gold standard na hierarquia: legislação → acreditação → literatura → indústria
2. Se encontrado: preencher ID, Tipo, Fonte (com seção/artigo), Fórmula, Features que usam
3. Se NÃO encontrado: registrar como "sem gold standard conhecido"; operação verificada só por corretude
4. Ao adicionar novo tipo, varrer features já auditadas que contenham o mesmo padrão e verificar retroativamente

### Protocolo de ambiguidade (mesmo nível)

Se duas fontes no mesmo nível conflitam:

1. Registrar ambas as fontes no campo Fórmula
2. Status: ⚠️ pendente
3. Issue criada para buscar fonte superior
4. Implementação atual permanece até resolução

### Protocolo de aplicabilidade

Se a aplicação da fórmula a um domínio específico não for verificável por falta de evidência documental:

1. Registrar gap de requisito (não de implementação) no PROGRESS.md
2. Issue criada para documentar requisito
3. Status: ⚠️ requisito pendente

---

## ANEXO B — D7 Script Refinement Workflow

### B.1 — Propósito

O script `scripts/audit/d7-bad-testing.sh` automatiza os 14 checks de D7. Este anexo define o protocolo de refinamento progressivo do script durante a auditoria, para garantir que, ao final, o script cubra 100% dos padrões detectáveis sem falsos positivos.

**Checks atuais (14):** D7.2, D7.5, D7.6, D7.8, D7.11, D7.12-14/14b/14c, D7.15-18.  
**Funções:** `check` (suporta modo `inverted`) + `check_files` (itera por arquivo com eval).

### B.2 — Workflow por feature auditada

Para cada feature nova (FT-XX):

```
1. MANUAL ──→ auditor D7 manual (9 checks, ler arquivos de teste)
2. SCRIPT ──→ `bash scripts/audit/d7-bad-testing.sh --feature <nome>`
3. CONFRONTO ──→ comparar achados manuais vs script
4. REFINAMENTO:
   ├── se script perdeu algo → ajustar regex/padrão no script
   └── se falso positivo → ajustar script para excluir
5. REPETIR 1-4 até manual === script (ambos zero violações ou mesmos achados)
```

**Proibido:** avançar para próxima feature enquanto `manual !== script`.

### B.3 — Arrasto único no final

Após a última feature auditada:

```bash
bash scripts/audit/d7-bad-testing.sh --all
```

Propósito: detectar padrões introduzidos inadvertidamente em features já auditadas ou que o script inicialmente não capturava.

Se o arrasto achar violações:

1. Corrigir pela causa raiz (se violação real)
2. Se foi perdida pelo refinamento → ajustar script
3. Re-arrastar `--all` até zero violações

### B.4 — Cobertura do script

O script automatiza todos os checks detectáveis sintaticamente. Cada check está mapeado para um modo de execução:

| Check    | Modo          | Como detecta                                                    |
| :------- | :------------ | :-------------------------------------------------------------- | ----- | ---------------- |
| D7.1     | Sempre manual | Requer semântica (toBeDefined pode ser válido)                  |
| D7.2     | Script        | `check_files`: por arquivo, expects >= tests via grep -cP       |
| D7.3     | Sempre manual | Requer conhecimento de requisitos (oracle problem)              |
| D7.4     | Sempre manual | Requer inspeção do mock shape                                   |
| D7.5     | Script        | `check`: grep de `toThrow()` sem argumento                      |
| D7.6     | Script        | `check`: grep de `(describe                                     | it    | test)\.skip\(`   |
| D7.7     | Sempre manual | Nomes de implementation vs comportamento em describe/it labels  |
| D7.8     | Script        | `check_files`: vi.mock presente → vi.(clear                     | reset | restore)AllMocks |
| D7.10    | Sempre manual | Requer leitura do source (dual-implementation)                  |
| D7.11    | Script        | `check` c/ `inverted`: ls do .property.test.ts ou find nos dirs |
| D7.12-18 | Script        | `check`: grep de patterns no source + tests + git log           |

Para checks manuais, o script reporta hits como alerta, mas a **decisão final** é do auditor.

### B.5 — Helpers do script

#### `check` function (modo normal e inverted)

```bash
check <id> <label> <cmd> [inverted]
```

- **Normal** (default): output vazio = PASS, output presente = FAIL (violação)
- **Inverted** (`inverted=true`): output presente = PASS (requisito atendido), output vazio = FAIL (padrão ausente)

Usado para: D7.11 (PBT presente — verificar se arquivo existe).

#### `check_files` function

```bash
check_files <id> <label> <file-list> <cmd>
```

Itera por cada arquivo na lista. O comando `cmd` é `eval`'d com `$f` disponível (path do arquivo atual).
Output de qualquer arquivo = FAIL.

Usado para: D7.2 (expect count per file), D7.8 (cleanup onde vi.mock presente).

### B.6 — Alterações no script

Toda alteração no script deve:

1. Ser testada contra as fixtures em `scripts/__fixtures__/d7-violations/` (se existirem)
2. Ser testada contra a feature atual (`--feature <nome>`)
3. Ser verificada com `--all` para garantir que não introduziu falso positivo em features já auditadas
