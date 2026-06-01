/** Three-tier test impact analysis — jest, keyword, and explicit mapping. */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { rootLogger } from './logger';
import { safeParseJson } from './safe-json';
import type { TestImpactResult, ImpactedTest, FileTestMapping, TestSelectionJson } from './types';

// ---- helpers ----

const PackageJsonSchema = z.object({
    devDependencies: z.record(z.string(), z.string()).optional(),
});

function loadPackageJson(): { devDependencies?: Record<string, string> } | null {
    try {
        const pkgPath = path.resolve(process.cwd(), 'package.json');
        if (!fs.existsSync(pkgPath)) return null;
        const raw = fs.readFileSync(pkgPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        return PackageJsonSchema.parse(parsed);
    } catch (err: unknown) {
        rootLogger.warn('Failed to read package.json', err);
        return null;
    }
}

function hasJest(pkg: { devDependencies?: Record<string, string> } | null): boolean {
    if (!pkg?.devDependencies) return false;
    return pkg.devDependencies.jest !== undefined;
}

function parseDiffLines(diff: string): string[] {
    return diff
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
}

interface JestResult {
    testFiles: string[];
    testTitles: string[];
}

function runJestFindRelated(changedFiles: string[]): JestResult | null {
    try {
        const output = execFileSync('npx', ['jest', '--listTests', '--findRelatedTests', ...changedFiles], {
            encoding: 'utf8',
        }).trim();
        const testFiles = output.split('\n').filter(Boolean);
        const testTitles = testFiles.map((f) => {
            const base = path.basename(f);
            return base.replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, '').replace(/\.(ts|js)$/, '');
        });
        return { testFiles, testTitles };
    } catch (err: unknown) {
        rootLogger.warn('jest --findRelatedTests failed', err);
        return null;
    }
}

function keywordMatch(changedFiles: string[], testTitles: string[]): ImpactedTest[] {
    if (testTitles.length === 0) return [];
    const impacted: ImpactedTest[] = [];
    for (const file of changedFiles) {
        const segments = file.split('/').flatMap((s) => {
            const name = path.parse(s).name;
            return name ? [name] : [];
        });
        for (const segment of segments) {
            for (const title of testTitles) {
                if (title.toLowerCase().includes(segment.toLowerCase())) {
                    impacted.push({
                        title,
                        reason: `Keyword match: "${segment}" in file "${file}"`,
                        matchMode: 'keyword',
                        filePattern: file,
                    });
                }
            }
        }
    }
    return impacted;
}

function explicitMapping(changedFiles: string[], mappingPath: string): ImpactedTest[] {
    try {
        if (!fs.existsSync(mappingPath)) return [];
        const content = fs.readFileSync(mappingPath, 'utf8');
        const mappings = safeParseJson<FileTestMapping[]>(content, []);
        const impacted: ImpactedTest[] = [];
        for (const file of changedFiles) {
            for (const mapping of mappings) {
                const files = mapping.files ?? [];
                const matched = files.some((pattern) => file.includes(pattern));
                if (!matched) continue;
                const keys = mapping.testKeys ?? [];
                const titles = mapping.testTitles ?? [];
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    if (!key) continue;
                    impacted.push({
                        testKey: key,
                        title: titles[i] ?? key,
                        reason: `Explicit mapping: file "${file}" matches pattern`,
                        matchMode: 'mapping',
                        filePattern: file,
                    });
                }
            }
        }
        return impacted;
    } catch (err: unknown) {
        rootLogger.warn('Failed to load test mapping', err);
        return [];
    }
}

function getGitDiff(): string {
    try {
        return execFileSync('git', ['diff', '--name-only', 'HEAD~1'], {
            encoding: 'utf8',
        }).trim();
    } catch {
        rootLogger.error('Failed to get git diff');
        return '';
    }
}

function dedupImpactedTests(
    mappingTests: ImpactedTest[],
    jestResult: JestResult | null,
    keywordTests: ImpactedTest[],
): ImpactedTest[] {
    const seen = new Set<string>();
    const result: ImpactedTest[] = [];
    const add = (test: ImpactedTest) => {
        const key = test.testKey ?? test.title;
        if (seen.has(key)) return;
        seen.add(key);
        result.push(test);
    };
    for (const t of mappingTests) add(t);
    if (jestResult) {
        for (let i = 0; i < jestResult.testFiles.length; i++) {
            const file = jestResult.testFiles[i];
            if (!file) continue;
            const title = jestResult.testTitles[i] ?? file;
            add({
                title,
                reason: `Jest --findRelatedTests: ${file}`,
                matchMode: 'jest_find_related',
                filePattern: file,
            });
        }
    }
    for (const t of keywordTests) add(t);
    return result;
}

function computeConfidence(
    mappingTests: ImpactedTest[],
    jestResult: JestResult | null,
    keywordTests: ImpactedTest[],
): 'high' | 'medium' | 'low' {
    if (mappingTests.length > 0 || (jestResult && jestResult.testFiles.length > 0)) {
        return 'high';
    }
    if (keywordTests.length > 0) {
        return 'medium';
    }
    return 'low';
}

// ---- public API ----

export function analyzeTestImpact(
    diff?: string,
    options?: {
        mappingPath?: string;
        jestEnabled?: boolean;
        testTitles?: string[];
    },
): TestImpactResult {
    const resolvedDiff = diff ?? getGitDiff();
    const changedFiles = parseDiffLines(resolvedDiff);

    if (changedFiles.length === 0) {
        return {
            changedFiles: [],
            impactedTests: [],
            unaffected: { total: 0, skippedDueTo: [] },
            confidence: 'low',
        };
    }

    const pkg = loadPackageJson();
    const jestAvailable = options?.jestEnabled ?? hasJest(pkg);

    let jestResult: JestResult | null = null;
    if (jestAvailable && changedFiles.length > 0) {
        jestResult = runJestFindRelated(changedFiles);
    }

    const allTitles = [...(options?.testTitles ?? []), ...(jestResult?.testTitles ?? [])];

    const keywordTests = keywordMatch(changedFiles, allTitles);

    const mappingTests = options?.mappingPath ? explicitMapping(changedFiles, options.mappingPath) : [];

    const impactedTests = dedupImpactedTests(mappingTests, jestResult, keywordTests);

    const confidence = computeConfidence(mappingTests, jestResult, keywordTests);

    const suggestedCommand =
        jestAvailable && changedFiles.length > 0 ? `npx jest --findRelatedTests ${changedFiles.join(' ')}` : undefined;

    return {
        changedFiles,
        impactedTests,
        unaffected: { total: 0, skippedDueTo: [] },
        suggestedCommand,
        confidence,
    };
}

/** Build a serialisable TestSelectionJson from an analysis result.
 * Pure function — no I/O. Caller writes the JSON to disk. */
export function generateTestSelectionJson(
    result: TestImpactResult,
    options?: { conservative?: boolean; smokeTests?: string[] },
): TestSelectionJson {
    return {
        generatedAt: new Date().toISOString(),
        changedFiles: result.changedFiles,
        impactedTests: result.impactedTests.map((t) => ({
            title: t.title,
            testKey: t.testKey,
            reason: t.reason,
            matchMode: t.matchMode,
            filePattern: t.filePattern,
        })),
        suggestedCommand: result.suggestedCommand,
        confidence: result.confidence,
        conservative: options?.conservative ?? false,
        smokeTests: options?.smokeTests ?? [],
    };
}
