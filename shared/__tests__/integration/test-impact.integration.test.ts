/**
 * Integration Tests — Test Impact (FT-35)
 *
 * FT-35c: vitest list --changed --filesOnly (real vitest)
 * FT-35b: generateTestSelectionJson (pure function)
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { rootLogger } from '../../logger.js';
import type { TestImpactResult } from '../../types/coverage.js';
import { generateTestSelectionJson } from '../../quality/test-impact.js';

const GIT_BIN = '/usr/bin/git';
let TEST_DIR: string;

function git(...args: string[]): string {
    return execFileSync(GIT_BIN, args, { cwd: TEST_DIR, encoding: 'utf-8' }).trim();
}

function writeFile(name: string, content: string): void {
    fs.writeFileSync(path.join(TEST_DIR, name), content, 'utf-8');
}

function setupVitestRepo(): void {
    TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-integration-test-impact-'));
    git('init');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'Test');
}

function teardownRepo(): void {
    try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (err) {
        rootLogger.warn(`cleanup: failed to remove ${TEST_DIR}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

const VITEST_BIN = path.resolve(process.cwd(), 'node_modules/.bin/vitest');
const NODE_MODULES = path.resolve(process.cwd(), 'node_modules');

const SOURCE_A = 'export const login = () => { return; };\n';
const SOURCE_A_MODIFIED = 'export const login = () => { return true; };\n';
const TEST_A = [
    "import { describe, it, expect } from 'vitest';",
    "import { login } from './login';",
    "describe('login', () => it('works', () => expect(login).toBeDefined()));",
    '',
].join('\n');

const SOURCE_B = 'export const auth = () => { return; };\n';
const SOURCE_B_MODIFIED = 'export const auth = () => { return true; };\n';
const TEST_B = [
    "import { describe, it, expect } from 'vitest';",
    "import { auth } from './auth';",
    "describe('auth', () => it('works', () => expect(auth).toBeDefined()));",
    '',
].join('\n');

describe('Integration: Test Impact (FT-35)', () => {
    describe('FT-35c: vitest list --changed (real vitest)', () => {
        beforeEach(setupVitestRepo);

        afterEach(teardownRepo);

        it('lists test files affected by source changes', () => {
            expect.hasAssertions();

            writeFile('login.ts', SOURCE_A);
            writeFile('login.test.ts', TEST_A);
            git('add', '-A');
            git('commit', '-m', 'initial');

            writeFile('login.ts', SOURCE_A_MODIFIED);
            const diffOut = git('diff', '--name-only');

            expect(diffOut).toContain('login.ts');

            const output = execFileSync(VITEST_BIN, ['list', '--changed', '--filesOnly'], {
                cwd: TEST_DIR,
                encoding: 'utf8',
                env: { ...process.env, NODE_PATH: NODE_MODULES },
            });
            const files = output
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);

            expect(files.length).toBeGreaterThan(0);
            expect(files).toContain('login.test.ts');
        });

        it('outputs clean file paths without pass/fail markers', () => {
            expect.hasAssertions();

            writeFile('auth.ts', SOURCE_B);
            writeFile('auth.test.ts', TEST_B);
            git('add', '-A');
            git('commit', '-m', 'initial');

            writeFile('auth.ts', SOURCE_B_MODIFIED);

            const output = execFileSync(VITEST_BIN, ['list', '--changed', '--filesOnly'], {
                cwd: TEST_DIR,
                encoding: 'utf8',
                env: { ...process.env, NODE_PATH: NODE_MODULES },
            });
            const lines = output.trim().split('\n');

            for (const line of lines) {
                expect(line).toMatch(/\.test\.ts$/);
                expect(line).not.toContain('\u2713');
                expect(line).not.toContain('\u2717');
            }
        });
    });

    describe('FT-35b: generateTestSelectionJson', () => {
        it('produces serialisable output from analysis result', () => {
            expect.hasAssertions();

            const result: TestImpactResult = {
                changedFiles: ['src/login.ts'],
                impactedTests: [
                    {
                        title: 'Login flow',
                        testKey: 'LOGIN-001',
                        reason: 'mapping match: src/login.ts',
                        matchMode: 'mapping',
                        filePattern: 'src/login.ts',
                    },
                ],
                unaffected: { total: 0, skippedDueTo: [] },
                suggestedCommand: 'npx vitest related --run',
                confidence: 'high',
            };

            const json = generateTestSelectionJson(result);

            expect(json.changedFiles).toStrictEqual(['src/login.ts']);
            expect(json.impactedTests).toHaveLength(1);
            expect(json.impactedTests[0]?.title).toBe('Login flow');
            expect(json.impactedTests[0]?.testKey).toBe('LOGIN-001');
            expect(json.confidence).toBe('high');
            expect(json.conservative).toBeFalsy();
            expect(json.generatedAt).toBeTruthy();
            expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json);
        });
    });
});
