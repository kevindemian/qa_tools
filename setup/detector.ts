import fs from 'fs';
import path from 'path';
import type { CtrfSource, Framework } from './context.js';

export interface DetectionResult {
    framework: Framework;
    testCmd: string;
    installCmd: string;
    ctrfReportPath: string;
    nodeVersion: string;
    ctrfSource: CtrfSource;
}

const DEFAULTS: Record<Framework, DetectionResult> = {
    cypress: {
        framework: 'cypress',
        testCmd: 'npx cypress run --reporter ctrf',
        installCmd: 'npm ci',
        ctrfReportPath: 'cypress/reports/ctrf-report.json',
        nodeVersion: '20',
        ctrfSource: 'cli-flag',
    },
    playwright: {
        framework: 'playwright',
        testCmd: 'npx playwright test --reporter ctrf',
        installCmd: 'npm ci && npx playwright install --with-deps',
        ctrfReportPath: 'playwright-report/ctrf-report.json',
        nodeVersion: '20',
        ctrfSource: 'cli-flag',
    },
    jest: {
        framework: 'jest',
        testCmd: 'npx jest --reporter ctrf',
        installCmd: 'npm ci',
        ctrfReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
        ctrfSource: 'cli-flag',
    },
    vitest: {
        framework: 'vitest',
        testCmd: 'npx vitest run',
        installCmd: 'npm ci',
        ctrfReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
        ctrfSource: 'missing',
    },
    generic: {
        framework: 'generic',
        testCmd: 'npm test',
        installCmd: 'npm ci',
        ctrfReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
        ctrfSource: 'missing',
    },
};

/**
 * Common vitest/vite config file names checked for CTRF reporter configuration.
 */
const VITEST_CONFIG_NAMES = [
    'vitest.config.ts',
    'vitest.config.js',
    'vitest.config.mjs',
    'vite.config.ts',
    'vite.config.js',
];

/**
 * Pattern to detect CTRF reporter usage in a vitest/vite config file.
 * Matches:
 *   - VitestCtrfReporter
 *   - 'vitest-ctrf-json-reporter'
 *   - '@d2t/vitest-ctrf-json-reporter'
 *   - 'ctrf-json-reporter'
 *   - './shared/vitest-ctrf-reporter'
 */
const CTRF_REPORTER_PATTERN =
    /vitest[-@]?ctrf|@[\w-]+\/vitest-ctrf|ctrf-json|\.\/.*?ctrf.*?reporter|VitestCtrfReporter/i;

/**
 * Scans project root for a vitest/vite config file and checks if a CTRF reporter
 * is already configured. Returns true if found.
 */
export function detectConfigCtrf(projectRoot?: string): boolean {
    const dir = projectRoot || process.cwd();
    for (const name of VITEST_CONFIG_NAMES) {
        const configPath = path.join(dir, name);
        try {
            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf8');
                if (CTRF_REPORTER_PATTERN.test(content)) {
                    return true;
                }
            }
        } catch {
            continue;
        }
    }
    return false;
}

function detectFromPkg(pkg: Record<string, unknown>): Framework {
    const deps = {
        ...(pkg['dependencies'] as Record<string, string>),
        ...(pkg['devDependencies'] as Record<string, string>),
    };

    if (deps['cypress']) return 'cypress';
    if (deps['@playwright/test'] || deps['playwright']) return 'playwright';
    if (deps['jest']) return 'jest';
    if (deps['vitest']) return 'vitest';
    return 'generic';
}

/**
 * Detect framework and CTRF configuration from a project's package.json and config files.
 *
 * For vitest projects, checks if a CTRF reporter is already configured in vitest.config.ts/vite.config.ts.
 * If found, sets ctrfSource to 'config-file' and keeps the existing test command.
 * If not found, sets ctrfSource to 'missing' (the wizard will suggest installation).
 *
 * For other frameworks, defaults to 'cli-flag' (--reporter ctrf).
 */
export function detectFramework(packageJsonPath?: string): DetectionResult {
    try {
        const pkgPath = packageJsonPath || path.join(process.cwd(), 'package.json');
        const content = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(content) as Record<string, unknown>;
        const framework = detectFromPkg(pkg);
        const defaults = { ...Reflect.get(DEFAULTS, framework) };

        if (framework === 'vitest' || framework === 'generic') {
            const projectRoot = packageJsonPath ? path.dirname(packageJsonPath) : process.cwd();
            if (detectConfigCtrf(projectRoot)) {
                defaults.ctrfSource = 'config-file';
            }
        }

        return defaults;
    } catch {
        return { ...DEFAULTS.generic };
    }
}

export function extractRepoFromGit(): { owner: string; repo: string } {
    try {
        const gitConfig = fs.readFileSync(process.cwd() + '/.git/config', 'utf8');
        const match = /url\s*=\s*\S+(?:github\.com|gitlab\.com)[/:]([^/]+)\/([^/\s]+?)(?:\.git)?\s/.exec(gitConfig);
        if (match) {
            const owner = String(match[1] ?? '');
            const repo = String(match[2] ?? '');
            return { owner, repo: repo.replace(/\.git$/, '') };
        }
    } catch {
        // not a git repo or no remote
    }
    return { owner: '', repo: '' };
}
