# LLM Judge Family Independence — Plano (v1)

**Data:** 2026-08-05
**Status:** Aprovado e autorizado explicitamente pelo usuário.

## 0. Objetivo

- **Geração (case18):** usar o modelo **main** (avançado) em vez de `fast`.
- **Judge (llm-judge):** usar um modelo de **família diferente** do gerador, de forma
  determinística, com falha explícita quando a independência não puder ser garantida.
- O sistema deve ser **agnóstico a provedor/formato**: o judge aceita qualquer modelo
  (decisão do usuário — restringir obrigaria a API dedicada, rejeitado).

## 1. Decisões (autorizadas)

| # | Decisão |
|---|---|
| D1 | `case18.ts` gera com `tier: 'main'` (era `fast`). |
| D2 | Judge usa `tier: 'reviewer'` **sempre** (tier sem fallback por construção). |
| D3 | Independência determinada por **família declarada** (`model-family.ts`), não por id. |
| D4 | Família desconhecida (`unknown`) ou mesma família → judge **não roda** + warn explícito (Rule 25). |
| D5 | Judge é agnóstico a formato de modelo (corrigir restrição `format:'gemini'` do reviewer). |
| D6 | Sem wizard, sem benchmarks públicos, sem `fallbackTiers` (decisões anteriores). |
| D7 | Decisão de modelos é config do usuário (`LLM_MODEL`, `LLM_REVIEW_MODEL`). |

## 2. Por que `reviewer` e não `fast` para judge

`shared/llm/llm-fallback.ts` fallbackMap:
```ts
['main', ['fallback', 'batch']],
['fast', ['main', 'fallback', 'batch']],  // degrada para main (família do gerador!)
['report', ['fallback', 'batch']],
```
`reviewer` NÃO está no mapa → `fallbacks = []` → se falhar, lança → judge retorna `null`.
Elimina por construção: degradação silenciosa para a família do gerador e contaminação de cache.

## 3. Arquitetura

```
shared/llm/model-family.ts          (NOVO, puro)
  canonicalModel(id) → remove prefixo provider (google/x → x)
  familyOf(model) → família declarada | 'unknown'
  override LLM_JUDGE_FAMILY

shared/llm/llm-fallback-config.ts
  assertJudgeIndependence() → { ok, reason }
    main sem modelo → erro explícito
    genFamily 'unknown' → block + reason
    reviewer sem modelo → block + reason acionável
    reviewer mesma família → block + reason
    reviewer 'unknown' → block (exige LLM_JUDGE_FAMILY)
    senão → ok

shared/llm/llm-fallback-config.ts (configFromExplicit reviewer)
  format agnóstico: derivar format do provider profile / baseUrl, não fixar 'gemini'

jira_management/commands/case18.ts:136  tier 'fast' → 'main'
shared/quality/llm-judge.ts:195         assertJudgeIndependence() antes de chamar
shared/llm/llm-client.ts                log do model id real (auditoria, sem chaves)
```

## 4. Tarefas

- T1 `shared/llm/model-family.ts` + testes
- T2 `assertJudgeIndependence()` em `llm-fallback-config.ts` + testes
- T3 `configFromExplicit('reviewer')` agnóstico a formato + testes
- T4 `case18.ts` `tier:'main'` + atualizar asserts
- T5 `llm-judge.ts` usa assert + testes
- T6 log do model real em `llmPrompt`
- T7 verificação: `npx vitest run` full + `npm run typecheck`
- T5-b (autorizado 2026-08-05): entregável estruturado do judge —
  `llm-judge.schema.ts` ganha `flaws[]` required (`{ location, reason, expected, fixToMax }`);
  `JudgeMetricReport`/`judgeResultToMetrics` propagam flaws; system prompt do judge ganha
  CONSTITUTION (no-hallucinate de flaws), standards de referência (ISO/IEC/IEEE 29119,
  ISTQB CTFL, IEEE 829 como critério), adversarial audit antes da nota, e contrato de
  entregável (score máximo ⇒ `flaws: []`; flaws não vazio refletido na distribuição).
  Fix de origem: `scripts/generate-env-example.ts` não conhecia a categoria `project`
  (schema tinha `qaCurrentProject`/`qaProjectDir`) — regeneração dropava as chaves;
  `LLM_JUDGE_FAMILY` adicionado ao CONFIG_SCHEMA e regenerado em `.env.example`.

## 5. Verificação (gate)

- `npx vitest run` 100% verde (suíte completa) — **551/551, 7636/7636 (2026-08-05)**.
- `npm run typecheck` verde — **confirmado (2026-08-05)**.
- Nenhum teste existente alterado para forçar passagem.

## 6. Fora de escopo

- Wizard de seleção de modelos (follow-up).
- Benchmarks públicos (decidido fora).
- `fallbackTiers` / cache identity (decidido fora — `reviewer` sem fallback resolve).
