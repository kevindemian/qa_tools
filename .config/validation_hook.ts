// validation_hook.ts
// Versão FINAL - Erros de TypeScript Corrigidos

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readSync, realpathSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), '.config', 'opencode');
const VIOLATION_LOG_FILE = join(CONFIG_DIR, '.security_violations.log');
const CACHE_FILE = join(CONFIG_DIR, '.validation_cache.json');
const CONFIG_FILE = join(CONFIG_DIR, 'validation.config.json');

const CACHE_MAX_ENTRIES = 1_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DENSITY_THRESHOLD = 0.3;
const VALIDATION_TIMEOUT_MS = parseInt(process.env.VALIDATION_TIMEOUT_MS || '30000', 10) || 30000;
const STDIN_TIMEOUT_MS = parseInt(process.env.STDIN_TIMEOUT_MS || '30000', 10) || 30000;
const MAX_DIFF_LINES = parseInt(process.env.MAX_DIFF_LINES || '10000', 10) || 10000;
const MAX_DIFF_BUFFER = 100 * 1024 * 1024; // 100MB
const COMMAND_TIMEOUT_MS = parseInt(process.env.COMMAND_TIMEOUT_MS || '10000', 10) || 10000;
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

interface DangerousIntent {
    name: string;
    keywords: string[];
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
        if (existsSync(CONFIG_FILE)) {
            const raw = readFileSync(CONFIG_FILE, 'utf-8');
            return JSON.parse(raw) as ExternalConfig;
        }
    } catch {
        /* config ausente */
    }
    return {};
}

const externalConfig = loadExternalConfig();

function buildProjectPatterns(): RegExp[] {
    const patterns: RegExp[] = [];
    for (const ctor of externalConfig.forbiddenConstructors ?? []) {
        const escaped = ctor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        patterns.push(new RegExp(`new\\s+${escaped}\\s*\\(`, 'i'));
    }
    for (const raw of externalConfig.projectPatterns ?? []) {
        try {
            patterns.push(new RegExp(raw, 'i'));
        } catch {
            /* ignorar */
        }
    }
    return patterns;
}

// ============================================================================
// CAMADA 1: PADRÕES LÉXICOS
// ============================================================================

const FORBIDDEN_PATTERNS: RegExp[] = [
    /disable\s+(?:the\s+)?(?:safety|security|check|validation|guard|test|assert|lint|type\s*check|static\s*analysis)\b/i,
    /turn\s+off\s+(?:the\s+)?(?:safety|security|check|validation|guard)\b/i,
    /deactivate\s+(?:the\s+)?(?:safety|security|check|validation)\b/i,
    /switch\s+off\s+(?:the\s+)?(?:safety|security|check)\b/i,
    /comment\s+out\s+(?:the\s+)?(?:test|assert|check|validation)\b/i,
    /(?<!(?:avoid|never use|no|without a|eliminate|remove|prevent).{0,40})\bworkaround\b/i,
    /(?<!(?:avoid|never|without).{0,30})\bbypass\b/i,
    /\bcircumvent\b/i,
    /\bevade\b/i,
    /\bkludge\b/i,
    /\bmonkey\s*patch\b/i,
    /overrides?\s+(?:safety|security|check)\b/i,
    /suppress\s+(?:the\s+)?(?:warning|error|test|failure|exception|assertion)\b/i,
    /silence\s+(?:the\s+)?(?:warning|error)\b/i,
    /ignore\s+(?:the\s+)?(?:warning|error|test|failure|exception)\b/i,
    /temporarily\s+(?:disable|turn\s+off|deactivate|ignore|suppress)\b/i,
    /as\s+a\s+(?:quick|temp(?:orary)?)\s+(?:fix|solution|hack)\b/i,
    /temporary\s+(?:solution|fix|workaround|hack|bypass)\b/i,
    /\bstopgap\b/i,
    /quick\s+and\s+dirty\b/i,
    /\bhotfix\b/i,
    /\bquickfix\b/i,
    /band-?aid\s+(?:fix|solution)\b/i,
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
    /\btrust\s+me\b/i,
    /\bshould\s+be\s+fine\b/i,
    /\bprobably\s+fine\b/i,
    /\bprobably\s+works?\b/i,
    /\bworks\s+on\s+my\s+machine\b/i,
    /it\s+compiles?,?\s+(?:so|therefore|thus)\s+(?:it'?s|it\s+is)\s+fine\b/i,
    /(?<!(?:avoid|never use|don't use|do not use|remove|delete).{0,40})@ts-ignore\b/i,
    /(?<!(?:avoid|never use|don't use|do not use|remove|delete).{0,40})@ts-expect-error\b/i,
    /@ts-nocheck\b/,
    /\bconst\s+\w[\w$]*\s*:\s*any\b/,
    /\blet\s+\w[\w$]*\s*:\s*any\b/,
    /\bas\s+any\b/,
    /\/\/\s*eslint-disable/,
    /\/\*\s*eslint-disable\s*\*\//,
    /eslint-disable-next-line/,
    /(?:it|test|describe)\.(?:skip|todo)\s*\(/i,
    /\.only\s*\(/i,
    /\btech\s+debt\b/i,
    /it'?s\s+not\s+my\s+(?:job|responsibility|concern)\b/i,
    /that\s+should\s+be\s+(?:handled|fixed)\s+by\b/i,
    /speed\s+over\s+(?:quality|safety)\b/i,
    /follow-?up\s+(?:PR|ticket|issue)\b/i,

    // Padroes em portugues
    /desabilitar?\s+temporariamente\b/i,
    /desativar?\s+temporariamente\b/i,
    /desligar?\s+(?:a|o)\s+(?:seguranca|validacao|verificacao)\b/i,
    /contornar?\s+(?:a\s+)?(?:validacao|verificacao|seguranca)\b/i,
    /pular?\s+(?:a\s+)?(?:validacao|verificacao|seguranca|check|teste)\b/i,
    /gambiarra\b/i,
    /jeitinho\b/i,
    /remendar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /corrigir?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /arrumar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /consertar?\s+(?:depois|futuramente|mais\s+tarde)\b/i,
    /nao\s+(?:e|eh)\s+meu\s+(?:trabalho|problema|job)\b/i,
    /vamos\s+(?:deixar|empurrar)\s+(?:assim|como\s+esta)\b/i,
    /depois\s+(?:a\s+)?gente\s+(?:arruma|corrige|resolve)\b/i,
    /(?:depois|futuramente)\s+(?:eu|nos)\s+(?:arrumo|corrigimos|resolvemos)\b/i,
    /(?:nao|não)\s+(?:precisa|precisamos)\s+(?:validar|verificar|checar)\b/i,
    /sem\s+(?:precisar|necessidade)\s+(?:validar|verificar)\b/i,
    /fingir?\s+que\s+(?:nao|não)\s+(?:viu|existe|tem)\b/i,
    /deixar?\s+(?:assim|como\s+esta)\s+(?:por\s+enquanto|agora)\b/i,
    /resolver?\s+(?:depois|futuramente|mais\s+tarde|no\s+proximo\s+(?:sprint|release))\b/i,
];

const INDIRECT_BYPASS_PATTERNS: RegExp[] = [
    /don'?t\s+(?:check|validate|verify|test|assert)\b/i,
    /skip\s+(?:the\s+)?(?:check|validation|verification|test)\b/i,
    /avoid\s+(?:checking|validating)\b/i,
    /assume\s+(?:it'?s\s+)?(?:correct|valid|safe|works)\b/i,
    /trust\s+(?:the\s+)?(?:input|data|caller|user)\b/i,
    /no\s+need\s+to\s+(?:check|validate|verify)\b/i,
    /cast\s+(?:it\s+to|as)\s+(?:any|unknown)\b/i,
    /not\s+production\s+code\b/i,
    /only\s+runs\s+in\s+(?:test|dev|development)\b/i,
    /pre-?existing\s+(?:behavior|code|issue)\b/i,
    /mock\s+out\s+the\s+(?:validation|check|safety)\b/i,
];

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
// CAMADA 4: HEURÍSTICA DE INTENÇÃO
// ============================================================================

const DANGEROUS_INTENTS: DangerousIntent[] = [
    {
        name: 'avoid_validation',
        keywords: ['bypass', 'circumvent', 'evade', 'sidestep'],
    },
    {
        name: 'temporary_fix',
        keywords: ['stopgap', 'provisional', 'temp fix'],
    },
    {
        name: 'weaken_safety',
        keywords: ['relax', 'loosen', 'weaken', 'diminish'],
    },
    {
        name: 'assume_safety',
        keywords: ["assume it's valid", 'presume safe'],
    },
    {
        name: 'defer_responsibility',
        keywords: ['fix later', 'address later', 'handle later'],
    },
];

const NEGATION_WORDS = [
    "don't",
    'do not',
    'never',
    "shouldn't",
    'should not',
    'avoid',
    'prevent',
    'stop',
    'must not',
    'cannot',
];

function hasDangerousIntent(text: string): {
    found: boolean;
    message: string;
} {
    const lower = text.toLowerCase();
    for (const intent of DANGEROUS_INTENTS) {
        for (const keyword of intent.keywords) {
            const idx = lower.indexOf(keyword);
            if (idx === -1) continue;
            const start = Math.max(0, idx - 60);
            const end = Math.min(lower.length, idx + keyword.length + 60);
            const context = lower.substring(start, end);
            const isNegated = NEGATION_WORDS.some((neg) => context.includes(neg));
            if (!isNegated) {
                return {
                    found: true,
                    message: `intenção perigosa: ${intent.name} ("${keyword}")`,
                };
            }
        }
    }
    return { found: false, message: '' };
}

// ============================================================================
// CAMADA 5: PADRÕES DE CÓDIGO TYPESCRIPT PERIGOSO
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
    /["']strict["']\s*:\s*false/,
    /["']noImplicitAny["']\s*:\s*false/,
    /["']strictNullChecks["']\s*:\s*false/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /__proto__/,
    /Object\.setPrototypeOf\s*\(/,
    /\bglobal\.\w+\s*=/,
];

const MOCK_FACTORY_PATTERNS: RegExp[] = [
    /jest\.doMock\s*\(/,
    /jest\.enableAutomock\s*\(/,
    /jest\.disableAutomock\s*\(/,
    /delete\s+require\s*\.\s*cache/,
];

function findMockFactoryViolations(content: string): MockFactoryMatch[] {
    const violations: MockFactoryMatch[] = [];
    for (const pattern of MOCK_FACTORY_PATTERNS) {
        if (pattern.test(content))
            violations.push({
                pattern: pattern.source,
                content: content.substring(0, 200),
            });
    }
    return violations;
}

const ARCHITECTURAL_PATTERNS: RegExp[] = buildProjectPatterns();

const DENSITY_INDICATORS: RegExp[] = [/:\s*any\b/, /\bas\s+any\b/, /@ts-(?:ignore|expect-error)/, /eslint-disable/];

function hasDangerousCodeDensity(content: string): {
    found: boolean;
    score: number;
    details: string[];
} {
    const lines = content.split('\n');
    let inBlockComment = false;
    const codeLines = lines.filter((l) => {
        const t = l.trim();
        if (inBlockComment) {
            if (t.includes('*/')) inBlockComment = false;
            return false;
        }
        if (t.startsWith('/*')) {
            if (!t.includes('*/')) inBlockComment = true;
            return false;
        }
        return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('#');
    });
    if (codeLines.length < 5) return { found: false, score: 0, details: [] };
    let dangerousCount = 0;
    const details: string[] = [];
    for (const line of codeLines) {
        let flagged = false;
        for (const indicator of DENSITY_INDICATORS) {
            if (indicator.test(line)) {
                if (!flagged) {
                    dangerousCount++;
                    flagged = true;
                }
                const excerpt = line.trim().substring(0, 80);
                if (!details.includes(excerpt)) details.push(excerpt);
            }
        }
    }
    const ratio = dangerousCount / codeLines.length;
    return {
        found: ratio > DENSITY_THRESHOLD,
        score: Math.round(ratio * 100),
        details,
    };
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
        blocks.push({ language, content, startLine: 0 });
    }
    return blocks;
}

function validateTsJsBlock(code: string): string[] {
    return DANGEROUS_TS_CODE_PATTERNS.filter((p) => p.test(code)).map((p) => p.source);
}

function validateCodeBlocks(response: string): string[] {
    const blocks = extractCodeBlocks(response);
    const all: string[] = [];
    for (const block of blocks) {
        if (['typescript', 'javascript', 'ts', 'js'].includes(block.language)) {
            all.push(...validateTsJsBlock(block.content).map((v) => `[${block.language}] ${v}`));
        }
    }
    return all;
}

function detectFileWrites(text: string): FileWriteDetection[] {
    const writes: FileWriteDetection[] = [];
    const patterns = [
        {
            regex: /echo\s+"((?:[^"\\]|\\.)*)"\s*>\s*(\S+)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[2],
                content: m[1],
            }),
        },
        {
            regex: /echo\s+'((?:[^'\\]|\\.)*)'\s*>\s*(\S+)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[2],
                content: m[1],
            }),
        },
        {
            regex: /echo\s+`([^`]+)`\s*>\s*(\S+)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[2],
                content: m[1],
            }),
        },
        {
            regex: /printf\s+"((?:[^"\\]|\\.)*)"\s*>\s*(\S+)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[2],
                content: m[1],
            }),
        },
        {
            regex: /printf\s+'((?:[^'\\]|\\.)*)'\s*>\s*(\S+)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[2],
                content: m[1],
            }),
        },
        {
            regex: /printf\s+`([^`]+)`\s*>\s*(\S+)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[2],
                content: m[1],
            }),
        },
        {
            regex: /cat\s*>\s*(\S+)\s*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[1],
                content: m[3],
            }),
        },
        {
            regex: /tee\s+(\S+)\s*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[1],
                content: m[3],
            }),
        },
        {
            regex: /python3?\s+-c\s+['"`](?:open\(['"`])([^'"`]+)['"`](?:,\s*['"]w['"]\)\.write\(['"`])([^'"`]+)['"`]\)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[1],
                content: m[2],
            }),
        },
        {
            regex: /node\s+-e\s+['"`]fs\.writeFileSync\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/gi,
            extractor: (m: RegExpExecArray) => ({
                command: m[0],
                targetFile: m[1],
                content: m[2],
            }),
        },
    ];
    for (const { regex, extractor } of patterns) {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const result = extractor(match);
            writes.push({
                command: result.command,
                targetFile: result.targetFile ?? '',
                content: result.content ?? '',
            });
        }
    }
    return writes;
}

function validateIndirectFileWrites(response: string): string[] {
    const writes = detectFileWrites(response);
    const all: string[] = [];
    for (const write of writes) {
        if (write.content)
            all.push(...validateTsJsBlock(write.content).map((v) => `file write to ${write.targetFile}: ${v}`));
    }
    return all;
}

const ARCHITECTURAL_WORKAROUND_PATTERNS: RegExp[] = [
    /add\s+a\s+(?:flag|setting|config|option)\s+to\s+(?:disable|bypass|toggle)\b/i,
    /mock\s+out\s+the\s+(?:validation|check|safety)\b/i,
];

function detectArchitecturalWorkarounds(response: string): string[] {
    return ARCHITECTURAL_WORKAROUND_PATTERNS.filter((p) => p.test(response)).map((p) => p.source);
}

// ============================================================================
// CAMADA 12: PROTEÇÃO AVANÇADA CONTRA SED/AWK/PERL
// ============================================================================

const SED_PATTERN = /sed\s+(?:-i|--in-place)\s*(?:(?:-e\s+)?)(['"`])?((?:[^\\]|\\.)+?)\1?\s+(\S+)/gi;
const AWK_PATTERN = /awk\s+['"`][^'"`]*>\s*(\S+)['"`]/gi;
const PERL_PATTERN = /perl\s+-pi\s+(?:-e\s+)?['"`]([^'"`]+)['"`]\s+(\S+)/gi;
const MULTI_CMD_SEPARATORS = /\s*(?:&&|\|\||;)\s*/;

// Usar AsyncLocalStorage para recursão segura (Node.js)
import { AsyncLocalStorage } from 'async_hooks';
const recursionDepthStorage = new AsyncLocalStorage<number>();

function detectSedWorkaround(command: string): { file: string; replacement: string } | null {
    const match = SED_PATTERN.exec(command);
    if (match) {
        const sedExpression = match[2] || match[1];
        const targetFile = match[3] ?? '';
        const replaceMatch = sedExpression?.match(/s\/([^/]+)\/([^/]+)\//);
        if (replaceMatch) {
            return { file: targetFile, replacement: replaceMatch[2] ?? '' };
        }
    }
    return null;
}

function validateSedCommand(command: string): string[] {
    const violations: string[] = [];
    const sedWorkaround = detectSedWorkaround(command);
    if (sedWorkaround && sedWorkaround.replacement) {
        try {
            validateResponse(sedWorkaround.replacement);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            violations.push(`sed replacement in ${sedWorkaround.file}: ${msg}`);
        }
    }
    return violations;
}

function validateMultiCommand(command: string): string[] {
    const violations: string[] = [];
    const subCommands = command.split(MULTI_CMD_SEPARATORS);
    const currentDepth = recursionDepthStorage.getStore() ?? 0;

    if (currentDepth >= MAX_RECURSION_DEPTH) {
        violations.push(`Max recursion depth exceeded for command: ${command.substring(0, 100)}`);
        return violations;
    }

    return recursionDepthStorage.run(currentDepth + 1, () => {
        for (const subCmd of subCommands) {
            const trimmed = subCmd.trim();
            if (trimmed) {
                const subViolations = validateCommandContent(trimmed);
                violations.push(...subViolations);
            }
        }
        return violations;
    });
}

const commandCache = new Map<string, { violations: string[]; timestamp: number }>();

function validateCommandContent(command: string): string[] {
    const cacheKey = getResponseHash(command);
    const cached = commandCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < COMMAND_TIMEOUT_MS) {
        return cached.violations;
    }

    const violations: string[] = [];

    const writes = detectFileWrites(command);
    for (const write of writes) {
        if (write.content) {
            try {
                validateResponse(write.content);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                violations.push(`File write to ${write.targetFile}: ${msg}`);
            }
        }
    }

    const sedViolations = validateSedCommand(command);
    violations.push(...sedViolations);

    if (MULTI_CMD_SEPARATORS.test(command)) {
        const multiViolations = validateMultiCommand(command);
        violations.push(...multiViolations);
    }

    commandCache.set(cacheKey, { violations, timestamp: Date.now() });

    return violations;
}

// ============================================================================
// CACHE E LOGGING
// ============================================================================

let rejectedCache: Record<string, { patterns: string[]; timestamp: string }> = {};

function loadRejectedCache(): void {
    try {
        if (existsSync(CACHE_FILE)) {
            const data: CacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
            const now = Date.now();
            rejectedCache = {};
            for (const entry of data.entries ?? []) {
                if (now - new Date(entry.timestamp).getTime() < CACHE_TTL_MS) {
                    rejectedCache[entry.hash] = {
                        patterns: entry.patterns,
                        timestamp: entry.timestamp,
                    };
                }
            }
        }
    } catch {
        rejectedCache = {};
    }
}

function saveRejectedHash(hash: string, patterns: string[]): void {
    try {
        const now = new Date().toISOString();
        rejectedCache[hash] = { patterns, timestamp: now };
        const entries = Object.entries(rejectedCache)
            .slice(-CACHE_MAX_ENTRIES)
            .map(([h, v]) => ({
                hash: h,
                patterns: v.patterns,
                timestamp: v.timestamp,
            }));
        writeFileSync(CACHE_FILE, JSON.stringify({ entries, lastUpdated: now }, null, 2), 'utf-8');
    } catch {
        /* sem permissão */
    }
}

function logViolation(response: string, pattern: string): void {
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

function getResponseHash(response: string): string {
    return createHash('sha256').update(response, 'utf-8').digest('hex');
}

// ============================================================================
// FUNÇÃO PRINCIPAL DE VALIDAÇÃO
// ============================================================================

export function validateResponse(response: string): boolean {
    if (!response || typeof response !== 'string') throw new Error('RESPOSTA REJEITADA: resposta vazia ou inválida');

    const hash = getResponseHash(response);
    const cached = rejectedCache[hash];
    if (cached) throw new Error(`RESPOSTA REJEITADA (cache): ${cached.patterns.join('; ')}`);

    const violations: ViolationEntry[] = [];

    for (const pattern of FORBIDDEN_PATTERNS)
        if (pattern.test(response)) violations.push({ pattern: pattern.source, severity: 'block' });
    for (const pattern of INDIRECT_BYPASS_PATTERNS)
        if (pattern.test(response)) violations.push({ pattern: pattern.source, severity: 'block' });
    for (const pattern of DANGEROUS_PHRASES)
        if (pattern.test(response)) violations.push({ pattern: pattern.source, severity: 'block' });
    const intent = hasDangerousIntent(response);
    if (intent.found) violations.push({ pattern: intent.message, severity: 'block' });
    for (const v of findMockFactoryViolations(response))
        violations.push({
            pattern: `mock_factory: ${v.pattern}`,
            severity: 'review',
        });
    for (const pattern of ARCHITECTURAL_PATTERNS)
        if (pattern.test(response)) violations.push({ pattern: pattern.source, severity: 'block' });
    const density = hasDangerousCodeDensity(response);
    if (density.found)
        violations.push({
            pattern: `dangerous_code_density: ${density.score}%`,
            severity: 'block',
        });
    for (const v of validateCodeBlocks(response)) violations.push({ pattern: v, severity: 'block' });
    for (const v of validateIndirectFileWrites(response)) violations.push({ pattern: v, severity: 'block' });
    for (const w of detectArchitecturalWorkarounds(response))
        violations.push({
            pattern: `architectural_workaround: ${w}`,
            severity: 'review',
        });

    if (violations.length === 0) return true;

    const patterns = violations.map((v) => v.pattern);
    for (const p of patterns) logViolation(response, p);

    const hasBlock = violations.some((v) => v.severity === 'block');
    const hasReview = violations.some((v) => v.severity === 'review');
    const summary = patterns.join('; ');

    if (hasBlock) {
        saveRejectedHash(hash, patterns);
        throw new Error(`RESPOSTA REJEITADA: ${summary}`);
    }
    if (hasReview) throw new Error(`RESPOSTA REQUER REVISÃO HUMANA: ${summary}`);
    return true;
}

export function sanitizeAndReject(response: string): ValidationResult {
    try {
        validateResponse(response);
        return { valid: true, response };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            valid: false,
            error: msg,
            response,
            requiresHumanReview: msg.includes('REQUER REVISÃO HUMANA'),
        };
    }
}

export const validateWithReview = sanitizeAndReject;

export function validateCommand(command: string): void {
    const violations = validateCommandContent(command);
    if (violations.length > 0) {
        throw new Error(`Comando bloqueado: ${violations.join('; ')}`);
    }
}

export function clearValidationCache(): void {
    rejectedCache = {};
    commandCache.clear();
    if (existsSync(CACHE_FILE))
        writeFileSync(
            CACHE_FILE,
            JSON.stringify({ entries: [], lastUpdated: new Date().toISOString() }, null, 2),
            'utf-8',
        );
}

export function getViolationStats(): {
    count: number;
    recentViolations: Array<{
        timestamp: string;
        pattern: string;
        responsePreview: string;
        responseLength: number;
    }>;
} {
    try {
        if (existsSync(VIOLATION_LOG_FILE)) {
            const lines = readFileSync(VIOLATION_LOG_FILE, 'utf-8').trim().split('\n').filter(Boolean);
            const parsed = lines.map((l) => JSON.parse(l));
            return {
                count: parsed.length,
                recentViolations: parsed.slice(-10),
            };
        }
    } catch {
        /* arquivo ausente */
    }
    return { count: 0, recentViolations: [] };
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

loadRejectedCache();

// ============================================================================
// HELPER — LEITURA DE STDIN
// ============================================================================

function readStdinSync(): string {
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    const buf = Buffer.alloc(65536);
    let bytesRead: number;
    const startTime = Date.now();
    let hasData = false;

    while (true) {
        if (Date.now() - startTime > STDIN_TIMEOUT_MS) {
            if (!hasData) return '';
            break;
        }
        try {
            bytesRead = readSync(0, buf, 0, buf.length, null);
        } catch {
            break;
        }
        if (bytesRead <= 0) {
            if (chunks.length === 0) return '';
            break;
        }
        hasData = true;
        chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

// ============================================================================
// CLI — PARSE DE DIFF GIT
// ============================================================================

function parseGitDiff(diff: string): DiffLine[] {
    const lines: DiffLine[] = [];
    const rawLines = diff.split('\n');
    let currentOriginalLine = 0;
    let isInHunk = false;

    for (let lineNumber = 0; lineNumber < rawLines.length; lineNumber++) {
        const rawLine = rawLines[lineNumber];
        if (rawLine == null) continue;

        if (rawLine.startsWith('@@')) {
            isInHunk = true;
            const match = rawLine.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) currentOriginalLine = parseInt(match[1] as string, 10) - 1;
            lines.push({
                lineNumber,
                content: rawLine,
                type: 'context',
                originalLineNumber: 0,
            });
            continue;
        }

        if (!isInHunk) {
            if (rawLine.startsWith('+++') || rawLine.startsWith('---')) {
                lines.push({
                    lineNumber,
                    content: rawLine,
                    type: 'context',
                    originalLineNumber: 0,
                });
            }
            continue;
        }

        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
            currentOriginalLine++;
            lines.push({
                lineNumber,
                content: rawLine.substring(1),
                type: 'added',
                originalLineNumber: currentOriginalLine,
            });
        } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
            lines.push({
                lineNumber,
                content: rawLine.substring(1),
                type: 'removed',
                originalLineNumber: 0,
            });
        } else if (rawLine.startsWith(' ')) {
            currentOriginalLine++;
            lines.push({
                lineNumber,
                content: rawLine.substring(1),
                type: 'context',
                originalLineNumber: currentOriginalLine,
            });
        }
    }
    return lines;
}

function buildOriginalLineIndex(lines: DiffLine[]): Map<number, number> {
    const index = new Map<number, number>();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (line.originalLineNumber > 0) {
            index.set(line.originalLineNumber, i);
        }
    }
    return index;
}

function getContextWindow(lines: DiffLine[], lineIndex: number, windowSize: number = 3): string {
    const start = Math.max(0, lineIndex - windowSize);
    const end = Math.min(lines.length, lineIndex + windowSize + 1);
    return lines
        .slice(start, end)
        .map((l) => l.content)
        .join('\n');
}

function runCheck(diff: string, quiet: boolean = false): CheckResult {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    const globalResult = sanitizeAndReject(diff);
    if (!globalResult.valid) {
        issues.push({
            line: 1,
            error: globalResult.error || 'Erro estrutural no Diff',
            severity: globalResult.requiresHumanReview ? 'review' : 'block',
        });
    }

    const parsedDiff = parseGitDiff(diff);
    const addedLines = parsedDiff.filter((l) => l.type === 'added');

    const hasDiffContent = parsedDiff.some((l) => l.type === 'added' || l.type === 'removed');
    if (!hasDiffContent && issues.length === 0) {
        if (!quiet) console.log('Nenhuma alteração para validar.');
        return {
            valid: true,
            issues: [],
            requiresReview: false,
            stats: { linesValidated: 0, timeMs: Date.now() - startTime },
        };
    }

    if (addedLines.length > MAX_DIFF_LINES) {
        if (!quiet) console.warn(`⚠️ Diff muito grande (${addedLines.length} linhas). Limitando a ${MAX_DIFF_LINES}.`);
        addedLines.length = MAX_DIFF_LINES;
    }
    const validatedHashes = new Set<string>();
    const originalLineIndex = buildOriginalLineIndex(parsedDiff);

    for (const line of addedLines) {
        const lineIndex = originalLineIndex.get(line.originalLineNumber);
        if (lineIndex === undefined) continue;

        const context = getContextWindow(parsedDiff, lineIndex, 3);
        const hash = getResponseHash(context);

        if (validatedHashes.has(hash)) continue;
        validatedHashes.add(hash);

        const result = sanitizeAndReject(context);
        if (!result.valid) {
            const severity = result.requiresHumanReview ? 'review' : 'block';
            issues.push({
                line: line.originalLineNumber,
                error: result.error || 'Unknown error',
                severity,
            });
        }
    }

    const hasBlock = issues.some((i) => i.severity === 'block');
    const hasReview = issues.some((i) => i.severity === 'review');

    return {
        valid: issues.length === 0,
        issues,
        requiresReview: hasReview && !hasBlock,
        stats: {
            linesValidated: validatedHashes.size,
            timeMs: Date.now() - startTime,
        },
    };
}

async function runCheckCommitMsg(quiet: boolean = false): Promise<CheckResult> {
    const commitEditMsgPath = join(process.cwd(), '.git', 'COMMIT_EDITMSG');
    if (!existsSync(commitEditMsgPath))
        return {
            valid: true,
            issues: [],
            requiresReview: false,
            stats: { linesValidated: 0, timeMs: 0 },
        };

    try {
        const msg = readFileSync(commitEditMsgPath, 'utf-8');
        if (!msg || msg.trim().length === 0)
            return {
                valid: true,
                issues: [],
                requiresReview: false,
                stats: { linesValidated: 0, timeMs: 0 },
            };
        const cleanMsg = msg
            .split('\n')
            .filter((l) => !l.trim().startsWith('#'))
            .join('\n');
        if (!cleanMsg.trim())
            return {
                valid: true,
                issues: [],
                requiresReview: false,
                stats: { linesValidated: 0, timeMs: 0 },
            };

        const result = await Promise.race([
            Promise.resolve(sanitizeAndReject(cleanMsg)),
            new Promise<ValidationResult>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), VALIDATION_TIMEOUT_MS),
            ),
        ]);

        if (!result.valid) {
            const severity = result.requiresHumanReview ? 'review' : 'block';
            return {
                valid: false,
                issues: [
                    {
                        line: 0,
                        error: result.error || 'Unknown error',
                        severity,
                    },
                ],
                requiresReview: result.requiresHumanReview || false,
                stats: { linesValidated: 1, timeMs: 0 },
            };
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'Timeout') {
            return {
                valid: false,
                issues: [
                    {
                        line: 0,
                        error: 'Timeout validating commit message',
                        severity: 'block',
                    },
                ],
                requiresReview: false,
                stats: { linesValidated: 0, timeMs: 0 },
            };
        }
        return {
            valid: false,
            issues: [{ line: 0, error: msg, severity: 'block' }],
            requiresReview: false,
            stats: { linesValidated: 0, timeMs: 0 },
        };
    }
    return {
        valid: true,
        issues: [],
        requiresReview: false,
        stats: { linesValidated: 0, timeMs: 0 },
    };
}

// ============================================================================
// CLI — MODO HOOK
// ============================================================================

async function runHook(): Promise<void> {
    const args = process.argv.slice(2);
    const quiet = args.includes('--quiet') || args.includes('-q');
    const outputJson = args.includes('--json');
    const noCache = args.includes('--no-cache');

    if (noCache) clearValidationCache();

    if (args.includes('--check')) {
        let diff = '';
        const startTime = Date.now();

        if (args.includes('--staged')) {
            try {
                execSync('git rev-parse --git-dir', { stdio: 'ignore' });
                diff = execSync('git diff --cached', {
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    maxBuffer: MAX_DIFF_BUFFER,
                });
            } catch (err) {
                if (!quiet && !outputJson) console.error('ERRO: não está em um repositório git');
                if (outputJson)
                    console.log(
                        JSON.stringify({
                            valid: false,
                            error: 'Not a git repository',
                            stats: { timeMs: Date.now() - startTime },
                        }),
                    );
                process.exit(1);
            }
        } else {
            diff = readStdinSync();
            if (!diff && !quiet && !outputJson) {
                console.error('ERRO: nenhum diff fornecido via stdin');
                process.exit(1);
            }
        }

        const diffResult = runCheck(diff, quiet);
        const commitResult = await runCheckCommitMsg(quiet);

        const allIssues = [...diffResult.issues, ...commitResult.issues];
        const hasBlock = allIssues.some((i) => i.severity === 'block');
        const hasReview = allIssues.some((i) => i.severity === 'review');
        const stats = {
            linesValidated: diffResult.stats.linesValidated + commitResult.stats.linesValidated,
            timeMs: Date.now() - startTime,
        };

        if (outputJson) {
            console.log(
                JSON.stringify({
                    valid: !hasBlock && !hasReview,
                    issues: allIssues,
                    requiresReview: hasReview && !hasBlock,
                    stats,
                    cacheEnabled: !noCache,
                }),
            );
        } else if (!quiet && allIssues.length > 0) {
            console.log('=== Violações encontradas ===');
            for (const issue of allIssues) {
                const icon = issue.severity === 'block' ? '❌' : '⚠️';
                console.log(`  ${icon} Linha ${issue.line}: ${issue.error}`);
            }
            console.log(`\n📊 Estatísticas: ${stats.linesValidated} linhas validadas em ${stats.timeMs}ms`);
        } else if (!quiet && allIssues.length === 0 && diff) {
            console.log(
                `✅ Nenhuma violação encontrada. (${stats.linesValidated} linhas validadas em ${stats.timeMs}ms)`,
            );
        }

        if (hasBlock) process.exit(1);
        if (hasReview) process.exit(2);
        process.exit(0);
    }

    if (args.includes('--test')) {
        console.log('Executando testes de validação...\n');
        const testCases = [
            {
                response: 'We can temporarily disable the test for now',
                shouldFail: true,
                desc: 'desabilitação temporária',
            },
            {
                response: 'This is just a workaround for the bug',
                shouldFail: true,
                desc: 'workaround',
            },
            {
                response: 'const x: any = getData()',
                shouldFail: true,
                desc: 'tipo any',
            },
            {
                response: 'Use @ts-ignore to bypass',
                shouldFail: true,
                desc: '@ts-ignore',
            },
            {
                response: '// eslint-disable-next-line',
                shouldFail: true,
                desc: 'eslint-disable',
            },
            {
                response: "We'll fix this later",
                shouldFail: true,
                desc: 'fix later',
            },
            {
                response: 'The type error must be fixed at the root cause',
                shouldFail: false,
                desc: 'correção na origem',
            },
            {
                response: 'All tests must pass before merging',
                shouldFail: false,
                desc: 'testes obrigatórios',
            },
            {
                response: 'Avoid @ts-ignore — fix the type properly',
                shouldFail: false,
                desc: 'negação @ts-ignore',
            },
            {
                response: 'No workaround needed',
                shouldFail: false,
                desc: 'negação workaround',
            },
        ];
        let passed = 0,
            failed = 0;
        for (const tc of testCases) {
            try {
                validateResponse(tc.response);
                if (tc.shouldFail) {
                    console.log(`❌ FALHOU: ${tc.desc}`);
                    failed++;
                } else {
                    console.log(`✅ PASS: ${tc.desc}`);
                    passed++;
                }
            } catch {
                if (tc.shouldFail) {
                    console.log(`✅ PASS: ${tc.desc}`);
                    passed++;
                } else {
                    console.log(`❌ FALHOU: ${tc.desc}`);
                    failed++;
                }
            }
        }
        console.log(`\nResultados: ${passed} passaram, ${failed} falharam`);
        process.exit(failed > 0 ? 1 : 0);
    }

    // Modo hook padrão
    let response = '';
    if (args.includes('--file')) {
        const idx = args.indexOf('--file') + 1;
        if (idx >= args.length) {
            if (!quiet && !outputJson) console.error('ERRO: --file requer um caminho');
            process.exit(1);
        }
        try {
            response = readFileSync(args[idx]!, 'utf-8');
        } catch {
            if (!quiet && !outputJson) console.error(`ERRO: não foi possível ler arquivo: ${args[idx]}`);
            process.exit(1);
        }
    } else if (args.includes('--response')) {
        const idx = args.indexOf('--response') + 1;
        if (idx >= args.length) {
            if (!quiet && !outputJson) console.error('ERRO: --response requer uma string');
            process.exit(1);
        }
        response = args[idx] ?? '';
    } else {
        response = readStdinSync();
    }

    if (!response || response.trim().length === 0) {
        if (!quiet && !outputJson) console.error('ERRO: resposta vazia');
        if (outputJson) console.log(JSON.stringify({ valid: false, error: 'Empty response' }));
        process.exit(1);
    }

    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), VALIDATION_TIMEOUT_MS),
        );
        await Promise.race([Promise.resolve(validateResponse(response)), timeoutPromise]);
        if (outputJson) console.log(JSON.stringify({ valid: true }));
        process.exit(0);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const requiresReview = msg.includes('REQUER REVISÃO HUMANA');
        if (outputJson) console.log(JSON.stringify({ valid: false, error: msg, requiresReview }));
        else if (!quiet) console.error(msg);
        process.exit(requiresReview ? 2 : 1);
    }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

try {
    const expected = realpathSync(fileURLToPath(import.meta.url));
    const actual = realpathSync(process.argv[1] as string);
    if (expected === actual) {
        runHook().catch((err) => {
            console.error(err instanceof Error ? err.message : String(err));
            process.exit(1);
        });
    }
} catch {
    if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
        runHook().catch((err) => {
            console.error(err instanceof Error ? err.message : String(err));
            process.exit(1);
        });
    }
}

// Exportação adicional para compatibilidade
export { validateCommandContent };
