/**
 * validation_hook.ts — versão final
 *
 * Histórico de evolução:
 *   doc3  → baseline de produção
 *   v2    → correções de bugs (mkdirSync, detectLanguage parcial, tsconfig JSON,
 *           SED lastIndex, commandCache TTL, readStdin EOF)
 *   v3    → adição de LINT_SUPPRESSION e CI_BYPASS
 *   v4    → redesign: padrões de PROPOSIÇÃO em vez de palavras isoladas
 *   v5    → correções de bugs do v4 (isNegated substring, isInCorrectiveContext
 *           direcional, verbos propositivos expandidos)
 *   final → correções pós-auditoria do v5:
 *
 * CORREÇÕES DESTA VERSÃO:
 *
 * [A] SED_PATTERN não capturava expressões com espaços (ex: 's/x/as any/g').
 *     O lazy quantifier parava no primeiro espaço dentro das aspas.
 *     Corrigido: regex separado para conteúdo quoted vs unquoted.
 *
 * [B] "will be refactored" e formas futuras de verbos corretivos não estavam
 *     na lista de julgamentos negativos após a palavra perigosa.
 *     Adicionado: /\bwill\s+be\s+(?:refactored|removed|fixed|replaced)\b/
 *
 * [C] Testes de sed no suite usavam validateResponse em vez de
 *     validateCommandContent. Corrigido no suite de testes.
 *
 * [D] Padrão /\bworkaround\s*:\s*\S/i bloqueava "documented workaround: this
 *     was intentional and will be refactored" porque o verbo corretivo
 *     "refactored" estava na janela após mas não listado. Corrigido pelo [B].
 *
 * ARQUITETURA:
 *   Padrões de PROPOSIÇÃO: detectam o ato de propor comportamento proibido,
 *   não a mera menção da palavra. "use a workaround" → bloqueia.
 *   "remove the workaround" → passa. "this workaround is dangerous" → passa.
 *
 *   checkWithContext(): antes de bloquear, verifica:
 *     - isNegated(): negação com \b word-boundary (sem falsos positivos de substring)
 *     - isInCorrectiveContext(): verbo corretivo ANTES ou julgamento negativo APÓS
 *
 * ZERO REGRESSÃO: todas as features do doc3 presentes.
 *   --check --staged, --json, --quiet, --no-cache, --response, --file,
 *   validateSedCommand, validateMultiCommand, AsyncLocalStorage,
 *   validateCommandContent exportada, runCheckCommitMsg, parseGitDiff,
 *   runCheck, getViolationStats, MAX_DIFF_BUFFER.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readSync, realpathSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG_DIR = process.env['OPENCODE_CONFIG_DIR'] ?? join(homedir(), '.config', 'opencode');
const VIOLATION_LOG_FILE = join(CONFIG_DIR, '.security_violations.log');
const CACHE_FILE = join(CONFIG_DIR, '.validation_cache.json');
const CONFIG_FILE = join(CONFIG_DIR, 'validation.config.json');

const CACHE_MAX_ENTRIES = 1_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DENSITY_THRESHOLD = 0.4;
const VALIDATION_TIMEOUT_MS = parseInt(process.env['VALIDATION_TIMEOUT_MS'] ?? '30000', 10) || 30000;
const STDIN_TIMEOUT_MS = parseInt(process.env['STDIN_TIMEOUT_MS'] ?? '30000', 10) || 30000;
const MAX_DIFF_LINES = parseInt(process.env['MAX_DIFF_LINES'] ?? '10000', 10) || 10000;
const MAX_DIFF_BUFFER = 100 * 1024 * 1024;
const MAX_RECURSION_DEPTH = 10;

if (!existsSync(CONFIG_DIR)) {
    try {
        mkdirSync(CONFIG_DIR, { recursive: true });
    } catch {
        /* sem permissão */
    }
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
interface ViolationEntry {
    pattern: string;
    severity: 'block' | 'review';
}

export interface Warning {
    section: string;
    name: string;
    rulePreview: string;
    matchedText: string;
    snippet: string;
    charPos: number;
}
interface CacheEntry {
    hash: string;
    patterns: string[];
    timestamp: string;
}
interface CacheData {
    entries: CacheEntry[];
    lastUpdated: string;
}
interface CodeBlock {
    language: string;
    content: string;
    startLine: number;
}
interface FileWriteDetection {
    command: string;
    targetFile: string;
    content: string;
}
interface MockFactoryMatch {
    pattern: string;
    content: string;
}
interface ExternalConfig {
    forbiddenConstructors?: string[];
    forbiddenImports?: string[];
    projectPatterns?: string[];
}
interface DiffLine {
    lineNumber: number;
    content: string;
    type: 'added' | 'removed' | 'context';
    originalLineNumber: number;
}
interface ValidationIssue {
    line: number;
    error: string;
    severity: 'block' | 'review';
}
interface CheckResult {
    valid: boolean;
    issues: ValidationIssue[];
    requiresReview: boolean;
    stats: { linesValidated: number; timeMs: number };
}

// ============================================================================
// CONFIGURAÇÃO EXTERNA
// ============================================================================

function loadExternalConfig(): ExternalConfig {
    try {
        if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as ExternalConfig;
    } catch {
        /* ausente ou malformado */
    }
    return {};
}
const externalConfig = loadExternalConfig();

function buildProjectPatterns(): RegExp[] {
    const out: RegExp[] = [];
    for (const ctor of externalConfig.forbiddenConstructors ?? []) {
        const e = ctor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out.push(new RegExp(`new\\s+${e}\\s*\\(`, 'i'));
    }
    for (const raw of externalConfig.projectPatterns ?? []) {
        try {
            out.push(new RegExp(raw, 'i'));
        } catch {
            process.stderr.write(`[validation_hook] projectPattern inválido: ${raw}\n`);
        }
    }
    return out;
}

// ============================================================================
// VOCABULÁRIOS DE CONTEXTO
// ============================================================================

/**
 * Verbos corretivos com \b — usados para detectar contexto antes da palavra perigosa.
 * Compilados uma vez no startup para performance.
 */
const CORRECTIVE_BEFORE: RegExp[] = [
    /\bremov(?:e|es|ed|ing)\b/i,
    /\belimina(?:te|tes|ted|ting)\b/i,
    /\brefactor(?:s|ed|ing)?\b/i,
    /\breplace(?:s|d|ing)?\b/i,
    /\baddress(?:es|ed|ing)?\b/i,
    /\bresolv(?:e|es|ed|ing)\b/i,
    /\bdelet(?:e|es|ed|ing)\b/i,
    /\bclean\s+up\b/i,
    /\beradicate\b/i,
    /\bremediate\b/i,
    /\bget\s+rid\s+of\b/i,
    // PT-BR
    /\bremov(?:er|a|ido|endo)\b/i,
    /\belimina(?:r|do|ndo)\b/i,
    /\bcorrig(?:ir|ido|indo)\b/i,
    /\brefatora(?:r|do|ndo)?\b/i,
    /\bsubstitu(?:ir|ído|indo)\b/i,
];

/**
 * Julgamentos negativos SOBRE a palavra perigosa — usados na janela APÓS.
 * [B] corrigido: inclui formas futuras "will be refactored", etc.
 */
const NEGATIVE_JUDGMENTS_AFTER: RegExp[] = [
    /\bis\s+(?:dangerous|problematic|harmful|wrong|incorrect|unsafe|bad)\b/i,
    /\bcauses?\s+bugs?\b/i,
    /\bintroduces?\s+(?:bugs?|issues?|problems?)\b/i,
    /\bbreaks?\b/i,
    /\bviolates?\b/i,
    /\bdefeats?\b/i,
    /\bundermines?\b/i,
    /\bis\s+(?:a\s+)?(?:code\s+smell|anti-?pattern|vulnerability|technical\s+debt)\b/i,
    // Ações corretivas explícitas APÓS (futuro ou modal)
    /\b(?:must|should|needs?\s+to|will|has\s+to)\s+be\s+(?:removed|fixed|replaced|refactored|eliminated|deleted|addressed)\b/i,
    /\bneeds?\s+(?:to\s+be\s+)?(?:removed|fixed|replaced|refactored)\b/i,
    // PT-BR
    /\bé\s+(?:perigoso|problemático|incorreto|errado|prejudicial)\b/i,
    /\bcausa\s+bugs?\b/i,
    /\bprecisa\s+ser\s+(?:corrigido|removido|substituído|refatorado)\b/i,
    /\bserá\s+(?:corrigido|removido|substituído|refatorado)\b/i,
];

/**
 * Negações com \b word-boundary.
 * Evita substring FP: "nor" não encontrado em "ignore"; "no " não em "innovation".
 */
const NEGATION_PATTERNS: RegExp[] = [
    /\bdon'?t\b/i,
    /\bdo\s+not\b/i,
    /\bnever\b/i,
    /\bshouldn'?t\b/i,
    /\bshould\s+not\b/i,
    /\bmustn'?t\b/i,
    /\bmust\s+not\b/i,
    /\bcannot\b/i,
    /\bcan'?t\b/i,
    /\bwon'?t\b/i,
    /\bwill\s+not\b/i,
    /\bavoid\b/i,
    /\bprevent\b/i,
    /\bprohibit\b/i,
    /\bforbid\b/i,
    /\bban\b/i,
    /\bno\s+(?:need|reason|workaround|bypass|suppressor)\b/i,
    /\bneither\b/i,
    /\bnor\s+/i, // "nor " com espaço após — não encontra "nor" em "ignore"
    // PT-BR
    /\bnão\b/i,
    /\bnao\b/i,
    /\bnunca\b/i,
    /\bjamais\b/i,
    /\bevitar\b/i,
    /\bevite\b/i,
    /\bproibido\b/i,
    /\bimpedir\b/i,
    /\bsem\s+(?:precisar|necessidade)\b/i,
];

/**
 * Contexto corretivo ANTES da correspondência (janela de 80 chars).
 */
function isInCorrectiveBefore(text: string, matchIndex: number): boolean {
    const before = text.substring(Math.max(0, matchIndex - 80), matchIndex);
    return CORRECTIVE_BEFORE.some((p) => p.test(before));
}

/**
 * Julgamento negativo APÓS a correspondência (janela de 80 chars). [B]
 */
function hasNegativeJudgmentAfter(text: string, matchIndex: number): boolean {
    const after = text.substring(matchIndex, Math.min(text.length, matchIndex + 80));
    return NEGATIVE_JUDGMENTS_AFTER.some((p) => p.test(after));
}

/**
 * Contexto corretivo = verbo corretivo antes OU julgamento negativo após.
 */
function isInCorrectiveContext(text: string, matchIndex: number): boolean {
    return isInCorrectiveBefore(text, matchIndex) || hasNegativeJudgmentAfter(text, matchIndex);
}

/**
 * Negação na janela de 100 chars antes/durante. Com \b para evitar substrings.
 */
function isNegated(text: string, matchIndex: number): boolean {
    const window = text.substring(Math.max(0, matchIndex - 100), Math.min(text.length, matchIndex + 30));
    return NEGATION_PATTERNS.some((p) => p.test(window));
}

// ============================================================================
// VALIDAÇÃO COM CONTEXTO
// ============================================================================

function checkWithContext(text: string, patterns: RegExp[]): string[] {
    const violations: string[] = [];
    for (const pattern of patterns) {
        const re = new RegExp(pattern.source, 'i');
        const match = re.exec(text);
        if (!match) continue;
        const idx = match.index;
        if (isNegated(text, idx)) continue;
        if (isInCorrectiveContext(text, idx)) continue;
        violations.push(pattern.source);
    }
    return violations;
}

// ============================================================================
// CAMADA 1 — PADRÕES DE PROPOSIÇÃO
// ============================================================================

// ── Workaround ────────────────────────────────────────────────────────────────

const WORKAROUND_PATTERNS: RegExp[] = [
    /\b(?:use|using|apply|applying|try|trying|add|adding|implement|implementing|introduce|introducing|put|putting|consider|suggest(?:ing)?)\s+(?:a\s+|this\s+|the\s+|an?\s+)?workaround\b/i,
    /\b(?:we|you|i)\s+(?:can|could|should|might|will|would)\s+(?:use\s+)?(?:a\s+)?workaround\b/i,
    /\blet'?s\s+(?:use\s+)?(?:a\s+)?workaround\b/i,
    /\bas\s+a\s+workaround\b/i,
    /\b(?:quick|simple|easy|temp(?:orary)?|short-term)\s+workaround\b/i,
    /\bworkaround\s*:\s*(?!this\s+was|it\s+was|was\s+intentional|\s*$)/i, // exclui "workaround: this was intentional"
    /\bworkaround\s+(?:for|to\s+(?:fix|avoid|solve|address))\b/i,
    /\bworkaround\s+(?:would\s+be|is\s+to|here\s+is)\b/i,
    /\b(?:here|there)'?s?\s+(?:a\s+)?workaround\b/i,
    // PT-BR
    /\b(?:usar?|aplicar?|tentar?|adicionar?|fazer?|colocar?|criar?|introduzir?)\s+(?:uma?\s+)?gambiarra\b/i,
    /\b(?:dar?|dá)\s+um\s+jeitinho\b/i,
    /\bgambiarra\s*:\s*\S/i,
    /\bgambiarra\s+(?:para|pra|que|mas)\b/i,
    /\bjeitinho\s+(?:para|pra|de|aqui)\b/i,
    /\bcomo\s+(?:uma?\s+)?gambiarra\b/i,
];

// ── Bypass ────────────────────────────────────────────────────────────────────

const BYPASS_PATTERNS: RegExp[] = [
    /\b(?:just\s+)?bypass\s+(?:the\s+)?(?:check|validation|security|guard|type|lint|test)\b/i,
    /\b(?:we|you|i)\s+(?:can|could|should|will)\s+bypass\b/i,
    /\blet'?s\s+bypass\b/i,
    /\bbypass(?:ing)?\s+(?:this|the|it)\s+(?:check|validation|security|guard)\b/i,
    /\b(?:use|apply)\s+a\s+bypass\b/i,
    // PT-BR
    /\bcontornar?\s+(?:a\s+)?(?:validação|verificação|segurança|validacao|verificacao|seguranca)\b/i,
    /\bburlar?\s+(?:a\s+)?(?:validação|verificação|segurança)\b/i,
];

// ── Supressão / silenciamento ─────────────────────────────────────────────────

const SUPPRESSION_PATTERNS: RegExp[] = [
    /\b(?:just\s+)?suppress\s+(?:the\s+)?(?:warning|error|exception|failure|output)\b/i,
    /\b(?:we|you)\s+can\s+suppress\b/i,
    /\b(?:just\s+)?(?:silence|mute)\s+(?:the\s+)?(?:warning|error|output)\b/i,
    // ignore como imperativo / proposição
    /\bignore\s+(?:the\s+)?(?:error|warning|exception|failure)(?:\s+and\b|\s+here\b|\s+for\s+now\b)/im,
    /\bjust\s+ignore\s+(?:it|the|this)\b/i,
    /\bsimply\s+ignore\s+(?:it|the|this)\b/i,
    /\bignore\s+(?:it|errors?|warnings?)\s+(?:and\s+)?continue\b/i,
    // disable proposto
    /\b(?:just\s+)?disable\s+(?:the\s+)?(?:check|validation|lint|rule|test|guard|warning)\b/i,
    /\b(?:we|you)\s+can\s+disable\s+(?:the\s+)?\w+\s+(?:check|validation|rule)\b/i,
    // PT-BR
    /\b(?:desabilitar?|desativar?|silenciar?)\s+(?:a\s+)?(?:validação|verificação|regra|aviso|erro)\b/i,
    /\bpular?\s+(?:a\s+)?(?:validação|verificação|check|teste)\b/i,
    /\bignorar?\s+(?:o\s+)?(?:erro|aviso|warning)\b/i,
];

// ── TypeScript supressores em texto natural ───────────────────────────────────

const TS_SUPPRESSOR_PATTERNS: RegExp[] = [
    // Linhas literais de supressão
    /\/\/\s*@ts-ignore\b/,
    /\/\/\s*@ts-expect-error\b/,
    /\/\/\s*@ts-nocheck\b/,
    /@ts-nocheck\b/,
    // Propostas de adicionar supressor
    /\b(?:add|use|put|insert|apply|place)\s+(?:a\s+)?@ts-(?:ignore|expect-error|nocheck)\b/i,
    // Tipo any em declaração
    /\bconst\s+\w[\w$]*\s*:\s*any\b/,
    /\blet\s+\w[\w$]*\s*:\s*any\b/,
    /\bvar\s+\w[\w$]*\s*:\s*any\b/,
    // Cast para any proposto
    /\b(?:cast|typed?)\s+(?:it\s+)?as\s+any\b/i,
    /\b(?:add|use|apply)\s+(?:a\s+)?(?:type\s+)?any\b/i,
    // eslint-disable em texto / código
    /\/\/\s*eslint-disable(?:-next-line|-line)?/,
    /\/\*\s*eslint-disable\b/,
    /\b(?:add|use|put|insert|place)\s+(?:an?\s+)?eslint-disable\b/i,
    /\beslint-disable-next-line\b/,
    /\beslint-disable-line\b/,
];

// ── Alta especificidade — sem necessidade de contexto ─────────────────────────

const TEMPORARY_PATTERNS: RegExp[] = [
    /\btemporarily\s+(?:disable|turn\s+off|deactivate|ignore|suppress|remove|skip)\b/i,
    /\bas\s+a\s+(?:quick|temp(?:orary)?)\s+(?:fix|solution|hack|patch)\b/i,
    /\btemporary\s+(?:solution|fix|hack|patch|bypass|measure)\b/i,
    /\bstopgap\b/i,
    /\bquick\s+and\s+dirty\b/i,
    /\bhotfix\b/i,
    /\bquickfix\b/i,
    /\bband-?aid\s+(?:fix|solution|patch)\b/i,
    /\bdesabilitar?\s+temporariamente\b/i,
    /\bdesativar?\s+temporariamente\b/i,
    /\bdeixar?\s+(?:assim|como\s+(?:está|esta))\s+(?:por\s+enquanto|agora|de\s+momento)\b/i,
];

const DEFERRAL_PATTERNS: RegExp[] = [
    /\bfix\s+(?:this|it|that)\s+later\b/i,
    /\bfix\s+next\s+(?:week|sprint|release|version)\b/i,
    /\bwill\s+fix\s+(?:this|it|that)\s+later\b/i,
    /\b'll\s+fix\s+(?:this|it|that)\s+later\b/i,
    /\brefactor\s+later\b/i,
    /\bclean\s+up\s+later\b/i,
    /\bcome\s+back\s+to\s+this\b/i,
    /\bwe'?ll\s+(?:address|tackle|handle|get\s+to)\s+(?:it|this|that)\s+later\b/i,
    /\bwe\s+can\s+(?:always\s+)?(?:fix|improve|refactor|clean\s+up)\s+later\b/i,
    /\bwe'?ll\s+(?:fix|address|resolve)\s+(?:it|this|that)\s+in\s+a\s+(?:follow-?up|separate)\s+(?:PR|ticket|issue)\b/i,
    /\baddress\s+(?:it|this)\s+in\s+a\s+(?:follow-?up|separate)\s+(?:PR|ticket)\b/i,
    /\bcorrigir?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /\barrumar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /\bconsertar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /\bremendar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /\bresolver?\s+(?:depois|futuramente|mais\s+tarde|no\s+pr[oó]ximo\s+(?:sprint|release))\b/i,
    /\bdepois\s+(?:a\s+)?gente\s+(?:arruma|corrige|resolve|vê)\b/i,
    /\b(?:depois|futuramente)\s+(?:eu|nós|nos)\s+(?:arrumo|corrigimos|resolvemos|vemos)\b/i,
    /\bvamos\s+(?:deixar|empurrar)\s+(?:assim|como\s+(?:está|esta))\b/i,
];

const TECH_DEBT_ACCEPTANCE_PATTERNS: RegExp[] = [
    /\btech\s+debt\b.*\b(?:later|anyway|ship|ignore|accept|live\s+with|deal\s+with\s+later)\b/i,
    /\btechnical\s+debt\b.*\b(?:later|anyway|ship|ignore|accept)\b/i,
    /\bthis\s+is\s+(?:just\s+)?tech(?:nical)?\s+debt\b[,\s]/i,
    /\bit'?s\s+(?:just\s+)?tech(?:nical)?\s+debt\b[,\s]/i,
];

const SPECULATION_PATTERNS: RegExp[] = [
    /\btrust\s+me\b/i,
    /\bshould\s+be\s+fine\s*(?:[—-]\s*)?(?:to\s+)?(?:ship|merge|deploy|push|commit)\b/i,
    /\bshould\s+be\s+fine[,.]\s*(?:let'?s\s+)?(?:ship|merge|deploy)\b/i,
    /\bprobably\s+fine\b(?!\s+(?:once|after|when|if))/i,
    /\bprobably\s+works?\b(?!\s+(?:once|after|when|if))/i,
    /\bworks\s+on\s+my\s+machine\b/i,
    /\bit\s+compiles?,?\s+(?:so|therefore|thus)\s+(?:it'?s|it\s+is)\s+fine\b/i,
];

const SECURITY_DISABLE_PATTERNS: RegExp[] = [
    /\bdisable\s+(?:the\s+)?(?:safety|security|check|validation|guard|test|assert|lint|type\s*check|static\s*analysis)\b/i,
    /\bturn\s+off\s+(?:the\s+)?(?:safety|security|check|validation|guard)\b/i,
    /\bdeactivate\s+(?:the\s+)?(?:safety|security|check|validation)\b/i,
    /\bswitch\s+off\s+(?:the\s+)?(?:safety|security|check)\b/i,
    /\bcomment\s+out\s+(?:the\s+)?(?:test|assert|check|validation)\b/i,
    /\boverrides?\s+(?:safety|security|check)\b/i,
    /\bgit\s+(?:commit|push)[^|&;\n]*--no-verify\b/,
    /\bHUSKY\s*=\s*0\b/,
    /\bHUSKY_SKIP_HOOKS\s*=\s*1\b/,
    /\bgit\s+config\s+[^|&;\n]*core\.hooksPath\s+(?:\/dev\/null|\/tmp|\.|''|"")/,
    /\bnpm\s+config\s+set\s+ignore-scripts\s+true\b/,
    /\bprocess\.env\.CI\s*=\s*["']{0,1}(?:false|0|""|'')?\s*[;"']/,
    /\bdesligar?\s+(?:a|o)\s+(?:segurança|validação|verificação|seguranca|validacao|verificacao)\b/i,
    /\b(?:nao|não)\s+(?:precisa|precisamos)\s+(?:validar|verificar|checar)\b/i,
    /\bsem\s+(?:precisar|necessidade\s+de?)\s+(?:validar|verificar)\b/i,
    /\bfingir?\s+que\s+(?:nao|não)\s+(?:viu|existe|tem)\b/i,
    /\bnao\s+(?:e|eh)\s+meu\s+(?:trabalho|problema|job)\b/i,
];

const TSCONFIG_DISABLE_PATTERNS: RegExp[] = [
    /(?:["']strict["']|\bstrict\b)\s*:\s*false/,
    /(?:["']noImplicitAny["']|\bnoImplicitAny\b)\s*:\s*false/,
    /(?:["']strictNullChecks["']|\bstrictNullChecks\b)\s*:\s*false/,
    /(?:["']strictFunctionTypes["']|\bstrictFunctionTypes\b)\s*:\s*false/,
    /(?:["']strictPropertyInitialization["']|\bstrictPropertyInitialization\b)\s*:\s*false/,
    /(?:["']noUncheckedIndexedAccess["']|\bnoUncheckedIndexedAccess\b)\s*:\s*false/,
    /(?:["']noImplicitReturns["']|\bnoImplicitReturns\b)\s*:\s*false/,
    /(?:["']noFallthroughCasesInSwitch["']|\bnoFallthroughCasesInSwitch\b)\s*:\s*false/,
];

const TEST_SKIP_PATTERNS: RegExp[] = [/\b(?:it|test|describe)\.(?:skip|todo)\s*\(/i, /\.only\s*\(/i];

const DANGEROUS_PHRASES: RegExp[] = [
    /\bwe\s+can\s+(?:temporarily\s+)?disable\s+the\s+(?:test|check|validation)\s+for\s+now\b/i,
    /\blet'?s\s+(?:just\s+)?(?:ignore|skip|bypass)\s+the\s+(?:test|check|validation)\b/i,
    /\bto\s+get\s+this\s+to\s+work,\s*we\s+need\s+to\s+(?:disable|bypass)\b/i,
    /\b(?:can|will)\s+(?:always|easily)\s+(?:fix|improve|refactor)\s+later\b/i,
    /\bjust\s+(?:merge|push|commit)\s+(?:it|this|that)\b.*\b(?:fix|improve|refactor)\b/i,
    /\bthe\s+tests?\s+pass(?:es|ed)?,?\s+(?:so|therefore|thus)\s+(?:it'?s|it\s+is)\s+fine\b/i,
    /\blet'?s\s+(?:just\s+)?ship\s+(?:it|this|that)\s+(?:and|,)/i,
    /\bspeed\s+over\s+(?:quality|safety)\b/i,
    /\bvelocity\s+over\s+(?:quality|safety)\b/i,
];

const INDIRECT_BYPASS_PATTERNS: RegExp[] = [
    /\bskip\s+(?:the\s+)?(?:check|validation|verification|test)\b(?!\s+(?:because|since|as)\s+(?:it|they)\s+(?:already|are))/i,
    /\bavoid\s+(?:checking|validating)\b/i,
    /\bassume\s+(?:(?:it'?s|it\s+is)\s+)?(?:correct|valid|safe|works)\b/i,
    /\bcast\s+(?:it\s+to|as)\s+(?:any|unknown)\b/i,
    /\bnot\s+production\s+code\b/i,
    /\bmock\s+out\s+the\s+(?:validation|check|safety)\b/i,
    /\bpre-?existing\s+(?:behavior|code|issue)\b/i,
];

const RESPONSIBILITY_AVOIDANCE_PATTERNS: RegExp[] = [
    /\bit'?s\s+not\s+my\s+(?:job|responsibility|concern)\b/i,
    /\babove\s+my\s+pay\s+grade\b/i,
    /\bthat\s+should\s+be\s+(?:handled|fixed)\s+by\s+(?:someone\s+else|them|another)\b/i,
];

// ── SOP/D7 — Code quality & testing anti-patterns (warning only) ───────────

const SOP_PATTERNS: RegExp[] = [
    /(?:\/\/|#|\/\*|<!--)\s*TODO\b(?!\s*[:-]\s*(?:done|fixed|implemented|resolved))/i,
    /\bFIXME\b(?!\s*[:-]\s*(?:done|fixed|resolved))/i,
    /\bHACK\b/i,
    /catch\s*\{[^\w]*\}/,
    /console\s*\.\s*(?:log|warn|error)\s*\(/i,
    /\bvar\s+\w+\s*=/,
    /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    /for\s*\(\s*(?:const|let|var)\s+\w+\s+in\s+/,
    /new\s+Date\s*\(\s*["'`]/,
    /\|\|\s+0\b(?!\s*[\/\*])/,
    /\|\|\s+["'`]["'`]/,
    /\.reduce\s*\([^,)]*\)/,
    /typeof\s+\w+\s*===?\s*["'`]object["'`]/,
    /return\s+await\s+/,
    /\binstanceof\b/,
    /as\s+any\b(?!\s*[;,\) \n])/i,
    /as\s+unknown\s+as\b/i,
    /\/\/\s*(?:TODO|FIXME|HACK|XXX)\b.*$/m,
];

const TESTING_ANTI_PATTERNS: RegExp[] = [
    /\.(?:skip|only|todo)\s*\(\s*["'`]/i,
    /toThrow\s*\(\s*\)/,
    /expect\.assertions\s*\(\s*0\s*\)/,
    /\/\*\s*istanbul\s+ignore\s+(?:next|if|else|file)\s*\*\//i,
    /\/\/\s*istanbul\s+ignore\s+(?:next|if|else)\b/i,
    /\/\*\s*c8\s+ignore\s+(?:next|if|else|file|start|stop)\s*\*\//i,
    /\/\*\s*v8\s+ignore\s+(?:next|if|else|file|start|stop)\s*\*\//i,
    /\/\/\s*(?:c8|v8)\s+ignore\b/i,
    /\/\/\s*coverage-disable(?:-next-line|-line)?\b/i,
    /\/\/\s*nyc\s+(?:disable|ignore)\b/i,
    /\(\s*\)\s*=>\s*\{\s*\}/,
    /catch\s*\([^)]*\)\s*\{[^}]*\/\/\s*(?:ignore|skip|suppress|swallow|silence)/i,
    /jest\s+(?:--updateSnapshot|-u)/i,
];

// ============================================================================
// CAMADA 2 — HEURÍSTICA DE INTENÇÃO
// ============================================================================

interface DangerousIntent {
    name: string;
    keywords: string[];
}

const DANGEROUS_INTENTS: DangerousIntent[] = [
    { name: 'temporary_fix', keywords: ['stopgap', 'provisional', 'temp fix', 'quick hack'] },
    { name: 'weaken_safety', keywords: ['relax the check', 'loosen the validation', 'weaken the guard'] },
    { name: 'assume_safety', keywords: ["assume it's valid", "presume it's safe", 'trust the input blindly'] },
    {
        name: 'defer_responsibility',
        keywords: ['fix it later', 'address it later', 'handle it later', 'deal with it later'],
    },
];

function hasDangerousIntent(text: string): { found: boolean; message: string } {
    const lower = text.toLowerCase();
    for (const intent of DANGEROUS_INTENTS) {
        for (const keyword of intent.keywords) {
            const idx = lower.indexOf(keyword);
            if (idx === -1) continue;
            if (isNegated(text, idx)) continue;
            if (isInCorrectiveContext(text, idx)) continue;
            return { found: true, message: `intenção perigosa: ${intent.name} ("${keyword}")` };
        }
    }
    return { found: false, message: '' };
}

// ============================================================================
// CAMADA 3 — PADRÕES DE CÓDIGO TYPESCRIPT (em blocos extraídos)
// ============================================================================

const DANGEROUS_TS_CODE_PATTERNS: RegExp[] = [
    /:\s*any\s*[=;,[\]{}()\n]/,
    /\bas\s+any\s*[;,) \n]/,
    /<any>/,
    /\bconst\s+\w+\s*:\s*any\s*=/,
    /\blet\s+\w+\s*:\s*any\s*=/,
    /\bas\s+unknown\s+as\s+\S+/,
    /\bRecord\s*<\s*string\s*,\s*(?:any|unknown)\s*>/,
    /\/\/\s*@ts-ignore/,
    /\/\/\s*@ts-expect-error/,
    /\/\/\s*eslint-disable/,
    /\beslint-disable-next-line/,
    /\b(?:it|test|describe)\.skip\s*\(/,
    /\.only\s*\(/,
    /\bcatch\s*\(\s*_\s*\)\s*\{\s*\}/,
    /\bcatch\s*\(\s*error\s*\)\s*\{\s*\/\/\s*ignore/i,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /__proto__/,
    /\bObject\.setPrototypeOf\s*\(/,
    /\bglobal\.\w+\s*=/,
];

/** Tokens perigosos nus — para validar replacements de sed. [A corrigido] */
const BARE_SUPPRESSOR_TOKENS: RegExp[] = [
    /^@?ts-(?:ignore|expect-error|nocheck)$/i,
    /^eslint-disable/i,
    /^#\s*noqa/i,
    /^#\s*type:\s*ignore/i,
    /\bas\s+any\b/i,
    /:\s*any\s*[;,=\s]/,
    /\bworkaround\b/i,
    /\/\/\s*eslint-disable/,
    /\/\/\s*@ts-ignore/,
];

function containsBareSuppressor(token: string): boolean {
    return BARE_SUPPRESSOR_TOKENS.some((p) => p.test(token.trim()));
}

// ============================================================================
// DETECÇÃO DE LINGUAGEM
// ============================================================================

function detectLanguage(lines: string[]): string {
    const s = lines.join('\n');
    if (
        /^\s*def\s+\w+\s*\(/m.test(s) ||
        /^\s*from\s+\w[\w.]*\s+import\b/m.test(s) ||
        /^\s*import\s+\w[\w.,\s]*$/m.test(s) ||
        /^\s*class\s+\w+[:(]/m.test(s) ||
        /^\s*#\s*(?:type:|noqa|pylint|flake8|mypy)/m.test(s) ||
        /\b(?:pickle|yaml|subprocess|os\.system)\b/m.test(s)
    )
        return 'python';

    if (/^\s*func\s+\w+/m.test(s) || /^\s*package\s+\w+/m.test(s) || /\s*:=\s/.test(s) || /\/\/(?:go:|nolint)/.test(s))
        return 'go';

    if (
        /^\s*fn\s+\w+/m.test(s) ||
        /^\s*let\s+mut\s/m.test(s) ||
        /^\s*use\s+std::/m.test(s) ||
        /#\[(?:allow|derive|test)\(/.test(s)
    )
        return 'rust';

    if (
        /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:class|interface|enum)\b/m.test(s) ||
        /^\s*import\s+java\./m.test(s) ||
        /^\s*@Override\b/m.test(s) ||
        /^\s*fun\s+\w+\s*\(/m.test(s)
    )
        return 'java';

    if (/^\s*#include\s*[<"]/m.test(s) || /\bstd::\w+/m.test(s) || /^\s*namespace\s+\w+/m.test(s)) return 'cpp';

    if (
        /^\s*(?:const|let|var)\s+\w/m.test(s) ||
        /=>\s*[{(]/.test(s) ||
        /^\s*(?:export|import)\s+(?:\{|type|default|async)/m.test(s) ||
        /^\s*(?:class|interface|type|enum)\s+\w/m.test(s)
    )
        return 'typescript';

    return 'unknown';
}

// ============================================================================
// VALIDAÇÃO POR LINGUAGEM (em blocos extraídos)
// ============================================================================

function validateTsJsBlock(code: string): string[] {
    return DANGEROUS_TS_CODE_PATTERNS.filter((p) => p.test(code)).map((p) => p.source);
}

function validatePythonBlock(code: string): string[] {
    const rules: Array<[RegExp, string]> = [
        [/#\s*type:\s*ignore(?:\[|$|\s)/, 'type: ignore'],
        [/#\s*noqa(?:\s*:\s*\w+)?(?:\s|$)/, 'noqa'],
        [/#\s*flake8:\s*noqa\b/, 'flake8: noqa'],
        [/#\s*pylint:\s*disable/, 'pylint: disable'],
        [/#\s*mypy:\s*(?:ignore-errors|disable-error-code)/, 'mypy suppression'],
        [/#\s*ruff:\s*noqa\b/, 'ruff: noqa'],
        [/\bexcept\s*:\s*pass/, 'bare except pass'],
        [/\bexcept\s+Exception\s*:\s*pass/, 'silent exception catch'],
        [/\beval\s*\(/, 'eval()'],
        [/\bexec\s*\(/, 'exec()'],
        [/__import__\s*\(/, '__import__()'],
        [/\bpickle\.loads?\s*\(/, 'unsafe pickle.loads'],
        [/\byaml\.load\s*\([^)]*\)(?!\s*,\s*Loader)/, 'unsafe yaml.load'],
    ];
    return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Python: ${msg}`);
}

function validateGoBlock(code: string): string[] {
    const rules: Array<[RegExp, string]> = [
        [/\/\/\s*nolint(?::\w[\w,]*)?(?:\s|$)/, 'nolint'],
        [/\/\/go:linkname\b/, 'linkname directive'],
        [/\bunsafe\./, 'unsafe package'],
    ];
    return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Go: ${msg}`);
}

function validateRustBlock(code: string): string[] {
    const rules: Array<[RegExp, string]> = [
        [/#\[allow\s*\([^)]+\)\]/, 'allow attribute'],
        [/#!\[allow\s*\([^)]+\)\]/, 'crate-level allow'],
        [/\bunsafe\s*\{/, 'unsafe block'],
        [/\bunimplemented!\(/, 'unimplemented!()'],
        [/\bunreachable!\(/, 'unreachable!()'],
    ];
    return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Rust: ${msg}`);
}

function validateJavaBlock(code: string): string[] {
    const rules: Array<[RegExp, string]> = [
        [/@SuppressWarnings\s*\(/, '@SuppressWarnings'],
        [/\/\/\s*NOLINT(?:\([\w,\s]+\))?\b/, 'NOLINT'],
        [/@Suppress\s*\(\s*["'][^"']+["']/, '@Suppress (Kotlin)'],
    ];
    return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Java/Kotlin: ${msg}`);
}

function validateCppBlock(code: string): string[] {
    const rules: Array<[RegExp, string]> = [
        [/\/\/\s*NOLINTNEXTLINE(?:\s*\([^)]*\))?/, 'NOLINTNEXTLINE'],
        [/\/\/\s*NOLINTBEGIN(?:\s*\([^)]*\))?/, 'NOLINTBEGIN'],
        [/#pragma\s+warning\s*\(\s*disable\s*:/, '#pragma warning disable'],
        [/#pragma\s+(?:clang|GCC)\s+diagnostic\s+ignored/, '#pragma diagnostic ignored'],
    ];
    return rules.filter(([p]) => p.test(code)).map(([, msg]) => `C/C++: ${msg}`);
}

function validateShellBlock(code: string): string[] {
    const rules: Array<[RegExp, string]> = [
        [/#\s*shellcheck\s+disable\b/, 'shellcheck disable'],
        [/#\s*hadolint\s+ignore\b/, 'hadolint ignore'],
    ];
    return rules.filter(([p]) => p.test(code)).map(([, msg]) => `Shell: ${msg}`);
}

// ============================================================================
// EXTRAÇÃO DE BLOCOS DE CÓDIGO
// ============================================================================

function extractCodeBlocks(text: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const fenceRe = /^[ \t]*(```|~~~)(\w*)\r?\n([\s\S]*?)^\s*\1[ \t]*$/gm;
    let match: RegExpExecArray | null;
    while ((match = fenceRe.exec(text)) !== null) {
        const language = (match[2] ?? '').toLowerCase().trim() || 'text';
        const content = match[3] ?? '';
        const startLine = text.substring(0, match.index).split('\n').length;
        blocks.push({ language, content, startLine });
    }
    const lines = text.split('\n');
    let cur: string[] = [];
    let blockStart = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (/^(?:[ ]{4,}|\t)/.test(line)) {
            if (cur.length === 0) blockStart = i;
            cur.push(line.replace(/^(?:[ ]{4}|\t)/, ''));
        } else if (cur.length > 0) {
            blocks.push({ language: detectLanguage(cur), content: cur.join('\n'), startLine: blockStart });
            cur = [];
        }
    }
    if (cur.length > 0)
        blocks.push({ language: detectLanguage(cur), content: cur.join('\n'), startLine: lines.length - cur.length });
    return blocks;
}

function validateCodeBlocks(response: string): string[] {
    const all: string[] = [];
    for (const block of extractCodeBlocks(response)) {
        const lang = block.language;
        if (['typescript', 'javascript', 'ts', 'js', 'tsx', 'jsx'].includes(lang))
            all.push(...validateTsJsBlock(block.content).map((v) => `[${lang}] ${v}`));
        else if (['bash', 'sh', 'shell', 'zsh'].includes(lang)) {
            all.push(...validateShellBlock(block.content).map((v) => `[${lang}] ${v}`));
            for (const w of detectFileWrites(block.content)) {
                if (!w.content) continue;
                all.push(...validateTsJsBlock(w.content).map((v) => `[bash→${w.targetFile}] ${v}`));
                all.push(...validatePythonBlock(w.content).map((v) => `[bash→${w.targetFile}] ${v}`));
            }
        } else if (lang === 'python') all.push(...validatePythonBlock(block.content));
        else if (lang === 'go') all.push(...validateGoBlock(block.content));
        else if (lang === 'rust') all.push(...validateRustBlock(block.content));
        else if (['java', 'kotlin'].includes(lang)) all.push(...validateJavaBlock(block.content));
        else if (['c', 'cpp', 'c++', 'cc', 'cxx'].includes(lang)) all.push(...validateCppBlock(block.content));
        // Code-quality & testing anti-patterns (language-agnostic) — código apenas
        for (const p of SOP_PATTERNS) if (p.test(block.content)) all.push(`[${lang}] ${p.source}`);
        for (const p of TESTING_ANTI_PATTERNS) if (p.test(block.content)) all.push(`[${lang}] ${p.source}`);
    }
    return all;
}

// ============================================================================
// DENSIDADE (apenas em blocos de código)
// ============================================================================

const DENSITY_INDICATORS: RegExp[] = [/:\s*any\b/, /\bas\s+any\b/, /@ts-(?:ignore|expect-error)/, /eslint-disable/];

function hasDangerousCodeDensity(response: string): { found: boolean; score: number; details: string[] } {
    const blocks = extractCodeBlocks(response);
    const codeContent = blocks
        .filter((b) =>
            [
                'typescript',
                'javascript',
                'ts',
                'js',
                'tsx',
                'jsx',
                'python',
                'go',
                'rust',
                'java',
                'kotlin',
                'c',
                'cpp',
            ].includes(b.language),
        )
        .map((b) => b.content)
        .join('\n');

    if (!codeContent.trim()) return { found: false, score: 0, details: [] };

    let inBlock = false;
    const codeLines = codeContent.split('\n').filter((l) => {
        const t = l.trim();
        if (inBlock) {
            if (t.includes('*/')) inBlock = false;
            return false;
        }
        if (t.startsWith('/*')) {
            if (!t.includes('*/')) inBlock = true;
            return false;
        }
        return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#');
    });

    if (codeLines.length < 5) return { found: false, score: 0, details: [] };

    let count = 0;
    const details: string[] = [];
    for (const line of codeLines) {
        let flagged = false;
        for (const ind of DENSITY_INDICATORS) {
            if (ind.test(line)) {
                if (!flagged) {
                    count++;
                    flagged = true;
                }
                const ex = line.trim().substring(0, 80);
                if (!details.includes(ex)) details.push(ex);
            }
        }
    }
    const ratio = count / codeLines.length;
    return { found: ratio > DENSITY_THRESHOLD, score: Math.round(ratio * 100), details };
}

// ============================================================================
// MOCK / FACTORY PATTERNS
// ============================================================================

const MOCK_FACTORY_PATTERNS: RegExp[] = [
    /jest\.doMock\s*\(/,
    /jest\.enableAutomock\s*\(/,
    /jest\.disableAutomock\s*\(/,
    /delete\s+require\s*\.\s*cache/,
];

function findMockFactoryViolations(content: string): MockFactoryMatch[] {
    return MOCK_FACTORY_PATTERNS.filter((p) => p.test(content)).map((p) => ({
        pattern: p.source,
        content: content.substring(0, 200),
    }));
}

const ARCHITECTURAL_PATTERNS: RegExp[] = buildProjectPatterns();

// ============================================================================
// DETECÇÃO DE ESCRITA INDIRETA DE ARQUIVOS
// ============================================================================

function detectFileWrites(text: string): FileWriteDetection[] {
    const writes: FileWriteDetection[] = [];
    const patterns: Array<{ regex: RegExp; extractor: (m: RegExpExecArray) => FileWriteDetection }> = [
        {
            regex: /echo\s+"((?:[^"\\]|\\.)*)"\s*>\s*(\S+)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[2] ?? '', content: m[1] ?? '' }),
        },
        {
            regex: /echo\s+'((?:[^'\\]|\\.)*)'\s*>\s*(\S+)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[2] ?? '', content: m[1] ?? '' }),
        },
        {
            regex: /echo\s+`([^`]+)`\s*>\s*(\S+)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[2] ?? '', content: m[1] ?? '' }),
        },
        {
            regex: /printf\s+"((?:[^"\\]|\\.)*)"\s*>\s*(\S+)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[2] ?? '', content: m[1] ?? '' }),
        },
        {
            regex: /printf\s+'((?:[^'\\]|\\.)*)'\s*>\s*(\S+)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[2] ?? '', content: m[1] ?? '' }),
        },
        {
            regex: /cat\s*>\s*(\S+)\s*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[1] ?? '', content: m[3] ?? '' }),
        },
        {
            regex: /tee\s+(\S+)\s*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[1] ?? '', content: m[3] ?? '' }),
        },
        {
            regex: /python3?\s+-c\s+['"`](?:open\(['"`])([^'"`]+)['"`](?:,\s*['"]w['"]\)\.write\(['"`])([^'"`]+)['"`]\)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[1] ?? '', content: m[2] ?? '' }),
        },
        {
            regex: /node\s+-e\s+['"`]fs\.writeFileSync\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/gi,
            extractor: (m) => ({ command: m[0] ?? '', targetFile: m[1] ?? '', content: m[2] ?? '' }),
        },
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
// SED / MULTI-COMMAND PROTECTION  [A corrigido]
// ============================================================================

const recursionDepthStorage = new AsyncLocalStorage<number>();
const MULTI_CMD_SEPARATORS = /\s*(?:&&|\|\||;)\s*/;

/**
 * Extrai o replacement de um comando sed.
 * [A] Corrigido: usa regex com captura de conteúdo quoted (suporta espaços).
 */
function extractSedReplacement(command: string): { file: string; replacement: string } | null {
    // Tentativa 1: expressão entre aspas (suporta espaços no replacement)
    const quotedRe = /sed\s+(?:-i|--in-place)\s*(?:-e\s+)?(['"`])([\s\S]*?)\1\s+(\S+)/i;
    const quotedMatch = quotedRe.exec(command);
    if (quotedMatch) {
        const expr = quotedMatch[2] ?? '';
        const file = quotedMatch[3] ?? '';
        const rm = expr.match(/s([/|,!])([^/|,!]*)([/|,!])([^/|,!]*)([/|,!])/);
        if (rm) return { file, replacement: rm[4] ?? '' };
    }

    // Tentativa 2: expressão sem aspas (sem espaços)
    const unquotedRe = /sed\s+(?:-i|--in-place)\s*(?:-e\s+)?(\S+)\s+(\S+)/i;
    const unquotedMatch = unquotedRe.exec(command);
    if (unquotedMatch) {
        const expr = unquotedMatch[1] ?? '';
        const file = unquotedMatch[2] ?? '';
        const rm = expr.match(/s([/|,!])([^/|,!]*)([/|,!])([^/|,!]*)([/|,!])/);
        if (rm) return { file, replacement: rm[4] ?? '' };
    }

    return null;
}

function validateSedCommand(command: string): string[] {
    const violations: string[] = [];
    const sed = extractSedReplacement(command);
    if (!sed?.replacement) return violations;

    if (containsBareSuppressor(sed.replacement)) {
        violations.push(`sed injects dangerous token into ${sed.file}: "${sed.replacement}"`);
        return violations;
    }

    try {
        validateResponse(sed.replacement);
    } catch (err) {
        violations.push(`sed replacement in ${sed.file}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return violations;
}

const commandCache = new Map<string, { violations: string[]; timestamp: number }>();

export function validateCommandContent(command: string): string[] {
    const cacheKey = getResponseHash(command);
    const cached = commandCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.violations;

    const violations: string[] = [];
    for (const write of detectFileWrites(command)) {
        if (write.content) {
            try {
                validateResponse(write.content);
            } catch (err) {
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
            violations.push(
                ...recursionDepthStorage.run(depth + 1, () =>
                    command.split(MULTI_CMD_SEPARATORS).flatMap((s) => {
                        const t = s.trim();
                        return t ? validateCommandContent(t) : [];
                    }),
                ),
            );
        }
    }
    commandCache.set(cacheKey, { violations, timestamp: Date.now() });
    return violations;
}

// ============================================================================
// CACHE E LOGGING
// ============================================================================

let rejectedCache: Record<string, { patterns: string[]; timestamp: string }> = {};

export function loadRejectedCache(): void {
    try {
        if (!existsSync(CACHE_FILE)) return;
        const data: CacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
        const now = Date.now();
        rejectedCache = {};
        for (const entry of data.entries ?? []) {
            if (now - new Date(entry.timestamp).getTime() < CACHE_TTL_MS)
                rejectedCache[entry.hash] = { patterns: entry.patterns, timestamp: entry.timestamp };
        }
    } catch {
        rejectedCache = {};
        process.stderr.write('[validation_hook] aviso: cache corrompido — iniciando vazio\n');
    }
}

function saveRejectedHash(hash: string, patterns: string[]): void {
    try {
        const now = new Date().toISOString();
        rejectedCache[hash] = { patterns, timestamp: now };
        const entries = Object.entries(rejectedCache)
            .slice(-CACHE_MAX_ENTRIES)
            .map(([h, v]) => ({ hash: h, patterns: v.patterns, timestamp: v.timestamp }));
        writeFileSync(CACHE_FILE, JSON.stringify({ entries, lastUpdated: now } satisfies CacheData, null, 2), 'utf-8');
    } catch {
        /* sem permissão */
    }
}

export function logViolation(response: string, pattern: string): void {
    try {
        appendFileSync(
            VIOLATION_LOG_FILE,
            JSON.stringify({
                timestamp: new Date().toISOString(),
                pattern,
                responsePreview: response.substring(0, 500),
                responseLength: response.length,
            }) + '\n',
            'utf-8',
        );
    } catch {
        /* sem permissão */
    }
}

function getResponseHash(s: string): string {
    return createHash('sha256').update(s, 'utf-8').digest('hex');
}

export function validateEnvVars(): string[] {
    const w: string[] = [];
    if (!process.env['OPENCODE_CONFIG_DIR']) w.push(`OPENCODE_CONFIG_DIR não definido — usando ${CONFIG_DIR}`);
    for (const key of ['VALIDATION_TIMEOUT_MS', 'STDIN_TIMEOUT_MS', 'MAX_DIFF_LINES']) {
        const val = process.env[key];
        if (val !== undefined && isNaN(Number(val))) w.push(`${key} deve ser numérico, recebido: "${val}"`);
    }
    return w;
}

// ============================================================================
// ENGINE DE DETECÇÃO UNIFICADA
// ============================================================================

export interface DetectedViolation {
    category: string;
    pattern: string;
    matchedText: string;
    charPos: number;
}

export function detectViolations(text: string): DetectedViolation[] {
    if (!text || typeof text !== 'string') return [];
    const violations: DetectedViolation[] = [];
    const seen = new Set<string>();

    const add = (category: string, pattern: string, matchedText: string, charPos: number) => {
        const key = category + '|' + pattern + '|' + charPos;
        if (seen.has(key)) return;
        seen.add(key);
        violations.push({ category, pattern, matchedText, charPos });
    };

    const addFromContextCheck = (patterns: RegExp[], category: string) => {
        for (const p of patterns) {
            const re = new RegExp(p.source, 'gi');
            let m: RegExpExecArray | null;
            while ((m = re.exec(text)) !== null) {
                const idx = m.index;
                if (isNegated(text, idx)) continue;
                if (isInCorrectiveContext(text, idx)) continue;
                add(category, p.source, (m[0] ?? '').substring(0, 80), idx);
            }
        }
    };

    // Layer 1: Proposition patterns (context-aware)
    addFromContextCheck(WORKAROUND_PATTERNS, 'workaround');
    addFromContextCheck(BYPASS_PATTERNS, 'bypass');
    addFromContextCheck(SUPPRESSION_PATTERNS, 'suppression');
    addFromContextCheck(TS_SUPPRESSOR_PATTERNS, 'ts_suppressor');

    // High specificity patterns (context-aware in unified engine)
    addFromContextCheck(TEMPORARY_PATTERNS, 'temporary');
    addFromContextCheck(DEFERRAL_PATTERNS, 'deferral');
    addFromContextCheck(TECH_DEBT_ACCEPTANCE_PATTERNS, 'tech_debt');
    addFromContextCheck(SPECULATION_PATTERNS, 'speculation');
    addFromContextCheck(SECURITY_DISABLE_PATTERNS, 'security_disable');
    addFromContextCheck(TSCONFIG_DISABLE_PATTERNS, 'tsconfig_disable');
    addFromContextCheck(TEST_SKIP_PATTERNS, 'test_skip');
    addFromContextCheck(DANGEROUS_PHRASES, 'dangerous_phrase');
    addFromContextCheck(INDIRECT_BYPASS_PATTERNS, 'indirect_bypass');
    addFromContextCheck(RESPONSIBILITY_AVOIDANCE_PATTERNS, 'responsibility_avoidance');
    addFromContextCheck(SOP_PATTERNS, 'sop_code_quality');
    addFromContextCheck(TESTING_ANTI_PATTERNS, 'testing_anti_pattern');

    // Dangerous intent
    const intent = hasDangerousIntent(text);
    if (intent.found) {
        add('dangerous_intent', intent.message, intent.message.substring(0, 80), 0);
    }

    // Code blocks
    for (const v of validateCodeBlocks(text)) {
        add('code_block', v, v.substring(0, 80), 0);
    }

    // Density
    const density = hasDangerousCodeDensity(text);
    if (density.found) {
        add('code_density', 'dangerous_code_density: ' + density.score + '%', '', 0);
    }

    // Mock factories
    for (const v of findMockFactoryViolations(text)) {
        add('mock_factory', 'mock_factory: ' + v.pattern, v.content.substring(0, 80), 0);
    }

    // Custom patterns
    for (const p of ARCHITECTURAL_PATTERNS) {
        const re = new RegExp(p.source, 'i');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            add('custom_pattern', p.source, (m[0] ?? '').substring(0, 80), m.index);
        }
    }

    // Indirect file writes
    for (const v of validateIndirectFileWrites(text)) {
        add('indirect_file_write', v, v.substring(0, 80), 0);
    }

    return violations;
}

// ============================================================================
// WARNING ENGINE
// ============================================================================
// WARNING ENGINE — severidade 1 (engenharia social)
// ============================================================================

const WARNING_LOG_FILE = join(CONFIG_DIR, 'audit', 'vigilant-warnings.log');

function extractSnippet(text: string, pos: number, window = 60): string {
    const start = Math.max(0, pos - window);
    const end = Math.min(text.length, pos + window);
    let s = text.substring(start, end);
    if (start > 0) s = '...' + s;
    if (end < text.length) s = s + '...';
    return s.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function formatWarning(w: Warning): string {
    const width = 72;
    const top = '\u250c' + '\u2500'.repeat(width - 2) + '\u2510';
    const bot = '\u2514' + '\u2500'.repeat(width - 2) + '\u2518';
    const sep = '\u2502' + '\u2500'.repeat(width - 2) + '\u2502';

    const wrap = (label: string, val: string): string[] => {
        const max = width - 6;
        const lines: string[] = [];
        let cur = label;
        let remaining = val;
        while (remaining.length > 0) {
            if (cur.length + remaining.length <= max) {
                lines.push(
                    '\u2502  ' +
                        cur +
                        remaining +
                        ' '.repeat(Math.max(0, width - 4 - cur.length - remaining.length)) +
                        '\u2502',
                );
                break;
            }
            const take = max - cur.length;
            lines.push(
                '\u2502  ' +
                    cur +
                    remaining.substring(0, take) +
                    ' '.repeat(Math.max(0, width - 4 - cur.length - take)) +
                    '\u2502',
            );
            remaining = remaining.substring(take);
            cur = '';
        }
        return lines;
    };

    const lines: string[] = [top];
    lines.push(
        '\u2502  \u26a0  WARNING \u2014 ' +
            w.section +
            ' '.repeat(Math.max(0, width - 16 - w.section.length)) +
            '\u2502',
    );
    lines.push(sep);
    lines.push(...wrap('', w.name));
    lines.push(sep);
    lines.push(...wrap('\U0001f4cb ', w.rulePreview));
    lines.push(sep);
    lines.push(...wrap('\U0001f50d ', w.matchedText));
    lines.push(sep);
    lines.push(...wrap('\U0001f4c4 ', w.snippet));
    lines.push(bot);

    return lines.join('\n');
}

const CATEGORY_WARNING_MAP: Record<string, { section: string; name: string; rulePreview: string }> = {
    workaround: { section: '\u00a73', name: 'Forbidden Transformations', rulePreview: 'Workaround patterns detected' },
    bypass: { section: '\u00a73', name: 'Forbidden Transformations', rulePreview: 'Bypass patterns detected' },
    suppression: {
        section: '\u00a74',
        name: 'Safety Mechanism Immutability',
        rulePreview: 'Suppression patterns detected',
    },
    ts_suppressor: {
        section: '\u00a74',
        name: 'Safety Mechanism Immutability',
        rulePreview: 'TS/ESLint suppressor patterns detected',
    },
    temporary: {
        section: '\u00a714',
        name: 'Temporary Bypass / Deferral',
        rulePreview: 'Temporary fix patterns detected',
    },
    deferral: { section: '\u00a714', name: 'Temporary Bypass / Deferral', rulePreview: 'Deferral patterns detected' },
    tech_debt: {
        section: '\u00a714',
        name: 'Temporary Bypass / Deferral',
        rulePreview: 'Tech debt acceptance patterns detected',
    },
    speculation: {
        section: '\u00a721',
        name: 'Speed Over Safety',
        rulePreview: 'Speculation/safety shortcuts detected',
    },
    security_disable: {
        section: '\u00a73',
        name: 'Forbidden Transformations',
        rulePreview: 'Security disabling patterns detected',
    },
    tsconfig_disable: {
        section: '\u00a75',
        name: 'Safety Mechanism Immutability',
        rulePreview: 'tsconfig weakening patterns detected',
    },
    test_skip: { section: '\u00a719', name: 'Testing Discipline', rulePreview: 'Test skipping patterns detected' },
    dangerous_phrase: {
        section: '\u00a73',
        name: 'Forbidden Transformations',
        rulePreview: 'Dangerous phrases detected',
    },
    indirect_bypass: {
        section: '\u00a73',
        name: 'Forbidden Transformations',
        rulePreview: 'Indirect bypass patterns detected',
    },
    responsibility_avoidance: {
        section: '\u00a73',
        name: 'Forbidden Transformations',
        rulePreview: 'Responsibility avoidance detected',
    },
    dangerous_intent: { section: '\u00a711', name: 'Dangerous Intent', rulePreview: 'Heuristic intent detection' },
    sop_code_quality: {
        section: '\u00a70.1',
        name: 'SOP Code Quality',
        rulePreview: 'Code quality anti-patterns detected',
    },
    testing_anti_pattern: {
        section: '\u00a7D7',
        name: 'Bad Testing Practices',
        rulePreview: 'Testing anti-patterns detected',
    },
    code_block: {
        section: '\u00a74',
        name: 'Safety Mechanism Immutability',
        rulePreview: 'Code block suppressor detected',
    },
    code_density: {
        section: '\u00a74',
        name: 'Safety Mechanism Immutability',
        rulePreview: 'Code density anti-pattern',
    },
    mock_factory: {
        section: '\u00a711',
        name: 'Mock Factory Violation',
        rulePreview: 'Mock factory patterns detected',
    },
    custom_pattern: { section: '\u00a73', name: 'Custom Patterns', rulePreview: 'Custom project pattern detected' },
    indirect_file_write: {
        section: '\u00a74',
        name: 'Indirect File Write',
        rulePreview: 'Dangerous file write detected',
    },
};
export function scanForWarnings(text: string): Warning[] {
    if (!text || typeof text !== 'string') return [];
    const violations = detectViolations(text);
    return violations.map((v) => {
        const meta = CATEGORY_WARNING_MAP[v.category] ?? {
            section: 'unknown',
            name: v.category,
            rulePreview: v.pattern,
        };
        return {
            section: meta.section,
            name: meta.name,
            rulePreview: meta.rulePreview,
            matchedText: v.matchedText,
            snippet: extractSnippet(text, v.charPos),
            charPos: v.charPos,
        };
    });
}

function logWarnings(text: string): void {
    const warnings = scanForWarnings(text);
    if (warnings.length === 0) return;
    for (const w of warnings) {
        process.stderr.write(formatWarning(w) + '\n');
    }
    try {
        const dir = join(CONFIG_DIR, 'audit');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(
            WARNING_LOG_FILE,
            warnings.map((w) => JSON.stringify({ timestamp: new Date().toISOString(), ...w })).join('\n') + '\n',
            'utf-8',
        );
    } catch {
        /* sem permissao para log */
    }
}

export function validateSoft(text: string): void {
    logWarnings(text);
}

export function validateHard(text: string): void {
    logWarnings(text);
    validateResponse(text);
}

export function validatePath(path: string): void {
    logWarnings(path);
    if (!path || typeof path !== 'string') throw new Error('PATH REJEITADO: caminho vazio ou invalido');
    const dangerousPathPatterns: RegExp[] = [
        /\.\.\//,
        /~(?:\/|$)/,
        /\/etc\/(?:passwd|shadow|sudoers)/,
        /\/dev\/(?:null|zero|random|urandom)/,
        /\$\{?\w+\}?/,
        /[|;&\`]/,
    ];
    for (const p of dangerousPathPatterns) {
        if (p.test(path)) throw new Error('PATH REJEITADO: padrao perigoso detectado em "' + path + '"');
    }
}

// ============================================================================
// PLUGIN DEFAULT EXPORT — integracao com opencode
// ============================================================================

export default async () => ({
    'chat.message': async (
        _i: { sessionID: string; agent?: string },
        output: { message: unknown; parts: Array<{ type?: string; text?: string }> },
    ) => {
        try {
            const parts = output?.parts || [];
            for (const part of parts) {
                if (part?.type === 'text' && typeof part?.text === 'string') {
                    // Apenas código: ignora prosa/chat, valida blocos de código
                    const codeIssues = validateCodeBlocks(part.text);
                    if (codeIssues.length > 0) {
                        part.text +=
                            '\n\n' +
                            codeIssues.map((v) => `⚠  CODE WARNING — ${v}\n     Ação: corrija na origem.`).join('\n\n');
                    }
                }
            }
        } catch {
            // soft — nunca propaga erro
        }
    },
    'tool.execute.before': async (
        input: { tool: string; sessionID: string; callID: string },
        output: { args?: { [key: string]: unknown } },
    ) => {
        if (input.tool === 'bash') {
            const command = output?.args?.command;
            if (typeof command === 'string' && command.length > 0) {
                validateHard(command);
            }
        }
        if (input.tool === 'write' || input.tool === 'edit') {
            const content = input.tool === 'write' ? output?.args?.content : output?.args?.newString;
            if (typeof content === 'string' && content.length > 0) {
                validateHard(content);
            }
        }
        if (input.tool === 'read' || input.tool === 'glob' || input.tool === 'grep') {
            const p = output?.args?.filePath ?? output?.args?.path ?? output?.args?.pattern;
            if (typeof p === 'string' && p.length > 0) {
                validatePath(p);
            }
        }
    },
});

export function validateResponse(response: string): boolean {
    if (!response || typeof response !== 'string') throw new Error('RESPOSTA REJEITADA: resposta vazia ou inválida');
    const hash = getResponseHash(response);
    const cached = rejectedCache[hash];
    if (cached) throw new Error('RESPOSTA REJEITADA (cache): ' + cached.patterns.join('; '));
    const violations = detectViolations(response);
    if (violations.length === 0) return true;
    const patterns = violations.map((v) => v.pattern);
    for (const p of patterns) logViolation(response, p);
    saveRejectedHash(hash, patterns);
    throw new Error('RESPOSTA REJEITADA: ' + patterns.join('; '));
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
        return { valid: false, error: msg, response, requiresHumanReview: msg.includes('REQUER REVISÃO HUMANA') };
    }
}

export const validateWithReview = sanitizeAndReject;

export function validateCommand(command: string): void {
    const v = validateCommandContent(command);
    if (v.length > 0) throw new Error(`Comando bloqueado: ${v.join('; ')}`);
}

export function clearValidationCache(): void {
    rejectedCache = {};
    commandCache.clear();
    if (existsSync(CACHE_FILE))
        try {
            writeFileSync(
                CACHE_FILE,
                JSON.stringify({ entries: [], lastUpdated: new Date().toISOString() } satisfies CacheData, null, 2),
                'utf-8',
            );
        } catch {
            /* sem permissão */
        }
}

export function getViolationStats(): {
    count: number;
    recentViolations: Array<{ timestamp: string; pattern: string; responsePreview: string; responseLength: number }>;
} {
    try {
        if (existsSync(VIOLATION_LOG_FILE)) {
            const lines = readFileSync(VIOLATION_LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean);
            return { count: lines.length, recentViolations: lines.slice(-10).map((l) => JSON.parse(l)) };
        }
    } catch {
        /* ausente */
    }
    return { count: 0, recentViolations: [] };
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

for (const w of validateEnvVars()) process.stderr.write(`[validation_hook] ${w}\n`);
loadRejectedCache();

// ============================================================================
// STDIN
// ============================================================================

function readStdinSync(): string {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    const buf = Buffer.alloc(65_536);
    const startTime = Date.now();
    let hasData = false;
    while (true) {
        if (Date.now() - startTime > STDIN_TIMEOUT_MS) {
            if (!hasData) return '';
            break;
        }
        try {
            const n = readSync(0, buf, 0, buf.length, null);
            if (n <= 0) {
                if (!hasData) return '';
                break;
            }
            hasData = true;
            chunks.push(Buffer.from(buf.subarray(0, n)));
        } catch {
            break;
        }
    }
    return Buffer.concat(chunks).toString('utf-8');
}

// ============================================================================
// PARSE DE DIFF GIT
// ============================================================================

function parseGitDiff(diff: string): DiffLine[] {
    const lines: DiffLine[] = [];
    const rawLines = diff.split('\n');
    let cur = 0;
    let inHunk = false;
    for (let n = 0; n < rawLines.length; n++) {
        const raw = rawLines[n];
        if (raw == null) continue;
        if (raw.startsWith('@@')) {
            inHunk = true;
            const m = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (m) cur = parseInt(m[1] as string, 10) - 1;
            lines.push({ lineNumber: n, content: raw, type: 'context', originalLineNumber: 0 });
            continue;
        }
        if (!inHunk) {
            if (raw.startsWith('+++') || raw.startsWith('---'))
                lines.push({ lineNumber: n, content: raw, type: 'context', originalLineNumber: 0 });
            continue;
        }
        if (raw.startsWith('+') && !raw.startsWith('+++'))
            lines.push({ lineNumber: n, content: raw.substring(1), type: 'added', originalLineNumber: ++cur });
        else if (raw.startsWith('-') && !raw.startsWith('---'))
            lines.push({ lineNumber: n, content: raw.substring(1), type: 'removed', originalLineNumber: 0 });
        else if (raw.startsWith(' '))
            lines.push({ lineNumber: n, content: raw.substring(1), type: 'context', originalLineNumber: ++cur });
    }
    return lines;
}

function buildOriginalLineIndex(lines: DiffLine[]): Map<number, number> {
    const idx = new Map<number, number>();
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l && l.originalLineNumber > 0) idx.set(l.originalLineNumber, i);
    }
    return idx;
}

function getContextWindow(lines: DiffLine[], i: number, w = 3): string {
    return lines
        .slice(Math.max(0, i - w), Math.min(lines.length, i + w + 1))
        .map((l) => l.content)
        .join('\n');
}

/**
 * Mapeia extensão de arquivo → validador de linha de código.
 * Retorna null para docs/prosa (.md, .txt, .json docs, .yaml, etc.) — esses
 * NÃO são varridos (elimina falso positivo em documentação, ex.: `as unknown as`).
 */
function isCodeValidator(path: string): ((line: string) => string[]) | null {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
        case 'ts':
        case 'tsx':
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'cjs':
            return (line: string) => {
                const issues = validateTsJsBlock(line);
                for (const p of SOP_PATTERNS) if (p.test(line)) issues.push(p.source);
                for (const p of TESTING_ANTI_PATTERNS) if (p.test(line)) issues.push(p.source);
                return issues;
            };
        case 'py':
            return (line: string) => validatePythonBlock(line);
        case 'go':
            return (line: string) => validateGoBlock(line);
        case 'rs':
            return (line: string) => validateRustBlock(line);
        case 'java':
        case 'kt':
            return (line: string) => validateJavaBlock(line);
        case 'c':
        case 'cpp':
        case 'cc':
        case 'cxx':
        case 'h':
        case 'hpp':
            return (line: string) => validateCppBlock(line);
        case 'sh':
        case 'bash':
            return (line: string) => validateShellBlock(line);
        default:
            return null;
    }
}

/**
 * Validação de código (não prosa/chat). Varre apenas linhas adicionadas de
 * arquivos de código; documentação (.md etc.) é ignorada. Foco em bypass/supressão
 * reais no código, não em texto.
 */
function runCheck(diff: string, quiet = false): CheckResult {
    const t0 = Date.now();
    const issues: ValidationIssue[] = [];
    let currentFile = '';
    let cur = 0;
    let validated = 0;
    for (const raw of diff.split('\n')) {
        if (raw.startsWith('+++ b/')) {
            currentFile = raw.substring(6).trim();
            continue;
        }
        if (raw.startsWith('@@')) {
            const m = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (m) cur = parseInt(m[1] as string, 10) - 1;
            continue;
        }
        if (raw.startsWith('+') && !raw.startsWith('+++')) {
            cur++;
            const line = raw.substring(1);
            const validator = isCodeValidator(currentFile);
            if (!validator) continue; // pula docs/prosa
            if (validated < MAX_DIFF_LINES) {
                validated++;
                const found = validator(line);
                if (found.length > 0) {
                    issues.push({ line: cur, error: `[${currentFile}] ${found.join('; ')}`, severity: 'block' });
                }
            }
        } else if (raw.startsWith(' ')) {
            cur++;
        }
    }
    return {
        valid: !issues.length,
        issues,
        requiresReview: false,
        stats: { linesValidated: validated, timeMs: Date.now() - t0 },
    };
}

async function runCheckCommitMsg(quiet = false): Promise<CheckResult> {
    const p = join(process.cwd(), '.git', 'COMMIT_EDITMSG');
    if (!existsSync(p))
        return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
    try {
        const msg = readFileSync(p, 'utf-8');
        if (!msg?.trim())
            return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
        const clean = msg
            .split('\n')
            .filter((l) => !l.trim().startsWith('#'))
            .join('\n');
        if (!clean.trim())
            return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
        // Apenas código: valida blocos de código da mensagem (não prosa/chat)
        const codeIssues = validateCodeBlocks(clean);
        if (codeIssues.length > 0) {
            return {
                valid: false,
                issues: [{ line: 0, error: codeIssues.join('; '), severity: 'block' }],
                requiresReview: false,
                stats: { linesValidated: 1, timeMs: 0 },
            };
        }
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
            `[validation_hook] runCheckCommitMsg falhou: ${errMsg} — falha de validação NÃO silenciada (fail-closed)\n`,
        );
        return {
            valid: false,
            issues: [{ line: 0, error: `erro interno de validação: ${errMsg}`, severity: 'block' }],
            requiresReview: false,
            stats: { linesValidated: 0, timeMs: 0 },
        };
    }
    return { valid: true, issues: [], requiresReview: false, stats: { linesValidated: 0, timeMs: 0 } };
}

// ============================================================================
// ENTRY POINT
// ============================================================================

async function runHook(): Promise<void> {
    const args = process.argv.slice(2);
    const quiet = args.includes('--quiet') || args.includes('-q');
    const json = args.includes('--json');
    const noCache = args.includes('--no-cache');
    if (noCache) clearValidationCache();

    if (args.includes('--check')) {
        let diff = '';
        const t0 = Date.now();
        if (args.includes('--staged')) {
            try {
                execSync('git rev-parse --git-dir', { stdio: 'ignore' });
                diff = execSync('git diff --cached', {
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    maxBuffer: MAX_DIFF_BUFFER,
                });
            } catch {
                if (!quiet && !json) process.stderr.write('ERRO: não está em um repositório git\n');
                if (json) console.log(JSON.stringify({ valid: false, error: 'Not a git repository' }));
                process.exit(1);
            }
        } else {
            diff = readStdinSync();
            if (!diff && !quiet && !json) {
                process.stderr.write('ERRO: nenhum diff fornecido via stdin\n');
                process.exit(1);
            }
        }
        const dr = runCheck(diff, quiet);
        const cr = await runCheckCommitMsg(quiet);
        const all = [...dr.issues, ...cr.issues];
        const hasBlock = all.some((i) => i.severity === 'block');
        const hasReview = all.some((i) => i.severity === 'review');
        const stats = { linesValidated: dr.stats.linesValidated + cr.stats.linesValidated, timeMs: Date.now() - t0 };
        if (json) {
            console.log(
                JSON.stringify({
                    valid: !hasBlock && !hasReview,
                    issues: all,
                    requiresReview: hasReview && !hasBlock,
                    stats,
                    cacheEnabled: !noCache,
                }),
            );
        } else if (!quiet && all.length > 0) {
            console.log('=== Violações encontradas ===');
            for (const i of all) console.log(`  ${i.severity === 'block' ? '❌' : '⚠️'} Linha ${i.line}: ${i.error}`);
            console.log(`\n📊 ${stats.linesValidated} linhas validadas em ${stats.timeMs}ms`);
        } else if (!quiet && !all.length && diff) {
            console.log(`✅ Nenhuma violação. (${stats.linesValidated} linhas em ${stats.timeMs}ms)`);
        }
        if (hasBlock) process.exit(1);
        if (hasReview) process.exit(2);
        process.exit(0);
    }

    if (args.includes('--test')) {
        await runTests();
        return;
    }

    let response = '';
    if (args.includes('--file')) {
        const idx = args.indexOf('--file') + 1;
        if (idx >= args.length) {
            if (!quiet && !json) process.stderr.write('ERRO: --file requer caminho\n');
            process.exit(1);
        }
        try {
            response = readFileSync(args[idx]!, 'utf-8');
        } catch {
            if (!quiet && !json) process.stderr.write(`ERRO: não leu: ${args[idx]}\n`);
            process.exit(1);
        }
    } else if (args.includes('--response')) {
        const idx = args.indexOf('--response') + 1;
        if (idx >= args.length) {
            if (!quiet && !json) process.stderr.write('ERRO: --response requer string\n');
            process.exit(1);
        }
        response = args[idx] ?? '';
    } else {
        response = readStdinSync();
    }

    if (!response?.trim()) {
        if (!quiet && !json) process.stderr.write('ERRO: resposta vazia\n');
        if (json) console.log(JSON.stringify({ valid: false, error: 'Empty response' }));
        process.exit(1);
    }

    try {
        await Promise.race([
            Promise.resolve(validateResponse(response)),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timeout')), VALIDATION_TIMEOUT_MS)),
        ]);
        if (json) console.log(JSON.stringify({ valid: true }));
        process.exit(0);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const rev = msg.includes('REQUER REVISÃO HUMANA');
        if (json) console.log(JSON.stringify({ valid: false, error: msg, requiresReview: rev }));
        else if (!quiet) process.stderr.write(`${msg}\n`);
        process.exit(rev ? 2 : 1);
    }
}

// ============================================================================
// SUITE DE TESTES
// [C] Corrigido: testes de sed usam validateCommandContent
// ============================================================================

async function runTests(): Promise<void> {
    console.log('Executando testes de validação...\n');
    interface TC {
        r: string;
        fail: boolean;
        desc: string;
        cmd?: boolean;
    }
    const cases: TC[] = [
        // ── DEVEM BLOQUEAR ──────────────────────────────────────────────────────
        { r: 'use a workaround to fix this', fail: true, desc: 'workaround: proposição direta' },
        { r: 'as a workaround, disable the validation', fail: true, desc: 'workaround: como solução' },
        { r: 'workaround to fix the bug', fail: true, desc: 'workaround: substantivo proposto' },
        { r: 'just bypass the check for now', fail: true, desc: 'bypass: proposto' },
        { r: 'add @ts-ignore to silence the error', fail: true, desc: '@ts-ignore: proposto' },
        { r: '// @ts-ignore', fail: true, desc: '@ts-ignore: linha literal' },
        { r: '// eslint-disable-next-line no-explicit-any', fail: true, desc: 'eslint-disable: inline' },
        { r: 'ignore the error and continue', fail: true, desc: 'ignore: imperativo' },
        { r: 'just ignore it', fail: true, desc: 'ignore: just ignore' },
        { r: 'suppress the warning for now', fail: true, desc: 'suppress: proposto' },
        { r: 'disable the lint rule to make it pass', fail: true, desc: 'disable: proposto' },
        { r: 'we can temporarily disable the check', fail: true, desc: 'disable: temporário' },
        { r: "We'll fix this later", fail: true, desc: 'fix later' },
        { r: 'this is tech debt, ship it anyway', fail: true, desc: 'tech debt: aceitação' },
        { r: 'const x: any = getData()', fail: true, desc: 'tipo any: declaração' },
        { r: 'trust me, this is safe', fail: true, desc: 'trust me' },
        { r: 'isso é uma gambiarra mas funciona', fail: true, desc: 'gambiarra: endossada' },
        { r: 'deixar assim por enquanto', fail: true, desc: 'deixar assim: PT-BR' },
        { r: '"strict": false', fail: true, desc: 'strict:false' },
        { r: '```json\n{ "noImplicitAny": false }\n```', fail: true, desc: 'noImplicitAny: JSON' },
        { r: '```typescript\neval("x")\n```', fail: true, desc: 'eval: bloco TS' },
        { r: 'the tests pass, so it is fine', fail: true, desc: 'tests pass so fine' },
        { r: "we'll fix it in a follow-up PR", fail: true, desc: 'follow-up PR: diferimento' },
        { r: 'using a workaround here', fail: true, desc: "workaround: 'using'" },
        { r: 'put @ts-ignore above the error line', fail: true, desc: "@ts-ignore: 'put'" },
        // [C] sed: usam validateCommandContent (flag cmd:true)
        { r: "sed -i 's/valid/eslint-disable/g' src/app.ts", fail: true, desc: 'sed injeta eslint-disable', cmd: true },
        { r: "sed -i 's/typed/as any/g' src/types.ts", fail: true, desc: 'sed injeta as any', cmd: true },
        // ── NÃO DEVEM BLOQUEAR ──────────────────────────────────────────────────
        { r: 'identify and remove existing workarounds', fail: false, desc: 'workaround: busca corretiva' },
        { r: 'this workaround is dangerous and must be fixed', fail: false, desc: 'workaround: julgamento negativo' },
        { r: 'do not introduce workarounds', fail: false, desc: 'workaround: instrução negativa' },
        { r: 'refactor away the workaround in auth.ts', fail: false, desc: 'workaround: ação corretiva' },
        { r: 'workarounds create technical debt — avoid them', fail: false, desc: 'workaround: metadiscurso' },
        { r: 'this PR removes the workaround from commit abc', fail: false, desc: 'workaround: remoção histórica' },
        {
            r: 'documented workaround: this was intentional and will be refactored',
            fail: false,
            desc: 'workaround: documentação com ação futura',
        },
        { r: 'do not bypass the validation layer', fail: false, desc: 'bypass: instrução negativa' },
        { r: 'this code bypasses security — refactor it', fail: false, desc: 'bypass: diagnóstico + ação' },
        { r: 'bypassing validation is a security vulnerability', fail: false, desc: 'bypass: metadiscurso' },
        { r: 'replace @ts-ignore with proper type annotations', fail: false, desc: '@ts-ignore: instrução corretiva' },
        { r: 'find all @ts-ignore and resolve the root cause', fail: false, desc: '@ts-ignore: busca corretiva' },
        { r: 'remove all eslint-disable from legacy code', fail: false, desc: 'eslint-disable: remoção' },
        { r: 'do not suppress errors — surface them', fail: false, desc: 'suppress: instrução negativa' },
        { r: 'never ignore exceptions in async code', fail: false, desc: 'ignore: instrução negativa' },
        { r: 'do not trust user input — always validate', fail: false, desc: 'trust: instrução negativa' },
        { r: 'address the tech debt before adding features', fail: false, desc: 'tech debt: ação corretiva' },
        { r: 'this depends on the follow-up PR #123', fail: false, desc: 'follow-up PR: dependência técnica' },
        { r: 'All tests must pass before merging', fail: false, desc: 'tests: obrigatórios' },
        { r: 'The type error must be fixed at the root cause', fail: false, desc: 'correção na origem' },
        { r: 'essa gambiarra precisa ser refatorada', fail: false, desc: 'gambiarra: diagnóstico PT-BR' },
        { r: 'não devemos contornar a validação de schema', fail: false, desc: 'contornar: negação PT-BR' },
        { r: 'Avoid @ts-ignore — fix the type properly', fail: false, desc: '@ts-ignore: negação' },
        {
            r: 'I found a workaround in auth.ts that needs to be removed',
            fail: false,
            desc: 'workaround: achado + remoção',
        },
    ];

    clearValidationCache();
    let passed = 0,
        failed = 0;

    for (const tc of cases) {
        let blocked = false;
        if (tc.cmd) {
            // [C] testes de comando usam validateCommandContent
            const v = validateCommandContent(tc.r);
            blocked = v.length > 0;
        } else {
            try {
                validateResponse(tc.r);
            } catch {
                blocked = true;
            }
        }
        clearValidationCache();
        const ok = blocked === tc.fail;
        if (ok) {
            console.log(`✅ PASS (${tc.fail ? 'bloqueado' : 'permitido'}): ${tc.desc}`);
            passed++;
        } else {
            console.log(`❌ ${tc.fail ? 'FALHOU (deveria bloquear)' : 'FALSO POSITIVO'}: ${tc.desc}`);
            failed++;
        }
    }

    console.log(`\n${'='.repeat(58)}`);
    console.log(`Resultado: ${passed}/${cases.length} passaram${failed > 0 ? `, ${failed} falharam` : ' — 100%'}`);
    console.log(`${'='.repeat(58)}`);
    clearValidationCache();
    process.exit(failed > 0 ? 1 : 0);
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

try {
    const expected = realpathSync(fileURLToPath(import.meta.url));
    const actual = realpathSync(process.argv[1] as string);
    if (expected === actual)
        runHook().catch((e) => {
            process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
            process.exit(1);
        });
} catch {
    if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
        runHook().catch((e) => {
            process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
            process.exit(1);
        });
}
