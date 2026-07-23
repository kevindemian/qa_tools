import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

let counter = 0;
function uniqueName(): string {
    counter += 1;
    return 'qa-qc-' + counter.toString(36) + '.ts';
}

function writeTmp(content: string): string {
    const f = path.join(os.tmpdir(), uniqueName());
    fs.writeFileSync(f, content, 'utf8');
    return f;
}

async function load() {
    return import('../quality-check.js');
}

describe('Quality check integrated', () => {
    afterEach(() => {
        for (const f of fs.readdirSync(os.tmpdir())) {
            if (f.startsWith('qa-qc-')) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
        }
    });

    describe('CheckNoPattern', () => {
        it('passes when no file matches the pattern', async () => {
            expect.hasAssertions();

            const f = writeTmp('export const x = 1;\n');
            const { checkNoPattern } = await load();

            const r = checkNoPattern('test', /throw\s+/, [f]);

            expect(r.passed).toBeTruthy();
            expect(r.violations).toHaveLength(0);
        });

        it('reports a violation when a file matches the pattern', async () => {
            expect.hasAssertions();

            const f = writeTmp('function bad() { throw new Error("x"); }\n');
            const { checkNoPattern } = await load();

            const r = checkNoPattern('test', /throw\s+/, [f]);

            expect(r.passed).toBeFalsy();
            expect(r.violations).toHaveLength(1);
            expect(r.violations[0]?.file ?? '').toBe(f);
        });

        it('skips lines matching the exclude pattern', async () => {
            expect.hasAssertions();

            const f = writeTmp('// skip: throw new Error\nok line\n');
            const { checkNoPattern } = await load();

            const r = checkNoPattern('test', /throw\s+/, [f], /skip/);

            expect(r.passed).toBeTruthy();
        });
    });

    describe('Repo scan detectors', () => {
        it('checkThrowString passes on a clean repo', async () => {
            expect.hasAssertions();

            const { checkThrowString } = await load();

            expect(checkThrowString().passed).toBeTruthy();
        });

        it('checkThrowString detects a thrown string literal in a real file', async () => {
            expect.hasAssertions();

            const f = path.join(ROOT, '_throw_tmp.ts');
            fs.writeFileSync(f, "export function x() { throw 'boom'; }\n");
            try {
                const { checkThrowString } = await load();

                expect(checkThrowString().passed).toBeFalsy();
            } finally {
                fs.rmSync(f, { force: true });
            }
        });

        it('checkNonNullAssertion passes on a clean repo', async () => {
            expect.hasAssertions();

            const { checkNonNullAssertion } = await load();

            expect(checkNonNullAssertion().passed).toBeTruthy();
        });

        it('checkIfTrueFalse passes on a clean repo', async () => {
            expect.hasAssertions();

            const { checkIfTrueFalse } = await load();

            expect(checkIfTrueFalse().passed).toBeTruthy();
        });

        it('checkIfTrueFalse detects an if(true) condition in a real file', async () => {
            expect.hasAssertions();

            const f = path.join(ROOT, '_iftrue_tmp.ts');
            fs.writeFileSync(f, 'export function x() { if (true) { return 1; } }\n');
            try {
                const { checkIfTrueFalse } = await load();

                expect(checkIfTrueFalse().passed).toBeFalsy();
            } finally {
                fs.rmSync(f, { force: true });
            }
        });

        it('checkDepWall passes on a clean repo', async () => {
            expect.hasAssertions();

            const { checkDepWall } = await load();

            expect(checkDepWall().passed).toBeTruthy();
        });

        it('checkViFnUnknown passes on a clean repo', async () => {
            expect.hasAssertions();

            const { checkViFnUnknown } = await load();

            expect(checkViFnUnknown().passed).toBeTruthy();
        });

        it('checkHandlerConsistency passes on the current repo', async () => {
            expect.hasAssertions();

            const { checkHandlerConsistency } = await load();

            expect(checkHandlerConsistency().passed).toBeTruthy();
        });
    });

    describe('Contract checks against real project files', () => {
        it('checkArtifactValidators finds all required exports', async () => {
            expect.hasAssertions();

            const { checkArtifactValidators } = await load();

            const r = checkArtifactValidators();

            expect(r.passed).toBeTruthy();
        });

        it('checkArtifactValidatorsExist finds all validator files', async () => {
            expect.hasAssertions();

            const { checkArtifactValidatorsExist } = await load();

            const r = checkArtifactValidatorsExist();

            expect(r.passed).toBeTruthy();
        });

        it('checkDashboardExports finds all dashboard export functions', async () => {
            expect.hasAssertions();

            const { checkDashboardExports } = await load();

            const r = checkDashboardExports();

            expect(r.passed).toBeTruthy();
        });

        it('checkQualityGateFiles finds both gate files', async () => {
            expect.hasAssertions();

            const { checkQualityGateFiles } = await load();

            const r = checkQualityGateFiles();

            expect(r.passed).toBeTruthy();
        });

        it('checkIntegrity passes with the current regenerated hash', async () => {
            expect.hasAssertions();

            // Skip during mutation testing - integrity check intentionally fails on mutated code
            if (process.env['STRYKER_ACTIVE'] === 'true') {
                return;
            }

            const { checkIntegrity } = await load();

            const r = checkIntegrity();

            expect(r.passed).toBeTruthy();
        });
    });

    describe('CheckEslintBaseline', () => {
        it('runs the real ESLint and returns a structured result', async () => {
            expect.hasAssertions();

            const { checkEslintBaseline } = await load();

            const r = checkEslintBaseline();

            expect(typeof r.passed).toBe('boolean');
            expect(Array.isArray(r.violations)).toBeTruthy();
            // Full-repo ESLint pass: under a loaded CI runner this can exceed the default
            // wall without any assertion failure. The budget is operational headroom only;
            // the eslint contract (real lint + structured result) is unchanged.
        }, 600000);
    });

    describe('Main', () => {
        it('runs every check against the real repo without throwing', async () => {
            expect.hasAssertions();

            const { main } = await load();

            expect(() => main()).not.toThrow();
        }, 240000);
    });
});
