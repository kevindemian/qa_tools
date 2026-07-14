import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { detectFramework } from './detector.js';
import { generateCIWorkflow } from './templates/github-ci.js';
import type { SetupContext } from './context.js';
import type { DetectionResult } from './detector.js';

const created: string[] = [];
function makeProject(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-int-'));
    created.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
    }
    return dir;
}

function buildContext(detection: DetectionResult, root: string): SetupContext {
    return {
        projectName: 'demo',
        framework: detection.framework,
        testReportPath: detection.testReportPath,
        artifactName: 'test-report',
        testReportSource: detection.testReportSource,
        nodeVersion: detection.nodeVersion,
        installCmd: detection.installCmd,
        testCmd: detection.testCmd,
        gitProvider: 'github',
        repoOwner: 'owner',
        repoName: 'repo',
        workflowDir: path.join(root, '.github', 'workflows'),
        features: {
            qualityGate: false,
            flakinessDashboard: false,
            aiFailureAnalysis: false,
            prePushHook: false,
            prReport: true,
            prReportPublishTarget: 'comment',
        },
    };
}

describe('Integration — detection drives CI reporter config', () => {
    afterEach(() => {
        for (const d of created.splice(0)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    });

    describe('Vitest + CTRF', () => {
        it('config-file source flows the CTRF report path into the generated CI', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': JSON.stringify({ devDependencies: { vitest: '^1.0' } }),
                'vitest.config.ts': `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { reporters: ['default', 'ctrf-json-reporter'] } });`,
            });

            const detection = await detectFramework(path.join(root, 'package.json'));

            expect(detection.framework).toBe('vitest');
            expect(detection.testReportSource).toBe('config-file');

            const ci = generateCIWorkflow(buildContext(detection, root));

            expect(ci).toContain('reports/ctrf-report.json');
        });
    });

    describe('Cypress + CTRF', () => {
        it('config-file source flows the --reporter ctrf flag and CTRF path into CI', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': JSON.stringify({ devDependencies: { cypress: '^13.0' } }),
                'cypress.config.ts': `import { defineConfig } from 'cypress';
export default defineConfig({ reporter: 'ctrf-json-reporter' });`,
            });

            const detection = await detectFramework(path.join(root, 'package.json'));

            expect(detection.framework).toBe('cypress');
            expect(detection.testReportSource).toBe('config-file');

            const ci = generateCIWorkflow(buildContext(detection, root));

            expect(ci).toContain('--reporter ctrf');
            expect(ci).toContain('cypress/reports/ctrf-report.json');
        });
    });

    describe('Vitest without reporter', () => {
        it('missing source yields config-file==missing and no injected reporter in CI', async () => {
            expect.hasAssertions();

            const root = makeProject({
                'package.json': JSON.stringify({ devDependencies: { vitest: '^1.0' } }),
                'vitest.config.ts': `export default { test: { reporters: ['default'] } };`,
            });

            const detection = await detectFramework(path.join(root, 'package.json'));

            expect(detection.testReportSource).toBe('missing');

            const ci = generateCIWorkflow(buildContext(detection, root));

            expect(ci).not.toContain('ctrf-json-reporter');
        });
    });
});
