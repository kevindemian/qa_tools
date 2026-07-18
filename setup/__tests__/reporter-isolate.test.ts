import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { describe, it, expect, afterEach } from 'vitest';
import { executeConfigInIsolate } from '../reporter-isolate.js';

const created: string[] = [];

describe('ExecuteConfigInIsolate', () => {
    afterEach(() => {
        for (const d of created.splice(0)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    });

    describe('Reporter extraction (primary path)', () => {
        it('extracts CTRF reporter from vitest.config.ts', async () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { reporters: ['default', 'ctrf-json-reporter'] } });`;
            const reporters = await executeConfigInIsolate('vitest.config.ts', src);

            expect(reporters).toContain('ctrf-json-reporter');
        });

        it('extracts JUnit reporter from jest.config.js', async () => {
            expect.hasAssertions();

            const src = `module.exports = { reporters: ['default', ['jest-junit', {}]] };`;
            const reporters = await executeConfigInIsolate('jest.config.js', src);

            expect(reporters).toContain('jest-junit');
        });

        it('extracts reporter from cypress.config.ts (singular reporter)', async () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from 'cypress';
export default defineConfig({ reporter: 'ctrf-json-reporter' });`;
            const reporters = await executeConfigInIsolate('cypress.config.ts', src);

            expect(reporters).toContain('ctrf-json-reporter');
        });

        it('extracts reporter from playwright.config.ts (array reporter)', async () => {
            expect.hasAssertions();

            const src = `import { defineConfig } from '@playwright/test';
export default defineConfig({ reporter: [['ctrf', {}], ['list']] });`;
            const reporters = await executeConfigInIsolate('playwright.config.ts', src);

            expect(reporters).toContain('ctrf');
        });

        it('handles CommonJS JSON config', async () => {
            expect.hasAssertions();

            const src = `{ "reporters": ["ctrf"] }`;
            const reporters = await executeConfigInIsolate('vitest.config.json', src);

            expect(reporters).toContain('ctrf');
        });
    });

    describe('Security: host is never reachable', () => {
        it('does NOT terminate the host process on process.exit()', async () => {
            expect.hasAssertions();

            const aliveBefore = process.pid;

            await expect(executeConfigInIsolate('evil.ts', `process.exit(1);`)).rejects.toThrow(/./);
            expect(process.pid).toBe(aliveBefore);
        });

        it('cannot read host files via require("fs")', async () => {
            expect.hasAssertions();

            const leak = path.join(os.tmpdir(), `qa_leaked_${randomUUID()}.txt`);

            await expect(
                executeConfigInIsolate(
                    'evil.ts',
                    `const fs = require('fs'); fs.readFileSync(${JSON.stringify('/etc/passwd')});`,
                ),
            ).rejects.toThrow(/./);
            expect(fs.existsSync(leak)).toBeFalsy();
        });

        it('cannot spawn host processes via require("child_process")', async () => {
            expect.hasAssertions();

            const leak = path.join(os.tmpdir(), `qa_leaked_exec_${randomUUID()}.txt`);

            await expect(
                executeConfigInIsolate(
                    'evil.ts',
                    `const cp = require('child_process'); cp.exec(${JSON.stringify('touch ' + leak)});`,
                ),
            ).rejects.toThrow(/./);
            expect(fs.existsSync(leak)).toBeFalsy();
        });

        it('cannot reach the network via fetch', async () => {
            expect.hasAssertions();
            await expect(executeConfigInIsolate('evil.ts', `fetch('https://example.com/secret');`)).rejects.toThrow(
                /./,
            );
        });
    });
});
