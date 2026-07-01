#!/usr/bin/env node
/**
 * UX Auditor — detects UX anti-patterns in the codebase.
 *
 * Category: Soft heuristics (on-demand, not CI gate)
 *
 * Detects:
 *   1. Noisy journey — handlers whose prompts lack hints
 *   2. Dead utility — exported functions called only from test files, never
 *      from production code (import-aware resolution).
 *   3. UX Friction Score — composite metric:
 *        PR = prompts without hint / total prompts
 *        EX = handlers without HELP_TOPICS entry / total handlers
 *        AL = submenu items without alias / total submenu items
 *        DP = max submenu nesting depth
 *        Score = (PR + EX + AL) * DP
 *
 * Usage:
 *   npx tsx scripts/ux-auditor.ts
 *
 * Output:
 *   .audit/ux-audit-<YYYY-MM-DD>.json
 */
import fs from 'fs';
import path from 'path';

interface AuditFinding {
    type: 'noisy-journey' | 'dead-utility';
    file: string;
    line: number;
    detail: string;
}

interface AuditReport {
    generatedAt: string;
    frictionScore: number;
    findings: AuditFinding[];
}

interface ImportGraphEntry {
    file: string;
    symbols: Set<string>;
}

const UTF8 = 'utf-8';

function readSource(file: string): string {
    return fs.readFileSync(path.resolve(file), UTF8);
}

function getAllTsFiles(dir: string, excludeTests = false): string[] {
    const files: string[] = [];
    const abs = path.resolve(dir);
    function walk(d: string) {
        for (const entry of fs.readdirSync(path.resolve(d), { withFileTypes: true })) {
            const p = path.join(d, entry.name);
            if (
                entry.isDirectory() &&
                !['node_modules', '.git', 'dist', 'coverage', '.audit', '__mocks__'].includes(entry.name)
            ) {
                walk(p);
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                if (excludeTests && entry.name.endsWith('.test.ts')) continue;
                files.push(p);
            }
        }
    }
    walk(abs);
    return files;
}

/** Resolve a module specifier relative to the importing file. Returns normalized absolute path. */
function resolveModulePath(specifier: string, importingFile: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const dir = path.dirname(importingFile);
    const resolved = path.resolve(dir, specifier);

    /* try as-is first */
    if (fs.existsSync(resolved)) return path.normalize(resolved);

    /* if specifier ends with .js (common TS import pattern), try replacing with .ts */
    if (resolved.endsWith('.js')) {
        const ts = resolved.slice(0, -3) + '.ts';
        if (fs.existsSync(ts)) return path.normalize(ts);
    }

    /* try appending .ts */
    const withTs = resolved + '.ts';
    if (fs.existsSync(withTs)) return path.normalize(withTs);

    /* try index files */
    for (const idx of ['/index.ts', '/index.js']) {
        const full = resolved + idx;
        if (fs.existsSync(full)) return path.normalize(full);
    }

    return null;
}

function ensureImportModule(imports: Map<string, Set<string>>, modulePath: string): Set<string> {
    if (!imports.has(modulePath)) imports.set(modulePath, new Set());
    return imports.get(modulePath) ?? new Set();
}

function parseNamedSymbols(namesRaw: string): string[] {
    return namesRaw
        .split(',')
        .map((p) => p.trim().split(' as ')[0] ?? '')
        .filter(Boolean);
}

/** Parse import statements from source, return map of normalized module path → imported symbols. */
function parseImports(src: string, importingFile: string): Map<string, Set<string>> {
    const imports = new Map<string, Set<string>>();

    /* named imports: import { a, b as alias } from './x' */
    const namedRe = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(namedRe)) {
        const normalized = resolveModulePath(m[2] ?? '', importingFile);
        if (!normalized) continue;
        const symbols = ensureImportModule(imports, normalized);
        for (const name of parseNamedSymbols(m[1] ?? '')) {
            symbols.add(name);
        }
    }

    /* default imports: import a from './x' */
    const defaultRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(defaultRe)) {
        const normalized = resolveModulePath(m[2] ?? '', importingFile);
        if (!normalized) continue;
        ensureImportModule(imports, normalized).add(m[1] ?? '');
    }

    /* namespace imports: import * as X from './x' */
    const nsRe = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(nsRe)) {
        const normalized = resolveModulePath(m[1] ?? '', importingFile);
        if (!normalized) continue;
        ensureImportModule(imports, normalized).add('*');
    }

    return imports;
}

/** Parse re-export statements from source. Same format as imports but with `export` prefix. */
function parseReExports(src: string, exportingFile: string): Map<string, Set<string>> {
    const reExports = new Map<string, Set<string>>();
    const reRe = /export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(reRe)) {
        const normalized = resolveModulePath(m[2] ?? '', exportingFile);
        if (!normalized) continue;
        if (!reExports.has(normalized)) reExports.set(normalized, new Set());
        const symbols = reExports.get(normalized) ?? new Set();
        reExports.set(normalized, symbols);
        for (const part of (m[1] ?? '').split(',')) {
            const name = part.trim().split(' as ')[0] ?? '';
            if (name) symbols.add(name);
        }
    }
    return reExports;
}

/* ------------------------------------------------------------------ */
/*  Import graph builder                                               */
/* ------------------------------------------------------------------ */

interface ImportGraph {
    /* exportingModule path → list of { importingFile, importedSymbols } */
    reverse: Map<string, ImportGraphEntry[]>;
}

function buildImportGraph(allNonTestFiles: string[]): ImportGraph {
    const reverse = new Map<string, ImportGraphEntry[]>();

    for (const file of allNonTestFiles) {
        const src = readSource(file);

        /* direct imports */
        const imports = parseImports(src, file);
        for (const [exportingModule, symbols] of imports) {
            if (!reverse.has(exportingModule)) reverse.set(exportingModule, []);
            reverse.get(exportingModule)?.push({ file, symbols });
        }

        /* re-exports — a file that re-exports symbols acts as an importer of the original module */
        const reExports = parseReExports(src, file);
        for (const [originalModule, symbols] of reExports) {
            if (!reverse.has(originalModule)) reverse.set(originalModule, []);
            reverse.get(originalModule)?.push({ file, symbols });
        }
    }

    return { reverse };
}

/* ------------------------------------------------------------------ */
/*  1. Noisy journey                                                   */
/* ------------------------------------------------------------------ */

function detectNoisyJourneys(): AuditFinding[] {
    const findings: AuditFinding[] = [];

    /* Check handlers with prompts without hint */
    const handlerFiles = getAllTsFiles('jira_management/commands', true);
    for (const hf of handlerFiles) {
        const src = readSource(hf);
        for (const call of src.matchAll(/ask\(['"]([^'"]+)['"][^)]*\)/g)) {
            if (!call[0].includes('hint:')) {
                const lineNum = src.slice(0, call.index).split('\n').length;
                const handlerName = path.basename(hf, '.ts');
                findings.push({
                    type: 'noisy-journey',
                    file: hf,
                    line: lineNum,
                    detail: `Handler ${handlerName}: ask() call without hint — "${call[1]}"`,
                });
            }
        }
    }

    return findings;
}

/* ------------------------------------------------------------------ */
/*  2. Dead utility — import-aware                                     */
/* ------------------------------------------------------------------ */

const SKIP_DIR_PREFIXES = [
    path.normalize('shared/test-utils'),
    path.normalize('shared/primitives'),
    path.normalize('e2e'),
];

function isSkippedDir(file: string): boolean {
    const normalized = path.normalize(file);
    return SKIP_DIR_PREFIXES.some((d) => normalized.startsWith(d));
}

function countTestCallsForExport(exp: { name: string }, allTestFiles: string[]): number {
    let testCalls = 0;
    for (const tf of allTestFiles) {
        const tfSrc = readSource(tf);
        if (!tfSrc) continue;
        const callPattern = exp.name + '(';
        let idx = 0;
        while ((idx = tfSrc.indexOf(callPattern, idx)) !== -1) {
            const prev = idx > 0 ? tfSrc[idx - 1] : undefined;
            if (idx === 0 || (prev !== undefined && /\s/.test(prev))) testCalls++;
            idx++;
        }
    }
    return testCalls;
}

function checkExportUsage(
    exp: { name: string; line: number },
    src: string,
    normalizedPath: string,
    importGraph: ImportGraph,
    allTestFiles: string[],
): AuditFinding | null {
    let prodCalls = 0;

    const importers = importGraph.reverse.get(normalizedPath);
    if (importers) {
        for (const importer of importers) {
            if (importer.symbols.has('*') || importer.symbols.has(exp.name)) {
                prodCalls++;
                break;
            }
        }
    }

    if (prodCalls === 0) {
        const selfCallPattern = exp.name + '(';
        const selfCallIdx = src.indexOf(selfCallPattern);
        const selfCallRe = selfCallIdx >= 0 && /^\s*\S/.test(src.slice(selfCallIdx));
        if (selfCallRe) {
            prodCalls++;
        }
    }

    if (prodCalls > 0) return null;

    const testCalls = countTestCallsForExport(exp, allTestFiles);
    if (testCalls > 0) {
        return {
            type: 'dead-utility',
            file: '',
            line: exp.line,
            detail: `Export '${exp.name}' called ${testCalls}x from tests, 0x from production code`,
        };
    }
    return null;
}

function extractExports(src: string): Array<{ name: string; line: number }> {
    const exports_: Array<{ name: string; line: number }> = [];
    for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) {
        const lineNum = src.slice(0, m.index).split('\n').length;
        exports_.push({ name: m[1] ?? '', line: lineNum });
    }
    for (const m of src.matchAll(/^export (?:const|let|var) (\w+)/gm)) {
        const lineNum = src.slice(0, m.index).split('\n').length;
        exports_.push({ name: m[1] ?? '', line: lineNum });
    }
    return exports_;
}

function checkFileDeadExports(f: string, importGraph: ImportGraph, allTestFiles: string[]): AuditFinding[] {
    if (isSkippedDir(f)) return [];
    const src = readSource(f);
    if (src.includes('__SKIP_AUDIT__')) return [];

    const exports_ = extractExports(src);
    const normalizedPath = path.normalize(f);
    const findings: AuditFinding[] = [];

    for (const exp of exports_) {
        if (exp.name === 'default') continue;
        if (exp.name.startsWith('_')) continue;

        const finding = checkExportUsage(exp, src, normalizedPath, importGraph, allTestFiles);
        if (finding) {
            finding.file = f;
            findings.push(finding);
        }
    }
    return findings;
}

function detectDeadUtilities(importGraph: ImportGraph): AuditFinding[] {
    const allNonTestFiles = getAllTsFiles('.').filter((f) => !f.endsWith('.test.ts'));
    const allTestFiles = getAllTsFiles('.').filter((f) => f.endsWith('.test.ts'));

    const findings: AuditFinding[] = [];
    for (const f of allNonTestFiles) {
        findings.push(...checkFileDeadExports(f, importGraph, allTestFiles));
    }
    return findings;
}

/* ------------------------------------------------------------------ */
/*  3. UX Friction Score                                               */
/* ------------------------------------------------------------------ */

function computePromptRatio(): number {
    let totalPrompts = 0;
    let promptsWithoutHint = 0;
    const handlerFiles = getAllTsFiles('jira_management/commands', true);
    for (const hf of handlerFiles) {
        const src = readSource(hf);
        const askCalls = [...src.matchAll(/ask\(['"]([^'"]+)['"]/g)];
        totalPrompts += askCalls.length;
        for (const call of askCalls) {
            const snippet = src.slice(Math.max(0, call.index - 50), call.index + 100);
            if (!snippet.includes('hint:')) {
                promptsWithoutHint++;
            }
        }
    }
    return totalPrompts > 0 ? promptsWithoutHint / totalPrompts : 0;
}

function extractHelpTopics(menuSource: string): Record<string, string> {
    const helpTopics: Record<string, string> = {};
    let pos = 0;
    while (pos < menuSource.length) {
        const colonIdx = menuSource.indexOf(':', pos);
        if (colonIdx === -1) break;
        const keyMatch = /^\w+/.exec(menuSource.slice(Math.max(0, colonIdx - 30), colonIdx));
        if (!keyMatch) {
            pos = colonIdx + 1;
            continue;
        }
        const key = keyMatch[0];
        const afterColon = colonIdx + 1;
        if (afterColon >= menuSource.length || menuSource[afterColon] !== "'") {
            pos = colonIdx + 1;
            continue;
        }
        const closeQuote = menuSource.indexOf("'", afterColon + 1);
        if (closeQuote === -1) break;
        helpTopics[key] = '';
        pos = closeQuote + 1;
    }
    return helpTopics;
}

function computeHandlerRatio(menuSource: string): number {
    const helpTopics = extractHelpTopics(menuSource);
    const handlerIds = new Set<string>();
    for (const m of menuSource.matchAll(/id:\s+'(\d+|d)'/g)) {
        handlerIds.add(m[1] ?? '');
    }
    let handlersWithHelp = 0;
    let totalHandlers = 0;
    for (const id of handlerIds) {
        if (id === '0') continue;
        totalHandlers++;
        if (Reflect.get(helpTopics, id)) handlersWithHelp++;
    }
    return totalHandlers > 0 ? 1 - handlersWithHelp / totalHandlers : 0;
}

function computeAliasRatio(menuSource: string): number {
    const aliasTargets = new Set<string>();
    for (const m of menuSource.matchAll(/['"]([\w-]+)['"]:\s*['"]([\w/]+)['"]/g)) {
        if (m[2]) aliasTargets.add(m[2]);
    }
    let itemsWithAlias = 0;
    let totalItems = 0;
    for (const m of menuSource.matchAll(/id:\s+'(\d+|d)'\s*,\s*label:\s+'[^']+'/g)) {
        const id = m[1] ?? '';
        if (id === '0') continue;
        totalItems++;
        if (aliasTargets.has(id)) itemsWithAlias++;
    }
    return totalItems > 0 ? 1 - itemsWithAlias / totalItems : 0;
}

function computeFrictionScore(): number {
    const menuSource = readSource('jira_management/menu-data.ts');

    const PR = computePromptRatio();
    const EX = computeHandlerRatio(menuSource);
    const AL = computeAliasRatio(menuSource);

    const submenus = ['reports', 'tests', 'bugreport', 'analytics', 'releases', 'config'];
    const DP = submenus.some((s) => menuSource.includes(s)) ? 2 : 1;

    const score = Number(((PR + EX + AL) * DP).toFixed(3));
    return Math.min(score, 1);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function audit(): AuditReport {
    const allNonTestFiles = getAllTsFiles('.').filter((f) => !f.endsWith('.test.ts'));
    const importGraph = buildImportGraph(allNonTestFiles);

    const noisy = detectNoisyJourneys();
    const dead = detectDeadUtilities(importGraph);
    const allFindings = [...noisy, ...dead];
    const score = computeFrictionScore();

    return {
        generatedAt: new Date().toISOString(),
        frictionScore: score,
        findings: allFindings,
    };
}

function main() {
    const report = audit();

    const auditDir = '.audit';
    if (!fs.existsSync(auditDir)) {
        fs.mkdirSync(auditDir, { recursive: true });
    }

    const date = new Date().toISOString().slice(0, 10);
    const outPath = path.join(auditDir, `ux-audit-${date}.json`);
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(report, null, 2), UTF8);

    process.stdout.write(`\nUX Auditor Report: ${outPath}\n`);
    process.stdout.write(`Friction Score: ${report.frictionScore}\n`);
    process.stdout.write(`Findings: ${report.findings.length}\n`);
    for (const f of report.findings) {
        process.stdout.write(`  [${f.type}] ${f.file}:${f.line} — ${f.detail}\n`);
    }
    process.stdout.write('\n');
}

main();
