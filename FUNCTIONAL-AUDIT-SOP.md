# FUNCTIONAL-AUDIT-SOP — Executable Specification

Checklist linear para auditar FT-xx. Cada seção = comando + critério binário + checkpoint. Regras de execução em AGENTS.md §22.

**Pré-requisito:** ler `${SOURCE}`, `${TEST_FILE_UNIT}`, `${TEST_FILE_INTEGRATION}`, `${TEST_FILE_PBT}`, `${FEATURE_NAME}`, `${CONSUMERS}` dos metadados da feature no PROGRESS.md.

## Phase 0 — Preparação

### P0.1 — Identificar feature

```
grep -n 'still pending\|Próximo' FUNCTIONAL-AUDIT-PROGRESS.md
```

✅ found FT-XX. Fallback: `grep -n '### FT-' PROGRESS.md | tail -1`. Extrair FEATURE_NAME e FT-ID. Registrar `**Início:** $(date +%Y-%m-%d)`.

### P0.2 — Carregar definições

`grep -A 10 "\bFT-${ID}\b" FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md` — extrair módulo, grupo, ordem.

### P0.3 — Encontrar source, tests, consumers

```
find . -name "${FEATURE_NAME}.ts" -not -path '*/node_modules/*'
find . -path "*__tests__/${FEATURE_NAME}.test.ts" -not -path '*/node_modules/*'
find . -path "*__tests__/integration/${FEATURE_NAME}.integration.test.ts" -not -path '*/node_modules/*'
find . -path "*__tests__/${FEATURE_NAME}.property.test.ts" -not -path '*/node_modules/*'
```

`wc -l ${SOURCE}`; `grep -rl "${FEATURE_NAME}" shared/ --include='*.ts' | grep -v test | grep -v node_modules`; `npx vitest run ${FEATURE_NAME} --reporter=verbose | grep 'Tests'`

### P0.4 — Registrar metadados

```
**Metadados FT-XX:**
- FEATURE_NAME:  - MODULE_NAME:  - SOURCE:  - TEST_FILE_UNIT:  - TEST_FILE_INTEGRATION:
- TEST_FILE_PBT:  - CONSUMERS:  - DOCS:  - EXPORTS:  - INTERNAL:
```

`<!-- CHECKPOINT: Phase 0 complete -->`

## Phase 0.1 — Deep read & pre-scan

### 0.1.1 — Source scan

`cat ${SOURCE}`. Para cada função, verificar tabela no PROGRESS.md:

| #   | Pergunta                                       | ❌ registra          | Comando                                                                                                      |
| --- | ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Nome revela o que faz?                         | gap clareza          | manual                                                                                                       |
| 2   | `unknown` / parsing sem validação?             | gap tipo             | manual                                                                                                       |
| 3   | `as`, `!`, `@ts-ignore`, `eslint-disable`?     | gap T14              | `grep -P 'as any\|as unknown\|@ts-ignore\|@ts-expect-error\|eslint-disable\|[a-zA-Z0-9)\]>]\s*!\s*[);,}\]]'` |
| 4   | `Object.entries()` propaga `any`?              | gap typesafety       | `grep -nP 'Object\.entries\('` + c/ `for (const [key])` → ok                                                 |
| 5   | I/O sem try/catch?                             | gap error handling   | `grep -nP 'readFile\|writeFile\|mkdir\|unlink\|existsSync'`                                                  |
| 6   | catch vazio ou `(err as Error).message`?       | gap T14e/b           | `grep -A1P 'catch\s*\{' \| grep '^\s*\}'`; `grep 'err as Error'`                                             |
| 7   | Error handler chama módulo de volta?           | gap segurança        | manual                                                                                                       |
| 8   | Getter com side effect?                        | gap arquitetura      | manual                                                                                                       |
| 9   | Mensagem de erro diz o que fazer?              | gap UX               | manual                                                                                                       |
| 10  | Importa lib externa sem DepWall?               | gap DepWall          | `grep "^import .* from '" src \| grep -vP "\.js\|\.json\|shared/deps"`                                       |
| 11  | Estado mutável compartilhado?                  | gap isolamento       | manual                                                                                                       |
| 12  | Constantes mágicas?                            | gap manutenibilidade | `grep -nP '[^a-zA-Z]\d{4,}[^a-zA-Z]'`                                                                        |
| 13  | Divisão sem guarda zero/NaN?                   | gap div/0            | `grep -nP '/ [a-zA-Z_]\w+'` — inspecionar cada `/ var`                                                       |
| 14  | `Object.values/keys/entries` sem `?? {}`?      | gap nullish          | `grep -nP 'Object\.(values\|keys\|entries)\('` — inspecionar `?? {}`                                         |
| 15  | `\|\| 0,\| -1,\| ''` onde 0/'' é valor válido? | gap falsy            | `grep -nP '\|\| 0\b\|\|\| ""\|\|\| -1'` — inspecionar semântica                                              |
| 16  | Output não clampado para range do domínio?     | gap range            | manual: rate [0,1], score [0,100], grade                                                                     |
| 17  | `reduce(fn)` sem initial value?                | gap reduce           | `grep -nP '\.reduce\([^,)]*\)'` — sem 2º arg                                                                 |
| 18  | `JSON.parse(JSON.stringify(x))`?               | gap serial           | `grep -nP 'JSON\.parse\(JSON\.stringify\('`                                                                  |
| 19  | `typeof x === 'object'` sem excluir null?      | gap typeof           | `grep -nP "typeof .* === 'object'"` — verificar `&& x !== null`                                              |
| 20  | `for...in` em array?                           | gap forin            | `grep -nP 'for\s*\(.*\s+in\s+'` — inspecionar alvo                                                           |
| 21  | `new Date(string)` sem validação?              | gap date             | `grep -nP 'new Date\('` — se argumento não é `new Date()`, verificar `isNaN(d.getTime())`                    |
| 22  | `console.log/warn/error` fora de logger.ts?    | gap console          | `grep -rnP 'console\.(log\|warn\|error)' src \| grep -v 'logger.ts\|output.ts'`                              |
| 23  | Parâmetro reatribuído?                         | gap reassign         | `grep -nP '^\s+\w+\s*=\s*[a-z_A-Z]' src \| grep -vP '^\s+(const\|let\|var)'` — manual                        |
| 24  | `var` usado (vs let/const)?                    | gap var              | `grep -nP '^var ' src`                                                                                       |

### 0.1.2 — Test scan

`cat ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`

| #   | Pergunta                                                     | ❌ registra        |
| --- | ------------------------------------------------------------ | ------------------ |
| T1  | Nome descreve comportamento (não implementação)?             | gap naming         |
| T2  | `as`, `!`, `@ts-ignore`, `@ts-expect-error`?                 | gap T14            |
| T3  | Mock shape idêntico ao real? (todos os campos)               | gap mock           |
| T4  | Expected value veio de requirements (não de output copiado)? | gap Oracle         |
| T5  | Testa uma coisa (não várias asserts soltas)?                 | gap coesão         |
| T6  | `.skip`, `.only`, `.todo`?                                   | gap skip           |
| T7  | `toBeDefined/Truthy/Null` sem assert real após?              | gap weak assertion |
| T8  | Estado compartilhado entre describes?                        | gap isolamento     |
| T9  | beforeEach/afterEach limpam estado?                          | gap cleanup        |

Registrar: `**Pre-scan (Phase 0.1):` com #, categoria, local, descrição no PROGRESS.md.
`<!-- CHECKPOINT: Phase 0.1 complete -->`

## Phase 1 — Mapeamento

### 1.1 — Exports

`grep -oP '^export (function|const|class|interface) \K\w+' ${SOURCE}` — ✅ lista / ❌

### 1.2 — Consumers

Para CADA export E: `grep -rl --include='*.ts' "(from ['\"]\\.\\.?/${FEATURE_NAME}|import\\s*\\{\\s*'${E}'\\s*\\} )" .` ✅ lista / ❌

### 1.3 — TECHDOC

`grep -n "${FEATURE_NAME}\|${MODULE_NAME}" docs/TECHDOC.md` ✅ / ❌

### 1.4 — Consumer test run

Para CADA CONSUMER: `npx vitest run $(basename $(dirname ${C})) --reporter=verbose | tail -5`
`<!-- CHECKPOINT: Phase 1 complete -->`

## Phase 2 — T1-T10

| ID  | Comando                                                                                                                                                                |          ✅          |       ❌       |
| :-: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------: | :------------: |
| T1  | `grep '^export function\|^export const\|^export class\|^export default' ${SOURCE}` — exports públicos                                                                  |       exports        |  sem exports   |
| T2  | `grep -n 'process\.env' ${SOURCE}` — env var dependency                                                                                                                |       nenhuma        |  usa sem doc   |
| T3  | `grep -n 'try\|catch\|fallback' ${SOURCE}` — safety mechanisms                                                                                                         |        ativos        |    ausentes    |
| T4  | `npx vitest run ${FEATURE_NAME} --reporter=verbose \| grep -E 'Tests\|Test Files'` — test coverage                                                                     | unit+integration+PBT |    missing     |
| T5  | `grep -oP '^function \K\w+' ${SOURCE} \| while read fn; do count=\$(grep -cP "\\\b\${fn}\\\b" ${SOURCE}); [ "\$count" -le 1 ] && echo "MORTO: \$fn"; done` — dead code |     zero mortos      |     mortos     |
| T6  | Ver T14                                                                                                                                                                |          —           |       —        |
| T7  | `grep -rl "${FEATURE_NAME}" --include='*.ts' . \| grep -v 'test\|node_modules' \| sort -u` — consumer consistency                                                      |    unidirecional     | inconsistente  |
| T8  | `grep -n 'process\.env' ${SOURCE}` (idem T2)                                                                                                                           |          —           |       —        |
| T9  | `grep -nP 'throw\s+(new\s+)?[A-Z]\w*(Error)?' ${SOURCE}` — error handling                                                                                              |    throw c/ Error    | throw genérico |
| T10 | `grep -n "${FEATURE_NAME}" docs/TECHDOC.md` (idem 1.3)                                                                                                                 |       TECHDOC        |    ausente     |

T6: Executar T14 suppressions sub-checks (ver D6). Registrar tabela no PROGRESS.md (ID | comando | status | observação).
`<!-- CHECKPOINT: Phase 2 complete -->`

## Phase 3 — D1-D12

### D1: Isolamento de Testes

`head -80 ${TEST_FILES} | grep -n 'beforeEach\|afterEach\|vi\.mock\|vi\.\w+AllMocks'`
D1.1✅ cleanup / D1.2✅ vi.mock / D1.3✅ sem estado compartilhado / D1.4✅ limpeza

### D2: Robustez

`grep -nP '^(export )?function \w+\(.*:.*\)' ${SOURCE}`
D2.1✅ input validation / D2.2✅ guard clauses / D2.3✅ fallbacks I/O / D2.4✅ timeout

### D3: Boas Práticas

`wc -l ${SOURCE}`; `grep -nP "^import .* from '" ${SOURCE} | grep -vP "\.js|\.json"`
D3.1✅ SRP / D3.2✅ DepWall / D3.3✅ sem bypass / D3.4✅ sem duplicação / D3.5✅ nomes claros

### D4: Implementação

`grep -n 'for\|while\|map\|filter\|reduce\|forEach' ${SOURCE} | head -20`
D4.1✅ complexidade / D4.2✅ sem cópias desnecessárias / D4.3✅ sem constantes mágicas / D4.4✅ early returns / D4.5✅ sem dead code

### D5: UX

```
grep -nP '"(error|warn|info|Usage|Error|Warning):' ${SOURCE} | head -15
grep -nP 'rootLogger\.(warn|error|info)' ${SOURCE} | head -15
```

D5.1✅ mensagens acionáveis (causa + ação) / D5.2✅ docs refletem comportamento / D5.3✅ terminologia consistente

### D6: Deep Test Audit (D7)

`bash scripts/audit/d7-bad-testing.sh --feature ${FEATURE_NAME}` — 14 checks.
✅ 14/14 pass / ❌ violações encontradas

### D7: Domain Adequacy (D8)

#### D7.0 — Catalogar tipos de cálculo

Identificar operações aritméticas/estatísticas com gold standard formal.
Hierarquia: Legislação → Acreditação (ISO, NIST) → Literatura → Indústria.

#### D7.1 — Verificar fórmula vs implementação (3 camadas)

| Camada                      | Evidência         |
| --------------------------- | ----------------- |
| 1 — Expressão de referência | Fonte citada      |
| 2 — Núcleo da implementação | Código reduzido   |
| 3 — Desvios estruturais     | Tabela de desvios |

#### D7.2 — Aplicabilidade

Verificar se aplicação da fórmula é apropriada para o domínio. Se não verificável: gap de requisito.

Registrar no PROGRESS.md. Gaps seguem fluxo normal (Phase 4 → RED → GREEN).
`<!-- CHECKPOINT: Phase 3 complete -->`

### D8: Numeric Safety (NEW)

|   Sub    | Comando                                                                                        | ❌ gap            |
| :------: | ---------------------------------------------------------------------------------------------- | ----------------- |
| **D8.1** | `grep -nP '/ [a-zA-Z_]\w+' SOURCE` — inspecionar CADA `/ var`. Verificar guard `den > 0`       | guarda div/0      |
| **D8.2** | `grep -nP 'Object\.(values\|keys\|entries)\(' SOURCE` — inspecionar `?? {}` adjacente          | nullish fallback  |
| **D8.3** | Para cada função numérica com domínio [min,max]: verificar `Math.min/Math.max` no return       | range clamp       |
| **D8.4** | `grep -nP '\|\| 0\b\|\|\| ""\b' SOURCE` — inspecionar se 0/"" é valor válido de domínio        | falsy fragility   |
| **D8.5** | `grep -nP '\.reduce\([^,)]*\)' SOURCE` — reduce sem initial value                              | empty array crash |
| **D8.6** | `grep -nP 'JSON\.parse\(JSON\.stringify\(' SOURCE` — roundtrip perde Date/Map/RegExp/undefined | serial loss       |
| **D8.7** | `grep -nP 'for\s*\(.*\s+in\s+' SOURCE` — inspecionar se alvo é array                           | for...in array    |
| **D8.8** | `grep -rnP 'Math\.(floor\|round\|ceil\|trunc)\(' SOURCE` — sem `isFinite` antes                | NaN math          |

### D9: Error & Async Integrity (NEW)

|   Sub    | Comando                                                                                                                           | ❌ gap               |
| :------: | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **D9.1** | `grep -nP '} catch \(' SOURCE` — inspecionar se erro é DISCRIMINADO (`ENOENT` vs `EACCES`, `TypeError` vs `Error`)                | error discrimination |
| **D9.2** | `grep -nP 'return await ' SOURCE` — verificar se `return await` está dentro de try (stack trace loss)                             | floating return      |
| **D9.3** | `grep -nP 'Promise\.all\(' SOURCE` — inspecionar se `allSettled` seria mais seguro                                                | brittle Promise.all  |
| **D9.4** | `grep -nP '^\s+\w+\(.*\)[^)]*\s*$' SOURCE \| grep -vP 'then\|catch\|await\|return\b\|typeof\|instanceof'` — fire-and-forget async | unhandled rejection  |
| **D9.5** | `grep -nP 'instanceof' SOURCE` — inspecionar catch blocks                                                                         | instanceof vs as     |

### D10: Data & String Integrity (NEW)

|    Sub    | Comando                                                                                          | ❌ gap          |
| :-------: | ------------------------------------------------------------------------------------------------ | --------------- |
| **D10.1** | `grep -nP 'new Date\(' SOURCE` — se argumento não é `new Date()`, verificar `isNaN(d.getTime())` | invalid date    |
| **D10.2** | `grep -nP "typeof .* === 'object'" SOURCE` — verificar `&& x !== null`                           | typeof+null     |
| **D10.3** | `grep -nP "typeof .* === 'object'" SOURCE` — verificar se `Array.isArray(x)` seria mais correto  | array check     |
| **D10.4** | `grep -nP 'console\.(log\|warn\|error)' SOURCE \| grep -vP 'logger\.ts\|output\.ts'`             | console in prod |
| **D10.5** | `grep -nP 'new RegExp\|\.match\(' SOURCE` — inspecionar ReDoS / input injection                  | regex safety    |
| **D10.6** | `grep -nP '\.toLowerCase\(\)\|\.toUpperCase\(\)' SOURCE` — locale-dependent sem locale param     | locale          |

### D11: Environment & Platform Safety (NEW)

|    Sub    | Comando                                                                                     | ❌ gap         |
| :-------: | ------------------------------------------------------------------------------------------- | -------------- |
| **D11.1** | `npx madge --circular SOURCE 2>&1 \| grep -E '^[a-z]'`                                      | circular dep   |
| **D11.2** | `grep -nP 'process\.env\[' SOURCE` — inspecionar se valor validado (não só `\|\| fallback`) | env validation |
| **D11.3** | `grep -nP 'path\.(resolve\|join)\(' SOURCE` — inspecionar se input-dependente vs constante  | path traversal |
| **D11.4** | `grep -nP "import\.meta\.(dirname\|url)" SOURCE` — compatibilidade cross-platform           | import meta    |
| **D11.5** | `grep -nP 'os\.EOL\|\\\n' SOURCE` — hardcoded vs `os.EOL`                                   | platform EOL   |

### D12: Parameter & State Integrity (NEW)

|    Sub    | Comando                                                                                                                                              | ❌ gap         |
| :-------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **D12.1** | `grep -nP '^\s+\w+\s*=\s*[a-z_A-Z]' SOURCE \| grep -vP '^\s+(const\|let\|var\|this\.\|import\|type\|interface\|function)'` — parâmetros reatribuídos | param reassign |
| **D12.2** | `grep -nP 'if \(.*\|\|.*=' SOURCE` — assignment dentro de condicional                                                                                | assign-in-if   |
| **D12.3** | `grep -nP '^var ' SOURCE` — `var` em vez de `let`/`const`                                                                                            | var hoisting   |

Registrar gaps de D8-D12 no PROGRESS.md. Cada ❌ vira gap na tabela da Phase 4.
`<!-- CHECKPOINT: Phase 3 complete -->`

## Phase 4 — Registro de Gaps

### 4.1 — Consolidar

Reunir todos ❌ de Phases 2 e 3:

```
| ID | Severidade | Descrição | Local | Origem |
| G1 | Alto | ... | ${F}:${L} | D8.2 |
```

Proibido: omitir gap, minimizar severidade, N/A sem evidência.

### 4.2 — Priorizar

Ordem: T14 (suppressions) → tsc → T4 (testes) → D6 → D8-12 → demais
`<!-- CHECKPOINT: Phase 4 complete -->`

## Phase 4.5 — Varredura de consistência

Agrupar gaps por arquivo. `cat ${CAMINHO_DO_ARQUIVO}` — ler completo. Para CADA ocorrência da MESMA categoria (não só diff):

- Se nova: registrar gap adicional
- Corrigir junto com originais (Phase 6)

`git diff --stat` — diff deve cobrir TODAS ocorrências. Se alguma não aparecer: PARAR.
`<!-- CHECKPOINT: Phase 4.5 complete -->`

## Phase 5 — RED (Testes que expõem gaps)

### 5.1 — Criar testes

Para cada gap de cobertura (T4): criar test que FALHA contra código atual.

- Expected values de REQUISITOS, NUNCA de output atual
- Mock shape IDÊNTICO ao real

**Template PBT para funções numéricas (obrigatório para D8 gap):**

```typescript
it('NaN → 0', () => { expect(fn(NaN, ...)).toBe(0); });
it('Infinity → 0', () => { expect(fn(Infinity, ...)).toBe(0); });
it('negative → 0', () => { expect(fn(-1, ...)).toBe(0); });
it('output ∈ [MIN, MAX]', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(),
        (a, b) => { const r = fn(a, b);
            expect(r).toBeGreaterThanOrEqual(MIN);
            expect(r).toBeLessThanOrEqual(MAX); }));
});
```

### 5.2 — Verificar Oracle Problem

Cada expect: ✅ veio de requisito / ❌ veio de output. Se ❌: criar NOVO teste com valor correto.

### 5.3 — Run

`npx vitest run ${FEATURE_NAME} --reporter=verbose` — ao menos 1 RED.
Exceção (re-auditoria): se código já corrigido, documentar como prevenção de regressão.
Proibido modificar SOURCE em Phase 5.
`<!-- CHECKPOINT: Phase 5 complete -->`

## Phase 6 — GREEN (Correção)

### 6.1 — Corrigir source

Para cada RED: corrigir SOURCE. Ordem: T14 → `npx tsc --noEmit` → tipos → demais.
Proibido: alterar expected values, workaround, bypass.

### 6.2 — Verificar

`npx vitest run ${FEATURE_NAME} --reporter=verbose` — se falhar: voltar 6.1.

### 6.3 — Corrigir gaps não-testáveis

Para gaps sem teste (D2, D5, D9-D12): aplicar correção diretamente. Proibido: ignorar, postergar.
`<!-- CHECKPOINT: Phase 6 complete -->`

## Phase 7 — Integração

### 7.1 — Consumidores

Para CADA CONSUMER: `npx vitest run $(basename $(dirname ${C})) --reporter=verbose | tail -5` ✅ intactos

### 7.2 — Full suite

`npx vitest run --reporter=verbose | tail -10` ✅ sem regressões (timeout ≥ 300s)

### 7.3 — Docs

`find docs/ -name '*.md' -exec grep -l "${FEATURE_NAME}\|${MODULE_NAME}" {} \;` ✅ consistentes
`<!-- CHECKPOINT: Phase 7 complete -->`

## Phase 8 — Refatoração (Decisão)

| Condição                         | Ação         |
| -------------------------------- | ------------ |
| Duplicação estrutural (D3.4 > 0) | 🔴 Refatorar |
| Nomes confusos/enganosos         | 🔴 Refatorar |
| Complexidade > 5                 | 🔴 Refatorar |
| Nenhuma das acima                | 🟢 Skip      |

Se SKIP: registrar e pular para Phase 9. Se não: extrair funções puras, renomear, remover duplicação. Não alterar exports/assinaturas/comportamento.
`npx vitest run ${FEATURE_NAME} --reporter=verbose` ✅ todos passam
`<!-- CHECKPOINT: Phase 8 complete -->`

## Phase 8.5 — Self-review

`git diff HEAD -- ${SOURCE} ${TEST_FILES} 2>/dev/null || git diff --cached -- ${SOURCE} ${TEST_FILES}`

|  Q  | Pergunta                                  | Se SIM            |
| :-: | ----------------------------------------- | ----------------- |
| Q1  | Violação de tipo/cast/assert introduzida? | PARAR e corrigir  |
| Q2  | Violação pré-existente ignorada?          | Voltar Phase 4.5  |
| Q3  | Causa raiz ou sintoma?                    | Se sintoma: PARAR |
| Q4  | Mensagem de erro acionável?               | Se não: corrigir  |

`<!-- CHECKPOINT: Phase 8.5 complete -->`

## Phase 9 — Validação Final

### 9.1 — TypeScript

`npx tsc --noEmit` ✅ 0 erros / ❌

### 9.2 — Batelada final

`npx tsc --noEmit && npx vitest run ${FEATURE_NAME} --reporter=verbose` ✅ todos passam

### 9.3 — Git diff audit

`git diff --stat` + `git diff HEAD` — ✅ apenas arquivos esperados / ✅ sem alteração acidental / ✅ diff cobre gaps
`<!-- CHECKPOINT: Phase 9 complete -->`

## Phase 10 — Atualizar PROGRESS.md

Sumário: gaps encontrados/corrigidos, status das fases, contagem de testes.
`<!-- CHECKPOINT: Phase 10 complete -->`

## Phase 11 — Quality Gate

| Dimensão        | Itens                                         | Status |
| --------------- | --------------------------------------------- | :----: |
| Architecture    | SRP, DepWall, zero duplicação                 |   ✅   |
| Security        | Path traversal, sem eval, sem secrets         |   ✅   |
| Error handling  | zero catches vazios, discriminados, fallbacks |   ✅   |
| Type safety     | casts com guard, zero `!`, zero suppressions  |   ✅   |
| Maintainability | nomes claros, <400L, baixa complexidade       |   ✅   |
| Consistency     | testes passam, TECHDOC presente               |   ✅   |

Inserir `✅ **Complete**` no PROGRESS.md.
`<!-- CHECKPOINT: Phase 11 complete -->`

---

## ANEXO A — Formula Type Registry

| ID  | Tipo                          | Fonte                       | Fórmula                             | Features           | Status |
| :-: | ----------------------------- | --------------------------- | ----------------------------------- | ------------------ | :----: |
| F01 | Média aritmética              | NIST/SEMATECH §2.3.1        | μ = Σx/N                            | FT-25, ...         |   ✅   |
| F02 | Desvio padrão (populacional)  | NIST/SEMATECH §2.3.6        | σ = √(Σ(x−μ)²/N)                    | FT-25, ...         |   ✅   |
| F03 | Filtro de outliers (NaN/IQR)  | ISO 16269-4:2017            | Exclusão de NaN por Number.isFinite | FT-19,20,22,25,... |   ✅   |
| F04 | Taxa de flakiness individual  | ISO/IEC 25010:2011 §4.2.1   | p = falhas / (passes + falhas)      | FT-04              |   ✅   |
| F05 | Taxa de flakiness agregada    | Indústria CI/CD             | flaky / qualifying × 100            | FT-04              |   ✅   |
| F06 | Pass rate                     | ISO/IEC 25010:2011 §4.2.1   | passed / (passed + failed) × 100    | FT-04              |   ✅   |
| F07 | Média exponencial ponderada   | NIST/SEMATECH §6.4.4 (EWMA) | μₜ = α·xₜ + (1−α)·μₜ₋₁              | FT-09              |   ✅   |
| F08 | Percentil                     | ISO 16269-4:2017            | Valor na posição ⌈p·n/100⌉          | FT-09,10           |   ✅   |
| F09 | Score por interpolação linear | ISO/IEC 25020:2019 Annex D  | v = m·x + b por faixa               | FT-09,10,14        |   ✅   |
| F10 | Média ponderada               | NIST/SEMATECH §2.3.1        | μ = Σ(wᵢ·xᵢ) / Σwᵢ                  | FT-09,14           |   ✅   |

**Protocolo de inclusão:** pesquisar gold standard na hierarquia. Se encontrado: preencher. Se não: "sem gold standard conhecido". Ao adicionar novo tipo, varrer features já auditadas retroativamente.
