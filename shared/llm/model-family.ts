/**
 * Model family classification — deterministic, org-driven (Rule 1).
 *
 * "Family" is the training lineage of a model (google, meta, openai, ...).
 *
 * Primary source of truth: the **org prefix of the model id** in the
 * `org/model` convention used by public model registries (OpenRouter, whose
 * registry is consumed in `data/model-registry.json`). The org IS the lineage:
 * `google/gemini-2.0-flash-exp` → `google`, `meta-llama/llama-3.1` → `meta`.
 * This is declared data from a versioned external source, not a heuristic.
 *
 * Exceptions are declared explicitly:
 *  - Router alias orgs (`opencode/...`) that are not a lineage → resolved by
 *    the base model name instead.
 *  - Bare model ids without an org (`gemini-2.0-flash-exp`) → resolved by the
 *    name-prefix fallback table.
 *
 * Anything still undetermined is `'unknown'` (fail-closed for judge
 * independence): we never guess a family (Rule 1 — inference is not authority).
 */

/** Canonical family identifiers used across the codebase. */
export type ModelFamily = string;

/** Sentinel returned when a model's family cannot be determined. */
export const UNKNOWN_FAMILY = 'unknown';

/**
 * Org slugs whose models must be resolved by base name instead of org:
 * the org is a serving/router namespace, not the training lineage.
 */
const ROUTER_ALIAS_ORGS: ReadonlySet<string> = new Set(['opencode', 'opencode-go', 'opencode-zen']);

/** Normalise a known org slug to a canonical family. Unknown orgs default to themselves. */
const ORG_TO_FAMILY: Readonly<Record<string, string>> = {
    'meta-llama': 'meta',
    meta: 'meta',
    google: 'google',
    openai: 'openai',
    anthropic: 'anthropic',
    'deepseek-ai': 'deepseek',
    deepseek: 'deepseek',
    moonshotai: 'moonshot',
    qwen: 'alibaba',
    alibaba: 'alibaba',
    mistralai: 'mistral',
    mistral: 'mistral',
    'x-ai': 'xai',
    xai: 'xai',
    cohere: 'cohere',
    microsoft: 'microsoft',
    zhipuai: 'zhipu',
    minimax: 'minimax',
    bytedance: 'bytedance',
    tencent: 'tencent',
    baidu: 'baidu',
    '01-ai': 'lingyiwanwu',
    stepfun: 'stepfun',
    baichuan: 'baichuan',
    nvidia: 'nvidia',
    ibm: 'ibm',
    ai21: 'ai21',
    allenai: 'allenai',
    amazon: 'amazon',
    mimo: 'mimo',
    upstage: 'upstage',
    databricks: 'databricks',
    snowflake: 'snowflake',
};

/**
 * Name-prefix fallback table for BARE model ids (no org prefix), e.g.
 * `gemini-2.0-flash-exp`, `deepseek-v4-pro`. Kept small because org-driven
 * resolution covers the registry convention; this handles direct-provider ids.
 */
const FAMILY_BY_NAME_PREFIX: ReadonlyArray<readonly [prefix: string, family: string]> = [
    // Google
    ['gemini-', 'google'],
    ['gemma-', 'google'],
    ['palm-', 'google'],
    // Meta
    ['llama', 'meta'],
    // OpenAI
    ['gpt-', 'openai'],
    ['o1-', 'openai'],
    ['o3-', 'openai'],
    ['o4-', 'openai'],
    ['o5-', 'openai'],
    // Anthropic
    ['claude-', 'anthropic'],
    // DeepSeek
    ['deepseek-', 'deepseek'],
    // Moonshot AI
    ['kimi-', 'moonshot'],
    // Alibaba (Qwen)
    ['qwen-', 'alibaba'],
    ['qwq-', 'alibaba'],
    // Mistral AI
    ['mixtral-', 'mistral'],
    ['mistral-', 'mistral'],
    ['codestral-', 'mistral'],
    ['devstral-', 'mistral'],
    ['mathstral-', 'mistral'],
    // xAI
    ['grok-', 'xai'],
    // Cohere
    ['command-r', 'cohere'],
    ['command-', 'cohere'],
    ['aya-', 'cohere'],
    // Microsoft
    ['phi-', 'microsoft'],
    ['maestro-', 'microsoft'],
    ['wizardlm-', 'microsoft'],
    // ByteDance (Doubao)
    ['doubao-', 'bytedance'],
    ['seed-', 'bytedance'],
    // Zhipu AI (GLM)
    ['glm-', 'zhipu'],
    ['chatglm-', 'zhipu'],
    // MiniMax
    ['minimax-', 'minimax'],
    // Tencent (Hunyuan)
    ['hunyuan-', 'tencent'],
    // Baidu (ERNIE)
    ['ernie-', 'baidu'],
    // 01.AI (Yi)
    ['yi-', 'lingyiwanwu'],
    // StepFun
    ['step-', 'stepfun'],
    // Baichuan
    ['baichuan-', 'baichuan'],
    // NVIDIA
    ['nemotron-', 'nvidia'],
    // IBM
    ['granite-', 'ibm'],
    // AI21 (Jamba)
    ['jamba-', 'ai21'],
    // Allen AI (OLMo)
    ['olmo-', 'allenai'],
    // Amazon (Nova/Titan)
    ['nova-', 'amazon'],
    ['titan-', 'amazon'],
    // Other market lineages
    ['mimo-', 'mimo'],
    ['solar-', 'upstage'],
    ['dbrx-', 'databricks'],
    ['snowflake-arctic-', 'snowflake'],
    ['aya-expanse-', 'cohere'],
];

/**
 * Extract the org segment of an `org/model` id, if present.
 * `google/gemini-2.0-flash-exp` → `google`; `gpt-4o` → `''`.
 */
export function extractOrg(model: string): string {
    if (typeof model !== 'string' || model.trim() === '') return '';
    const trimmed = model.trim();
    const slashIdx = trimmed.indexOf('/');
    return slashIdx >= 0 ? trimmed.slice(0, slashIdx) : '';
}

/**
 * Remove the org/prefix from a model id (the base model name).
 * `google/gemini-2.0-flash-exp` → `gemini-2.0-flash-exp`; `gpt-4o` stays.
 */
export function canonicalModel(model: string): string {
    if (typeof model !== 'string' || model.trim() === '') return '';
    const trimmed = model.trim();
    const slashIdx = trimmed.indexOf('/');
    return slashIdx >= 0 ? trimmed.slice(slashIdx + 1) : trimmed;
}

/**
 * Classify a model into its family.
 *
 * Resolution order:
 *  1. Org prefix present and NOT a router alias → family = normalised org
 *     (unknown orgs default to the org itself — it is the declared lineage).
 *  2. Router alias org (`opencode/...`) or bare id → name-prefix fallback.
 *  3. Still undetermined → `'unknown'` (fail-closed, never guesses).
 */
export function familyOf(model: string): string {
    if (typeof model !== 'string' || model.trim() === '') return UNKNOWN_FAMILY;
    const trimmed = model.trim();
    const org = extractOrg(trimmed);

    if (org !== '' && !ROUTER_ALIAS_ORGS.has(org)) {
        return ORG_TO_FAMILY[org] ?? org;
    }

    const base = canonicalModel(trimmed);
    if (base === '') return UNKNOWN_FAMILY;
    const match = FAMILY_BY_NAME_PREFIX.find(([prefix]) => base.startsWith(prefix));
    if (!match) return UNKNOWN_FAMILY;
    return match[1];
}
