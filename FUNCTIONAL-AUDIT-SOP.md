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

### 0.1.3 — Integration test gap (criar se ausente)

```
if [ ! -f "${TEST_FILE_INTEGRATION}" ]; then
  echo "INTEGRATION_TEST_AUSENTE: ${FEATURE_NAME}"
fi
```

**Se ausente:** criar `${TEST_FILE_INTEGRATION}` com cobertura segura mínima:

```typescript
import { ${EXPORTS} } from '../${FEATURE_NAME}.js';

describe('${FEATURE_NAME} — Integration', () => {
    it('happy path — processa entrada válida', () => {
        const result = ${EXPORT_FN}(VALID_INPUT);
        expect(result).toBeDefined();
        // assert shape do output
    });

    it('null/undefined — retorna fallback sem lançar', () => {
        expect(${EXPORT_FN}(null as any)).toBeDefined();
        expect(${EXPORT_FN}(undefined as any)).toBeDefined();
    });

    it('vazio — retorna fallback sem lançar', () => {
        expect(${EXPORT_FN}([])).toBeDefined();
    });

    it('erro de I/O — trata sem propagar exceção', () => {
        // simular cenário de falha externa
    });
});
```

Registrar gap T4 se integration não existia antes.

### 0.1.4 — PBT gap (criar se módulo tem operações numéricas)

Detectar se source tem divisão, `Math.*`, `reduce`, ou `Object.values` com numérico:

```
grep -qP '/ [a-zA-Z_]\w+|Math\.(floor|round|ceil|trunc)\(|\.reduce\(|Object\.values\(' ${SOURCE} \
  && echo "PBT_REQUIRED: ${FEATURE_NAME}"
if [ ! -f "${TEST_FILE_PBT}" ]; then
  echo "PBT_AUSENTE: ${FEATURE_NAME}"
fi
```

**Se ausente E requerido:** criar `${TEST_FILE_PBT}` com invariantes mandatórios:

```typescript
import fc from 'fast-check';
import { ${EXPORTS} } from '../${FEATURE_NAME}.js';

describe('${FEATURE_NAME} — PBT invariants', () => {
    // D9.1: NaN/Infinity não propagam
    it('NaN → 0', () => { expect(${EXPORT_FN}(NaN, ...)).toBe(0); });
    it('Infinity → 0', () => { expect(${EXPORT_FN}(Infinity, ...)).toBe(0); });
    it('-Infinity → 0', () => { expect(${EXPORT_FN}(-Infinity, ...)).toBe(0); });

    // D8.8: output nunca é NaN para inputs finitos
    it('nunca retorna NaN para entrada finita', () => {
        fc.assert(fc.property(fc.integer(), fc.integer(),
            (a, b) => expect(Number.isFinite(${EXPORT_FN}(a, b))).toBe(true)));
    });

    // D9.3: output está no domínio especificado
    it('output ∈ [MIN, MAX]', () => {
        fc.assert(fc.property(fc.integer(), fc.integer(),
            (a, b) => { const r = ${EXPORT_FN}(a, b);
                expect(r).toBeGreaterThanOrEqual(MIN);
                expect(r).toBeLessThanOrEqual(MAX); }));
    });

    // D9.2: Object.values em objeto dinâmico não quebra
    it('Object.values nunca recebe null/undefined', () => {
        // se aplicável
    });
});
```

Registrar gap T4 se PBT não existia antes.
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

## Phase 2 — T1-T20

Referência completa das categorias: `FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md §5`.

Executar para CADA T. Se N/A: justificar. Se ❌: registrar gap.

|  #  | Categoria                 | Comando                                                                                                                                                    |    ✅    |   ❌    |
| :-: | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | :------: | :-----: |
| T1  | Entry point               | `grep '^export function\|^export const\|^export class\|^export default' ${SOURCE}` — exports públicos                                                      | exports  |   sem   |
| T2  | Config model              | `grep -P 'interface \w+\|type \w+ =' ${SOURCE}` — interfaces/tipos de config                                                                               |  schema  | ausente |
| T3  | Config accessor           | `grep -nP 'get(ter)?\s+\w+\|^\s+static\s+get' ${SOURCE}` — getters tipados                                                                                 | getters  | ausente |
| T4  | Runtime lê config         | `grep -nP 'readConfig\|readEnv\|loadConfig' ${SOURCE}` — runtime carrega config                                                                            | carrega  | ausente |
| T5  | Wizard entry              | `grep -nP 'wizard\|setup.*feature' ${SOURCE} 2>/dev/null` — entrada de wizard                                                                              |  ✅ N/A  |   ❌    |
| T6  | Wizard detection          | `grep -nP 'detect.*context\|auto.*detect' ${SOURCE} 2>/dev/null` — detecção automática                                                                     |  ✅ N/A  |   ❌    |
| T7  | Wizard output             | `grep -nP 'write.*config\|generate.*file' ${SOURCE} 2>/dev/null` — geração de arquivos                                                                     |  ✅ N/A  |   ❌    |
| T8  | Wizard prompts            | `grep -nP 'prompt\|question\|ask' ${SOURCE} 2>/dev/null` — perguntas claras                                                                                |  ✅ N/A  |   ❌    |
| T9  | Reconfig handler          | `grep -nP 'reconfig\|re-?configure' ${SOURCE} 2>/dev/null` — handler de reconfig                                                                           |  ✅ N/A  |   ❌    |
| T10 | CI integration            | `grep -rnP "${FEATURE_NAME}" .github/ --include='*.yml' --include='*.yaml' 2>/dev/null \| head -5` — workflows CI                                          |  ✅ N/A  |   ❌    |
| T11 | CI safety                 | `grep -nP 'try\|catch\|fallback' ${SOURCE}` — safety mechanisms ativos                                                                                     |  ativos  | ausente |
| T12 | Test coverage             | `ls ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null` — se ausente: criar via templates §0.1.3 e §0.1.4                             | 3 files  | missing |
|     |                           | `npx vitest run ${FEATURE_NAME} --reporter=verbose \| grep -E 'Tests\|Test Files'` — rodar e verificar                                                     |          |         |
| T13 | Dead code                 | `grep -oP '^function \K\w+' ${SOURCE} \| while read fn; do count=\$(grep -cP "\\\b\${fn}\\\b" ${SOURCE}); [ "\$count" -le 1 ] && echo "MORTO: \$fn"; done` | 0 mortos | mortos  |
| T14 | Suppressions              | Executar 9 sub-checks T14a-i (ver D7 Deep Test Audit). Registrar tabela no PROGRESS.md.                                                                    |  0 hits  |   ❌    |
| T15 | Bidirectional consistency | `grep -rl "${FEATURE_NAME}" --include='*.ts' . \| grep -v 'test\|node_modules' \| sort -u` — consumidores consistentes                                     |  unidir  |   ❌    |
| T16 | CLI interface             | `grep -nP 'parseArgs\|command\|cli\|yargs\|commander' ${SOURCE} 2>/dev/null` — CLI presente? `--help`?                                                     |  ✅ N/A  |   ❌    |
| T17 | Env var dependency        | `grep -nP 'process\.env\[' ${SOURCE}` — env vars validadas (schema) e documentadas (.env.example)                                                          |    0     |   ❌    |
| T18 | Error handling            | `grep -nP 'throw\s+(new\s+)?[A-Z]\w*(Error)?' ${SOURCE}` — erros com contexto; `grep -A1P 'catch\s*\{' ${SOURCE}` — catches vazios                         |    ok    |   ❌    |
| T19 | TECHDOC                   | `grep -n "${FEATURE_NAME}" docs/TECHDOC.md` (idem 1.3)                                                                                                     | presente | ausente |
| T20 | CI/Config Contract        | `grep -nP "${FEATURE_NAME}" action.yml .github/ --include='*.yml' 2>/dev/null \| head -5` — contrato CI→runtime→config                                     |  ✅ N/A  |   ❌    |

`<!-- CHECKPOINT: Phase 2 complete -->`

## Phase 3 — D1-D13

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

### D5: Métricas (Conformidade Normativa)

Avaliar **qualidade das métricas** que a feature produz — conceituação, fórmula, conformidade normativa.

`grep -nP 'Math\.\|Number\.\|reduce\|\.score\|\.rate\|\.weight\|\.grade' ${SOURCE} | head -20`

|  Sub  | Pergunta                                                      | ❌ gap               |
| :---: | ------------------------------------------------------------- | -------------------- |
| D5.1  | Cada métrica tem nome, descrição e unidade claros?            | métrica opaca        |
| D5.2  | A métrica é útil para decisão (não vaidade)?                  | métrica vaidade      |
| D5.3  | Método de coleta é adequado (censo vs amostragem)?            | coleta inadequada    |
| D5.4  | Agregação correta para o tipo de dado?                        | agregação errada     |
| D5.5  | Tratamento de outliers ativo?                                 | sem tratamento       |
| D5.6  | Fórmula referenciada por gold standard (ISO/NIST/literatura)? | sem referência       |
| D5.7  | Denominador tem guarda zero/NaN?                              | div/0                |
| D5.8  | Saturação/clamp aplicado (ex: [0,100], [0,1])?                | sem clamp            |
| D5.9  | Precisão numérica adequada (int vs float, rounding)?          | precisão errada      |
| D5.10 | Thresholds têm fundamento normativo ou empírico?              | threshold arbitrário |

Referência completa: `FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md §4 Dimensão 5`.

### D6: UX

`grep -nP '"(error|warn|info|Usage|Error|Warning):' ${SOURCE} | head -15`
`grep -nP 'rootLogger\.(warn|error|info)' ${SOURCE} | head -15`

| Sub  | Pergunta                                                  | ❌ gap                     |
| :--: | --------------------------------------------------------- | -------------------------- |
| D6.1 | Mensagens de erro são acionáveis (causa + ação)?          | mensagem vaga              |
| D6.2 | CLI `--help` e docs são claros, completos e consistentes? | doc inconsistente          |
| D6.3 | Output de relatórios é legível (formatação, tabelas)?     | output ilegível            |
| D6.4 | Feedback de progresso para operações longas?              | sem feedback               |
| D6.5 | Confirmação antes de ações destrutivas?                   | sem confirmação            |
| D6.6 | Terminologia consistente entre código, CLI e docs?        | terminologia inconsistente |
| D6.7 | Docs refletem comportamento real da implementação?        | doc obsoleto               |

Referência completa: `FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md §4 Dimensão 6`.

### D7: Deep Test Audit

`bash scripts/audit/d7-bad-testing.sh --feature ${FEATURE_NAME}` — 12 checks automáticos.

**Sub-checks manuais adicionais (complementam o script):**

|  Sub  | Pergunta                                                    | ❌ gap               |
| :---: | ----------------------------------------------------------- | -------------------- |
| D7.13 | Testes de erro validam mensagem/causa (não só `toThrow()`)  | assert genérico      |
| D7.14 | Test names descrevem comportamento, não implementação       | nome implementação   |
| D7.15 | Testes são determinísticos (sem estado global não resetado) | não determinístico   |
| D7.16 | Type suppressions em testes (`as any`, `!`, `nullAs()`)     | T14 test             |
| D7.17 | Dual-implementation (teste replica fórmula do source)       | Oracle Problem       |
| D7.18 | PBT obrigatório para lógica crítica foi omitido?            | PBT ausente          |
| D7.19 | Test-first violado (código sem teste correspondente)?       | test-first violation |

Referência completa: `FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md §4 Dimensão 7`.
✅ 12/12 automáticos + 7 manuais / ❌ violações encontradas

### D8: Domain Adequacy

#### D8.0 — Catalogar tipos de cálculo

Identificar operações aritméticas/estatísticas com gold standard formal.
Hierarquia: Legislação → Acreditação (ISO, NIST) → Literatura → Indústria.

#### D8.1 — Verificar fórmula vs implementação (3 camadas)

| Camada                      | Evidência         |
| --------------------------- | ----------------- |
| 1 — Expressão de referência | Fonte citada      |
| 2 — Núcleo da implementação | Código reduzido   |
| 3 — Desvios estruturais     | Tabela de desvios |

#### D8.2 — Aplicabilidade

Verificar se aplicação da fórmula é apropriada para o domínio. Se não verificável: gap de requisito.

#### D8.3 — Domínio de operações aninhadas (NaN propagation)

`grep -nP 'Math\.(floor\|round\|ceil\|trunc)\(.*Math\.' SOURCE` — operações aninhadas sem `isFinite` em cada estágio.

**Guidance:** NaN em estágio intermediário propaga silenciosamente. Cada estágio de cálculo aninhado deve ser guardado individualmente, não só o resultado final.

#### D8.4 — Domínio de falsy coalescence (`|| 0`, `|| ""`)

`grep -nP '\|\| 0\b\|\|\| ""\b\|\|\| -1\b' SOURCE` — inspecionar SEMÂNTICA vs DOMÍNIO.

**Guidance:** `|| 0` é correto se 0 não é valor válido no domínio (ex: índice de array). É INCORRETO se 0 é valor legítimo (ex: score, rate, count). Preferir `??` (nullish coalescing) quando 0/"" é válido.

Registrar no PROGRESS.md. Gaps seguem fluxo normal (Phase 4 → RED → GREEN).
`<!-- CHECKPOINT: Phase 3 complete -->`

### D9: Numeric Safety

|   Sub    | Comando                                                                                        | ❌ gap            |
| :------: | ---------------------------------------------------------------------------------------------- | ----------------- |
| **D9.1** | `grep -nP '/ [a-zA-Z_]\w+' SOURCE` — inspecionar CADA `/ var`. Verificar guard `den > 0`       | guarda div/0      |
| **D9.2** | `grep -nP 'Object\.(values\|keys\|entries)\(' SOURCE` — inspecionar `?? {}` adjacente          | nullish fallback  |
| **D9.3** | Para cada função numérica com domínio [min,max]: verificar `Math.min/Math.max` no return       | range clamp       |
| **D9.4** | `grep -nP '\|\| 0\b\|\|\| ""\b' SOURCE` — inspecionar se 0/"" é valor válido de domínio        | falsy fragility   |
| **D9.5** | `grep -nP '\.reduce\([^,)]*\)' SOURCE` — reduce sem initial value                              | empty array crash |
| **D9.6** | `grep -nP 'JSON\.parse\(JSON\.stringify\(' SOURCE` — roundtrip perde Date/Map/RegExp/undefined | serial loss       |
| **D9.7** | `grep -nP 'for\s*\(.*\s+in\s+' SOURCE` — inspecionar se alvo é array                           | for...in array    |
| **D9.8** | `grep -rnP 'Math\.(floor\|round\|ceil\|trunc)\(' SOURCE` — sem `isFinite` antes                | NaN math          |

### D10: Error & Async Integrity

|    Sub    | Comando                                                                                                                           | ❌ gap               |
| :-------: | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **D10.1** | `grep -nP '} catch \(' SOURCE` — inspecionar se erro é DISCRIMINADO (`ENOENT` vs `EACCES`, `TypeError` vs `Error`)                | error discrimination |
| **D10.2** | `grep -nP 'return await ' SOURCE` — verificar se `return await` está dentro de try (stack trace loss)                             | floating return      |
| **D10.3** | `grep -nP 'Promise\.all\(' SOURCE` — inspecionar se `allSettled` seria mais seguro                                                | brittle Promise.all  |
| **D10.4** | `grep -nP '^\s+\w+\(.*\)[^)]*\s*$' SOURCE \| grep -vP 'then\|catch\|await\|return\b\|typeof\|instanceof'` — fire-and-forget async | unhandled rejection  |
| **D10.5** | `grep -nP 'instanceof' SOURCE` — inspecionar catch blocks                                                                         | instanceof vs as     |

### D11: Data & String Integrity

|    Sub    | Comando                                                                                          | ❌ gap          |
| :-------: | ------------------------------------------------------------------------------------------------ | --------------- |
| **D11.1** | `grep -nP 'new Date\(' SOURCE` — se argumento não é `new Date()`, verificar `isNaN(d.getTime())` | invalid date    |
| **D11.2** | `grep -nP "typeof .* === 'object'" SOURCE` — verificar `&& x !== null`                           | typeof+null     |
| **D11.3** | `grep -nP "typeof .* === 'object'" SOURCE` — verificar se `Array.isArray(x)` seria mais correto  | array check     |
| **D11.4** | `grep -nP 'console\.(log\|warn\|error)' SOURCE \| grep -vP 'logger\.ts\|output\.ts'`             | console in prod |
| **D11.5** | `grep -nP 'new RegExp\|\.match\(' SOURCE` — inspecionar ReDoS / input injection                  | regex safety    |
| **D11.6** | `grep -nP '\.toLowerCase\(\)\|\.toUpperCase\(\)' SOURCE` — locale-dependent sem locale param     | locale          |

### D12: Environment & Platform Safety

|    Sub    | Comando                                                                                     | ❌ gap         |
| :-------: | ------------------------------------------------------------------------------------------- | -------------- |
| **D12.1** | `npx madge --circular SOURCE 2>&1 \| grep -E '^[a-z]'`                                      | circular dep   |
| **D12.2** | `grep -nP 'process\.env\[' SOURCE` — inspecionar se valor validado (não só `\|\| fallback`) | env validation |
| **D12.3** | `grep -nP 'path\.(resolve\|join)\(' SOURCE` — inspecionar se input-dependente vs constante  | path traversal |
| **D12.4** | `grep -nP "import\.meta\.(dirname\|url)" SOURCE` — compatibilidade cross-platform           | import meta    |
| **D12.5** | `grep -nP 'os\.EOL\|\\\n' SOURCE` — hardcoded vs `os.EOL`                                   | platform EOL   |

### D13: Parameter & State Integrity

|    Sub    | Comando                                                                                                                                              | ❌ gap         |
| :-------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **D13.1** | `grep -nP '^\s+\w+\s*=\s*[a-z_A-Z]' SOURCE \| grep -vP '^\s+(const\|let\|var\|this\.\|import\|type\|interface\|function)'` — parâmetros reatribuídos | param reassign |
| **D13.2** | `grep -nP 'if \(.*\|\|.*=' SOURCE` — assignment dentro de condicional                                                                                | assign-in-if   |
| **D13.3** | `grep -nP '^var ' SOURCE` — `var` em vez de `let`/`const`                                                                                            | var hoisting   |

Registrar gaps de D5-D13 no PROGRESS.md. Cada ❌ vira gap na tabela da Phase 4.
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

Ordem: T14 (suppressions) → tsc → T12 (testes) → D7 (Deep Test) → D9-13 → D5 (Métricas) → demais
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

**Template PBT para funções numéricas (obrigatório para D8 gap; criar se ausente por §0.1.4):**

```typescript
import fc from 'fast-check';

// D9.1/D9.8: NaN/Infinity não propagam
it('NaN → 0', () => { expect(fn(NaN, ...)).toBe(0); });
it('Infinity → 0', () => { expect(fn(Infinity, ...)).toBe(0); });
it('-Infinity → 0', () => { expect(fn(-Infinity, ...)).toBe(0); });

// D8.8: output nunca é NaN para inputs finitos
it('nunca retorna NaN para entrada finita', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(),
        (a, b) => expect(Number.isFinite(fn(a, b))).toBe(true)));
});

// D9.3: output está no domínio especificado
it('output ∈ [MIN, MAX]', () => {
    fc.assert(fc.property(fc.integer(), fc.integer(),
        (a, b) => { const r = fn(a, b);
            expect(r).toBeGreaterThanOrEqual(MIN);
            expect(r).toBeLessThanOrEqual(MAX); }));
});

// D9.4: falsy guard (se || 0 for usado, 0 é válido?)
it('falsy guard não mascara zero válido', () => {
    // verificar edge cases do domínio
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

Para gaps sem teste (D2, D6, D8, D10-D13): aplicar correção diretamente. Proibido: ignorar, postergar.
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

**Protocolo de inclusão:**

1. Pesquisar gold standard na hierarquia: Legislação → Acreditação (ISO, NIST) → Literatura → Indústria
2. Se encontrado: preencher ID, tipo, fonte, fórmula, features aplicáveis, status
3. Se não encontrado: registrar "sem gold standard conhecido" + justificativa
4. Ao adicionar novo tipo: varrer features já auditadas retroativamente e atualizar status
5. Se houver ambiguidade sobre qual fórmula se aplica ao domínio: registrar gap de requisito (não assumir)

**Protocolo de aplicabilidade:**

- F01-F10 cobrem padrões conhecidos. Se uma feature usa variação (ex: Média ponderada com pesos diferentes de Σwᵢ=1): registrar desvio em D8.1 camada 3
- Se a feature implementa métrica sem correspondente no registry: considerar gap de rastreabilidade (D5.6)

---

## Appendix A — Comandos de Diagnóstico Rápido

```bash
# Verificar estrutura da feature
ls -la shared/${FEATURE_NAME}.ts*
ls -la shared/__tests__/${FEATURE_NAME}* 2>/dev/null
ls -la shared/__tests__/integration/${FEATURE_NAME}* 2>/dev/null

# Contar linhas
wc -l ${SOURCE}
wc -l ${TEST_FILE_UNIT} 2>/dev/null

# Verificar tipo de retorno da função principal
grep -P '^export function' ${SOURCE}

# Verificar Zod schemas (se existem)
grep -P 'z\.' ${SOURCE} | head -5

# Verificar imports do módulo
grep -P "^import" ${SOURCE}

# Verificar suppressions no source (T14)
grep -P 'as any|as unknown|@ts-(ignore|expect-error)|eslint-disable' ${SOURCE}
grep -nP '[a-zA-Z0-9)\]>]\s*!\s*[);,}\]]' ${SOURCE}  # non-null assertion

# Verificar suppressions nos testes
grep -P 'as any|@ts-(ignore|expect-error)|nullAs\b' ${TEST_FILE_UNIT} 2>/dev/null
```

---

## Appendix B — Critérios de Parada Obrigatória (STOP conditions)

| Condição                                                     | Ação                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Ambiguidade na especificação                                 | PARAR. Reportar qual especificação está ambígua.                                                     |
| Contradição entre regras                                     | PARAR. Reportar quais regras conflitam.                                                              |
| Dependência não mapeada                                      | PARAR. Reportar qual dependência não foi analisada.                                                  |
| Teste falha e causa raiz não é óbvia                         | PARAR. Reportar o teste que falha e o que foi tentado.                                               |
| Mudança de contrato necessária                               | PARAR. Reportar contrato, produtores e consumidores afetados.                                        |
| **Mudança de comportamento observável** (ex: `--all`→`HEAD`) | PARAR. Reportar comportamento antigo, novo, e consumidores afetados. Aguardar autorização explícita. |
| Workaround seria mais rápido que correção real               | PARAR. Reportar que workaround foi considerado e rejeitado.                                          |
| Mecanismo de segurança precisa ser enfraquecido              | PARAR. Reportar qual mecanismo e por que não pode ser preservado.                                    |
| Feature não se encaixa em nenhuma dimensão                   | PARAR. Reportar qual dimensão não se aplica e por quê.                                               |
