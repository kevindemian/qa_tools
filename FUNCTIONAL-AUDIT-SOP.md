# FUNCTIONAL-AUDIT-SOP — Standard Operating Procedure

> **Propósito:** Checklist linear, sem ambiguidade, para auditar uma feature (FT-xx).
> Cada passo tem comando exato, critério e destino de registro.
> Se qualquer passo falhar → PARAR. Reportar. Não continuar.

---

## Regras de Execução

1. Ordem absoluta: execute os passos em sequência. Nunca pule.
2. Cada passo só termina quando o critério de conclusão for satisfeito.
3. Se um passo falhar (critério não atingido): PARAR, reportar o que falhou e por quê.
4. Registo de gaps é cumulative: diagnosticar T1-T20 e D1-D7 primeiro (Phases 2-3), depois registrar todos os gaps (Phase 4), depois corrigir (Phases 5-6). Proibido corrigir antes de registrar todos os gaps.
5. Proibido corrigir antes de registrar todos os gaps da fase.
6. **Checkpoint obrigatório:** após cada Phase, escrever no PROGRESS.md:
   `<!-- CHECKPOINT: Phase N complete -->`
   Se a sessão for interrompida, o checkpoint indica de onde retomar.
7. **Variáveis de estado:** os valores extraídos nos passos (SOURCE, TEST_FILES, CONSUMERS, FEATURE_NAME) devem ser escritos no PROGRESS.md como bloco de metadados, para consulta em passos posteriores sem depender de memória do agente.

---

## Phase 0 — Preparação

### P0.1 — Identificar a feature

Feature ID e nome vêm de `FUNCTIONAL-AUDIT-PROGRESS.md` (procurar por "still pending" ou "Próximo").

- **Comando primário:** `grep -n 'still pending\|Próximo' FUNCTIONAL-AUDIT-PROGRESS.md`
- **Fallback se primário retornar vazio:** `grep -n '### FT-' FUNCTIONAL-AUDIT-PROGRESS.md | tail -1` (última feature iniciada, pode estar in-progress)
- **Fallback se ambos vazios:** `grep -n 'FT-' FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md | grep 'pending\|still' | head -5`
- **Registrar em:** progresso da feature no PROGRESS.md com `**Início:** $(date +%Y-%m-%d)` (YYYY-MM-DD)

### P0.2 — Carregar definições do plano

- **Comando:** `grep -A 10 "\bFT-${ID}\b" FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md`
  (uso de `\b` evita casar "FT-370" quando ID é "FT-37")
- **Extrair:** Nome da feature, módulo, grupo, ordem
- **Registrar em:** PROGRESS.md > header da feature

### P0.3 — Inicializar variáveis de estado

Após identificar feature e carregar definições, extrair e registrar no PROGRESS.md:

```markdown
**Metadados FT-${ID}:**

- FEATURE_NAME: git-metrics-adapter
- SOURCE: shared/git-metrics-adapter.ts
- TEST_FILE_UNIT: shared/git-metrics-adapter.test.ts
- TEST_FILE_INTEGRATION: shared/**tests**/integration/git-metrics-adapter.integration.test.ts
- TEST_FILE_PBT: shared/**tests**/git-metrics-adapter.property.test.ts
- CONSUMERS: (lista de paths)
- DOCS: docs/03-git-triggers.md (se aplicável)
```

Os comandos dos passos seguintes usarão `${FEATURE_NAME}`, `${SOURCE}`, `${TEST_FILE_UNIT}`, etc.
Sempre consultar o PROGRESS.md para resolver estas variáveis — nunca depender de memória de sessão.

---

## Phase 1 — Mapeamento de Arquivos

### 1.1 — Localizar source

- **Comando:** `find . -name "${feature}.ts" -not -path '*/node_modules/*'`
- **Critério:** encontrar exatamente 1 arquivo `.ts`
- **Registrar:** path completo + linhas de código (`wc -l`)

### 1.2 — Localizar tests existentes

Buscar arquivos de teste que referenciam o módulo:

- **Comandos:**
    ```
    find . -name "${feature}.test.ts" -not -path '*/node_modules/*'
    find . -name "${feature}.integration.test.ts" -not -path '*/node_modules/*'
    find . -name "${feature}.property.test.ts" -not -path '*/node_modules/*'
    ```
- **Critério:** listar todos; registrar quantos de cada tipo
- **Registrar:** paths + contagem total de testes (rodar `npx vitest run ${feature} --reporter=verbose 2>&1 | grep 'Tests'`)

### 1.3 — Mapear consumidores diretos

- **Comando 1: exports do módulo**
  `grep -oP '^export (function|const|class|interface) \K\w+' ${SOURCE}`

- **Comando 2: quem importa cada export**
  Para cada export E encontrado no comando 1:

    ```
    grep -rl --include='*.ts' '(from ["'\'']\.\.?/${FEATURE_NAME}|from ["'\'']\.\./${FEATURE_NAME}|import\s*\{\s*'${E}'\s*\} )' .
    ```

    (dois comandos separados: barrel import e named import)

- **Comando 3: quem chama a função principal**  
  `grep -rl --include='*.ts' '${MAIN_EXPORT}' . | grep -v node_modules | grep -v test | grep -v '\.d\.ts'`

- **Critério:** listar todos os arquivos que importam e usam a feature
- **Registrar:** paths dos consumidores (excluindo testes e node_modules)

### 1.4 — Verificar TECHDOC

- **Comando:** `grep -n "${feature}" docs/TECHDOC.md`
- **Critério:** o módulo deve estar listado na tabela `shared/`
- **Status:**
    - ✅ encontrado
    - ❌ não encontrado → registrar gap
- **Registrar:** gap se ausente (ID: T19-1)

### 1.5 — Verificar documentação externa

- **Comando:** `grep -rn "${feature}" docs/ --include='*.md' | grep -v TECHDOC.md`
- **Critério:** se feature tem entry point CLI, deve estar em `docs/03-git-triggers.md` ou `docs/02-jira-management.md`
- **Registrar:** status + caminho da doc

---

## Phase 2 — Auditoria T1-T20

Regras:

- Para cada T: ler o critério em `FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md` Seção 5
- Executar comando, registrar status, se ❌ criar gap
- **Não corrigir ainda** — apenas diagnosticar e registrar

### 2.1 — T1: Entry point

- **Comando:** `grep '^export function\|^export const\|^export class\|^export default' ${SOURCE}`
- **Critério:** feature tem entry point(s) público(s) acessível(is) por CLI, trigger, ou API programática
- **Registrar:** lista de exports públicos

### 2.2 — T2: Config model

- **Comando:** `grep -n 'interface\|type\|z\.object\|z\.string\|z\.number\|zod' ${SOURCE} | head -10`
- **Critério:** interfaces + schemas (Zod) existem e estão exportados quando relevantes
- **Status:**
    - ✅ interfaces exportadas + Zod schema (se aplicável)
    - ⚠️ interfaces existem mas sem schema de runtime
    - ❌ sem interfaces

### 2.3 — T3: Config accessor

- **Comando:** `grep -n 'config-accessor\|Config\b\|config\.get\|configAccessor' ${SOURCE} | head -5`
- **Critério:** se feature precisa de config, usa `config-accessor.ts` com getters tipados
- **Status:** ✅ / ❌ N/A

### 2.4 — T4: Runtime lê config

- **Comando:** `grep -n 'config\|process\.env\|\.env\|xdgStateHome' ${SOURCE} | head -10`
- **Critério:** runtime lê config de fonte externa (config file, env vars, CLI flags)
- **Status:** ✅ / ❌ N/A

### 2.5 — T5: Wizard entry

- **Comando:** `grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | head -5`
- **Critério:** setup wizard tem entrada para configurar esta feature
- **Status:** ✅ / ❌ N/A

### 2.6 — T6: Wizard detection

- **Comando:** `grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | grep -i 'detect\|auto' | head -5`
- **Critério:** wizard detecta automaticamente contexto relevante para a feature
- **Status:** ✅ / ❌ N/A

### 2.7 — T7: Wizard output

- **Comando:** `grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | grep -i 'write\|generate\|create\|output' | head -5`
- **Critério:** wizard gera/configura arquivos necessários para a feature
- **Status:** ✅ / ❌ N/A

### 2.8 — T8: Wizard prompts

- **Comando:** `grep -rn "${FEATURE_NAME}" setup/ --include='*.ts' 2>/dev/null | grep -i 'prompt\|question\|ask\|input' | head -5`
- **Critério:** perguntas do wizard são claras e completas
- **Status:** ✅ / ❌ N/A

### 2.9 — T9: Reconfig handler

- **Comando:** `grep -rn "${FEATURE_NAME}" git_triggers/ --include='*.ts' 2>/dev/null | grep -i 'reconfig\|reconfigure\|handler' | head -5`
- **Critério:** handler para reconfigurar existe (se feature tem config)
- **Status:** ✅ / ❌ N/A

### 2.10 — T10: CI integration

- **Comando:** `grep -rn "${FEATURE_NAME}\|${MODULE_NAME}" .github/ --include='*.yml' --include='*.yaml' 2>/dev/null | head -5`
- **Critério:** feature integrada em templates CI (GitHub Actions, GitLab CI)
- **Status:** ✅ (workflow + steps corretos) / ⚠️ (parcial) / ❌ N/A

### 2.11 — T11: CI safety

- **Comando:** `grep -n 'try\|catch\|fallback\|catch' ${SOURCE} | head -10`
- **Critério:** safety mechanisms ativos (try/catch, fallbacks) para falhas de I/O, rede, parsing
- **Status:** ✅ / ⚠️ / ❌

### 2.12 — T12: Test coverage

- **Comando:** `npx vitest run ${FEATURE} --reporter=verbose 2>&1 | grep -E 'Tests|Test Files'`
- **Critério:** testes existem, cobrem caminhos principais + edge cases
- **Sub-checks:**
    1. ✅ Existem testes unitários
    2. ✅ Existem testes de integração (se feature faz I/O de rede, disco, git)
    3. ✅ Existem PBT (se feature tem lógica numérica/validação/state machine)
- **Registrar:** contagem total (unit + integration + PBT)

### 2.13 — T13: Dead code

- **Comando 1 (funções privadas):**
    ```
    # Extrair nomes de funções não exportadas
    grep -oP '^function \K\w+' ${SOURCE} | while read fn; do
      count=$(grep -cP "\b${fn}\b" ${SOURCE})
      if [ "$count" -le 1 ]; then echo "POSSIVELMENTE MORTO: $fn (refs: $count)"; fi
    done
    ```
- **Comando 2 (constantes privadas):**
    ```
    grep -oP '^const \K\w+' ${SOURCE} | grep -vP '^export' | while read cn; do
      count=$(grep -cP "\b${cn}\b" ${SOURCE})
      if [ "$count" -le 1 ]; then echo "POSSIVELMENTE MORTO: $cn (refs: $count)"; fi
    done
    ```
- **Critério:** zero ocorrências de código não referenciado (contagem de referências <= 1 = declarado mas não usado)
- **Status:** ✅ / ❌

### 2.14 — T14: Suppressions

**Sub-categorias a verificar separadamente:**

- **T14a — Type cast `as any` / `as unknown as`**
  `grep -P 'as any|as unknown' ${SOURCE}`
- **T14b — Non-null assertion `!` (pós-fixo)**
  `grep -nP '[a-zA-Z0-9)\]>]\s*!\s*[);,}\]]' ${SOURCE}`
  (apenas operador pós-fixo, não negação `if(!x)`)
- **T14c — `@ts-ignore` / `@ts-expect-error`**
  `grep -P '@ts-ignore|@ts-expect-error' ${SOURCE}`
- **T14d — `eslint-disable`**
  `grep -P 'eslint-disable' ${SOURCE}`
- **T14e — catch vazio**
  `grep -A1P 'catch\s*\{' ${SOURCE} | grep -P '^\s*\}'`
  (catch sem conteúdo)

> **Nota:** O comando T14b usa pattern mais restritivo para evitar falso positivo com `if(!x)`.
> Falsos positivos residuais devem ser verificados manualmente (inspecionar cada match).

- **Critério:** zero type suppressions, zero catch vazios, zero eslint-disable
- **Status:**
    - ✅ zero ocorrências em todas as sub-categorias
    - ❌ encontradas → registrar cada localização como gap (T14a-1, T14b-1, ...)

### 2.15 — T15: Bidirectional consistency

- **Comando:** Identificar se feature tem fluxo bidirecional (read + write). Se sim:
  `grep -rn "${FEATURE}" --include='*.ts' . | grep -v 'test\|node_modules'`
- **Critério:** se A→B e B→A existem, os dois caminhos produzem estados consistentes
- **Status:** ✅ / ❌ N/A (fluxo unidirecional)

### 2.16 — T16: CLI interface

- **Comando:** `grep -rn "${FEATURE_NAME}\|${MODULE_NAME}" --include='*.ts' . | grep -i 'cli\|arg\|command\|--help\|program\|dispatch' | head -5`
- **Critério:** feature tem CLI própria (subcomando). `--help` funciona. Unknown flags reportadas.
- **Status:** ✅ / ❌ N/A (sem CLI própria)

### 2.17 — T17: Env var dependency

- **Comando:** `grep -n 'process\.env' ${SOURCE} | head -10`
- **Critério:** se depende de env vars, estão em `.env.example` e no schema de config
- **Status:** ✅ (nenhuma) / ⚠️ (usa mas não documentada) / ✅ (documentada)

### 2.18 — T18: Error handling

- **T18a — Blocos try/catch**
  `grep -nP '^\s*(try|catch)\s*\{' ${SOURCE}`
  Verificar contexto do log.
- **T18b — throw new Error (vs throw string)**
  `grep -nP 'throw\s+(new\s+)?[A-Z]\w*(Error)?' ${SOURCE}`
- **T18c — Logging com contexto**
  `grep -nP 'rootLogger\.(warn|error|info)\(' ${SOURCE} | grep -vP 'Error|error'`
  (logs sem variável de contexto são suspeitos)
- **T18d — Fallbacks**
  `grep -nP 'return \[\]|return null|return {}|catch' ${SOURCE} | head -10`

- **Critério:**
    - ✅ T18a + T18c + T18d presentes — erros logados com contexto, fallbacks explícitos
    - ⚠️ catch vazio (T14e) ou log sem contexto
    - ❌ operações de I/O sem try/catch que podem quebrar o runtime

### 2.19 — T19: TECHDOC presente

- **Comando:** `grep -n "${MODULE_FILE}" docs/TECHDOC.md`
- **Critério:** módulo listado na tabela `shared/` do TECHDOC.md
- **Status:** ✅ / ❌

### 2.20 — T20: CI/Config contract

- **Comando:** Verificar se feature faz parte de cadeia: Github Action → CLI args → config key. Se sim:
  `grep -rn "${FEATURE_NAME}" .github/ --include='*.yml' --include='*.yaml' 2>/dev/null`
- **Critério:** parâmetros de CI correspondem aos args de CLI que correspondem às config keys
- **Status:** ✅ / ❌ N/A

---

## Phase 3 — Auditoria D1 a D7

### 3.1 — D1: Isolamento de Testes

**Comando:** `head -80 ${TEST_FILE} | grep -n 'beforeEach\|afterEach\|vi\.mock\|vi\.clearAllMocks\|vi\.resetAllMocks\|vi\.restoreAllMocks'`

**Itens a verificar:**

```
D1.1: beforeEach/afterEach com cleanup de estado? (file system, mocks, globals)
D1.2: vi.mock usado para isolar dependências externas?
D1.3: Testes compartilham estado mutável entre si?
D1.4: Testes de integração limpam recursos (arquivos temporários, diretórios)?
```

**Critério de aprovação:** todos os 4 itens ✅

**Registrar:** ✅ / ⚠️ / ❌ para cada sub-item

### 3.2 — D2: Robustez

**Comandos:**

- **D2.1 — Input validation**
  `grep -nP '^(export )?function \w+\(.*:.*\)' ${SOURCE} | head -15`
  Verificar se parâmetros têm tratamento de null/undefined/default.
- **D2.2 — Guard clauses**
  `grep -nP '\bif\s*\([^)]*(null|undefined|!==|===)\s' ${SOURCE} | head -15`
- **D2.3 — Fallbacks para I/O**
  `grep -nP 'catch' ${SOURCE} | head -10`
    - ler cada catch para verificar fallback.
- **D2.4 — Timeout**
  `grep -nP 'timeout|maxBuffer|Signal' ${SOURCE} | head -5`

**Itens a verificar:**

```
D2.1: Input validation — parâmetros de função validados? (defaults, null checks, type guards)
D2.2: Guard clauses para edge cases (arrays vazios, undefined, strings vazias)?
D2.3: Fallbacks para falhas externas (git, rede, arquivo)?
D2.4: Timeout configurado para operações externas (execFileSync, HTTP calls)?
```

**Critério:** pelo menos 3/4 ✅

**Registrar:** ✅ / ⚠️ / ❌ para cada sub-item

### 3.3 — D3: Boas Práticas

**Comando:** `wc -l ${SOURCE}` — arquivos > 400 linhas merecem atenção

**Itens a verificar:**

```
D3.1: SRP — cada função tem uma responsabilidade única?
D3.2: DIP — imports externos passam pelo DepWall (shared/deps.ts)?
D3.3: workarounds? bypasses? código comentado?
D3.4: código duplicado com outros módulos?
D3.5: Nomes de funções/variáveis revelam intenção?
```

**Comando DIP (D3.2):**

```
# Listar imports que violam DepWall (importam bibliotecas externas fora de shared/deps.ts)
grep -nP "^import .* from '" ${SOURCE} | grep -vP "\.js|\.json" | grep -v "shared/deps"
```

Se houver imports de bibliotecas externas (chalk, axios, zod, etc.) que NÃO passam por shared/deps.ts: ❌.

**Critério:** pelo menos 4/5 ✅

**Registrar:** ✅ / ⚠️ / ❌ para cada sub-item

### 3.4 — D4: Implementação Ótima

**Comando:** `grep -n 'for\|while\|map\|filter\|reduce\|forEach' ${SOURCE} | head -20`

**Itens a verificar:**

```
D4.1: Algoritmos com complexidade adequada (evitar O(n²) desnecessário)?
D4.2: Cópias desnecessárias? (ex: [...arr] sem motivo)
D4.3: Constantes mágicas? (números soltos sem nome)
D4.4: Early returns bem utilizados?
D4.5: Código comentado ou dead code?
```

**Critério:** pelo menos 4/5 ✅

### 3.5 — D5: Métricas

**Itens a verificar:**

```
D5.1: A feature PRODUZ métricas (valores quantitativos sobre qualidade)?
   - Se NÃO: ❌ N/A — pular o resto
   - Se SIM: continuar
D5.2: As métricas são persistidas? Formato consistente com shared/metrics.ts?
D5.3: As métricas têm unidade/documentação clara?
D5.4: Erro em métrica pode corromper dados a montante?
```

**Referência:** `grep -n 'saveMetrics\|loadMetrics\|MetricsRun\|FailureClassification' ${SOURCE} | head -5`

**Registrar:** ✅ / ⚠️ / ❌ / ❌ N/A

### 3.6 — D6: UX (com documentação)

> **Definição (conforme decisão registrada no PROGRESS.md e FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md):**
> UX engloba **toda a experiência do usuário** — interface (CLI, menus, flags, outputs),
> **documentação** (TECHDOC, README, --help, guias, mensagens de erro), e comportamento
> (feedback, confirmações, navegação, terminologia).
> Documentação incorreta, desatualizada, incompleta ou contraditória **é gap de UX**, não N/A.

**Comandos:**

```
# Documentação externa
find docs/ -name '*.md' -exec grep -l "${FEATURE_NAME}" {} \; 2>/dev/null
# Mensagens para o usuário no código
grep -nP '"(error|warn|info|Usage|Error|Warning):' ${SOURCE} | head -15
# Mensagens de erro/feedback
grep -nP 'rootLogger\.(warn|error|info)' ${SOURCE} | head -15
```

**Itens a verificar:**

```
D6.1: Mensagens de erro são acionáveis (dizem o que fazer, não só o que falhou)?
D6.2: Documentação da feature existe (TECHDOC + docs/*.md) e reflete o comportamento real?
      (Se ausente em TECHDOC: ❌. Se presente mas desatualizada: ⚠️)
      Comando para detectar docs desatualizadas:
        for doc in $(find docs/ -name '*.md' -exec grep -l "${FEATURE_NAME}" {} \;); do
            echo "=== $doc ==="
            grep -n "${FEATURE_NAME}\|${MODULE}" "$doc"
        done
      Critério: cada menção à feature no doc deve ser verificada manualmente
      contra o comportamento real do código (pós-correção). Se doc descreve
      comportamento que não existe mais (ou omite comportamento adicionado): ⚠️.
D6.3: Terminologia consistente entre código, docs, CLI e mensagens?
D6.4: CLI --help claro e completo (se aplicável)?
D6.5: Output legível para o usuário (quando aplicável)?
```

**Critério:** D6.1 + D6.2 + D6.3 obrigatórios ✅. D6.1+D6.2+D6.3 é requisito mínimo.
Se documentação estiver ausente: ❌ (não N/A).

**Registrar:** ✅ / ⚠️ / ❌ para cada sub-item

### 3.7 — D7: Deep Test Audit

Esta dimensão audita os **testes existentes**, não o código-fonte.

**Comando base:** `cat ${TEST_FILE}` + `cat ${INTEGRATION_TEST_FILE}` + `cat ${PBT_FILE}`

**Itens a verificar:**

```
7.1  — Testes usam toBeDefined() / toBeTruthy() / toBeNull() sem assert real?
        Comando: grep -P 'toBeDefined|toBeTruthy|toBeNull' ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null
        Critério: cada ocorrência deve ser seguida de um assert real (ex: expect(x).toBeDefined(); expect(x.field).toBe(value))
7.2  — Testes têm zero expect calls (no-assert test)?
        Comando (contar testes): grep -cP '^\s*(it|test)\(' ${TEST_FILES} 2>/dev/null | awk -F: '{s+=$2} END {print s}'
        Comando (contar expects): grep -cP 'expect\(' ${TEST_FILES} 2>/dev/null | awk -F: '{s+=$2} END {print s}'
        Critério: nº expects >= nº tests. Se expects < tests: há no-assert tests.
7.3  — Oracle Problem: valores esperados vêm de requisitos ou de output do código?
        Comando: grep -nP 'expect\(.*\)\.toBe\(|expect\(.*\)\.toEqual\(|expect\(.*\)\.toStrictEqual\(' ${TEST_FILES} 2>/dev/null
        Critério: para cada match, ler o JSDoc/contrato da função testada. Se o valor esperado
        for um literal que corresponde ao output atual do código em vez de uma invariante
        de domínio → Oracle Problem. Exemplo de OK: expect(ratio).toBeGreaterThan(0).
        Exemplo de Oracle: expect(calculate({x:1})).toEqual({result: 42}) onde 42 veio de execução manual.
7.4  — Mock discipline: mocks têm shape idêntico ao real (sem campos omitidos)?
        Comando: grep -P 'vi\.fn|mockReturnValue|mockImplementation' ${TEST_FILES} | head -10
        Critério: para cada mock, verificar se o shape (campos + tipos) corresponde ao
        tipo real. Dica: comparar com a interface no SOURCE. Se mock omite campos
        obrigatórios → mock leniente (❌).
7.5  — toThrow() sem argumento?
        Comando: grep -P 'toThrow\(\s*\)' ${TEST_FILES} 2>/dev/null
        Critério: toda ocorrência é gap. toThrow() sem argumento não diferencia
        entre erro esperado e erro inesperado.
7.6  — describe.skip / it.skip / test.skip presentes sem documentação?
        Comando: grep -P '\.skip\(' ${TEST_FILES} 2>/dev/null
        Critério: se existir, deve haver comentário/documentação explicando por quê.
7.7  — Test names descrevem comportamento, não implementação?
        Comando: grep -P '^\s*(it|test)\("' ${TEST_FILES} 2>/dev/null | head -20
        Critério: "returns 400 when key is invalid" ✅. "calls validateJiraKey" ❌.
7.8  — Testes são determinísticos (sem dependência de estado global não resetado)?
        Comando: grep -P 'beforeEach|afterEach|vi\.(clear|reset|restore)AllMocks' ${TEST_FILES} | head -5
        Critério: beforeEach/afterEach devem limpar estado. Se testa fs: rmSync em afterEach.
7.9  — Type suppressions em testes (as any, !, nullAs(), @ts-ignore, @ts-expect-error)?
        Comando: grep -P 'as any|@ts-ignore|@ts-expect-error|nullAs[(\b]' ${TEST_FILES} 2>/dev/null
        Critério: zero ocorrências. Cada suppression contorna o sistema de tipos em vez de
        testar contratos reais. nullAs() merece atenção especial — é helper de supressão.
7.10 — Dual-implementation detectada (teste replica fórmula do source)?
        Critério: ler os expects. Se o teste implementa a MESMA lógica (mesma fórmula,
        mesmo algoritmo) do código-fonte em vez de testar invariantes — dual-implementation.
        Exemplo: source faz total = a + b; teste faz expect(total).toBe(a + b) → ❌.
        Correto: expect(total).toBeGreaterThanOrEqual(a + b) (invariante).
7.11 — PBT obrigatório para lógica crítica foi implementado?
        Comando: ls ${TEST_FILE_PBT} 2>/dev/null && echo 'EXISTS' || echo 'MISSING'
        Critério: se feature tem validação numérica, state machine, parsing, filtros,
        algoritmos com limites — PBT deve existir e cobrir invariantes.
7.12 — Test-first violado (código escrito sem teste correspondente)?
        Critério: apenas para código novo (N/A para features existentes).
        Se feature já existia antes desta auditoria: ❌ N/A.
```

**Status agregado:** ✅ todos 12 itens / ⚠️ até 2 violações / ❌ 3+ violações

**Registrar:** tabela com cada item + evidência + status

---

## Phase 4 — Registro de Gaps

### 4.1 — Consolidar gaps

- **Ação:** reunir todos os ❌ e ⚠️ das fases 2 e 3
- **Formato:** cada gap vira uma linha na tabela no PROGRESS.md

```
| ID | Severidade | Descrição | Local | Origem (T/D) |
|----|-----------|-----------|-------|--------------|
| G1 | Alto      | ...       | ${FILE}:${LINE} | T14 |
| G2 | Médio     | ...       | ${FILE}:${LINE} | T12 |
```

- **Critério:** todo ❌ e ⚠️ deve ter um gap ID
- **Proibido:** omitir gap, minimizar severidade, ou justificar como "não se aplica" sem evidência

### 4.2 — Priorizar gaps

Ordem de correção (sequencial — cada passo depende do anterior):

1. **T14 (suppressions)** — remover supressões primeiro, pois mascaram outros problemas
2. **TSC check** — compilar SEM as supressões. Erros de tipo reais aparecem aqui.
   Se TSC falhar: corrigir tipos adequadamente (reintroduzir supressão NÃO é permitido).
3. **T12 (test coverage)** — criar testes. Só depois de compilação limpa.
4. **D7 (deep test audit)** — verificar qualidade dos testes existentes + novos.
5. **T11 + T18 (CI safety + error handling)** — robustez do runtime.
6. **Demais T1-T20** — completude arquitetural.
7. **D1-D6** — demais dimensões.

---

## Phase 5 — RED Phase (Testes que expõem gaps)

### 5.1 — Para cada gap de T12 (cobertura)

**Regra:** criar testes que reproduzem o comportamento esperado da feature.

- **Se não existe teste de integração:** criar `${MODULE}.integration.test.ts`
    - Usar fixture real (arquivo temporário, git init, chamada HTTP real mockada)
    - Mock apenas o necessário (camada de I/O)
    - Shape do mock: IDÊNTICO ao tipo real (verificar com `grep 'interface\|type' ${SOURCE}`)
- **Se não existe PBT:** criar `${MODULE}.property.test.ts`
    - Invariantes devem vir da especificação (JSDoc), NUNCA do output atual do código
    - PBT obrigatório para: validação numérica, state machine, parsing, filtros
- **Expected values:** derivados da lógica de negócio, NUNCA do output atual do código

### 5.2 — Para cada gap de D7 (Oracle Problem)

- **Comando para cada expect suspeito:**
    ```
    grep -A1 'expect.*toBe\|expect.*toEqual\|expect.*toStrictEqual' ${TEST_FILE}
    ```
- **Verificar:** o valor esperado veio de:
    - ✅ Requisito/domínio (ex: `expect(ratio).toBeGreaterThan(0)`)
    - ❌ Output do código (ex: copiar resultado de console.log)
- **Se ❌:** o teste está errado. Criar um NOVO teste com valor correto baseado em requisito. O teste antigo deve ser documentado como defeituoso, não alterado.

### 5.3 — Verificação

- Rodar os novos testes: `npx vitest run ${FEATURE} --reporter=verbose`
- **Classificar cada teste novo em uma das categorias:**
    1. **Bug-fix test** — reproduz um bug conhecido (gap T14, T9, T11, T18). **DEVE falhar (RED)** com o código atual.
    2. **Coverage test** — cobre caminho existente sem bug conhecido (integration, PBT para comportamento já correto). **Pode passar (GREEN)** — é esperado se o código já implementa o comportamento corretamente.
- **Se bug-fix test passar (GREEN):** o teste não está expondo o bug. Revisar o teste e o gap.
- **Se coverage test falhar (RED):** pode indicar bug não identificado durante o diagnóstico. Investigar.
- **Regra:** ao menos 1 bug-fix test deve estar em RED para avançar. Se só existirem coverage tests e todos passarem, avançar mesmo assim.

---

## Phase 6 — GREEN Phase (Correção de Causa Raiz)

### 6.1 — Corrigir código-fonte

- Para cada teste em RED: corrigir o **código-fonte** para satisfazer o teste.
- **Ordem de correção:**
    1. Remover supressões (T14) — depois rodar `npx tsc --noEmit`
    2. Se TSC falhar: corrigir tipos adequadamente (tipos mais precisos, não re-suppress)
    3. Se TSC passar: continuar para os demais gaps
- **Proibido:**
    - ❌ Alterar valores esperados no teste
    - ❌ workaround / bypass / suppress
    - ❌ correção temporária
    - ❌ "depois a gente melhora"
- **Obrigatório:**
    - ✅ Identificar causa raiz (não sintoma)
    - ✅ Corrigir na origem
    - ✅ Preservar ou fortalecer mecanismos de segurança

### 6.2 — Verificação

- Rodar `npx vitest run ${FEATURE} --reporter=verbose`
- **Se algum teste ainda falhar:** voltar para 6.1
- **Se todos passarem:** avançar

### 6.3 — Corrigir gaps não-testáveis (OBRIGATÓRIO)

Gaps que **não têm teste associado** (D2, D6, T18⚠️, etc.) também precisam de correção. **Tech debt não é permitido** — todo gap, independente de severidade, deve ser corrigido na raiz.

- **Identificar:** na tabela de gaps (Phase 4), quais têm `severidade = ⚠️ ou ❌` mas nenhum teste os expõe.
- **Para cada gap não-testável:**
    1. Aplicar correção diretamente no código-fonte (não requer teste — a auditoria manual é a evidência)
    2. Se a correção exigir testes para comprovação (ex: validação de input, mensagem de erro), criar testes específicos
- **Proibido:**
    - ❌ Ignorar gap de qualquer severidade
    - ❌ Registrar como tech debt
    - ❌ Postergar correção
- **Verificação:** após cada correção:
    1. Rodar `npx vitest run ${FEATURE} --reporter=verbose` para confirmar que nada quebrou
    2. Registrar a correção na tabela de gaps do PROGRESS.md com diff

---

## Phase 7 — Integração (antes da refatoração)

### 7.1 — Testar consumidores

- **Comando:** para cada consumidor identificado em 1.3, rodar seus testes:
    ```
    npx vitest run $(basename $(dirname ${CONSUMER}))/$(basename ${CONSUMER} .ts) --reporter=verbose 2>&1 | tail -5
    ```
- **Critério:** consumidores não quebram
- **Se quebrar:** verificar se a mudança de contrato (assinatura/tipo) afetou o consumidor. Se sim, a mudança é inválida — reverter e encontrar abordagem que preserve contrato.
- **⚠️ Limitação:** se consumidores mockam o módulo (vi.mock), os testes PASSAM mesmo com mudanças comportamentais. A etapa 7.1b cobre este caso.

### 7.1b — Revisão manual de mudanças comportamentais

**Quando:** sempre que o diff da correção (Phase 6) alterar lógica que consumidores mockam nos testes.

- **Comando:** gerar diff das correções aplicadas:
    ```
    git diff HEAD -- ${SOURCE} | head -80
    ```
- **Para cada bloco alterado, verificar:**
    1. O comportamento mudou? (ex: `--all` → `HEAD` reduz escopo de dados)
    2. Consumidores dependem do comportamento antigo?
    3. Se sim: a mudança precisa de **autorização explícita** do usuário (Appendix B — STOP)
    4. Se não: registrar no PROGRESS.md que não há impacto em consumidores
- **Registrar:** resultado da análise no PROGRESS.md como `**Análise de impacto em consumidores:** sem impacto / carece decisão`

### 7.2 — Full test suite

- **Comando:** `npx vitest run --reporter=verbose 2>&1 | tail -10`
- **Critério:** sem regressões
- **Nota:** esta etapa pode ser lenta (5-15 min). Se o conjunto completo for proibitivo, rodar pelo menos os módulos que compartilham dependências com a feature auditada.

### 7.3 — Verificar documentação em docs/ (pós-correção)

Correções de código (Phase 6) podem tornar `docs/*.md` obsoletos ou inconsistentes.

- **Comando para localizar docs que referenciam a feature:**
    ```
    find docs/ -name '*.md' -exec grep -l "${FEATURE_NAME}\|${MODULE}" {} \;
    ```
- **Para cada doc encontrado, verificar:**
    1. O comportamento descrito no doc corresponde ao comportamento atual do código?
    2. Funcionalidades adicionadas na correção estão documentadas?
    3. Funcionalidades removidas na correção foram removidas do doc?
- **Se qualquer item falhar:**
    - Registrar como gap na tabela de gaps (Phase 4) com severidade ⚠️
    - A correção do doc ocorre na Phase 10 (10.1 item 9)
- **Critério:** não pode haver discrepância entre doc e implementação. Se houver, a feature NÃO está completa.

---

## Phase 8 — Refatoração

### 8.1 — Aplicar refatorações seguras

Após testes verdes + consumidores intactos, refatorar:

- Extrair funções puras de lógica misturada com I/O (se identificado em D3/D4)
- Renomear variáveis para clareza
- Remover duplicação (se identificado em D3.4)
- Adicionar JSDoc onde ausente

> **Limite da refatoração:** não alterar:
>
> 1. Exports públicos
> 2. Assinaturas de função
> 3. Contratos de tipos (interfaces, schemas)
> 4. **Comportamento observável** — a saída da função para mesmas entradas deve permanecer idêntica
>
> Se a refatoração exigir mudança de contrato OU comportamento:
> → PARAR e reportar (Appendix B). A mudança de comportamento requer **autorização explícita**.
>
> **Exemplo de violação:** trocar `--all` por `HEAD` em um comando git muda o conjunto de
> commits retornados. Contratos (assinatura, tipos) não mudaram, mas **comportamento observável
> sim** — consumidores que esperavam múltiplas branches agora recebem só a branch atual.

### 8.2 — Verificação pós-refatoração

- **Comandos:**
    ```
    npx vitest run ${FEATURE} --reporter=verbose
    npx vitest run $(basename $(dirname ${CONSUMER_FIRST}))/...  (testar consumidores novamente)
    ```
- **Critério:** todos os testes da feature + consumidores ainda passam
- **Se falhar:** reverter a refatoração que quebrou e tentar abordagem diferente

---

## Phase 9 — Validação Final

### 9.1 — TypeScript

- **Comando:** `npx tsc --noEmit`
- **Critério:** 0 erros
- **Se falhar:** corrigir erros de tipo (podem ser de T14 corrigido)

### 9.2 — Lint

- **Comando:** `npm run lint`
- **Critério:** ✅ All quality checks passed
- **Se falhar:** corrigir violações (começar pelas de eslint)

### 9.3 — TSC + Lint + Tests (batelada final)

- **Comando:**
    ```
    npx tsc --noEmit && npm run lint && npx vitest run ${FEATURE} --reporter=verbose
    ```
- **Critério:** todos os 3 passam

---

## Phase 10 — Atualização do Progresso

### 10.1 — Preencher PROGRESS.md

Atualizar na entrada da feature:

1. **T1-T20:** tabela completa com status + gap de cada T
2. **D1-D7:** tabela completa com status + achados de cada dimensão
3. **D6 detalhado:** tabela 6.1-6.9 com evidência
4. **D7 detalhado:** tabela 7.1-7.12 com evidência
5. **Gaps:** tabela com ID, severidade, descrição, correção
6. **Correções aplicadas:** diff relevante para cada gap
7. **Testes de integração:** tabela com sub-testes criados
8. **Validação:** resultados de tsc + vitest + lint
9. **docs/ atualizados:** se Phase 7.3 identificou gaps de documentação, aplicar correções nos arquivos docs/\*.md e registrar diff
10. **Marcador de conclusão:** `✅ FT-${ID} completo`

### 10.2 — Atualizar "Próximo"

- Ler o PLAN (`FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md`) para saber o próximo FT-ID após o atual:
    ```
    grep -A 2 "FT-${ID}" FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md | grep "FT-" | tail -1
    ```
- Se houver próximo: escrever `## Próximo: FT-${NEXT} a FT-${LAST} (still pending)` no final
- Se esta for a última feature: escrever `## Todas as features auditadas. ✅`

---

## Appendix A — Comandos de Diagnóstico Rápido

```bash
# Verificar estrutura da feature
ls -la shared/${FEATURE}.ts*
ls -la shared/__tests__/${FEATURE}* 2>/dev/null
ls -la shared/__tests__/integration/${FEATURE}* 2>/dev/null

# Contar linhas
wc -l shared/${FEATURE}.ts
wc -l shared/${FEATURE}.test.ts 2>/dev/null

# Verificar tipo de retorno da função principal
grep -P '^export function' shared/${FEATURE}.ts

# Verificar Zod schemas (se existem)
grep -P 'z\.' shared/${FEATURE}.ts | head -5

# Verificar imports do módulo
grep -P "^import" shared/${FEATURE}.ts

# Verificar suppressions no source (T14)
grep -P 'as any|as unknown|@ts-(ignore|expect-error)|eslint-disable' shared/${FEATURE}.ts
grep -nP '[a-zA-Z0-9)\]>]\s*!\s*[);,}\]]' shared/${FEATURE}.ts  # non-null assertion

# Verificar suppressions nos testes
grep -P 'as any|@ts-(ignore|expect-error)|nullAs\b' shared/${FEATURE}.test.ts 2>/dev/null
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

---

> Este documento é auto-suficiente. Consulte `FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md` para definições de cada T e cada Dimensão.
> A ordem dos passos é absoluta. Nunca pule.
