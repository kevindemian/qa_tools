import fs from 'fs';
import path from 'path';
import type { TestReportSource, Framework } from './context.js';
import { rootLogger } from '../shared/logger.js';
import { getErrorMessage } from '../shared/errors.js';

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
 * Pattern to detect reporter usage in a vitest/vite config file.
 * Matches CTRF, JUnit, and Mochawesome reporters.
 */
const REPORTER_PATTERNS = [
    /vitest[-@]?ctrf|@[\w-]+\/vitest-ctrf|ctrf-json|\.\/.*?ctrf.*?reporter|VitestCtrfReporter/i,
    /@d2t\/vitest-junit|vitest-junit-reporter|junit/i,
    /mochawesome/i,
];

/**
 * Scans project root for a vitest/vite config file and checks if a test reporter
 * is already configured. Returns true if found.
 */
export function detectTestReporter(projectRoot?: string): boolean {
    const dir = projectRoot || process.cwd();
    for (const name of VITEST_CONFIG_NAMES) {
        const configPath = path.join(dir, name);
        try {
            if (fs.existsSync(path.resolve(configPath))) {
                const content = fs.readFileSync(path.resolve(configPath), 'utf8');
                for (const pattern of REPORTER_PATTERNS) {
                    if (pattern.test(content)) {
                        return true;
                    }
                }
            }
        } catch (err) {
            rootLogger.debug('detectTestReporter: failed to read config, skipping: ' + getErrorMessage(err));
            continue;
        }
    }
    return false;
}

function detectFromPkg(pkg: { [key: string]: unknown }): Framework {
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
 * Detect framework and test reporter configuration from a project's package.json and config files.
 *
 * For vitest projects, checks if a reporter is already configured in vitest.config.ts/vite.config.ts.
 * If found, sets testReportSource to 'config-file' and keeps the existing test command.
 * If not found, sets testReportSource to 'missing' (the wizard will suggest installation).
 *
 * For other frameworks, defaults to 'cli-flag' (--reporter ctrf).
 */
export function detectFramework(packageJsonPath?: string): DetectionResult {
    try {
        const pkgPath = packageJsonPath || path.join(process.cwd(), 'package.json');
        const content = fs.readFileSync(path.resolve(pkgPath), 'utf8');
        const pkg = JSON.parse(content) as { [key: string]: unknown };
        const framework = detectFromPkg(pkg);
        const defaults = { ...Reflect.get(DEFAULTS, framework) };

        if (framework === 'vitest' || framework === 'generic') {
            const projectRoot = packageJsonPath ? path.dirname(packageJsonPath) : process.cwd();
            if (detectTestReporter(projectRoot)) {
                defaults.testReportSource = 'config-file';
            }
        }

        return defaults;
    } catch (err) {
        rootLogger.debug('detectFramework: fell back to generic defaults: ' + getErrorMessage(err));
        return { ...DEFAULTS.generic };
    }
}

export function extractRepoFromGit(): { owner: string; repo: string } {
    try {
        const gitConfig = fs.readFileSync(path.resolve(process.cwd()) + '/.git/config', 'utf8');
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
