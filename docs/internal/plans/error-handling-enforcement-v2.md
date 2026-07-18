# Error-Handling Enforcement + Log System Hardening — Plano Consolidado

> **Data:** 2026-07-16
> **Autor:** opencode (sessão de auditoria)
> **Status:** PLANO — aguarda aprovação para sair de plan mode
> **Substitui:** `shared/plans/error-handling-enforcement.md` (catraca `result` teatral — ver §1)

---

## 0. ESTADO REAL MEDIDO (auditoria independente, 2026-07-16)

Re-auditoria direta do código atual. Difere do `error-handling-enforcement.md` anterior e do `BACKLOG_sanitize.md` (escrito 2026-06-14) em pontos críticos.

### 0.1 A catraca `result-catraca` É TEATRO (violação AGENTS §5/§25)

- `eslint.config.mjs:215` habilita `'local-result/must-use-result': 'error'`.
- `scripts/eslint-plugins/result-catraca.cjs` existe e é type-aware.
- **Porém:** `grep neverthrow` em todo o repo = **0 imports**. O repo NÃO usa `neverthrow`/`Result` em lugar nenhum.
- Consequência: a regra vigia um tipo (`Result`) que nunca ocorre → **0 erros sempre**. É um mecanismo de segurança que não exerce função alguma. Viola §5 (Safety Mechanism Immutability): um mecanismo de segurança inerte é pior que nenhum, pois cria falsa sensação de cobertura.
- Decisão (confirmada pelo usuário): **substituir** por detector de supressão real (categorias semânticas abaixo), não por type-gating de um tipo inexistente.

### 0.2 Taxonomia real de supressão (repo atual, >50k LoC)

| Categoria | O quê                                                                        | Medido (prod, não-teste) | Regra canônica?                                  |
| --------- | ---------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| C1        | `eslint-disable` / `@ts-ignore` / `@ts-expect-error` / `noinspection` inline | **96**                   | já proibido por AGENTS §5/§18 — deve ser extinto |
| C2        | `catch {}` / `catch(e){}` vazio                                              | 0                        | ESLint `no-empty` cobre                          |
| C3        | `catch` que só loga e continua (sentinela implícita)                         | ~68                      | sem regra canônica → Semgrep taint               |
| C4        | `catch` que retorna `{}`/`[]`/`null` (fallback silencioso)                   | ~30                      | sem regra canônica → Semgrep                     |
| C5        | `catch` que faz `log + return` de default                                    | ~95                      | Semgrep                                          |
| C6        | `handleError(..., { returnNull: true })` (sink central)                      | **17** (prod)            | Semgrep + remoção de sink                        |
| C7        | `as any` / `: any` (perde type-check de erro)                                | 4 arquivos               | ESLint `no-explicit-any`                         |
| C8        | `.catch(() => {})` fire-and-forget sem rethrow                               | 1 (teste)                | ESLint `no-floating-promises`                    |
| —         | `unwrapOr`/retry que engole / boolean-em-vez-de-throw                        | não medido (semântico)   | Semgrep dataflow                                 |

**Total aproximado de sítios de supressão real:** ~306 (contra ~286 do doc anterior; diferença por re-contagem semântica, não sintática).

### 0.3 Backlog Log System — VERIFICAÇÃO CONTRA CÓDIGO ATUAL

Releitura de `shared/logger.ts` (239 linhas) e `shared/feature-config.ts` (145 linhas) em 2026-07-16:

| ID                 | Backlog (2026-06-14)                                                  | Estado REAL 2026-07-16                                                                                                                                            | Ação                                                                                                                |
| ------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| LOG-01             | `loadFeatureConfig` silencia `fs.existsSync` falso → `{}` sem warning | **AINDA REAL** — `feature-config.ts:37-39` retorna `{}` silenciosamente quando `config/features.json` ausente. Causa raiz do "PR Report disabled" em CI persiste. | CORRIGIR na raiz: `rootLogger.warn` + retornar `(DEFAULT_PR_REPORT_CONFIG)` com flag explícita de "não configurado" |
| LOG-02             | `_writeFile` não filtra por nível                                     | **REAL** — `_writeFile` (logger.ts:163) escreve DEBUG..ERROR incondicional; só `_writeConsole` (143) filtra                                                       | CORRIGIR: aplicar filtro de nível em `_writeFile`                                                                   |
| LOG-03             | `_fileError` falha permanente, sem recovery                           | **REAL** — `_fileError` setado em 81/97/187, nunca resetado                                                                                                       | CORRIGIR: recovery com backoff/retry limitado (não silencioso)                                                      |
| LOG-04             | `rootLogger` singleton sem config                                     | **REAL (menor)** — `rootLogger = new Logger()` (239), `_config=null`, delega `Config.get()`                                                                       | CORRIGIR: garantir `Config` inicializado antes de `rootLogger` ser usado (ordem de import)                          |
| LOG-05             | `maskDeep` não é recursivo                                            | **FALSO — já corrigido** — `maskDeep` (40-56) É recursivo (`maskDeep(item)`/`maskDeep(val)`). Backlog desatualizado.                                              | NÃO tocar. Marcar como resolvido no BACKLOG                                                                         |
| LOG-06             | `fs.existsSync` em todo log (perf)                                    | **REAL (baixo)** — `_ensureDir` (90) faz `existsSync` por write até cache hit                                                                                     | CORRIGIR: cache de `dirExists`                                                                                      |
| LSA-2a/2b/2c (T14) | `(err as Error)` em 3 catches do logger                               | **FALSO — 0 ocorrências** — `grep "(err as Error)"` repo = 0. logger.ts usa `Object(err)` guard (111).                                                            | NÃO tocar. Backlog desatualizado                                                                                    |
| LSA-1/3            | Audit de error-handling/masking/consumo                               | Pendente de execução                                                                                                                                              | Executar como Fase de auditoria, não como correção cega                                                             |

**Conclusão:** integrar ao plano APENAS os itens LOG-01/02/03/04/06 (reais). LOG-05 e LSA-2 estão **obsoletos** e devem ser marcados resolvidos no `BACKLOG_sanitize.md` (edição posterior, fora de plan mode).

---

## 1. PRINCÍPIO ORIENTADOR (AGENTS §4/§5/§25)

- **Zero silenciamento.** Todo erro de I/O/rede/parse deve ser explícito (lançado ou retornado como tipo `Err`), NUNCA mascarado por default/fallback silencioso.
- **Mecanismo de segurança real, não decorativo.** A catraca teatral (§0.1) é substituída por detector que EXERCE função (bloqueia diff que adiciona supressão não-isenta).
- **Isenção explícita, nunca inline.** AGENTS §18 proíbe `eslint-disable`/`@ts-ignore` inline. Isenções vão para `audit/suppressions.yaml` com `sunset: 90d`, log no audit trail, e são tratadas como dívida rastreada — não como "desliga regra".
- **Causa raiz, não sintoma.** NÃO banir `return null` genericamente (falso-positivo em sentinelas legítimas, ex.: `404 → null`). Tratar o canal de erro tornando-o explícito no tipo/contrato.

---

## 2. ARQUITETURA DE ENFORCEMENT (3 camadas + rollout)

### Camada A — ESLint `no-swallow` (type-aware, local) — SUBSTITUI `result-catraca`

- **Remover** `scripts/eslint-plugins/result-catraca.cjs` e a entrada `'local-result/must-use-result'` de `eslint.config.mjs`.
- **Criar** `scripts/eslint-plugins/no-swallow.cjs` (type-aware via `parserServices`):
    - Dispara em `catch` cujo corpo **não** (a) relança, (b) chama `rootLogger.error/warn` **E** retorna sentinela de domínio documentada, ou (c) retorna via tipo `Result`/`ExternalError`.
    - Permite `catch (e) { throw new ExternalError(...) }` e `if (status === 404) return null` (sentinela explícita de contrato).
    - **Não** dispara em código legado sem modificação (catraca por diff no pre-commit + CI só nos arquivos do diff).
- **Auto-teste da regra** (`scripts/eslint-plugins/no-swallow.test.ts`): caso que engole → erro; caso que relança/Log+throw → OK.

### Camada B — Semgrep custom (`.semgrep/`)

- **Instalar/versionar** Semgrep no repo (binário existe em `~/.local/bin/semgrep` mas NÃO está versionado — autorizado pelo usuário).
    - Adicionar `semgrep` ao `devDependencies` (ou wrapper `scripts/run-semgrep.ts` que baixa versão fixa no CI).
- **Regras em `.semgrep/suppression.yaml`** (dataflow/taint) para categorias sem regra ESLint canônica:
    - `catch-returns-default` (C4/C5): `catch` → `return {}|[]|null|<default>` sem log de erro.
    - `handleError-returnNull` (C6): qualquer `handleError(..., { returnNull: true })` — detector + futura extinção do sink.
    - `silent-retry` (semântico): retry loop cujo `catch` não propaga.
    - `boolean-instead-of-throw`: função que retorna `boolean` para sinalizar falha onde deveria lançar.
- **CI job `semgrep`** em `.github/workflows/ci.yml` (bloqueante): roda nas mudanças do PR (diff) — não big-bang.

### Camada C — Stryker (mutation testing) incremental

- **Instalar** `@stryker-mutator/*` (autorizado pelo usuário).
- `stryker.conf.json`: escopo incremental (`mutate` = apenas arquivos do diff em PR), `coverageAnalysis: 'perTest'`, thresholds: iniciar em **50%**, subir para **75%+** após estabilizar.
- **CI job `mutation`** (bloqueante) no `ci.yml`.

### Camada D — `audit/suppressions.yaml` (isenção rastreada, não inline)

- Substitui todos os `eslint-disable`/`@ts-ignore` inline (C1=96) por entradas YAML com: `file`, `line`, `rule`, `reason`, `owner`, `sunset: <ISO 90d>`.
- Script `scripts/audit-suppressions.ts`: falha se alguma isenção estiver expirada ou sem `reason`/`owner`.
- **Proibido** manter `eslint-disable` inline (AGENTS §18); migrar os 96 existentes para o YAML ou corrigir a causa raiz.

### Rollout (teto decrescente, confirmado pelo usuário)

1. Baseline medido: ~306 sítios (§0.2).
2. CI/linters bloqueiam **adição** de novas supressões no diff (Camadas A/B + pre-commit diff).
3. Migração orgânica: cada arquivo que entra no diff corrige sua causa raiz; contador em `audit/suppressions.yaml` decresce.
4. `scripts/audit-suppressions.ts` reporta o teto atual; meta: decrescer até 0 em X incrementos.

---

## 3. INTEGRAÇÃO: LOG SYSTEM HARDENING (itens reais do BACKLOG)

Executado como track paralelo ao enforcement, mesma disciplina (Regra 19: teste primeiro, causa raiz, zero workaround).

### Fase L1 — LOG-01 (CRITICAL, causa raiz do "PR Report disabled" em CI)

- `shared/feature-config.ts:37-39`: ao ausente `config/features.json`, NÃO retornar `{}` silencioso.
    - `rootLogger.warn('config/features.json not found at <path>; using DEFAULT_PR_REPORT_CONFIG (prReport disabled). Verify CWD/checkout.')`.
    - Retornar estrutura que distingue "não configurado" de "desabilitado por escolha" (campo `_source: 'default-missing-file'` ou tipo `FeatureConfigStore | MissingConfig`).
- **Teste (Red):** `feature-config.test.ts` — arquivo ausente → `rootLogger.warn` chamado COM a causa; `isPrReportEnabled` reflete explicitamente "missing, defaulting to disabled" (não silencia).
- Investigar CWD vs checkout no CI (item 2 da "Ação Requerida" do backlog).

### Fase L2 — LOG-02 (HIGH)

- `shared/logger.ts:163` `_writeFile`: aplicar o mesmo filtro de nível de `_writeConsole` (linha 143) antes de escrever.
- **Teste:** log DEBUG com `logLevel=info` → NÃO aparece no arquivo; ERROR → aparece.

### Fase L3 — LOG-03 (MEDIUM)

- `shared/logger.ts:80` `_ensureDir`: substituir `_fileError` permanente por recovery com tentativa limitada (ex.: reset `_fileError=false` após N writes bem-sucedidos ou backoff) — NÃO silenciar, logar recovery.
- **Teste:** falha de I/O seguida de sucesso → logger recupera e escreve.

### Fase L4 — LOG-04 (MEDIUM, menor)

- Garantir ordem de inicialização: `Config` populado antes do primeiro uso de `rootLogger`. Se `rootLogger` usado antes, logar explicitamente (não comportamento imprevisível silencioso).
- **Teste:** `rootLogger` sem `Config` inicializado → `warn` explícito, não crash silencioso.

### Fase L5 — LOG-06 (LOW, perf)

- `shared/logger.ts:90`: cache de `dirExists` (`_logDirResolved` boolean) para evitar `fs.existsSync` por write.
- **Teste:** contador de `fs.existsSync` chamado ≤ 1 vez por diretório.

### Fase L6 — LSA-1 / LSA-3 (Auditoria, não correção cega)

- LSA-1a..1e: auditoria de `maskDeep` (já recursivo — confirmar cobertura de todos os campos sensíveis via teste PBT), rotação, file handles, level filtering.
- LSA-3a..3c: varredura repo-wide de catch blocks (usar Semgrep da Camada B como instrumento) — alimenta o inventário de C3/C4/C5.
- **Saída:** relatório em `docs/audit/log-system-audit-<data>.md`, não correção automática.

---

## 4. ORDEM DE EXECUÇÃO (fora de plan mode)

1. **Branch** `fix/error-handling-enforcement` (de `dev`).
2. Camada A: remover `result-catraca`, criar `no-swallow` + auto-teste. Validar `tsc` + `eslint`.
3. Camada D: `audit/suppressions.yaml` + `scripts/audit-suppressions.ts`; migrar/eliminar 96 inline (ou corrigir causa raiz onde viável).
4. Camada B: instalar Semgrep versionado + `.semgrep/suppression.yaml` + CI job.
5. Camada C: Stryker config + CI job incremental.
6. Log track L1→L5 (cada um com teste Red→Green per Regra 19).
7. L6 auditoria → relatório.
8. Atualizar `BACKLOG_sanitize.md`: marcar LOG-05 e LSA-2 como RESOLVIDOS (obsoletos); marcar LOG-01/02/03/04/06 como em progresso/concluídos.
9. `tsc --noEmit` + `vitest run` + `eslint` + novos CI jobs verdes antes do push.
10. Push → monitorar CI (AGENTS §13).

---

## 5. RISCOS / TRADE-OFFS (honestos)

- **Falso-positivo em sentinela legítima** (`404 → null`): mitigado por allowlist explícita na regra `no-swallow` e no Semgrep (só bloqueia fallback SILENCIOSO, não sentinela documentada).
- **Custo de lint type-aware**: mantido só no diff (pre-commit + Semgrep/Stryker no PR).
- **Migração de 96 inline suppressions**: algumas são isenções legítimas (vão para `suppressions.yaml` com sunset); outras escondem bug real (corrigir causa raiz). Não silenciar nenhuma sem justificativa registrada.
- **Stryker 50%→75%**: threshold inicial conservador para não quebrar CI imediatamente; sobe conforme mutators mortos são cobertos.
- **LOG-04 ordem de import**: risco de mudança de comportamento em bootstrap — testar init path do CLI.

---

## 6. AUDIT TRAIL

- 2026-07-16: re-auditoria revela `result-catraca` teatral (0 `neverthrow` no repo) e desatualização de LOG-05/LSA-2 no backlog. Plano reescrito para substituir catraca por detector real de supressão + integrar Log System hardening (itens reais).
- Decisões do usuário confirmadas: proibir anotações inline de isenção; diff-only + teto decrescente; `suppressions.yaml` sunset 90d; CI bloqueante para todas as camadas; Semgrep versionado no repo; Stryker incremental; integrar tarefas de `BACKLOG_sanitize.md`.
- **Fechamento (2026-07-16):** usuário aprovou o plano e liberou execução (build mode). Decisões finais registradas:
    - **Imutabilidade do `scripts/audit-suppressions.ts`:** recebe `chattr +i` (bit immutable de SO) na máquina de dev APÓS escrita+validação; no CI, step reaplica `chattr +i` e falha se o bit não estiver setado (`lsattr`). O `rule-vigilant.ts` NÃO é o vigilante primário (ele mesmo é editável) — proteção real vem do `chattr +i` + checagem de `lsattr` no CI. Adicionar `scripts/audit-suppressions.ts` à lista de `ci.yml:38` + regra no `rule-vigilant.ts` que detecta rebaixar teto.
    - **Tabela de teto Stryker (hardcoded no script, imutável):** modelo C1 (contagem absoluta de supressões) — 306→50%, 200→60%, 120→70%, 0→75%. **Trava temporal de 90d MANTIDA**: se em 90d o contador não caiu o suficiente, o teto sobe mesmo assim (evita estagnação).
    - **Branch:** `fix/error-handling-enforcement` (de `dev`).
- Verificação pré-execução: `rule-vigilant.ts` faz scan baseado em regras (não lista fixa); CI itera lista em `ci.yml:38`. Semgrep e Stryker NÃO estão no repo (instalação é passo real). `chattr` presente local e no runner Ubuntu, mas bit não persiste via `actions/checkout` → reaplicar no CI.
