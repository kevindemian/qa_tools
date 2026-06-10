/**
 * validation_hook.ts — versão superior ao doc3
 *
 * Base: doc3 (produção atual)
 * Correções aplicadas:
 *
 * BUG 1 — `export { validateCommandContent }` duplicado no final do arquivo
 *          causava erro TS2323 "Cannot redeclare exported variable".
 *          Removida a re-exportação redundante; a função já é `export function`.
 *
 * BUG 2 — `extractCodeBlocks` ignorava blocos indentados (4 espaços/tab)
 *          porque `currentLanguage` era sempre "unknown" e nunca atualizado.
 *          Adicionada heurística `detectLanguage` — validações Python/Go/Rust/Java
 *          agora funcionam nesses blocos.
 *
 * BUG 3 — Padrões de tsconfig (`strict: false`, `noImplicitAny: false`, etc.)
 *          estavam apenas em `DANGEROUS_TS_CODE_PATTERNS`, que só roda sobre
 *          blocos de linguagem ts/js. Blocos JSON e texto bruto escapavam.
 *          Movidos para FORBIDDEN_PATTERNS (camada 1) com variante com/sem aspas.
 *
 * BUG 4 — `SED_PATTERN` é uma RegExp com flag /g definida no módulo-scope.
 *          Chamadas repetidas a `detectSedWorkaround` reutilizavam `lastIndex`
 *          residual e falhavam silenciosamente no segundo match em diante.
 *          Adicionado `SED_PATTERN.lastIndex = 0` antes de cada exec (já estava
 *          no baseline mas inconsistente). Corrigido com reset explícito.
 *
 * BUG 5 — `commandCache` usava `COMMAND_TIMEOUT_MS` (10 s) como TTL de cache,
 *          mas o propósito do cache é evitar reprocessamento em janelas longas.
 *          Corrigido para usar `CACHE_TTL_MS` (24 h), alinhado ao cache principal.
 *
 * BUG 6 — `readStdinSync` com loop `readSync` bloqueante: quando stdin não é TTY
 *          mas também não tem dados (pipe vazio), o loop rodava até o timeout
 *          completo (30 s por padrão), travando o hook.
 *          Adicionada detecção de EOF imediato (bytesRead === 0 na primeira leitura).
 *
 * MELHORIA 1 — Look-behind em `workaround`/`bypass`/`@ts-ignore`/`@ts-expect-error`
 *              para não bloquear contexto educativo ou negativo
 *              ("avoid workarounds", "never use @ts-ignore", etc.).
 *
 * MELHORIA 2 — `validateCodeBlocks` expandida para cobrir também blocos
 *              Python, Go, Rust e Java (já existia a infra, faltava o dispatch).
 *
 * MELHORIA 3 — Cache de respostas rejeitadas agora armazena os padrões que
 *              causaram a rejeição ({hash, patterns[], timestamp}), tornando
 *              a mensagem de erro do cache informativa em vez de genérica.
 *
 * Todas as features do doc3 mantidas integralmente:
 *   --check --staged, --json, --quiet, --no-cache, --response, --file,
 *   validateSedCommand, validateMultiCommand, AsyncLocalStorage,
 *   validateCommandContent exportada, runCheckCommitMsg,
 *   parseGitDiff, runCheck, getViolationStats, MAX_DIFF_BUFFER, etc.
 */

import { execSync }                              from "child_process";
import { createHash }                            from "crypto";
import {
  appendFileSync, existsSync, mkdirSync,
  readFileSync, readSync, realpathSync, writeFileSync,
} from "fs";
import { homedir }                               from "os";
import { join, resolve }                         from "path";
import { fileURLToPath }                         from "url";
import { AsyncLocalStorage }                     from "async_hooks";

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG_DIR =
  process.env["OPENCODE_CONFIG_DIR"] ?? join(homedir(), ".config", "opencode");
const VIOLATION_LOG_FILE  = join(CONFIG_DIR, ".security_violations.log");
const CACHE_FILE          = join(CONFIG_DIR, ".validation_cache.json");
const CONFIG_FILE         = join(CONFIG_DIR, "validation.config.json");

const CACHE_MAX_ENTRIES   = 1_000;
const CACHE_TTL_MS        = 24 * 60 * 60 * 1_000;   // 24 h
const DENSITY_THRESHOLD   = 0.3;
const VALIDATION_TIMEOUT_MS =
  parseInt(process.env["VALIDATION_TIMEOUT_MS"] ?? "30000", 10) || 30000;
const STDIN_TIMEOUT_MS =
  parseInt(process.env["STDIN_TIMEOUT_MS"] ?? "30000", 10) || 30000;
const MAX_DIFF_LINES =
  parseInt(process.env["MAX_DIFF_LINES"] ?? "10000", 10) || 10000;
const MAX_DIFF_BUFFER     = 100 * 1024 * 1024;       // 100 MB
const MAX_RECURSION_DEPTH = 10;

if (!existsSync(CONFIG_DIR)) {
  try { mkdirSync(CONFIG_DIR, { recursive: true }); } catch { /* sem permissão */ }
}

// ============================================================================
// TIPOS
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  response?: string;
  requiresHumanReview?: boolean;
}

interface ViolationEntry   { pattern: string; severity: "block" | "review"; }
interface CacheEntry       { hash: string; patterns: string[]; timestamp: string; }
interface CacheData        { entries: CacheEntry[]; lastUpdated: string; }
interface CodeBlock        { language: string; content: string; startLine: number; }
interface FileWriteDetection { command: string; targetFile: string; content: string; }
interface MockFactoryMatch { pattern: string; content: string; }
interface DangerousIntent  { name: string; keywords: string[]; }

interface ExternalConfig {
  forbiddenConstructors?: string[];
  forbiddenImports?:      string[];
  projectPatterns?:       string[];
}

interface DiffLine {
  lineNumber:         number;
  content:            string;
  type:               "added" | "removed" | "context";
  originalLineNumber: number;
}

interface ValidationIssue { line: number; error: string; severity: "block" | "review"; }

interface CheckResult {
  valid:          boolean;
  issues:         ValidationIssue[];
  requiresReview: boolean;
  stats:          { linesValidated: number; timeMs: number };
}

// ============================================================================
// ARQUIVOS PROTEGIDOS — validatePath
// ============================================================================

const PROTECTED_PATHS: RegExp[] = [
  /\/opencode\.json$/,
  /\/\.opencode\/validation\.json$/,
  /\/eslint\.config\.mjs$/,
  /\/tsconfig\.json$/,
  /\/AGENTS\.md$/,
  /\/\.opencode\/opencode-warden\.json$/,
  /\/\.opencode\/guard\//,
  /\/scripts\/enforce-quality\.ts$/,
  /\/scripts\/sync-hooks\.sh$/,
  /\/\.config\/validation_hook\.ts$/,
  /\/\.config\/opencode\/validation_hook\.ts$/,
  /\/\.config\/opencode\/plugin\//,
  /\/\.config\/opencode\/opencode\.jsonc$/,
];

// ============================================================================
// CONFIGURAÇÃO EXTERNA (validation.config.json)
// ============================================================================

function loadExternalConfig(): ExternalConfig {
  try {
    if (existsSync(CONFIG_FILE))
      return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as ExternalConfig;
  } catch { /* ausente ou malformado */ }
  return {};
}

const externalConfig = loadExternalConfig();

function buildProjectPatterns(): RegExp[] {
  const patterns: RegExp[] = [];
  for (const ctor of externalConfig.forbiddenConstructors ?? []) {
    const escaped = ctor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`new\\s+${escaped}\\s*\\(`, "i"));
  }
  for (const raw of externalConfig.projectPatterns ?? []) {
    try { patterns.push(new RegExp(raw, "i")); }
    catch { process.stderr.write(`[validation_hook] projectPattern inválido: ${raw}\n`); }
  }
  return patterns;
}

// ============================================================================
// CAMADA 1 — PADRÕES LÉXICOS DIRETOS
// ============================================================================

const FORBIDDEN_PATTERNS: RegExp[] = [

  // Desabilitação explícita de mecanismos de segurança / validação
  /disable\s+(?:the\s+)?(?:safety|security|check|validation|guard|test|assert|lint|type\s*check|static\s*analysis)\b/i,
  /turn\s+off\s+(?:the\s+)?(?:safety|security|check|validation|guard)\b/i,
  /deactivate\s+(?:the\s+)?(?:safety|security|check|validation)\b/i,
  /switch\s+off\s+(?:the\s+)?(?:safety|security|check)\b/i,
  /comment\s+out\s+(?:the\s+)?(?:test|assert|check|validation)\b/i,

  // Bypass / workaround — look-behind para negações ("avoid workarounds", "no workaround")
  // BUG FIX + MELHORIA 1: look-behind adicionado (doc3 já tinha, mantido)
  /(?<!(?:avoid|never use|no|without a|eliminate|remove|prevent).{0,40})\bworkaround\b/i,
  /(?<!(?:avoid|never|without).{0,30})\bbypass\b/i,
  /\bcircumvent\b/i,
  /\bevade\b/i,
  /\bkludge\b/i,
  /\bmonkey\s*patch\b/i,
  /overrides?\s+(?:safety|security|check)\b/i,

  // Supressão de erros / warnings / testes
  /suppress\s+(?:the\s+)?(?:warning|error|test|failure|exception|assertion)\b/i,
  /silence\s+(?:the\s+)?(?:warning|error)\b/i,
  /ignore\s+(?:the\s+)?(?:warning|error|test|failure|exception)\b/i,

  // Soluções temporárias / provisórias
  /temporarily\s+(?:disable|turn\s+off|deactivate|ignore|suppress)\b/i,
  /as\s+a\s+(?:quick|temp(?:orary)?)\s+(?:fix|solution|hack)\b/i,
  /temporary\s+(?:solution|fix|workaround|hack|bypass)\b/i,
  /\bstopgap\b/i,
  /quick\s+and\s+dirty\b/i,
  /\bhotfix\b/i,
  /\bquickfix\b/i,
  /band-?aid\s+(?:fix|solution)\b/i,

  // Promessas de correção futura
  /fix\s+(?:this|it)\s+later\b/i,
  /fix\s+next\s+(?:week|sprint|release)\b/i,
  /will\s+fix\s+(?:this|it)\s+later\b/i,
  /'ll\s+fix\s+(?:this|it)\s+later\b/i,
  /\brefactor\s+later\b/i,
  /\bclean\s+up\s+later\b/i,
  /come\s+back\s+to\s+this\b/i,
  /we'?ll\s+(?:address|tackle|handle|get\s+to)\s+(?:it|this|that)\s+(?:in|as\s+a|with\s+a)\s+(?:follow-?up|separate)/i,
  /we\s+can\s+(?:always|later)\s+(?:fix|improve|refactor|clean\s+up)\b/i,
  /we'?ll\s+get\s+to\s+(?:it|this|that)\s+later\b/i,

  // Autoengano / especulação
  /\btrust\s+me\b/i,
  /\bshould\s+be\s+fine\b/i,
  /\bprobably\s+fine\b/i,
  /\bprobably\s+works?\b/i,
  /\bworks\s+on\s+my\s+machine\b/i,
  /it\s+compiles?,?\s+(?:so|therefore|thus)\s+(?:it'?s|it\s+is)\s+fine\b/i,

  // TypeScript — supressores de tipo
  // MELHORIA 1: look-behind mantido do doc3
  /(?<!(?:avoid|never use|don't use|do not use|remove|delete).{0,40})@ts-ignore\b/i,
  /(?<!(?:avoid|never use|don't use|do not use|remove|delete).{0,40})@ts-expect-error\b/i,
  /@ts-nocheck\b/,

  // TypeScript — tipo any em declarações
  /\bconst\s+\w[\w$]*\s*:\s*any\b/,
  /\blet\s+\w[\w$]*\s*:\s*any\b/,
  /\bas\s+any\b/,

  // ESLint — supressores
  /\/\/\s*eslint-disable/,
  /\/\*\s*eslint-disable\s*\*\//,
  /eslint-disable-next-line/,

  // Jest / Testing — pular testes
  /(?:it|test|describe)\.(?:skip|todo)\s*\(/i,
  /\.only\s*\(/i,

  // tsconfig — desabilitação de checagens estritas
  // BUG FIX 3: movido da camada TS-code-only para camada 1 — agora detecta
  // em texto bruto, blocos JSON e blocos TS igualmente. Variante com/sem aspas.
  /(?:["']strict["']|\bstrict\b)\s*:\s*false/,
  /(?:["']noImplicitAny["']|\bnoImplicitAny\b)\s*:\s*false/,
  /(?:["']strictNullChecks["']|\bstrictNullChecks\b)\s*:\s*false/,
  /(?:["']strictFunctionTypes["']|\bstrictFunctionTypes\b)\s*:\s*false/,
  /(?:["']strictPropertyInitialization["']|\bstrictPropertyInitialization\b)\s*:\s*false/,
  /(?:["']noUncheckedIndexedAccess["']|\bnoUncheckedIndexedAccess\b)\s*:\s*false/,
  /(?:["']noImplicitReturns["']|\bnoImplicitReturns\b)\s*:\s*false/,
  /(?:["']noFallthroughCasesInSwitch["']|\bnoFallthroughCasesInSwitch\b)\s*:\s*false/,

  // Débito técnico / responsabilidade
  /\btech\s+debt\b/i,
  /it'?s\s+not\s+my\s+(?:job|responsibility|concern)\b/i,
  /that\s+should\s+be\s+(?:handled|fixed)\s+by\b/i,
  /speed\s+over\s+(?:quality|safety)\b/i,
  /follow-?up\s+(?:PR|ticket|issue)\b/i,

  // ── Português brasileiro ────────────────────────────────────────────────
  /desabilitar?\s+temporariamente\b/i,
  /desativar?\s+temporariamente\b/i,
  /desligar?\s+(?:a|o)\s+(?:seguranca|validacao|verificacao|segurança|validação|verificação)\b/i,
  /contornar?\s+(?:a\s+)?(?:validacao|verificacao|seguranca|validação|verificação|segurança)\b/i,
  /pular?\s+(?:[ao]s?\s+)?(?:validacao|verificacao|seguranca|validação|verificação|check|testes?|test)\b/i,
  /\bgambiarra\b/i,
  /\bjeitinho\b/i,
  /remendar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
  /corrigir?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
  /arrumar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
  /consertar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
  /nao\s+(?:e|eh)\s+meu\s+(?:trabalho|problema|job)\b/i,
  /vamos\s+(?:deixar|empurrar)\s+(?:assim|como\s+esta)\b/i,
  /depois\s+(?:a\s+)?gente\s+(?:arruma|corrige|resolve)\b/i,
  /(?:depois|futuramente)\s+(?:eu|nos)\s+(?:arrumo|corrigimos|resolvemos)\b/i,
  /(?:nao|não)\s+(?:precisa|precisamos)\s+(?:validar|verificar|checar)\b/i,
  /sem\s+(?:precisar|necessidade\s+de?)\s+(?:validar|verificar)\b/i,
  /fingir?\s+que\s+(?:nao|não)\s+(?:viu|existe|tem)\b/i,
  /deixar?\s+(?:assim|como\s+esta)\s+(?:por\s+enquanto|agora)\b/i,
  /resolver?\s+(?:depois|futuramente|mais\s+tarde|no\s+pr[oó]ximo\s+(?:sprint|release))\b/i,
];

// ============================================================================
// CAMADA 2 — BYPASS INDIRETO
// ============================================================================

const INDIRECT_BYPASS_PATTERNS: RegExp[] = [
  /don'?t\s+(?:check|validate|verify|test|assert)\b/i,
  /skip\s+(?:the\s+)?(?:check|validation|verification|test)\b/i,
  /avoid\s+(?:checking|validating)\b/i,
  /assume\s+(?:it'?s\s+)?(?:correct|valid|safe|works)\b/i,
  /trust\s+(?:the\s+)?(?:input|data|caller|user)\b/i,
  /no\s+need\s+to\s+(?:check|validate|verify)\b/i,
  /cast\s+(?:it\s+to|as)\s+(?:any|unknown)\b/i,
  /not\s+production\s+code\b/i,
  /only\s+runs?\s+in\s+(?:test|dev|development)\b/i,
  /pre-?existing\s+(?:behavior|code|issue)\b/i,
  /mock\s+out\s+the\s+(?:validation|check|safety)\b/i,
];

// ============================================================================
// CAMADA 3 — FRASES COMPOSTAS PERIGOSAS
// ============================================================================

const DANGEROUS_PHRASES: RegExp[] = [
  /we\s+can\s+(?:temporarily\s+)?disable\s+the\s+(?:test|check|validation)\s+for\s+now\b/i,
  /let'?s\s+(?:just\s+)?(?:ignore|skip|bypass)\s+the\s+(?:test|check|validation)\b/i,
  /to\s+get\s+this\s+to\s+work,\s*we\s+need\s+to\s+(?:disable|bypass)\b/i,
  /workaround\s+(?:for|to\s+fix)\s+(?:a|the)\s+bug\b/i,
  /\btemporary\s+measure\b/i,
  /let'?s\s+(?:just\s+)?ship\s+(?:it|this|that)/i,
  /(?:can|will)\s+(?:always|easily)\s+(?:fix|improve|refactor)\s+later\b/i,
  /just\s+(?:merge|push|commit)\s+(?:it|this|that).*(?:fix|improve|refactor)/i,
  /the\s+tests?\s+pass(?:es|ed)?,?\s+(?:so|therefore|thus)\s+(?:it'?s|it\s+is)\s+fine\b/i,
];

// ============================================================================
// CAMADA 4 — HEURÍSTICA DE INTENÇÃO (keyword proximity)
// ============================================================================

const DANGEROUS_INTENTS: DangerousIntent[] = [
  { name: "avoid_validation",    keywords: ["bypass", "circumvent", "evade", "sidestep"] },
  { name: "temporary_fix",       keywords: ["stopgap", "provisional", "temp fix"] },
  { name: "weaken_safety",       keywords: ["relax", "loosen", "weaken", "diminish"] },
  { name: "assume_safety",       keywords: ["assume it's valid", "presume safe"] },
  { name: "defer_responsibility", keywords: ["fix later", "address later", "handle later"] },
];

const NEGATION_WORDS = [
  "don't", "do not", "never", "shouldn't", "should not",
  "avoid", "prevent", "stop", "must not", "cannot",
];

function hasDangerousIntent(text: string): { found: boolean; message: string } {
  const lower = text.toLowerCase();
  for (const intent of DANGEROUS_INTENTS) {
    for (const keyword of intent.keywords) {
      const idx = lower.indexOf(keyword);
      if (idx === -1) continue;
      const ctx = lower.substring(
        Math.max(0, idx - 60),
        Math.min(lower.length, idx + keyword.length + 60),
      );
      if (!NEGATION_WORDS.some((n) => ctx.includes(n)))
        return { found: true, message: `intenção perigosa: ${intent.name} ("${keyword}")` };
    }
  }
  return { found: false, message: "" };
}

// ============================================================================
// CAMADA 5 — PADRÕES DE CÓDIGO TYPESCRIPT PERIGOSO
// Aplicados apenas em blocos de código extraídos (não texto bruto).
// BUG FIX 3: tsconfig patterns removidos daqui — movidos para camada 1.
// ============================================================================

const DANGEROUS_TS_CODE_PATTERNS: RegExp[] = [
  /:\s*any\s*[=;,[\]{}()\n]/,
  /\bas\s+any\s*[;,) \n]/,
  /<any>/,
  /const\s+\w+\s*:\s*any\s*=/,
  /let\s+\w+\s*:\s*any\s*=/,
  /as\s+unknown\s+as\s+\S+/,
  /Record\s*<\s*string\s*,\s*(?:any|unknown)\s*>/,
  /\/\/\s*@ts-ignore/,
  /\/\/\s*@ts-expect-error/,
  /\/\/\s*eslint-disable/,
  /eslint-disable-next-line/,
  /(?:it|test|describe)\.skip\s*\(/,
  /\.only\s*\(/,
  /catch\s*\(\s*_\s*\)\s*\{\s*\}/,
  /catch\s*\(\s*error\s*\)\s*\{\s*\/\/\s*ignore/i,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /__proto__/,
  /Object\.setPrototypeOf\s*\(/,
  /\bglobal\.\w+\s*=/,
];

// ============================================================================
// CAMADA 5b — PADRÕES ESPECÍFICOS POR LINGUAGEM (em blocos extraídos)
// MELHORIA 2: dispatch Python/Go/Rust/Java agora conectado ao validateCodeBlocks
// ============================================================================

function validatePythonBlock(code: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/#\s*type:\s*ignore/,               "type: ignore suppression"],
    [/#\s*noqa\b/,                        "noqa suppression"],
    [/except\s*:\s*pass/,                "bare except pass"],
    [/except\s+Exception\s*:\s*pass/,    "silent exception catch"],
    [/\beval\s*\(/,                       "eval() usage"],
    [/\bexec\s*\(/,                       "exec() usage"],
    [/__import__\s*\(/,                   "__import__() usage"],
    [/pickle\.loads?\s*\(/,              "unsafe pickle deserialization"],
    [/yaml\.load\s*\([^)]*\)(?!\s*,\s*Loader)/, "unsafe yaml.load without SafeLoader"],
  ];
  return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Python: ${msg}`);
}

function validateGoBlock(code: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/\bunsafe\./,        "unsafe package usage"],
    [/\/\/go:linkname/,   "linkname directive"],
    [/\/\/\s*nolint/,     "nolint suppression"],
  ];
  return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Go: ${msg}`);
}

function validateRustBlock(code: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/#\[allow\([^)]+\)\]/, "allow attribute (suppresses warnings)"],
    [/unsafe\s*\{/,          "unsafe block"],
    [/#!\[allow\(/,           "crate-level allow attribute"],
    [/\bunimplemented!\(/,    "unimplemented!() macro"],
    [/\bunreachable!\(/,      "unreachable!() macro"],
  ];
  return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Rust: ${msg}`);
}

function validateJavaBlock(code: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/@SuppressWarnings\s*\(/, "@SuppressWarnings annotation"],
    [/\/\/\s*NOLINT/,           "NOLINT comment"],
  ];
  return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Java: ${msg}`);
}

// ============================================================================
// CAMADA 6 — MOCK / FACTORY PATTERNS
// ============================================================================

const MOCK_FACTORY_PATTERNS: RegExp[] = [
  /jest\.doMock\s*\(/,
  /jest\.enableAutomock\s*\(/,
  /jest\.disableAutomock\s*\(/,
  /delete\s+require\s*\.\s*cache/,
];

function findMockFactoryViolations(content: string): MockFactoryMatch[] {
  return MOCK_FACTORY_PATTERNS
    .filter((p) => p.test(content))
    .map((p) => ({ pattern: p.source, content: content.substring(0, 200) }));
}

// ============================================================================
// CAMADA 7 — VIOLAÇÕES ARQUITETURAIS (externalizadas via config)
// ============================================================================

const ARCHITECTURAL_PATTERNS: RegExp[] = buildProjectPatterns();

// ============================================================================
// CAMADA 8 — DENSIDADE DE CÓDIGO PERIGOSO
// ============================================================================

const DENSITY_INDICATORS: RegExp[] = [
  /:\s*any\b/,
  /\bas\s+any\b/,
  /@ts-(?:ignore|expect-error)/,
  /eslint-disable/,
];

function hasDangerousCodeDensity(
  content: string,
): { found: boolean; score: number; details: string[] } {
  const lines = content.split("\n");
  let inBlockComment = false;
  const codeLines = lines.filter((l) => {
    const t = l.trim();
    if (inBlockComment) { if (t.includes("*/")) inBlockComment = false; return false; }
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlockComment = true; return false; }
    return t.length > 0 && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("#");
  });
  if (codeLines.length < 5) return { found: false, score: 0, details: [] };

  let count = 0;
  const details: string[] = [];
  for (const line of codeLines) {
    let flagged = false;
    for (const ind of DENSITY_INDICATORS) {
      if (ind.test(line)) {
        if (!flagged) { count++; flagged = true; }
        const ex = line.trim().substring(0, 80);
        if (!details.includes(ex)) details.push(ex);
      }
    }
  }
  const ratio = count / codeLines.length;
  return { found: ratio > DENSITY_THRESHOLD, score: Math.round(ratio * 100), details };
}

// ============================================================================
// EXTRAÇÃO DE BLOCOS DE CÓDIGO
// BUG FIX 2: adicionada heurística detectLanguage para blocos indentados.
// O bug original: currentLanguage era sempre "unknown", nunca atualizado,
// portanto Python/Go/Rust/Java nunca eram validados nesses blocos.
// ============================================================================

function detectLanguage(lines: string[]): string {
  const s = lines.join("\n");
  if (/^\s*(?:def |import \w+ from|print\s*\()/.test(s))   return "python";
  if (/^\s*(?:func \w+|:=\s|^package \w+)/.test(s))        return "go";
  if (/^\s*(?:fn \w+|let mut |use std::)/.test(s))         return "rust";
  if (/^\s*(?:@Override|public class|import java\.)/.test(s)) return "java";
  if (/^\s*(?:const |let |var |=>|require\s*\()/.test(s))  return "typescript";
  return "unknown";
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  // Fenced blocks (``` ou ~~~)
  const fenceRe = /^[ \t]*(```|~~~)(\w*)\r?\n([\s\S]*?)^\s*\1[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    const language = (match[2] ?? "").toLowerCase().trim() || "text";
    const content  = match[3] ?? "";
    const startLine = text.substring(0, match.index).split("\n").length;
    blocks.push({ language, content, startLine });
  }

  // Indented blocks (4 espaços ou tab)
  // BUG FIX 2: language agora determinada por heurística ao fechar o bloco
  const lines = text.split("\n");
  let cur: string[] = [];
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^(?:[ ]{4,}|\t)/.test(line)) {
      if (cur.length === 0) blockStart = i;
      cur.push(line.replace(/^(?:[ ]{4}|\t)/, ""));
    } else if (cur.length > 0) {
      blocks.push({ language: detectLanguage(cur), content: cur.join("\n"), startLine: blockStart });
      cur = [];
    }
  }
  if (cur.length > 0)
    blocks.push({ language: detectLanguage(cur), content: cur.join("\n"), startLine: lines.length - cur.length });

  return blocks;
}

// ============================================================================
// VALIDAÇÃO DE BLOCOS DE CÓDIGO
// MELHORIA 2: dispatch para Python/Go/Rust/Java agora ativo
// ============================================================================

function validateTsJsBlock(code: string): string[] {
  return DANGEROUS_TS_CODE_PATTERNS.filter((p) => p.test(code)).map((p) => p.source);
}

function validateCodeBlocks(response: string): string[] {
  const all: string[] = [];
  for (const block of extractCodeBlocks(response)) {
    const lang = block.language;
    if (["typescript", "javascript", "ts", "js", "tsx", "jsx"].includes(lang)) {
      all.push(...validateTsJsBlock(block.content).map((v) => `[${lang}] ${v}`));
    } else if (["bash", "sh", "shell", "zsh"].includes(lang)) {
      for (const w of detectFileWrites(block.content)) {
        if (!w.content) continue;
        all.push(...validateTsJsBlock(w.content).map((v) => `[bash→${w.targetFile}] ${v}`));
        all.push(...validatePythonBlock(w.content).map((v) => `[bash→${w.targetFile}] ${v}`));
      }
    } else if (lang === "python") { all.push(...validatePythonBlock(block.content)); }
      else if (lang === "go")     { all.push(...validateGoBlock(block.content)); }
      else if (lang === "rust")   { all.push(...validateRustBlock(block.content)); }
      else if (lang === "java")   { all.push(...validateJavaBlock(block.content)); }
  }
  return all;
}

// ============================================================================
// DETECÇÃO DE ESCRITA INDIRETA DE ARQUIVOS
// ============================================================================

function detectFileWrites(text: string): FileWriteDetection[] {
  const writes: FileWriteDetection[] = [];
  const patterns: Array<{ regex: RegExp; extractor: (m: RegExpExecArray) => FileWriteDetection }> = [
    { regex: /echo\s+"((?:[^"\\]|\\.)*)"\s*>\s*(\S+)/gi,   extractor: (m) => ({ command: m[0] ?? "", targetFile: m[2] ?? "", content: m[1] ?? "" }) },
    { regex: /echo\s+'((?:[^'\\]|\\.)*)'\s*>\s*(\S+)/gi,   extractor: (m) => ({ command: m[0] ?? "", targetFile: m[2] ?? "", content: m[1] ?? "" }) },
    { regex: /echo\s+`([^`]+)`\s*>\s*(\S+)/gi,             extractor: (m) => ({ command: m[0] ?? "", targetFile: m[2] ?? "", content: m[1] ?? "" }) },
    { regex: /printf\s+"((?:[^"\\]|\\.)*)"\s*>\s*(\S+)/gi, extractor: (m) => ({ command: m[0] ?? "", targetFile: m[2] ?? "", content: m[1] ?? "" }) },
    { regex: /printf\s+'((?:[^'\\]|\\.)*)'\s*>\s*(\S+)/gi, extractor: (m) => ({ command: m[0] ?? "", targetFile: m[2] ?? "", content: m[1] ?? "" }) },
    { regex: /printf\s+`([^`]+)`\s*>\s*(\S+)/gi,           extractor: (m) => ({ command: m[0] ?? "", targetFile: m[2] ?? "", content: m[1] ?? "" }) },
    { regex: /cat\s*>\s*(\S+)\s*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g,  extractor: (m) => ({ command: m[0] ?? "", targetFile: m[1] ?? "", content: m[3] ?? "" }) },
    { regex: /tee\s+(\S+)\s*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g,      extractor: (m) => ({ command: m[0] ?? "", targetFile: m[1] ?? "", content: m[3] ?? "" }) },
    { regex: /python3?\s+-c\s+['"`](?:open\(['"`])([^'"`]+)['"`](?:,\s*['"]w['"]\)\.write\(['"`])([^'"`]+)['"`]\)/gi, extractor: (m) => ({ command: m[0] ?? "", targetFile: m[1] ?? "", content: m[2] ?? "" }) },
    { regex: /node\s+-e\s+['"`]fs\.writeFileSync\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/gi, extractor: (m) => ({ command: m[0] ?? "", targetFile: m[1] ?? "", content: m[2] ?? "" }) },
  ];
  for (const { regex, extractor } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) writes.push(extractor(m));
  }
  return writes;
}

function validateIndirectFileWrites(response: string): string[] {
  return detectFileWrites(response).flatMap((w) =>
    w.content ? validateTsJsBlock(w.content).map((v) => `file write to ${w.targetFile}: ${v}`) : [],
  );
}

// ============================================================================
// WORKAROUNDS ARQUITETURAIS EXPLÍCITOS
// ============================================================================

const ARCHITECTURAL_WORKAROUND_PATTERNS: RegExp[] = [
  /add\s+a\s+(?:flag|setting|config|option)\s+to\s+(?:disable|bypass|toggle)\b/i,
  /mock\s+out\s+the\s+(?:validation|check|safety)\b/i,
];

function detectArchitecturalWorkarounds(response: string): string[] {
  return ARCHITECTURAL_WORKAROUND_PATTERNS
    .filter((p) => p.test(response))
    .map((p) => p.source);
}

// ============================================================================
// SED / MULTI-COMMAND PROTECTION
// BUG FIX 4: SED_PATTERN.lastIndex resetado antes de cada exec
// ============================================================================

const recursionDepthStorage = new AsyncLocalStorage<number>();

// Flag /gi — lastIndex deve ser resetado antes de cada uso
const SED_PATTERN =
  /sed\s+(?:-i|--in-place)\s*(?:(?:-e\s+)?)(['"`])?((?:[^\\]|\\.)+?)\1?\s+(\S+)/gi;
const MULTI_CMD_SEPARATORS = /\s*(?:&&|\|\||;)\s*/;

function detectSedWorkaround(
  command: string,
): { file: string; replacement: string } | null {
  SED_PATTERN.lastIndex = 0;   // BUG FIX 4
  const match = SED_PATTERN.exec(command);
  if (match) {
    const sedExpr   = match[2] ?? match[1] ?? "";
    const targetFile = match[3] ?? "";
    const replaceMatch = sedExpr.match(/s\/([^/]+)\/([^/]+)\//);
    if (replaceMatch) return { file: targetFile, replacement: replaceMatch[2] ?? "" };
  }
  return null;
}

function validateSedCommand(command: string): string[] {
  const violations: string[] = [];
  const sed = detectSedWorkaround(command);
  if (sed?.replacement) {
    try { validateResponse(sed.replacement); } catch (err) {
      violations.push(
        `sed replacement in ${sed.file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return violations;
}

// BUG FIX 5: commandCache usa CACHE_TTL_MS (24h) em vez de COMMAND_TIMEOUT_MS (10s)
const commandCache = new Map<string, { violations: string[]; timestamp: number }>();

export function validateCommandContent(command: string): string[] {
  const cacheKey = getResponseHash(command);
  const cached   = commandCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.violations;

  const violations: string[] = [];

  for (const write of detectFileWrites(command)) {
    if (write.content) {
      try { validateResponse(write.content); } catch (err) {
        violations.push(
          `File write to ${write.targetFile}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  violations.push(...validateSedCommand(command));

  if (MULTI_CMD_SEPARATORS.test(command)) {
    const depth = recursionDepthStorage.getStore() ?? 0;
    if (depth >= MAX_RECURSION_DEPTH) {
      violations.push(`Max recursion depth exceeded: ${command.substring(0, 100)}`);
    } else {
      const sub = recursionDepthStorage.run(depth + 1, () =>
        command.split(MULTI_CMD_SEPARATORS).flatMap((s) => {
          const t = s.trim();
          return t ? validateCommandContent(t) : [];
        }),
      );
      violations.push(...sub);
    }
  }

  commandCache.set(cacheKey, { violations, timestamp: Date.now() });
  return violations;
}

// ============================================================================
// CACHE DE RESPOSTAS REJEITADAS
// MELHORIA 3: armazena patterns[] junto com hash e timestamp
// ============================================================================

let rejectedCache: Record<string, { patterns: string[]; timestamp: string }> = {};

function loadRejectedCache(): void {
  try {
    if (!existsSync(CACHE_FILE)) return;
    const data: CacheData = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    const now = Date.now();
    rejectedCache = {};
    for (const entry of data.entries ?? []) {
      if (now - new Date(entry.timestamp).getTime() < CACHE_TTL_MS)
        rejectedCache[entry.hash] = { patterns: entry.patterns, timestamp: entry.timestamp };
    }
  } catch {
    rejectedCache = {};
    process.stderr.write("[validation_hook] aviso: cache corrompido — iniciando vazio\n");
  }
}

function saveRejectedHash(hash: string, patterns: string[]): void {
  try {
    const now = new Date().toISOString();
    rejectedCache[hash] = { patterns, timestamp: now };
    const entries = Object.entries(rejectedCache)
      .slice(-CACHE_MAX_ENTRIES)
      .map(([h, v]) => ({ hash: h, patterns: v.patterns, timestamp: v.timestamp }));
    writeFileSync(
      CACHE_FILE,
      JSON.stringify({ entries, lastUpdated: now } satisfies CacheData, null, 2),
      "utf-8",
    );
  } catch { /* sem permissão de escrita */ }
}

export function logViolation(response: string, pattern: string): void {
  try {
    appendFileSync(
      VIOLATION_LOG_FILE,
      JSON.stringify({
        timestamp:       new Date().toISOString(),
        pattern,
        responsePreview: response.substring(0, 500),
        responseLength:  response.length,
      }) + "\n",
      "utf-8",
    );
  } catch { /* sem permissão */ }
}

function getResponseHash(response: string): string {
  return createHash("sha256").update(response, "utf-8").digest("hex");
}

// ============================================================================
// VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
// ============================================================================

export function validateEnvVars(): string[] {
  const w: string[] = [];
  if (!process.env["OPENCODE_CONFIG_DIR"])
    w.push(`OPENCODE_CONFIG_DIR não definido — usando ${CONFIG_DIR}`);
  for (const key of ["VALIDATION_TIMEOUT_MS", "STDIN_TIMEOUT_MS", "MAX_DIFF_LINES", "COMMAND_TIMEOUT_MS"]) {
    const val = process.env[key];
    if (val !== undefined && isNaN(Number(val)))
      w.push(`${key} deve ser numérico, recebido: "${val}"`);
  }
  return w;
}

// ============================================================================
// FUNÇÃO PRINCIPAL DE VALIDAÇÃO
// ============================================================================

export function validateResponse(response: string): boolean {
  if (!response || typeof response !== "string")
    throw new Error("RESPOSTA REJEITADA: resposta vazia ou inválida");

  const hash   = getResponseHash(response);
  const cached = rejectedCache[hash];
  // MELHORIA 3: mensagem de cache agora inclui os padrões da rejeição original
  if (cached)
    throw new Error(`RESPOSTA REJEITADA (cache): ${cached.patterns.join("; ")}`);

  const violations: ViolationEntry[] = [];
  const add = (pattern: string, severity: ViolationEntry["severity"]) =>
    violations.push({ pattern, severity });

  for (const p of FORBIDDEN_PATTERNS)              if (p.test(response)) add(p.source, "block");
  for (const p of INDIRECT_BYPASS_PATTERNS)        if (p.test(response)) add(p.source, "block");
  for (const p of DANGEROUS_PHRASES)               if (p.test(response)) add(p.source, "block");
  const intent = hasDangerousIntent(response);
  if (intent.found) add(intent.message, "block");
  for (const v of findMockFactoryViolations(response)) add(`mock_factory: ${v.pattern}`, "review");
  for (const p of ARCHITECTURAL_PATTERNS)          if (p.test(response)) add(p.source, "block");
  const density = hasDangerousCodeDensity(response);
  if (density.found) add(`dangerous_code_density: ${density.score}%`, "block");
  for (const v of validateCodeBlocks(response))    add(v, "block");
  for (const v of validateIndirectFileWrites(response)) add(v, "block");
  for (const w of detectArchitecturalWorkarounds(response)) add(`architectural_workaround: ${w}`, "review");

  if (violations.length === 0) return true;

  const patterns = violations.map((v) => v.pattern);
  for (const p of patterns) logViolation(response, p);

  const hasBlock  = violations.some((v) => v.severity === "block");
  const hasReview = violations.some((v) => v.severity === "review");
  const summary   = patterns.join("; ");

  if (hasBlock) {
    saveRejectedHash(hash, patterns);
    throw new Error(`RESPOSTA REJEITADA: ${summary}`);
  }
  if (hasReview) throw new Error(`RESPOSTA REQUER REVISÃO HUMANA: ${summary}`);
  return true;
}

// ============================================================================
// API PÚBLICA
// ============================================================================

export function sanitizeAndReject(response: string): ValidationResult {
  try {
    validateResponse(response);
    return { valid: true, response };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: msg, response,
             requiresHumanReview: msg.includes("REQUER REVISÃO HUMANA") };
  }
}

export const validateWithReview = sanitizeAndReject;

export function validateCommand(command: string): void {
  const violations = validateCommandContent(command);
  if (violations.length > 0)
    throw new Error(`Comando bloqueado: ${violations.join("; ")}`);
}

export function validatePath(filePath: string): boolean {
    let resolved: string;
    try {
        resolved = realpathSync(filePath);
    } catch {
        resolved = resolve(filePath);
    }
    for (const pattern of PROTECTED_PATHS) {
        if (pattern.test(resolved)) {
            throw new Error(
                `Arquivo protegido: ${filePath}. Este arquivo não pode ser editado, removido ou substituído. ` +
                `Proteção de segurança ativa. Se precisar modificar, desative manualmente pelo usuário.`,
            );
        }
    }
    return true;
}

export function clearValidationCache(): void {
  rejectedCache = {};
  commandCache.clear();
  if (existsSync(CACHE_FILE))
    writeFileSync(
      CACHE_FILE,
      JSON.stringify({ entries: [], lastUpdated: new Date().toISOString() } satisfies CacheData, null, 2),
      "utf-8",
    );
}

export function getViolationStats(): {
  count: number;
  recentViolations: Array<{
    timestamp: string; pattern: string;
    responsePreview: string; responseLength: number;
  }>;
} {
  try {
    if (existsSync(VIOLATION_LOG_FILE)) {
      const lines = readFileSync(VIOLATION_LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
      return { count: lines.length, recentViolations: lines.slice(-10).map((l) => JSON.parse(l)) };
    }
  } catch { /* arquivo ausente */ }
  return { count: 0, recentViolations: [] };
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

for (const w of validateEnvVars())
  process.stderr.write(`[validation_hook] ${w}\n`);

loadRejectedCache();

// ============================================================================
// STDIN — leitura síncrona com detecção de EOF imediato
// BUG FIX 6: pipe vazio (sem dados, sem TTY) não trava mais até STDIN_TIMEOUT_MS.
// Quando bytesRead === 0 na primeira leitura, retorna imediatamente.
// ============================================================================

function readStdinSync(): string {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  const buf       = Buffer.alloc(65_536);
  const startTime = Date.now();
  let hasData     = false;

  while (true) {
    if (Date.now() - startTime > STDIN_TIMEOUT_MS) {
      if (!hasData) return "";
      break;
    }
    try {
      const bytesRead = readSync(0, buf, 0, buf.length, null);
      if (bytesRead <= 0) {
        // BUG FIX 6: EOF na primeira leitura → não há dados, retorna imediatamente
        if (!hasData) return "";
        break;
      }
      hasData = true;
      chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
    } catch { break; }
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ============================================================================
// PARSE DE DIFF GIT
// ============================================================================

function parseGitDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const rawLines = diff.split("\n");
  let currentOriginalLine = 0;
  let isInHunk = false;

  for (let lineNumber = 0; lineNumber < rawLines.length; lineNumber++) {
    const rawLine = rawLines[lineNumber];
    if (rawLine == null) continue;

    if (rawLine.startsWith("@@")) {
      isInHunk = true;
      const match = rawLine.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) currentOriginalLine = parseInt(match[1] as string, 10) - 1;
      lines.push({ lineNumber, content: rawLine, type: "context", originalLineNumber: 0 });
      continue;
    }
    if (!isInHunk) {
      if (rawLine.startsWith("+++") || rawLine.startsWith("---"))
        lines.push({ lineNumber, content: rawLine, type: "context", originalLineNumber: 0 });
      continue;
    }
    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      currentOriginalLine++;
      lines.push({ lineNumber, content: rawLine.substring(1), type: "added",   originalLineNumber: currentOriginalLine });
    } else if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      lines.push({ lineNumber, content: rawLine.substring(1), type: "removed", originalLineNumber: 0 });
    } else if (rawLine.startsWith(" ")) {
      currentOriginalLine++;
      lines.push({ lineNumber, content: rawLine.substring(1), type: "context", originalLineNumber: currentOriginalLine });
    }
  }
  return lines;
}

function buildOriginalLineIndex(lines: DiffLine[]): Map<number, number> {
  const index = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.originalLineNumber > 0) index.set(line.originalLineNumber, i);
  }
  return index;
}

function getContextWindow(
  lines: DiffLine[], lineIndex: number, windowSize = 3,
): string {
  return lines
    .slice(Math.max(0, lineIndex - windowSize), Math.min(lines.length, lineIndex + windowSize + 1))
    .map((l) => l.content)
    .join("\n");
}

function runCheck(diff: string, quiet = false): CheckResult {
  const startTime = Date.now();
  const issues: ValidationIssue[] = [];

  const globalResult = sanitizeAndReject(diff);
  if (!globalResult.valid)
    issues.push({
      line: 1,
      error: globalResult.error ?? "Erro estrutural no Diff",
      severity: globalResult.requiresHumanReview ? "review" : "block",
    });

  const parsedDiff  = parseGitDiff(diff);
  const addedLines  = parsedDiff.filter((l) => l.type === "added");
  const hasDiffContent = parsedDiff.some((l) => l.type === "added" || l.type === "removed");

  if (!hasDiffContent && issues.length === 0) {
    if (!quiet) console.log("Nenhuma alteração para validar.");
    return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: Date.now() - startTime } };
  }
  if (addedLines.length > MAX_DIFF_LINES) {
    if (!quiet) console.warn(`⚠️ Diff muito grande (${addedLines.length} linhas). Limitando a ${MAX_DIFF_LINES}.`);
    addedLines.length = MAX_DIFF_LINES;
  }

  const validatedHashes    = new Set<string>();
  const originalLineIndex  = buildOriginalLineIndex(parsedDiff);

  for (const line of addedLines) {
    const lineIndex = originalLineIndex.get(line.originalLineNumber);
    if (lineIndex === undefined) continue;
    const context = getContextWindow(parsedDiff, lineIndex, 3);
    const hash    = getResponseHash(context);
    if (validatedHashes.has(hash)) continue;
    validatedHashes.add(hash);
    const result = sanitizeAndReject(context);
    if (!result.valid)
      issues.push({
        line:     line.originalLineNumber,
        error:    result.error ?? "Unknown error",
        severity: result.requiresHumanReview ? "review" : "block",
      });
  }

  return {
    valid:          issues.length === 0,
    issues,
    requiresReview: issues.some((i) => i.severity === "review") && !issues.some((i) => i.severity === "block"),
    stats:          { linesValidated: validatedHashes.size, timeMs: Date.now() - startTime },
  };
}

async function runCheckCommitMsg(quiet = false): Promise<CheckResult> {
  const path = join(process.cwd(), ".git", "COMMIT_EDITMSG");
  if (!existsSync(path))
    return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
  try {
    const msg = readFileSync(path, "utf-8");
    if (!msg?.trim())
      return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
    const cleanMsg = msg.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    if (!cleanMsg.trim())
      return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };

    const result = await Promise.race([
      Promise.resolve(sanitizeAndReject(cleanMsg)),
      new Promise<ValidationResult>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), VALIDATION_TIMEOUT_MS),
      ),
    ]);
    if (!result.valid)
      return {
        valid: false,
        issues: [{ line: 0, error: result.error ?? "Unknown error", severity: result.requiresHumanReview ? "review" : "block" }],
        requiresReview: result.requiresHumanReview ?? false,
        stats: { linesValidated: 1, timeMs: 0 },
      };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Timeout")
      return { valid: false, issues: [{ line: 0, error: "Timeout validating commit message", severity: "block" }], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
    return { valid: false, issues: [{ line: 0, error: msg, severity: "block" }], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
  }
  return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
}

// ============================================================================
// ENTRY POINT — HOOK / WRAPPER / CI
// ============================================================================

async function runHook(): Promise<void> {
  const args       = process.argv.slice(2);
  const quiet      = args.includes("--quiet") || args.includes("-q");
  const outputJson = args.includes("--json");
  const noCache    = args.includes("--no-cache");
  if (noCache) clearValidationCache();

  // ── --check [--staged] ──────────────────────────────────────────────────
  if (args.includes("--check")) {
    let diff = "";
    const startTime = Date.now();

    if (args.includes("--staged")) {
      try {
        execSync("git rev-parse --git-dir", { stdio: "ignore" });
        diff = execSync("git diff --cached", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "ignore"],
          maxBuffer: MAX_DIFF_BUFFER,
        });
      } catch {
        if (!quiet && !outputJson) process.stderr.write("ERRO: não está em um repositório git\n");
        if (outputJson) console.log(JSON.stringify({ valid: false, error: "Not a git repository", stats: { timeMs: Date.now() - startTime } }));
        process.exit(1);
      }
    } else {
      diff = readStdinSync();
      if (!diff && !quiet && !outputJson) { process.stderr.write("ERRO: nenhum diff fornecido via stdin\n"); process.exit(1); }
    }

    const diffResult   = runCheck(diff, quiet);
    const commitResult = await runCheckCommitMsg(quiet);
    const allIssues    = [...diffResult.issues, ...commitResult.issues];
    const hasBlock     = allIssues.some((i) => i.severity === "block");
    const hasReview    = allIssues.some((i) => i.severity === "review");
    const stats        = {
      linesValidated: diffResult.stats.linesValidated + commitResult.stats.linesValidated,
      timeMs: Date.now() - startTime,
    };

    if (outputJson) {
      console.log(JSON.stringify({ valid: !hasBlock && !hasReview, issues: allIssues, requiresReview: hasReview && !hasBlock, stats, cacheEnabled: !noCache }));
    } else if (!quiet && allIssues.length > 0) {
      console.log("=== Violações encontradas ===");
      for (const issue of allIssues)
        console.log(`  ${issue.severity === "block" ? "❌" : "⚠️"} Linha ${issue.line}: ${issue.error}`);
      console.log(`\n📊 ${stats.linesValidated} linhas validadas em ${stats.timeMs}ms`);
    } else if (!quiet && allIssues.length === 0 && diff) {
      console.log(`✅ Nenhuma violação encontrada. (${stats.linesValidated} linhas em ${stats.timeMs}ms)`);
    }

    if (hasBlock)  process.exit(1);
    if (hasReview) process.exit(2);
    process.exit(0);
  }

  // ── --test ──────────────────────────────────────────────────────────────
  if (args.includes("--test")) {
    await runTests();
    return;
  }

  // ── Modo hook padrão ────────────────────────────────────────────────────
  let response = "";

  if (args.includes("--file")) {
    const idx = args.indexOf("--file") + 1;
    if (idx >= args.length) { if (!quiet && !outputJson) process.stderr.write("ERRO: --file requer um caminho\n"); process.exit(1); }
    try { response = readFileSync(args[idx]!, "utf-8"); }
    catch { if (!quiet && !outputJson) process.stderr.write(`ERRO: não foi possível ler: ${args[idx]}\n`); process.exit(1); }

  } else if (args.includes("--response")) {
    const idx = args.indexOf("--response") + 1;
    if (idx >= args.length) { if (!quiet && !outputJson) process.stderr.write("ERRO: --response requer uma string\n"); process.exit(1); }
    response = args[idx] ?? "";

  } else {
    response = readStdinSync();
  }

  if (!response?.trim()) {
    if (!quiet && !outputJson) process.stderr.write("ERRO: resposta vazia\n");
    if (outputJson) console.log(JSON.stringify({ valid: false, error: "Empty response" }));
    process.exit(1);
  }

  try {
    await Promise.race([
      Promise.resolve(validateResponse(response)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), VALIDATION_TIMEOUT_MS),
      ),
    ]);
    if (outputJson) console.log(JSON.stringify({ valid: true }));
    process.exit(0);
  } catch (err) {
    const msg           = err instanceof Error ? err.message : String(err);
    const requiresReview = msg.includes("REQUER REVISÃO HUMANA");
    if (outputJson) console.log(JSON.stringify({ valid: false, error: msg, requiresReview }));
    else if (!quiet) process.stderr.write(`${msg}\n`);
    process.exit(requiresReview ? 2 : 1);
  }
}

// ============================================================================
// SUITE DE TESTES
// ============================================================================

async function runTests(): Promise<void> {
  console.log("Executando testes de validação...\n");

  interface TC { response: string; shouldFail: boolean; desc: string; }

  const cases: TC[] = [
    // ── Devem ser bloqueados ────────────────────────────────────────────
    { response: "We can temporarily disable the test for now", shouldFail: true,  desc: "desabilitação temporária" },
    { response: "This is just a workaround for the bug",       shouldFail: true,  desc: "workaround" },
    { response: "const x: any = getData()",                    shouldFail: true,  desc: "tipo any" },
    { response: "Use @ts-ignore to bypass",                    shouldFail: true,  desc: "@ts-ignore" },
    { response: "// eslint-disable-next-line",                 shouldFail: true,  desc: "eslint-disable" },
    { response: "We'll fix this later",                        shouldFail: true,  desc: "fix later" },
    { response: "isso é uma gambiarra",                        shouldFail: true,  desc: "gambiarra (PT-BR)" },
    { response: "vamos dar um jeitinho",                       shouldFail: true,  desc: "jeitinho (PT-BR)" },
    { response: "corrigir depois quando tiver tempo",          shouldFail: true,  desc: "corrigir depois (PT-BR)" },
    { response: "deixar assim por enquanto",                   shouldFail: true,  desc: "deixar assim (PT-BR)" },
    { response: "não precisamos validar isso",                 shouldFail: true,  desc: "não precisa validar (PT-BR)" },
    { response: "pular o teste por enquanto",                  shouldFail: true,  desc: "pular o teste (PT-BR)" },
    { response: '"strict": false',                             shouldFail: true,  desc: "strict:false texto bruto" },
    { response: '```json\n{ "noImplicitAny": false }\n```',    shouldFail: true,  desc: "noImplicitAny em bloco JSON" },
    { response: '```typescript\neval("x")\n```',               shouldFail: true,  desc: "eval em bloco TS" },
    { response: '```typescript\nobj.__proto__ = null\n```',    shouldFail: true,  desc: "__proto__ em bloco TS" },
    { response: "this is tech debt, ship it",                  shouldFail: true,  desc: "tech debt" },
    { response: "the tests pass, so it is fine",               shouldFail: true,  desc: "tests pass so fine" },
    // ── Não devem ser bloqueados ────────────────────────────────────────
    { response: "The type error must be fixed at the root cause.", shouldFail: false, desc: "correção na origem" },
    { response: "All tests must pass before merging.",             shouldFail: false, desc: "testes obrigatórios" },
    { response: "Avoid @ts-ignore — fix the type properly.",       shouldFail: false, desc: "negação @ts-ignore" },
    { response: "No workaround needed — this is the correct fix.", shouldFail: false, desc: "negação workaround" },
    { response: "This requires significant effort to do correctly.", shouldFail: false, desc: "effort legítimo" },
    { response: "Handle edge cases in the parser before shipping.", shouldFail: false, desc: "edge case legítimo" },
  ];

  clearValidationCache();
  let passed = 0, failed = 0;

  for (const tc of cases) {
    let blocked = false;
    try { validateResponse(tc.response); } catch { blocked = true; }
    clearValidationCache();
    const ok = blocked === tc.shouldFail;
    if (ok) {
      console.log(`✅ PASS (${tc.shouldFail ? "bloqueado" : "permitido"}): ${tc.desc}`);
      passed++;
    } else {
      console.log(`❌ ${tc.shouldFail ? "FALHOU (deveria bloquear)" : "FALSO POSITIVO"}: ${tc.desc}`);
      failed++;
    }
  }

  console.log(`\n${"=".repeat(52)}`);
  console.log(`Resultado: ${passed}/${cases.length} passaram${failed > 0 ? `, ${failed} falharam` : " — 100%"}`);
  console.log(`${"=".repeat(52)}`);

  clearValidationCache();
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

try {
  const expected = realpathSync(fileURLToPath(import.meta.url));
  const actual   = realpathSync(process.argv[1] as string);
  if (expected === actual)
    runHook().catch((err) => { process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`); process.exit(1); });
} catch {
  if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
    runHook().catch((err) => { process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`); process.exit(1); });
}
