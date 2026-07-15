import fs from 'fs';
import path from 'path';
import type { TestReportSource, Framework } from './context.js';
import { rootLogger } from '../shared/logger.js';
import { getErrorMessage } from '../shared/errors.js';
import { readConfigFileSafe } from './secure-io.js';
import { executeConfigInIsolate, logIsolateFallback } from './reporter-isolate.js';
import { extractReportersAst, extractReportersFromJsonObject } from './reporter-ast.js';
import { matchReporter } from './reporter-registry.js';

export interface DetectionResult {
    framework: Framework;
    testCmd: string;
    installCmd: string;
    testReportPath: string;
    nodeVersion: string;
    testReportSource: TestReportSource;
}

const DEFAULTS: Record<Framework, DetectionResult> = {
    cypress: {
        framework: 'cypress',
        testCmd: 'npx cypress run --reporter ctrf',
        installCmd: 'npm ci',
        testReportPath: 'cypress/reports/ctrf-report.json',
        nodeVersion: '20',
        testReportSource: 'cli-flag',
    },
    playwright: {
        framework: 'playwright',
        testCmd: 'npx playwright test --reporter ctrf',
        installCmd: 'npm ci && npx playwright install --with-deps',
        testReportPath: 'playwright-report/ctrf-report.json',
        nodeVersion: '20',
        testReportSource: 'cli-flag',
    },
    jest: {
        framework: 'jest',
        testCmd: 'npx jest --reporter ctrf',
        installCmd: 'npm ci',
        testReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
        testReportSource: 'cli-flag',
    },
    vitest: {
        framework: 'vitest',
        testCmd: 'npx vitest run',
        installCmd: 'npm ci',
        testReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
        testReportSource: 'missing',
    },
    generic: {
        framework: 'generic',
        testCmd: 'npm test',
        installCmd: 'npm ci',
        testReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
        testReportSource: 'missing',
    },
};

/** Candidate config files (basename w/o extension) scanned per project. */
const CONFIG_CANDIDATES: Array<{ name: string }> = [
    { name: 'vitest.config' },
    { name: 'vite.config' },
    { name: 'jest.config' },
    { name: 'cypress.config' },
    { name: 'playwright.config' },
];
const CONFIG_EXTENSIONS = ['.ts', '.js', '.mjs', '.cjs'];

/**
 * Detect whether any test reporter (CTRF/JUnit/Mochawesome) is configured in
 * the project's config files or package.json. Isolate-first, AST-fallback.
 *
 * The detection is data-driven via the reporter registry (`matchReporter`),
 * replacing the previous regex-only approach. It covers all frameworks
 * (vitest, vite, jest, cypress, playwright) and eliminates false positives
 * from comments/strings because only the structural `reporters`/`reporter`
 * arrays are inspected.
 */
export async function detectTestReporter(projectRoot: string): Promise<boolean> {
    const reporters = await collectReporters(projectRoot);
    return reporters.some((name) => matchReporter(name) !== null);
}

async function collectReporters(projectRoot: string): Promise<string[]> {
    const found: string[] = [];

    await Promise.all(
        CONFIG_CANDIDATES.flatMap((cand) =>
            CONFIG_EXTENSIONS.map(async (ext) => {
                const relativeName = cand.name + ext;
                const content = await readConfigFileSafe(projectRoot, relativeName);
                if (content === null) return;
                const reporters = await extractReporters(relativeName, content);
                found.push(...reporters);
            }),
        ),
    );

    const pkgContent = await readConfigFileSafe(projectRoot, 'package.json');
    if (pkgContent !== null) {
        try {
            const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
            found.push(...extractInlinePkgReporters(pkg));
        } catch (err) {
            rootLogger.debug(`collectReporters: package.json parse failed: ${getErrorMessage(err)}`);
        }
    }

    return found;
}

/**
 * Extract raw reporter identifiers from a config file: isolate-first, AST on
 * any failure. The isolate throws on evaluation failure; we log (never
 * swallow) and delegate to the AST extractor, which never executes code.
 */
async function extractReporters(configPath: string, content: string): Promise<string[]> {
    try {
        return await executeConfigInIsolate(configPath, content);
    } catch (err) {
        logIsolateFallback(configPath, err);
        return extractReportersAst(configPath, content);
    }
}

/** Inline reporter detection from package.json: reporter deps + jest/vitest blocks. */
function extractInlinePkgReporters(pkg: Record<string, unknown>): string[] {
    const out: string[] = [];

    const deps = {
        ...asRecord(pkg['dependencies']),
        ...asRecord(pkg['devDependencies']),
    };
    for (const depName of Object.keys(deps)) {
        if (matchReporter(depName) !== null) out.push(depName);
    }

    const jest = asRecord(pkg['jest']);
    if (jest !== undefined) {
        out.push(...extractReportersFromJsonObject(jest));
    }
    const vitest = asRecord(pkg['vitest']);
    if (vitest !== undefined) {
        out.push(...extractReportersFromJsonObject(vitest));
    }

    return out;
}

function detectFromPkg(pkg: Record<string, unknown>): Framework {
    const deps = {
        ...asRecord(pkg['dependencies']),
        ...asRecord(pkg['devDependencies']),
    };

    if (deps['cypress']) return 'cypress';
    if (deps['@playwright/test'] || deps['playwright']) return 'playwright';
    if (deps['jest']) return 'jest';
    if (deps['vitest']) return 'vitest';
    return 'generic';
}

/**
 * Detect framework and whether a test reporter is already configured.
 *
 * Routes every framework through `detectTestReporter`. If a reporter is found,
 * `testReportSource` is `config-file`; otherwise it falls back to the
 * framework default (`cli-flag` for cypress/playwright/jest, `missing` for
 * vitest/generic).
 */
export async function detectFramework(packageJsonPath: string): Promise<DetectionResult> {
    const resolvedPath = packageJsonPath;
    const projectRoot = path.dirname(path.resolve(packageJsonPath));

    let pkg: Record<string, unknown> = {};
    const pkgContent = await readConfigFileSafe(projectRoot, path.basename(resolvedPath));
    if (pkgContent !== null) {
        try {
            pkg = JSON.parse(pkgContent) as Record<string, unknown>;
        } catch (err) {
            rootLogger.debug(`detectFramework: package.json parse failed: ${getErrorMessage(err)}`);
        }
    }

    const framework = detectFromPkg(pkg);
    const defaults: DetectionResult = { ...DEFAULTS[framework] };

    const hasReporter = await detectTestReporter(projectRoot);
    if (hasReporter) {
        defaults.testReportSource = 'config-file';
    }

    return defaults;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

export function extractRepoFromGit(projectRoot: string): { owner: string; repo: string } {
    const root = projectRoot;
    try {
        const gitConfig = fs.readFileSync(path.resolve(root, '.git', 'config'), 'utf8');
        const match = /url\s*=\s*\S+(?:github\.com|gitlab\.com)[/:]([^/]+)\/([^/\s]+?)(?:\.git)?\s/.exec(gitConfig);
        if (match) {
            const owner = String(match[1] ?? '');
            const repo = String(match[2] ?? '');
            return { owner, repo: repo.replace(/\.git$/, '') };
        }
    } catch (err) {
        rootLogger.debug('extractRepoFromGit: not a git repo or no remote: ' + getErrorMessage(err));
    }
    return { owner: '', repo: '' };
}
