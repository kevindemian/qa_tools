# PLANO — Sistema de Log Bulletproof: encontrar e corrigir todos os erros silenciosos, degradações graciosas e erros engolidos

**Local:** `dev/docs/plans/planos-pendentes/`
**Data de criação:** 2026-08-07
**Autoridade:** instrução explícita do usuário (AGENTS.md §1).

---

## 0. Regras de execução (AGENTS.md — não negociáveis)

- **TDD RED→GREEN (Regra 19.9/19.11):** teste que reproduz o defeito primeiro; correção na implementação, nunca no teste.
- **Causa raiz (Regra 4):** nenhum workaround, bypass, correção parcial ou paliativa.
- **Zero erro silencioso (Regra 25):** nenhum catch vazio, nenhum default que mascare dado ausente, nenhum `String(err)` que destrua stack.
- **Mock integrity (Regra 26):** testes de logger usam fs real/temp-dir; proibido mock-teatro.
- **Fases atômicas:** cada fase é dividida em tarefas **atômicas, comitáveis, testáveis e auditáveis** — uma tarefa = um commit = uma verificação.
- **Ordem de prioridade:** Safety > Correctness > Performance.
- **SOP §22:** fases sequenciais; checkpoint (`<!-- CHECKPOINT: Phase N complete -->`) registrado antes de avançar.
- **Solução tecnicamente superior** sempre; sem novos débitos.

---

## 1. Objetivo

Sistema de log robusto, eficiente e útil:

- **Toda falha é detectável** — nenhum erro é silenciado, engolido ou degradado a ruído sem decisão documentada.
- **Toda origem é rastreável** — stack trace sempre preservado nos caminhos de erro.
- **Útil para humanos e automação** — níveis corretos, contexto estruturado, secrets mascarados, arquivo de log disponível por padrão.
- **Gates de CI impedem regressão** — detecção automática de novos erros silenciosos.

---

## 2. Estado atual — evidências (levantamento em 2026-08-07)

### 2.1 Padrões de silenciamento quantificados (código de produção)

| # | Padrão | Contagem | Locais de maior densidade |
|---|--------|----------|---------------------------|
| A-1 | `catch` que só loga `rootLogger.debug(...)` (erro degradado a debug) | **108** | espalhado pelo repo |
| A-2 | `String(err)` em logs (perde stack/estrutura) | **217** | `scripts/opencode-db-maintenance.ts` (14), `shared/infra/store-backend.ts` (13), `jira_management/main.ts` (11), `shared/state.ts` (7), `shared/infra/temp-dir.ts` (6), `shared/infra/disk-cache.ts` (6), `shared/env-loader.ts` (6) |
| A-3 | `console.log/warn/error` em produção (bypass do logger) | **31** | espalhado |
| A-4 | `catch` vazio / `.catch()` vazio | 0 | — |
| A-5 | Handler global que destrói stack | 2 | `jira_management/main.ts:675`, `git_triggers/main.ts:15` |
| A-6 | `return null/{}` sem log em catch | 0 (detectável via no-swallow) | — |

### 2.2 Estado do logger (`shared/logger.ts`)

- Níveis: TRACE/DEBUG/INFO/WARN/ERROR (`config-schema.ts:166-173`, default INFO).
- `LOG_FILE` boolean, **default false** — arquivo de log **não é gerado por padrão** (causa do "log vazio" na reprodução do bug jira).
- `LOG_DIR` default `logs`; `LOG_MAX_SIZE` 5MB com rotação `.1/.2/...`.
- `maskDeep` aplicado em dados estruturados; `child(extra)` para contexto.
- `_writeConsole` (linha 141): erro → stderr; debug/info → stdout; data só anexado em nível ERROR e se < 160 chars.
- `_writeFile` (linha 165): usa `maskDeep(data)`; rotaciona; falha de escrita → stderr (não silenciosa).

### 2.3 Gate `no-swallow` (estado atual)

- `scripts/run-noswallow.ts`: roda ESLint com plugin `scripts/eslint-plugins/no-swallow.cjs` **apenas nos arquivos do diff** (CI).
- Cobertura atual: **apenas** catch vazio e catch que retorna default silencioso (sintático).
- Camada B (Semgrep semântico) mencionada no header do plugin **não existe**.
- Catraca: `audit/suppressions.yaml` (file+line+rule+owner+sunset 90d); validação via `scripts/audit-suppressions.ts`.

### 2.4 Caminho de erro do usuário

- `printError` → `extractErrorMessage` (`shared/ui/prompt-errors.ts:125-150`) lê apenas `message`/`response.data` — **nunca stack**.
- `_showErrorDetails` (`prompt-errors.ts:185-197`) exibe stack apenas quando o usuário escolhe "Details" — não é o caminho padrão.

---

## 3. Inventário de problemas (P-1 … P-8)

| # | Problema | Evidência |
|---|----------|-----------|
| P-1 | Handlers globais destroem stack | `jira_management/main.ts:675`, `git_triggers/main.ts:15` |
| P-2 | 108 `catch` degradam erro para `debug` | A-1 |
| P-3 | 217 `String(err)` perdem stack/estrutura | A-2 |
| P-4 | 31 `console.*` bypassam logger (sem mask/nível/file) | A-3 |
| P-5 | `LOG_FILE` default false → "sem logs" por padrão | `config-schema.ts:175-181` |
| P-6 | `no-swallow` incompleto (sintático + só diff) | §2.3 |
| P-7 | `extractErrorMessage`/`printError` perdem stack no caminho do usuário | §2.4 |
| P-8 | Sem helper canônico erro→log (cada chamador reinventa `String(err)`) | A-2 |

---

## 4. Fases e tarefas atômicas

> Formato de cada tarefa: **`<ID>` — título** · *descrição* · arquivos · teste/verificação · aceite. Cada tarefa é um commit independente. As fases são sequenciais (checkpoint entre fases); as tarefas dentro de uma fase podem ser paralelizadas se independentes.

---

### FASE 0 — Auditoria read-only (gerar inventário)

**Objetivo:** inventário completo e verificável de todos os padrões de silenciamento, sem alterar código.

**L-0.1 — Gerar inventário de `catch`/degradações**
- Rodar `rg`/`no-swallow` estendido sobre o repo inteiro; catalogar: catch vazio, catch `debug`-only, `String(err)`, `console.*`, `return default` sem log, `??`/`||` mascarando ausência, `.catch` sem handler.
- Entregável: `dev/docs/plans/planos-pendentes/log-audit-2026-08-07.md` (tabela por arquivo/linha/prioridade).
- Verificação: documento gerado com contagens reproduzíveis pelos comandos documentados.
- Aceite: inventário cobre os padrões A-1..A-6; zero código alterado.

**L-0.2 — Baseline de testes de logger**
- Confirmar cobertura atual de `shared/logger.ts` (vitest, fs real via `temp-dir`).
- Verificação: rodar suíte de `shared/logger` e `cli_base`; registrar números.
- Aceite: baseline conhecido (métricas antes/depois do plano).

**Checkpoint Fase 0:** inventário + baseline registrados.

---

### FASE 1 — Infra do logger (`shared/logger.ts`)

**Objetivo:** helper canônico de erro, stack preservado em `error()`, log em disco por padrão, mask completo.

**L-1.1 — Helper canônico `formatError(err): { message, name, stack, cause? }`**
- Novo export em `shared/logger.ts` (ou módulo dedicado `shared/errors-format.ts`); serializa stack; trata `cause`; nunca lança; mascara secrets presentes no stack.
- Teste TDD: `formatError` com `Error`, `TypeError`, string, objeto genérico, erro com `cause`, erro com secret no message.
- Aceite: função pura testada; stack preservado; secret mascarado.

**L-1.2 — `logger.error()` sempre emite stack**
- `error(msg, { err })` (e `err` diretamente) serializa via `formatError`; console (nível DEBUG+) e file recebem stack.
- TDD: erro com stack aparece completo no console e no arquivo; `maskDeep` aplicado.
- Aceite: nenhum `String(err)` nu gerado pelo logger; stack visível.

**L-1.3 — `LOG_FILE` default true**
- `config-schema.ts:175-181`: default `logFile` → `true`.
- Guarda: falha de escrita é reportada em stderr (nunca silenciosa) e **não** derruba o app.
- TDD: com default, `rootLogger.filePath` não-nulo; falha de escrita (dir inválido) reportada e app continua.
- Aceite: arquivo de log gerado por padrão em todo run.

**L-1.4 — `maskDeep` em TODOS os caminhos (incl. stack)**
- Garantir mask aplicado em console + file + structured, incluindo `err.stack` (mensagens podem conter tokens).
- TDD: erro cuja stack contém `secret=valor` → valor mascarado no file e console.
- Aceite: nenhum secret vaza via stack.

**L-1.5 — Contexto estruturado de sessão**
- `rootLogger.child({ session, project, operation })` propagado automaticamente no file (formato já existe via `context`).
- Verificar que `writeFileOnly` e file line mantêm contexto.
- TDD: child logger grava contexto; `maskDeep` em context.
- Aceite: linhas de log com contexto de sessão consistentes.

**Checkpoint Fase 1:** logger com stack + default file + mask completo + contexto; suíte `shared/logger` verde.

---

### FASE 2 — Handlers globais e caminho do usuário (P-1, P-7)

**Objetivo:** stack trace nunca destruído em handlers de processo e no caminho de erro do usuário.

**L-2.1 — `jira_management/main.ts:673-677` `unhandledRejection` com stack**
- Registrar `error` + `stack` via `formatError`; manter console (`printError`) + `gracefulExit(ERROR)`.
- Verificação: reproduzir caminho async com erro simulado → stack completo no log.
- Aceite: stack presente; exit code preservado.

**L-2.2 — `git_triggers/main.ts:13-17` `unhandledRejection` com stack**
- Mesma correção; consistência sistêmica.
- Verificação: `tsc` + suíte git_triggers.
- Aceite: idêntico a L-2.1.

**L-2.3 — `printError` com stack sob debug**
- `extractErrorMessage` preserva `stack`; `printError` exibe stack quando `LOG_LEVEL=DEBUG` (ou flag `--debug`).
- TDD: `printError(ctx, err)` com debug → stack visível; sem debug → mensagem/hint (comportamento atual preservado).
- Aceite: usuário obtém stack em modo verbose sem mudar contrato default.

**Checkpoint Fase 2:** nenhum caminho global/periférico destrói stack; testes de `prompt-errors` verdes.

---

### FASE 3 — Substituição em massa guiada (P-2, P-3)

**Objetivo:** eliminar `String(err)` e degradações `debug`-only, por arquivo de maior densidade, com TDD por caso.

**Ordem de execução (densidade desc):**
1. `shared/infra/store-backend.ts` (13)
2. `jira_management/main.ts` (11)
3. `shared/state.ts` (7)
4. `shared/infra/temp-dir.ts` (6)
5. `shared/infra/disk-cache.ts` (6)
6. `shared/env-loader.ts` (6)
7. demais arquivos da lista de A-2 e A-1.

**L-3.N — Tarefa por arquivo (N = sequencial)**
- Para cada arquivo: substituir `String(err)` → `formatError(err)`/`logger.error(msg, { err })`; `debug`-only em catch → nível correto (WARN/ERROR) **ou** sentinela de contrato documentada + log.
- TDD: teste que falha reproduz o caso antes da correção (RED); passa após (GREEN).
- Verificação: `tsc`, testes do arquivo, `no-swallow` no diff, cobertura ≥ floor.
- Aceite: 0 `String(err)` no arquivo; 0 catch `debug`-only sem sentinela documentada; testes verdes.
- Regra: **uma tarefa = um arquivo = um commit** (quando dependências permitirem agrupar módulos pequenos, agrupar e documentar).

**Checkpoint Fase 3:** 0 `String(err)` e 0 `debug`-only restantes no repo (verificável via `rg`).

---

### FASE 4 — `console.*` → logger (P-4)

**Objetivo:** eliminar bypass do logger em código de produção.

**L-4.1 — Catalogar os 31 `console.*`**
- Classificar: contrato de CLI (splash/output — manter via `output.ts`) vs. bypass indevido (migrar).
- Entregável: tabela no log-audit (marcação manter/migrar).
- Verificação: documento atualizado.
- Aceite: classificação completa e verificável.

**L-4.2 — Migrar bypasses para `rootLogger`/`output`**
- Cada ocorrência migrada ganha nível + mask + file; contrato de CLI mantido via `output.ts`.
- TDD por grupo; verificação `tsc` + suíte + `no-swallow`.
- Aceite: 0 `console.*` em produção exceto contratos de CLI documentados.

**Checkpoint Fase 4:** `rg "console\."` em produção retorna apenas contratos de CLI.

---

### FASE 5 — Gate `no-swallow` reforçado (P-6)

**Objetivo:** detecção automática das novas categorias no repo inteiro (não só diff).

**L-5.1 — Estender plugin `no-swallow.cjs`**
- Novas categorias sintáticas: catch `debug`-only sem sentinela documentada; `return default` com dado ausente; `??`/`||` que mascara ausência de dado (casos inequívocos); `.catch` sem handler.
- Catraca `audit/suppressions.yaml` preservada (sunset 90d).
- TDD: casos positivos (report) e negativos (sentinelas documentadas) no próprio plugin/testes.
- Aceite: plugin detecta as novas categorias sem falso-positivo nos casos permitidos.

**L-5.2 — Rodar no repo inteiro em CI (não só diff)**
- `run-noswallow.ts` ganha modo full-repo (ou novo script `no-swallow:full`); CI invoca.
- Verificação: qualidade-check/local com repo inteiro; violações novas → correção na origem (Fase 3) antes do merge.
- Aceite: CI falha se repo inteiro tiver violação das categorias.

**Checkpoint Fase 5:** gate cobre categorias novas no repo inteiro; suppressions decrescente.

---

### FASE 6 — Configuração e UX (P-5, complemento)

**Objetivo:** log utilizável por padrão e documentado.

**L-6.1 — Expor config de log no `.env.example` + docs**
- Adicionar `LOG_FILE`, `LOG_DIR`, `LOG_LEVEL`, `LOG_MAX_SIZE` com comentários; atualizar docs de troubleshooting/config.
- Verificação: `.env.example` gerado via `npm run generate-env-example` mantém as chaves.
- Aceite: configuração documentada e reproduzível.

**L-6.2 — Mensagem de sessão com path do log**
- No início de cada módulo (jira/git), registrar `Log: <rootLogger.filePath>` quando arquivo ativo (já existe em `printSessionSummary`; estender para o start).
- TDD: início de sessão imprime path quando `LOG_FILE` ativo.
- Aceite: usuário sabe onde está o log.

**Checkpoint Fase 6:** config documentada + path visível no start.

---

### FASE 7 — Validação final e regressão real

**Objetivo:** provar a robustez do sistema com a reprodução do bug original.

**L-7.1 — Reprodução do caso `_getSession` com log rastreável**
- Com o logger final, reproduzir o fluxo do bug jira → stack completo + origem no arquivo de log.
- Verificação: `LOG_FILE=true LOG_LEVEL=DEBUG npm run jira` (ou entry-menu → jira) gera log com stack.
- Aceite: causa raiz visível no log; nenhum erro silenciado.

**L-7.2 — Suíte completa + gates**
- `npx tsc --noEmit`; `npx vitest run` completo; `quality-check` 20/20; lint; depcruise; unused-exports; `no-swallow` full-repo; report-determinism.
- Aceite: tudo verde; zero regressão.

**L-7.3 — Auditoria final**
- Atualizar `log-audit-2026-08-07.md` com status final (padrões remanescentes, se houver, com justificativa documentada).
- Verificação: tabela final com contagens 0 ou justificadas.
- Aceite: audit trail completo e auditável.

**Checkpoint Fase 7:** tudo verde + audit final.

---

## 5. Critérios de aceite globais (medíveis)

- [ ] 100% dos handlers globais registram stack completo.
- [ ] 0 `console.*` em produção (exceto contratos de CLI documentados).
- [ ] 0 `catch` vazio / `.catch()` sem handler em produção.
- [ ] 0 `String(err)` em logs (substituídos por `formatError`).
- [ ] Todo `catch` que não relança registra nível adequado (WARN/ERROR) ou sentinela de contrato documentada.
- [ ] `LOG_FILE=true` por padrão; falha de escrita reportada, nunca silenciosa.
- [ ] `maskDeep` aplicado em todos os caminhos, incluindo stack traces.
- [ ] `no-swallow` cobre as novas categorias no repo inteiro; suppressions decrescente.
- [ ] Suíte completa + CI verdes.
- [ ] Bug original (`_getSession`) reproduzido com stack rastreável no log.
- [ ] Nenhum workaround, bypass ou enfraquecimento de safety mechanism.

---

## 6. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Mudança global de `LOG_FILE` default aumenta I/O | Escrita em append; rotação por tamanho; `LOG_MAX_SIZE` já existente; medir overhead em L-7.2 |
| Substituição em massa (217+108) introduz regressão | TDD por arquivo; commit por tarefa; `no-swallow` full-repo em CI |
| `no-swallow` estendido gera falso-positivos | Casos negativos (sentinelas documentadas) testados no plugin; catraca `suppressions.yaml` |
| Secrets em stack traces | `maskDeep` garantido em L-1.4 com teste dedicado |
| Escopo grande (repo inteiro) | Fases sequenciais com checkpoint; tarefas atômicas comitáveis |

---

## 7. Dependências externas

- Nenhuma dependência de runtime nova (ESLint plugin e vitest já existem).
- `audit/suppressions.yaml` mantido como catraca (não removido).
