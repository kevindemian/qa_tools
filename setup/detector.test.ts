import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { detectFramework, detectTestReporter, extractRepoFromGit } from './detector.js';

const created: string[] = [];
function makeProject(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-det-'));
    created.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
}
function pkg(deps: Record<string, string>): string {
    return JSON.stringify({ devDependencies: deps }, null, 2);
}

describe('Detector', () => {
    afterEach(() => {
        for (const d of created.splice(0)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    });

    describe('DetectFramework — framework by deps', () => {
        it('detects cypress', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ cypress: '^13.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.framework).toBe('cypress');
        });

        it('detects playwright', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ '@playwright/test': '^1.40' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.framework).toBe('playwright');
        });

        it('detects jest', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ jest: '^29.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.framework).toBe('jest');
        });

        it('detects vitest', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ vitest: '^1.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.framework).toBe('vitest');
        });

        it('falls back to generic', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ eslint: '^8.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.framework).toBe('generic');
        });
    });

    describe('DetectTestReporter — all frameworks', () => {
        it('vitest + CTRF via config', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ vitest: '^1.0' }),
                'vitest.config.ts': `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { reporters: ['default', 'ctrf-json-reporter'] } });`,
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });

        it('jest + JUnit via config', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ jest: '^29.0' }),
                'jest.config.js': `module.exports = { reporters: ['default', ['jest-junit', {}]] };`,
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });

        it('cypress + CTRF via config', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ cypress: '^13.0' }),
                'cypress.config.ts': `import { defineConfig } from 'cypress';
export default defineConfig({ reporter: 'ctrf-json-reporter' });`,
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });

        it('playwright + CTRF via config', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ '@playwright/test': '^1.40' }),
                'playwright.config.ts': `import { defineConfig } from '@playwright/test';
export default defineConfig({ reporter: [['ctrf', {}]] });`,
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });

        it('returns false when no config exists', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ vitest: '^1.0' }) });

            await expect(detectTestReporter(root)).resolves.toBeFalsy();
        });

        it('returns false when config has no reporter', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ vitest: '^1.0' }),
                'vitest.config.ts': `export default { test: { reporters: ['default'] } };`,
            });

            await expect(detectTestReporter(root)).resolves.toBeFalsy();
        });

        it('no false positive from a comment/string mentioning ctrf', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ vitest: '^1.0' }),
                'vitest.config.ts': `// configure ctrf reporter later
const note = 'we will add ctrf reporter soon';
export default { test: { reporters: ['default'] } };`,
            });

            await expect(detectTestReporter(root)).resolves.toBeFalsy();
        });
    });

    describe('DetectTestReporter — package.json inline', () => {
        it('detects reporter dependency in devDependencies', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': JSON.stringify({ devDependencies: { vitest: '^1.0', 'ctrf-json-reporter': '^1.0' } }),
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });

        it('detects jest.reporters inline block', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': JSON.stringify({
                    devDependencies: { jest: '^29.0' },
                    jest: { reporters: ['jest-junit'] },
                }),
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });

        it('detects vitest.test.reporters inline block', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': JSON.stringify({
                    devDependencies: { vitest: '^1.0' },
                    vitest: { test: { reporters: ['ctrf'] } },
                }),
            });

            await expect(detectTestReporter(root)).resolves.toBeTruthy();
        });
    });

    describe('DetectFramework — testReportSource', () => {
        it('cypress => cli-flag', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ cypress: '^13.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.testReportSource).toBe('cli-flag');
        });

        it('vitest with reporter in config => config-file', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': pkg({ vitest: '^1.0' }),
                'vitest.config.ts': `export default { test: { reporters: ['ctrf'] } };`,
            });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.testReportSource).toBe('config-file');
        });

        it('vitest without reporter => missing', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ vitest: '^1.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.testReportSource).toBe('missing');
        });

        it('vitest testCmd does not include --reporter ctrf', async () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ vitest: '^1.0' }) });
            const r = await detectFramework(path.join(root, 'package.json'));

            expect(r.testCmd).toBe('npx vitest run');
        });
    });

    describe('ExtractRepoFromGit', () => {
        it('extracts GitHub owner and repo from a real .git/config', () => {
            expect.hasAssertions();

            const root = makeProject({
                '.git/config': `[remote "origin"]
\turl = git@github.com:myorg/my-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`,
            });
            const result = extractRepoFromGit(root);

            expect(result.owner).toBe('myorg');
            expect(result.repo).toBe('my-repo');
        });

        it('extracts GitLab owner and repo', () => {
            expect.hasAssertions();

            const root = makeProject({
                '.git/config': `[remote "origin"]
\turl = https://gitlab.com/myorg/my-repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`,
            });
            const result = extractRepoFromGit(root);

            expect(result.owner).toBe('myorg');
            expect(result.repo).toBe('my-repo');
        });

        it('returns empty when not a git repo', () => {
            expect.hasAssertions();

            const root = makeProject({ 'package.json': pkg({ vitest: '^1.0' }) });
            const result = extractRepoFromGit(root);

            expect(result.owner).toBe('');
            expect(result.repo).toBe('');
        });
    });
});
