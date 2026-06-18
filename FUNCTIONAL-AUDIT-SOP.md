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
8. **Cabeçalho de comando obrigatório:** Antes de executar qualquer comando do SOP, o agente DEVE exibir o bloco literal do SOP e o comando exato no formato:
    ```
    [SOP <seção>]
    Comando exato: <comando literal do SOP>
    ```
    Execução sem cabeçalho = **violação, sessão inválida**.
9. **execução sequencial entre fases:** Dentro de uma fase, comandos independentes podem rodar em paralelo. Entre fases, execução é estritamente sequencial. O checkpoint de fase (`<!-- CHECKPOINT: Phase N complete -->`) DEVE ser escrito antes de iniciar a fase seguinte.
10. **Proibição de otimização silenciosa:** É proibido substituir um comando do SOP por um "equivalente", pular comandos, combinar múltiplos passos em um, ou executar de memória. Cada comando DEVE ser executado exatamente como escrito.

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
- TEST_FILE_PREVIOUS: shared/git-metrics-adapter.test.ts (se existir na raiz de shared/)
- TEST_FILE_UNIT: shared/**tests**/git-metrics-adapter.test.ts
- TEST_FILE_INTEGRATION: shared/**tests**/integration/git-metrics-adapter.integration.test.ts
- TEST_FILE_PBT: shared/**tests**/git-metrics-adapter.property.test.ts
- CONSUMERS: (lista de paths)
- DOCS: docs/03-git-triggers.md (se aplicável)
```

**Comando para localizar TEST_FILE_PREVIOUS (testes na raiz do módulo):**

```
find . -name "${FEATURE_NAME}.test.ts" -not -path '*/node_modules/*' -not -path '*/__tests__/*'
```

Arquivos encontrados neste caminho (ex: `shared/metrics.test.ts`) contêm testes que usam `memfs` ou mock global de fs. Eles DEVEM ser incluídos na contagem de testes (T12) e auditados em D7. Não omitir.

**Comando para localizar TEST_FILE_UNIT (testes no diretório **tests**):**

```
find . -path "*/__tests__/${FEATURE_NAME}.test.ts" -not -path '*/node_modules/*'
```

**Comando para localizar TEST_FILE_INTEGRATION:**

```
find . -path "*/__tests__/integration/${FEATURE_NAME}.integration.test.ts" -not -path '*/node_modules/*'
```

**Comando para localizar TEST_FILE_PBT:**

```
find . -path "*/__tests__/${FEATURE_NAME}.property.test.ts" -not -path '*/node_modules/*'
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

> **Escopo expandido (T14a a T14i):** todos os comandos devem ser executados contra
> `${SOURCE}`, `${TEST_FILE_UNIT}`, `${TEST_FILE_INTEGRATION}` e `${TEST_FILE_PBT}`.
> Suppressions em testes são tão graves quanto em código-fonte — mascarar tipos em testes
> impede que o sistema de tipos detecte violações de contrato.
> Se um arquivo não existir (ex: `${TEST_FILE_PBT}` vazio), pular.

- **T14a — Type cast `as any` / `as unknown as`**
  `grep -P 'as any|as unknown' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
- **T14b — Non-null assertion `!` (pós-fixo)**
  `grep -nP '[a-zA-Z0-9)\]>]\s*!\s*[);,}\]]' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
  (apenas operador pós-fixo, não negação `if(!x)`)
- **T14c — `@ts-ignore` / `@ts-expect-error`**
  `grep -P '@ts-ignore|@ts-expect-error' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
- **T14d — `eslint-disable`**
  `grep -P 'eslint-disable' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
- **T14e — catch vazio**
  `grep -A1P 'catch\s*\{' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null | grep -P '^\s*\}'`
  (catch sem conteúdo)

- **T14f — Type cast não-any com `as TypeName` em parsing/deserialização**
  `grep -nP 'JSON\.parse\(.*\) as [A-Z]\w+|as (MetricsStore|Record<)' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
  (casts de parsing que pulam validação de runtime — `JSON.parse(...) as MetricsStore` é gap mesmo sem `as any`)

- **T14g — `as never` (bypass total do sistema de tipos)**
  `grep -nP 'as never' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`

    > **Justificativa:** `as never` é pior que `as any` — permite atribuir o valor a qualquer tipo
    > sem nenhuma verificação. `as never` em mocks de teste indica que o mock não respeita o tipo real.
    > Solução correta: criar objeto que satisfaça a interface esperada, ou usar `Partial<T>` se aplicável.

- **T14h — `as string` / `as number` em valores nullable**
  `grep -nP 'as (string|number|boolean)\b' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`

    > **Justificativa:** `as string` em um `string | null` esconde o null — se o valor for null,
    > o cast silencia o erro. A correção é usar narrowing (`if (x)`) ou `??` com fallback.
    > **Exceção:** `global.as string` em `process.env` é aceitável pois o env var SEMPRE retorna string.
    > Qualquer outra ocorrência é gap.

- **T14i — `Object.entries()` em parâmetro tipado como `object`**
  `grep -nP 'Object\.entries\(' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null`
    > **Justificativa:** `Object.entries(object)` retorna `[string, any][]` segundo a definição de tipo
    > do TypeScript. O `any` no retorno propaga type-unsafety. A correção é usar um tipo indexado
    > (`Record<string, T>` ou `{[key: string]: unknown}`) em vez de `object`, ou usar um helper
    > tipado como `Object.entries(obj as Record<string, unknown>)` em contexto controlado (testes).
    > **Verificação manual:** inspecionar cada match. Se o valor de retorno de `Object.entries` for
    > usado apenas como `string` (ex: `for (const [key] of ...`), o `any` no value não é propagado e
    > pode ser aceito. Se o `any` for propagado (ex: `val` usado em expressão tipada): ❌ gap.
    > Bloqueios de `as Record<...>` em T14a não se aplicam aqui — o custo de tipar a variável fonte
    > como indexada é aceitável.
    > **Justificativa:** `JSON.parse` retorna `unknown` ou `any`, e fazer cast direto para `MetricsStore` sem validação
    > (Zod, class-transformer, ou guard manual) é um bypass de type safety equivalente a `as any`.
    > A diferença é puramente estilística — ambos permitem que dados inválidos entrem no sistema sem checagem.

> **Nota:** O comando T14b usa pattern mais restritivo para evitar falso positivo com `if(!x)`.
> Falsos positivos residuais devem ser verificados manualmente (inspecionar cada match).
>
> **Nota T14f:** O padrão `as [A-Z]\w+` captura casts em parsing. Falsos positivos (ex: `x as MyType` em código
> que já validou o dado em passo anterior) devem ser julgados manualmente. Se o cast segue uma validação real
> (Zod parse, class-transformer, guard com `if`), não é gap.

- **Critério:** zero type suppressions, zero catch vazios, zero eslint-disable, zero casts não-validados de parsing
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
      Protocolo de verificação (para cada rootLogger.{warn,error,info} encontrado):
        1. Copiar a mensagem literal
        2. O usuário sabe EXATAMENTE o que aconteceu? (causa)
        3. O usuário sabe EXATAMENTE o que fazer? (ação)
        4. Se resposta for NÃO para 2 ou 3: ❌
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

**Regra D6.1 (protocolo de acionabilidade):** Mensagens que apenas descrevem o que aconteceu
sem orientar o usuário sobre o que fazer são ❌. Exemplo de mensagem NÃO acionável:
"Arquivo de estado corrompido. Recuperando backup..." — diz o que aconteceu e o que o sistema fez,
mas não diz se o usuário precisa agir, verificar algo, ou reexecutar. Exemplo de mensagem acionável:
"Falha ao salvar configuração: permissão negada. Verifique as permissões do diretório e tente novamente."

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

## Phase 4.5 — File-wide consistency enforcement

> **Propósito:** Evitar que violações pré-existentes no mesmo arquivo passem despercebidas.
> Um gap no diff nunca é um problema isolado — o mesmo padrão pode existir no restante do arquivo.
> Ignorar violações existentes porque "não estão no diff" é aceitar dívida técnica deliberadamente.

### 4.5.1 — Identificar categoria do gap

Para cada gap registrado em Phase 4, identificar sua **categoria**:

| Categoria         | Exemplos de gap                               |
| ----------------- | --------------------------------------------- |
| **Cast**          | `as X`, `!`, `@ts-ignore`, `@ts-expect-error` |
| **DepWall**       | Import direto de lib externa                  |
| **ErrorHandling** | catch vazio, `(err as Error).message`         |
| **UX**            | Mensagem não acionável                        |
| **TestIsolation** | Estado compartilhado, falta de cleanup        |
| **TestCoverage**  | PBT ausente, teste faltando                   |
| **TypeSafety**    | `Object.entries()` em `object` retorna `any`  |

### 4.5.2 — Varrer arquivo completo

Para cada arquivo que contém gap(s) registrados:

- **Comando:** `find . -path './${FILE_PATH}' -exec cat {} \;` (ler o arquivo completo)
- **Ação:** para CADA ocorrência da MESMA categoria no arquivo (não apenas no diff):
    1. Se for nova ocorrência (fora do diff original): **registrar como gap adicional** na tabela de gaps
    2. A correção do gap adicional ocorre junto com os gaps originais (Phase 6)
- **Critério:** zero ocorrências residuais da categoria no arquivo após correção

### 4.5.3 — Escopo expandido para teste e fonte

A varredura aplica-se a **arquivos de código-fonte E de teste** sem distinção.

Se o arquivo `logger.test.ts` tem 6 `as {...}` casts em testes existentes e o gap original é "Cast em logger.ts":

- A varredura encontra os 6 casts em `logger.test.ts`
- Cada um é registrado como gap adicional
- Todos são corrigidos em Phase 6

### 4.5.4 — Verificação

Após corrigir todos os gaps (adicionais + originais):

- Rodar `git diff --stat` e verificar que o diff cobre todas as ocorrências identificadas
- Se alguma ocorrência conhecida não aparecer no diff: **não foi corrigida. PARAR.**

**Invariante:** nenhuma violação da categoria pode permanecer no arquivo após a correção, independente de ser pré-existente ou introduzida.

---

## Phase 5 — RED Phase (Testes que expõem gaps)

> ⚠️ **Limite de fronteira Phase 4→5:** Phase 5 **pode modificar arquivos de TESTE** (criar ou editar `*.test.ts`, `*.property.test.ts`, `*.integration.test.ts`).
> **Arquivos de SOURCE** (`${SOURCE}`, mais qualquer arquivo em `src/`, `shared/`, `scripts/`) **NÃO podem ser modificados** em Phase 5.
> A correção de código-fonte (SOURCE) ocorre exclusivamente em **Phase 6**.
>
> **Razão:** respeitar RED-GREEN-REFACTOR: o teste deve falhar (RED) contra o código atual antes de qualquer correção.
> Corrigir SOURCE antes de verificar RED viola a ordem e mascara se o teste realmente expõe o bug.

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

## Phase 8 — Refatoração (Decisão)

### 8.0 — Gate de decisão

Antes de refatorar, o auditor DEVE responder explicitamente:

| Condição                                                | Ação                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| Duplicação estrutural (D3.4 > 0)                        | 🔴 **Obrigatório refatorar**                                   |
| Nomes confusos/enganosos                                | 🔴 **Obrigatório refatorar**                                   |
| Complexidade ciclomática > 5 (inspecionar manualmente)  | 🔴 **Obrigatório refatorar**                                   |
| Funções impuras misturadas com I/O sem extração (D3/D4) | 🟡 **Recomendado refatorar**                                   |
| Nenhuma das condições acima                             | 🟢 **Skip permitido** — registrar "Sem refatoração necessária" |

**Se decisão for SKIP (🟢):**

- Registrar em PROGRESS.md: `**Refatoração:** Nenhuma necessária.`
- Pular para Phase 9.

### 8.1 — Aplicar refatorações seguras (se decisão for REFATORAR)

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

## Phase 8.5 — Author self-review

> **Propósito:** O autor deve ler criticamente o próprio diff antes de commitar,
> para detectar violações que passariam despercebidas na automação.
> Nenhuma ferramenta substitui o julgamento humano sobre qualidade de código.

### 8.5.1 — Ler diff completo

- **Comando:** `git diff HEAD -- ${SOURCE} ${TEST_FILES} 2>/dev/null || git diff --cached -- ${SOURCE} ${TEST_FILES}`
- **Ação:** ler o diff completo, linha por linha. Especial atenção para:
    - Linhas que não foram alteradas mas estão no mesmo contexto do gap
    - Padrões que a Phase 4.5 deveria ter pego mas pode ter perdido

### 8.5.2 — Responder a 4 perguntas

O autor DEVE responder explicitamente (registrar no PROGRESS.md):

| #   | Pergunta                                                       | Critério                              |
| --- | -------------------------------------------------------------- | ------------------------------------- |
| 1   | Alguma violação de tipo/cast/assert foi introduzida?           | Se sim: PARAR e corrigir              |
| 2   | Alguma violação pré-existente no mesmo arquivo foi ignorada?   | Se sim: retornar à Phase 4.5          |
| 3   | O código resolve a causa raiz do defeito, ou apenas o sintoma? | Se apenas sintoma: PARAR e reanalisar |
| 4   | Alguma mensagem de erro não é acionável para o usuário?        | Se sim: corrigir                      |

### 8.5.3 — Registrar autoavaliação

- Escrever no PROGRESS.md como:

```
#### Autoavaliação (Phase 8.5)

- Q1 (violação introduzida): ❌ NÃO
- Q2 (violação pré-existente ignorada): ❌ NÃO
- Q3 (causa raiz vs sintoma): ✅ Causa raiz
- Q4 (mensagens acionáveis): ✅ Sim
```

### 8.5.4 — Se qualquer resposta for diferente do esperado

**PARAR.** Corrigir antes de prosseguir para Phase 9.

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

### 9.4 — Git diff audit

**Obrigatório — verificar que apenas arquivos intencionados foram alterados.**

- **Comandos:**

    ```
    git diff --stat
    git diff HEAD
    ```

- **Verificar:**
    1. ✅ Todos os arquivos no diff são esperados para esta FT
    2. ✅ Nenhum arquivo de config, CI, ou proteção foi alterado acidentalmente
    3. ✅ Nenhum arquivo fora do escopo da FT (ex: outra feature, infra, docs não relacionados) aparece
    4. ✅ Mudanças em cada arquivo correspondem exatamente ao que foi planejado nas fases 5-7

- **Se arquivo inesperado aparecer:** reverter mudança no arquivo, investigar causa raiz, refazer fase relevante.
- **Se diff contiver lixo (comentários de debug, console.log, espaços em branco):** corrigir antes de avançar.
- **Critério:** diff limpo e intencional. Zero arquivos acidentais.

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
10. **Marcador de conclusão:** `🔜 FT-${ID} aguardando Quality Gate` (o marcador final `✅ FT-${ID} completo` só é escrito após aprovação na Phase 11)

### 10.2 — Atualizar "Próximo"

- Ler o PLAN (`FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md`) para saber o próximo FT-ID após o atual:
    ```
    grep -A 2 "FT-${ID}" FUNCTIONAL-AUDIT-INTEGRATED-PLAN.md | grep "FT-" | tail -1
    ```
- Se houver próximo: escrever `## Próximo: FT-${NEXT} a FT-${LAST} (still pending)` no final
- Se esta for a última feature: escrever `## Todas as features auditadas. ✅`

---

## Phase 11 — Final Quality Gate

> **Propósito:** Após todas as correções, validações e registros, a Phase 11 é a **porta de saída absoluta**.
> Nenhuma feature é considerada completa sem passar por esta avaliação holística.
> Diferente das fases anteriores (que verificam corretude técnica), esta fase pergunta:
> **"O código está BOM? Atende aos padrões arquiteturais e de qualidade do projeto?"**

### 11.1 — Architecture compliance check

| #   | Pergunta                                                                                           | Critério |
| --- | -------------------------------------------------------------------------------------------------- | -------- |
| A1  | O código segue SRP? Cada função/método tem uma responsabilidade única?                             | ✅ / ❌  |
| A2  | O código segue DIP? Dependências de bibliotecas externas passam pelo DepWall (`shared/deps.ts`)?   | ✅ / ❌  |
| A3  | Separação de camadas está preservada? (não há lógica de domínio misturada com I/O no mesmo método) | ✅ / ❌  |
| A4  | Não há duplicação estrutural com outro módulo?                                                     | ✅ / ❌  |

**Comando:** `grep -nP "^import .* from '" ${SOURCE} | grep -vP "\.js|\.json" | grep -v "shared/deps"` — verificar DepWall

**Se qualquer A ❌:** PARAR. Feature não está completa.

### 11.2 — Security review

| #   | Pergunta                                                                                                           | Critério |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| S1  | Nenhum caminho de arquivo é construído por concatenação de string sem validação? (path traversal)                  | ✅ / ❌  |
| S2  | Nenhum `eval()`, `Function()`, ou `setTimeout(string)` está presente?                                              | ✅ / ❌  |
| S3  | Dados de entrada do usuário são validados antes de uso em I/O, HTTP, ou shell?                                     | ✅ / ❌  |
| S4  | Nenhuma chave/segredo/token está hardcoded no código?                                                              | ✅ / ❌  |
| S5  | Nenhum `__proto__`, `constructor`, ou `prototype` é usado como chave de objeto sem proteção? (prototype pollution) | ✅ / ❌  |

**Comandos:**

```
grep -nP '(eval|Function\s*\()' ${SOURCE}
grep -nP '(path\.join|path\.resolve).*\+' ${SOURCE}
grep -nP '"__proto__"|"constructor"|"prototype"' ${SOURCE}
```

**Se qualquer S ❌:** PARAR. Feature não está completa.

### 11.3 — Error handling audit

| #   | Pergunta                                                                            | Critério |
| --- | ----------------------------------------------------------------------------------- | -------- |
| E1  | Toda operação de I/O (fs, rede, git) está dentro de try/catch?                      | ✅ / ❌  |
| E2  | Todo catch trata ou loga o erro? (nenhum catch vazio ou sem log)                    | ✅ / ❌  |
| E3  | Nenhum erro é propagado como string (`throw "erro"`) em vez de `throw new Error()`? | ✅ / ❌  |
| E4  | Mensagens de erro são acionáveis (dizem o que fazer)?                               | ✅ / ❌  |
| E5  | Nenhum error handler chama de volta o próprio serviço (risco de recursão infinita)? | ✅ / ❌  |

**Comandos:**

```
grep -A1P 'catch\s*\{' ${SOURCE}
grep -nP 'throw\s+"' ${SOURCE}
grep -nP 'rootLogger\.(debug|info|warn|error)' ${SOURCE} | grep -v '//.*test'
```

**Se qualquer E ❌:** PARAR. Feature não está completa.

### 11.4 — Type safety audit

| #   | Pergunta                                                               | Critério |
| --- | ---------------------------------------------------------------------- | -------- |
| T1  | Zero `as` casts em código-fonte (source)?                              | ✅ / ❌  |
| T2  | Zero `as` casts em testes?                                             | ✅ / ❌  |
| T3  | Zero `!` non-null assertions em código-fonte?                          | ✅ / ❌  |
| T4  | Zero `@ts-ignore` / `@ts-expect-error`?                                | ✅ / ❌  |
| T5  | Zero `eslint-disable` / `noqa`?                                        | ✅ / ❌  |
| T6  | Zero `Object.entries()` em parâmetro `object` com propagação de `any`? | ✅ / ❌  |

**Comandos:**

```
grep -nP 'as (any|never|string|number|boolean|Record|unknown)' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null
grep -nP '@ts-(ignore|expect-error)' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null
grep -nP 'eslint-disable' ${SOURCE} ${TEST_FILE_UNIT} ${TEST_FILE_INTEGRATION} ${TEST_FILE_PBT} 2>/dev/null
```

**Se qualquer T ❌:** PARAR. Feature não está completa.

### 11.5 — Maintainability check

| #   | Pergunta                                                                                | Critério |
| --- | --------------------------------------------------------------------------------------- | -------- |
| M1  | Nomes de funções, variáveis e classes revelam intenção? (sem `fn`, `temp`, `data`, `x`) | ✅ / ❌  |
| M2  | Não há constantes mágicas (números/strings soltos sem nome)?                            | ✅ / ❌  |
| M3  | Código comentado ou dead code está ausente?                                             | ✅ / ❌  |
| M4  | Complexidade ciclomática é aceitável? (métodos < 30 linhas idealmente)                  | ✅ / ❌  |

**Comandos:**

```
grep -nP '=\s*[0-9]{1,2}\s*[;,]' ${SOURCE} | grep -vP 'index|length|size|count|offset|limit|timeout|port|max|min|threshold|version|status|code|level|id|num|total|default|type|retry|attempt|seq|page|step|delay|interval|retries|chunk|batch|workers'
grep -nP '//.*$' ${SOURCE} | grep -vP '(eslint|istanbul|prettier|@ts-)' | head -5
```

**Se M1 ou M3 ❌:** PARAR. Feature não está completa.
**Se M2 ou M4 ❌:** ⚠️ Registrar como gap técnico.

### 11.6 — System consistency check

| #   | Pergunta                                                                                                          | Critério |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| C1  | Todos os consumidores identificados em Phase 1 continuam funcionando?                                             | ✅ / ❌  |
| C2  | Contratos públicos (exports, tipos, assinaturas) estão preservados (a menos que alteração tenha sido autorizada)? | ✅ / ❌  |
| C3  | Nenhum arquivo fora do escopo da FT foi alterado acidentalmente?                                                  | ✅ / ❌  |
| C4  | Equivalência comportamental: se a correção mudou comportamento, a mudança foi autorizada?                         | ✅ / N/A |

**Comando:** `git diff --stat` — verificar que apenas arquivos esperados foram alterados.

**Se qualquer C ❌:** PARAR. Feature não está completa.

### 11.7 — Registro da avaliação

Após responder a todas as perguntas, registrar no PROGRESS.md:

```markdown
#### Final Quality Gate (Phase 11)

| Categoria               | Status  |
| ----------------------- | ------- |
| A1-A4 (Architecture)    | ✅ / ❌ |
| S1-S5 (Security)        | ✅ / ❌ |
| E1-E5 (Error handling)  | ✅ / ❌ |
| T1-T6 (Type safety)     | ✅ / ❌ |
| M1-M4 (Maintainability) | ✅ / ❌ |
| C1-C4 (Consistency)     | ✅ / ❌ |

**Resultado:** ✅ APROVADO / ❌ REPROVADO
```

**Se REPROVADO:** a feature retorna à fase de correção (Phase 5) para os gaps identificados.

**Se APROVADO:** a feature está oficialmente completa. O marcador `✅ FT-${ID} completo` no PROGRESS.md (Phase 10.1 item 10) só pode ser escrito APÓS a aprovação na Phase 11.

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
