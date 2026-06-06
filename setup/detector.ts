import fs from 'fs';
import type { Framework } from './context.js';

export interface DetectionResult {
    framework: Framework;
    testCmd: string;
    installCmd: string;
    ctrfReportPath: string;
    nodeVersion: string;
}

const DEFAULTS: Record<Framework, DetectionResult> = {
    cypress: {
        framework: 'cypress',
        testCmd: 'npx cypress run --reporter ctrf',
        installCmd: 'npm ci',
        ctrfReportPath: 'cypress/reports/ctrf-report.json',
        nodeVersion: '20',
    },
    playwright: {
        framework: 'playwright',
        testCmd: 'npx playwright test --reporter ctrf',
        installCmd: 'npm ci && npx playwright install --with-deps',
        ctrfReportPath: 'playwright-report/ctrf-report.json',
        nodeVersion: '20',
    },
    jest: {
        framework: 'jest',
        testCmd: 'npx jest --reporter ctrf',
        installCmd: 'npm ci',
        ctrfReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
    },
    vitest: {
        framework: 'vitest',
        testCmd: 'npx vitest run --reporter ctrf',
        installCmd: 'npm ci',
        ctrfReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
    },
    generic: {
        framework: 'generic',
        testCmd: 'npm test',
        installCmd: 'npm ci',
        ctrfReportPath: 'reports/ctrf-report.json',
        nodeVersion: '20',
    },
};

function detectFromPkg(pkg: Record<string, unknown>): Framework {
    const deps = {
        ...((pkg.dependencies as Record<string, string>) || {}),
        ...((pkg.devDependencies as Record<string, string>) || {}),
    };

    if (deps.cypress) return 'cypress';
    if (deps['@playwright/test'] || deps.playwright) return 'playwright';
    if (deps.jest) return 'jest';
    if (deps.vitest) return 'vitest';
    return 'generic';
}

export function detectFramework(packageJsonPath?: string): DetectionResult {
    try {
        const pkgPath = packageJsonPath || process.cwd() + '/package.json';
        const content = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(content) as Record<string, unknown>;
        const framework = detectFromPkg(pkg);
        return { ...DEFAULTS[framework] };
    } catch {
        return { ...DEFAULTS.generic };
    }
}

export function extractRepoFromGit(): { owner: string; repo: string } {
    try {
        const gitConfig = fs.readFileSync(process.cwd() + '/.git/config', 'utf8');
        const match = gitConfig.match(/url\s*=\s*.*?(?:github\.com|gitlab\.com)[/:]([^/]+)\/([^/\s]+?)(?:\.git)?\s/);
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
