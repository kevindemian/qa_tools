import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';

const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockAppendFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.stubEnv('OPENCODE_CONFIG_DIR', join(tmpdir(), 'vh-units-' + process.pid));

vi.mock('node:fs', async () => {
    const actual: typeof import('fs') = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        readFileSync: mockReadFileSync,
        existsSync: mockExistsSync,
        writeFileSync: mockWriteFileSync,
        appendFileSync: mockAppendFileSync,
        mkdirSync: mockMkdirSync,
    };
});

async function load() {
    return import('../validation-hook.js');
}

describe('Validation-hook — exported units', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockExistsSync.mockReturnValue(false);
        mockReadFileSync.mockImplementation((p: string) => {
            throw new Error('ENOENT: ' + String(p));
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    describe('ValidateCommandContent', () => {
        it('detects eslint-disable injected via sed (quoted)', async () => {
            expect.hasAssertions();

            const m = await load();
            const out = m.validateCommandContent("sed -i 's/valid/eslint-disable/g' src/app.ts");

            expect(out.join(' ')).toMatch(/eslint-disable/);
        });

        it('extracts sed replacement from unquoted expression', async () => {
            expect.hasAssertions();

            const m = await load();
            const out = m.validateCommandContent('sed -i s/valid/@ts-ignore/g src/app.ts');

            expect(out.join(' ')).toMatch(/ts-ignore/);
        });

        it('detects bare any-token in file write', async () => {
            expect.hasAssertions();

            const m = await load();
            const out = m.validateCommandContent('echo "const z: any = 9" > f.ts');

            expect(out.join(' ')).toMatch(/any/);
        });

        it('detects echo redirect file writes', async () => {
            expect.hasAssertions();

            const m = await load();
            const out = m.validateCommandContent('echo "const w: any = 5" > a.ts');

            expect(out.join(' ')).toMatch(/a\.ts/);
        });

        it('detects heredoc file writes', async () => {
            expect.hasAssertions();

            const m = await load();
            const out = m.validateCommandContent('cat > b.ts <<EOF\nconst q: any = 1\nEOF');

            expect(out.join(' ')).toMatch(/b\.ts/);
        });

        it('passes a benign command', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(m.validateCommandContent('ls -la src')).toStrictEqual([]);
        });
    });

    describe('FormatWarning', () => {
        it('renders a boxed warning', async () => {
            expect.hasAssertions();

            const m = await load();
            const w = {
                section: '§3',
                name: 'Forbidden Transformations',
                rulePreview: 'Workaround patterns detected',
                matchedText: 'use a workaround',
                snippet: '... use a workaround ...',
                charPos: 0,
            };
            const rendered = m.formatWarning(w);

            expect(rendered).toContain('WARNING');
            expect(rendered).toContain('Workaround patterns detected');
        });
    });

    describe('ScanForWarnings', () => {
        it('maps detectViolations into warnings', async () => {
            expect.hasAssertions();

            const m = await load();
            const ws = m.scanForWarnings('use a workaround to fix this');

            expect(ws.length).toBeGreaterThan(0);
            expect(ws[0]?.section).toBeDefined();
        });

        it('returns empty for empty input', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(m.scanForWarnings('')).toStrictEqual([]);
        });
    });

    describe('ValidatePath', () => {
        it('rejects path traversal', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('../../etc/passwd')).toThrow(/REJEITADO/);
        });

        it('rejects empty path', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('')).toThrow(/REJEITADO/);
        });

        it('rejects env-var expansions', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('${HOME}/x')).toThrow(/REJEITADO/);
        });

        it('accepts a safe relative path', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('src/app.ts')).not.toThrow();
        });
    });

    describe('ValidateEnvVars', () => {
        it('returns a warning list', async () => {
            expect.hasAssertions();

            const m = await load();
            const warnings = m.validateEnvVars();

            expect(Array.isArray(warnings)).toBeTruthy();
        });
    });

    describe('ValidateSoft / validateHard', () => {
        it('validateSoft does not throw on safe text', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validateSoft('Properly typed code is good.')).not.toThrow();
        });

        it('validateHard does not throw on safe text', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validateHard('Properly typed code is good.')).not.toThrow();
        });
    });

    describe('GetViolationStats', () => {
        it('returns zero stats when log absent', async () => {
            expect.hasAssertions();

            const m = await load();
            mockExistsSync.mockReturnValue(false);
            const stats = m.getViolationStats();

            expect(stats.count).toBe(0);
        });

        it('parses violation log lines when present', async () => {
            expect.hasAssertions();

            const m = await load();
            const line = JSON.stringify({
                timestamp: '2026-07-15T00:00:00Z',
                pattern: 'workaround',
                responsePreview: 'use a workaround',
                responseLength: 16,
            });
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(line + '\n');
            const stats = m.getViolationStats();

            expect(stats.count).toBe(1);
            expect(stats.recentViolations[0]?.pattern).toBe('workaround');
        });
    });

    describe('ClearValidationCache', () => {
        it('resets in-memory cache and writes empty cache file', async () => {
            expect.hasAssertions();

            const m = await load();
            mockExistsSync.mockReturnValue(true);
            m.clearValidationCache();

            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining('.validation_cache.json'),
                expect.any(String),
                'utf-8',
            );
        });
    });

    describe('RunCheck (diff scan)', () => {
        it('flags a suppressor in an added ts line', async () => {
            expect.hasAssertions();

            const m = await load();
            const diff =
                'diff --git a/src/app.ts b/src/app.ts\n' +
                '+++ b/src/app.ts\n' +
                '@@ -1,3 +1,3 @@\n' +
                '+const x: any = 1; // @ts-ignore\n';

            const result = m.runCheck(diff);

            expect(result.valid).toBeFalsy();
            expect(result.issues.length).toBeGreaterThan(0);
        });

        it('ignores docs/prose files (no validator)', async () => {
            expect.hasAssertions();

            const m = await load();
            const diff =
                'diff --git a/README.md b/README.md\n' +
                '+++ b/README.md\n' +
                '@@ -1,2 +1,2 @@\n' +
                '+This is prose mentioning `const x: any = 1` as example\n';

            const result = m.runCheck(diff);

            expect(result.valid).toBeTruthy();
            expect(result.issues).toStrictEqual([]);
        });

        it('validates python/go/rust added lines per language', async () => {
            expect.hasAssertions();

            const m = await load();
            const diff =
                'diff --git a/a.py b/a.py\n' +
                '+++ b/a.py\n' +
                '@@ -0,0 +1,1 @@\n' +
                '+x = 1  # noqa\n' +
                'diff --git a/b.go b/b.go\n' +
                '+++ b/b.go\n' +
                '@@ -0,0 +1,1 @@\n' +
                '+// nolint\n';

            const result = m.runCheck(diff);

            expect(result.issues.map((i) => i.error).join(' ')).toMatch(/noqa|nolint/);
        });

        it('returns valid for an empty diff', async () => {
            expect.hasAssertions();

            const m = await load();
            const result = m.runCheck('');

            expect(result.valid).toBeTruthy();
            expect(result.stats.linesValidated).toBe(0);
        });
    });

    describe('Plugin default export', () => {
        it('chat.message handler appends code warnings to flagged text parts', async () => {
            expect.hasAssertions();

            const m = await load();
            const plugin = await m.default();
            const chatHandler = plugin['chat.message'];
            const output = { message: 'x', parts: [{ type: 'text', text: '```ts\nconst a: any = 1;\n```' }] };

            await chatHandler({ sessionID: 's' }, output);

            expect(output.parts[0]?.text).toContain('CODE WARNING');
        });

        it('chat.message handler ignores non-text parts without throwing', async () => {
            expect.hasAssertions();

            const m = await load();
            const plugin = await m.default();
            const chatHandler = plugin['chat.message'];

            await expect(
                chatHandler({ sessionID: 's' }, { message: 'x', parts: [{ type: 'image' }] as never }),
            ).resolves.toBeUndefined();
        });

        it('tool.execute.before validates bash commands', async () => {
            expect.hasAssertions();

            const m = await load();
            const plugin = await m.default();
            const toolHandler = plugin['tool.execute.before'];

            await expect(
                toolHandler({ tool: 'bash', sessionID: 's', callID: 'c' }, { args: { command: 'ls -la' } }),
            ).resolves.toBeUndefined();
        });

        it('tool.execute.before validates write content and read paths', async () => {
            expect.hasAssertions();

            const m = await load();
            const plugin = await m.default();
            const toolHandler = plugin['tool.execute.before'];

            await toolHandler({ tool: 'write', sessionID: 's', callID: 'c' }, { args: { content: 'ok' } });

            await expect(
                toolHandler({ tool: 'read', sessionID: 's', callID: 'c' }, { args: { filePath: 'src/app.ts' } }),
            ).resolves.toBeUndefined();
        });
    });
});
