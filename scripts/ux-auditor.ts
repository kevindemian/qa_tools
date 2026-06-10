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
    return fs.readFileSync(file, UTF8);
}

function getAllTsFiles(dir: string, excludeTests = false): string[] {
    const files: string[] = [];
    const abs = path.resolve(dir);
    function walk(d: string) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
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

/** Parse import statements from source, return map of normalized module path → imported symbols. */
function parseImports(src: string, importingFile: string): Map<string, Set<string>> {
    const imports = new Map<string, Set<string>>();

    /* named imports: import { a, b as alias } from './x' */
    const namedRe = /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(namedRe)) {
        const normalized = resolveModulePath(m[2] ?? '', importingFile);
        if (!normalized) continue;
        if (!imports.has(normalized)) imports.set(normalized, new Set());
        const symbols = imports.get(normalized) ?? new Set();
        imports.set(normalized, symbols);
        for (const part of (m[1] ?? '').split(',')) {
            const name = part.trim().split(/\s+as\s+/)[0] ?? '';
            if (name) symbols.add(name);
        }
    }

    /* default imports: import a from './x' */
    const defaultRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(defaultRe)) {
        const normalized = resolveModulePath(m[2] ?? '', importingFile);
        if (!normalized) continue;
        if (!imports.has(normalized)) imports.set(normalized, new Set());
        imports.get(normalized)?.add(m[1] ?? '');
    }

    /* namespace imports: import * as X from './x' */
    const nsRe = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(nsRe)) {
        const normalized = resolveModulePath(m[1] ?? '', importingFile);
        if (!normalized) continue;
        /* namespace = wildcard, assume all exports used */
        if (!imports.has(normalized)) imports.set(normalized, new Set());
        imports.get(normalized)?.add('*');
    }

    return imports;
}

/** Parse re-export statements from source. Same format as imports but with `export` prefix. */
function parseReExports(src: string, exportingFile: string): Map<string, Set<string>> {
    const reExports = new Map<string, Set<string>>();
    const reRe = /export\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(reRe)) {
        const normalized = resolveModulePath(m[2] ?? '', exportingFile);
        if (!normalized) continue;
        if (!reExports.has(normalized)) reExports.set(normalized, new Set());
        const symbols = reExports.get(normalized) ?? new Set();
        reExports.set(normalized, symbols);
        for (const part of (m[1] ?? '').split(',')) {
            const name = part.trim().split(/\s+as\s+/)[0] ?? '';
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

function detectDeadUtilities(importGraph: ImportGraph): AuditFinding[] {
    const findings: AuditFinding[] = [];
    const allNonTestFiles = getAllTsFiles('.').filter((f) => !f.endsWith('.test.ts'));
    const allTestFiles = getAllTsFiles('.').filter((f) => f.endsWith('.test.ts'));

    for (const f of allNonTestFiles) {
        if (isSkippedDir(f)) continue;
        const src = readSource(f);
        if (src.includes('__SKIP_AUDIT__')) continue;

        /* Find exports */
        const exports_: Array<{ name: string; line: number }> = [];
        for (const m of src.matchAll(/^export (?:async )?function (\w+)/gm)) {
            const lineNum = src.slice(0, m.index).split('\n').length;
            exports_.push({ name: m[1]!, line: lineNum });
        }
        for (const m of src.matchAll(/^export (?:const|let|var) (\w+)/gm)) {
            const lineNum = src.slice(0, m.index).split('\n').length;
            exports_.push({ name: m[1]!, line: lineNum });
        }

        const normalizedPath = path.normalize(f);

        for (const exp of exports_) {
            if (exp.name === 'default') continue;
            if (exp.name.startsWith('_')) continue;

            let prodCalls = 0;

            /* 1. Check import graph — does any non-test file import this symbol from this module? */
            const importers = importGraph.reverse.get(normalizedPath);
            if (importers) {
                for (const importer of importers) {
                    if (importer.symbols.has('*') || importer.symbols.has(exp.name)) {
                        prodCalls++;
                        break;
                    }
                }
            }

            /* 2. Check if the export is called at module-level within its own file.
             *    Module-level calls are not inside a function body — they execute at import time. */
            if (prodCalls === 0) {
                const selfCallRe = new RegExp(`^\\s*${exp.name}\\s*\\(`, 'm');
                if (selfCallRe.test(src)) {
                    prodCalls++;
                }
            }

            /* 3. If still zero prod usage but called from tests, flag as dead utility */
            if (prodCalls === 0) {
                let testCalls = 0;
                const testCallRe = new RegExp(`\\b${exp.name}\\s*\\(`, 'g');
                for (const tf of allTestFiles) {
                    const tfSrc = readSource(tf);
                    const matches = tfSrc.match(testCallRe);
                    if (matches) testCalls += matches.length;
                }

                if (testCalls > 0) {
                    findings.push({
                        type: 'dead-utility',
                        file: f,
                        line: exp.line,
                        detail: `Export '${exp.name}' called ${testCalls}x from tests, 0x from production code`,
                    });
                }
            }
        }
    }

    return findings;
}

/* ------------------------------------------------------------------ */
/*  3. UX Friction Score                                               */
/* ------------------------------------------------------------------ */

function computeFrictionScore(): number {
    const menuSource = readSource('jira_management/menu-data.ts');

    /* PR: prompts without hint / total prompts */
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
    const PR = totalPrompts > 0 ? promptsWithoutHint / totalPrompts : 0;

    /* EX: handlers without HELP_TOPICS entry / total handlers */
    const helpTopics: Record<string, string> = {};
    for (const m of menuSource.matchAll(/(\w+):\s*'[^']*'/g)) {
        helpTopics[m[1]!] = '';
    }
    const handlerIds = new Set<string>();
    for (const m of menuSource.matchAll(/id:\s+'(\d+|d)'/g)) {
        handlerIds.add(m[1]!);
    }
    let handlersWithHelp = 0;
    let totalHandlers = 0;
    for (const id of handlerIds) {
        if (id === '0') continue;
        totalHandlers++;
        if (helpTopics[id]) handlersWithHelp++;
    }
    const EX = totalHandlers > 0 ? 1 - handlersWithHelp / totalHandlers : 0;

    /* AL: submenu items without alias / total submenu items */
    const aliasTargets = new Set<string>();
    for (const m of menuSource.matchAll(/['"]([\w-]+)['"]:\s*['"]([\w\d\/]+)['"]/g)) {
        if (m[2]) aliasTargets.add(m[2]);
    }
    let itemsWithAlias = 0;
    let totalItems = 0;
    for (const m of menuSource.matchAll(/id:\s+'(\d+|d)'\s*,\s*label:\s+'[^']+'/g)) {
        const id = m[1]!;
        if (id === '0') continue;
        totalItems++;
        if (aliasTargets.has(id)) itemsWithAlias++;
    }
    const AL = totalItems > 0 ? 1 - itemsWithAlias / totalItems : 0;

    /* DP: max submenu depth */
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
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), UTF8);

    console.log(`\nUX Auditor Report: ${outPath}`);
    console.log(`Friction Score: ${report.frictionScore}`);
    console.log(`Findings: ${report.findings.length}`);
    for (const f of report.findings) {
        console.log(`  [${f.type}] ${f.file}:${f.line} — ${f.detail}`);
    }
    console.log('');
}

main();
