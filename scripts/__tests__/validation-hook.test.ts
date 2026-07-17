import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';

const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockAppendFileSync = vi.fn();
const mockMkdirSync = vi.fn();

vi.stubEnv('OPENCODE_CONFIG_DIR', join(tmpdir(), 'vh-test-config-' + process.pid));

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

describe('Validation-hook', () => {
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

    describe('ValidateResponse', () => {
        it('rejects empty response', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(() => m.validateResponse('')).toThrow(/vazia|inválida/);
            expect(() => m.validateResponse(undefined as unknown as string)).toThrow('RESPOSTA REJEITADA');
        });

        it('passes safe response', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(m.validateResponse('Always validate user input properly.')).toBeTruthy();
        });

        it('blocks workaround proposition', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(() => m.validateResponse('use a workaround to fix this')).toThrow(/REJEITADA/);
        });

        it('allows corrective-context workaround mention', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(m.validateResponse('remove the existing workaround in auth.ts')).toBeTruthy();
        });

        it('caches rejection so repeated call throws from cache', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            let first = '';
            try {
                m.validateResponse('just bypass the check for now');
            } catch (e) {
                first = (e as Error).message;
            }

            expect(first).toContain('REJEITADA');

            let second = '';
            try {
                m.validateResponse('just bypass the check for now');
            } catch (e) {
                second = (e as Error).message;
            }

            expect(second).toContain('cache');
        });
    });

    describe('SanitizeAndReject / validateWithReview', () => {
        it('returns valid result for safe text', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const r = m.sanitizeAndReject('Properly typed code is good.');

            expect(r.valid).toBeTruthy();
            expect(r.response).toBeDefined();
        });

        it('returns invalid result with error for blocked text', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const r = m.sanitizeAndReject('add @ts-ignore to silence the error');

            expect(r.valid).toBeFalsy();
            expect(r.error).toBeDefined();
        });
    });

    describe('ValidateCommand / validateCommandContent', () => {
        it('throws for command injecting eslint-disable via sed', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(() => m.validateCommand("sed -i 's/valid/eslint-disable/g' src/app.ts")).toThrow(/bloqueado/);
        });

        it('passes a benign command', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(() => m.validateCommand('ls -la src')).not.toThrow();
        });

        it('detects file write with dangerous content', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const v = m.validateCommandContent('echo "const x: any = 1" > src/a.ts');

            expect(v.length).toBeGreaterThan(0);
        });

        it('splits multi-command by separators', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const v = m.validateCommandContent('echo ok > a.ts && echo "const y: any = 2" > b.ts');

            expect(v.length).toBeGreaterThan(0);
        });
    });

    describe('DetectViolations', () => {
        it('detects multiple categories', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const v = m.detectViolations('use a workaround and just bypass the check and add @ts-ignore');
            const cats = v.map((x) => x.category);

            expect(cats).toContain('workaround');
            expect(cats).toContain('bypass');
            expect(cats).toContain('ts_suppressor');
        });

        it('returns empty for non-string / empty input', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(m.detectViolations('')).toStrictEqual([]);
            expect(m.detectViolations(undefined as unknown as string)).toStrictEqual([]);
        });

        it('detects dangerous code density in blocks', async () => {
            expect.hasAssertions();

            const m = await load();
            const block = '```ts\n' + Array.from({ length: 6 }, () => 'const a: any = 1;').join('\n') + '\n```';
            const v = m.detectViolations(block);

            expect(v.some((x) => x.category === 'code_density')).toBeTruthy();
        });

        it('detects mock factory violations', async () => {
            expect.hasAssertions();

            const m = await load();
            const v = m.detectViolations('jest.doMock("x");');

            expect(v.some((x) => x.category === 'mock_factory')).toBeTruthy();
        });

        it('detects per-language code block suppressors', async () => {
            expect.hasAssertions();

            const m = await load();
            const texts = [
                '```python\n# type: ignore\n```',
                '```go\n// nolint\n```',
                '```rust\n#![allow(dead_code)]\n```',
                '```java\n@SuppressWarnings("x")\n```',
                '```cpp\n// NOLINTNEXTLINE\n```',
                '```sh\n# shellcheck disable=SC2002\n```',
            ];
            for (const t of texts) {
                const v = m.detectViolations(t);

                expect(v.length).toBeGreaterThan(0);
            }
        });
    });

    describe('ScanForWarnings / formatWarning', () => {
        it('maps violations to warnings', async () => {
            expect.hasAssertions();

            const m = await load();
            const w = m.scanForWarnings('use a workaround to ship it');

            expect(w.length).toBeGreaterThan(0);
            expect(w[0]?.section).toBeDefined();

            const formatted = m.formatWarning(w[0] as NonNullable<(typeof w)[number]>);

            expect(formatted).toContain('WARNING');
        });

        it('returns empty for empty input', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(m.scanForWarnings('')).toStrictEqual([]);
        });
    });

    describe('ValidatePath', () => {
        it('throws for empty path', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('')).toThrow(/vazio/);
        });

        it('throws for dangerous path patterns', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('../../etc/passwd')).toThrow(/perigoso/);
            expect(() => m.validatePath('/etc/passwd')).toThrow(/perigoso/);
        });

        it('accepts a safe path', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validatePath('src/app/valid-name.ts')).not.toThrow();
        });
    });

    describe('ValidateSoft / validateHard', () => {
        it('does not throw for safe text', async () => {
            expect.hasAssertions();

            const m = await load();

            expect(() => m.validateSoft('nothing dangerous here')).not.toThrow();
            expect(() => m.validateHard('nothing dangerous here')).not.toThrow();
        });

        it('validateHard rejects blocked text (validates response)', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();

            expect(() => m.validateHard('use a workaround now')).toThrow(/REJEITADA/);
        });
    });

    describe('GetViolationStats', () => {
        it('returns zero when no log file exists', async () => {
            expect.hasAssertions();

            const m = await load();
            mockExistsSync.mockImplementation((p: string) => !String(p).includes('violations'));
            const s = m.getViolationStats();

            expect(s.count).toBe(0);
            expect(s.recentViolations).toStrictEqual([]);
        });

        it('parses existing violation log lines', async () => {
            expect.hasAssertions();

            const m = await load();
            const line = JSON.stringify({
                timestamp: '2026-01-01T00:00:00Z',
                pattern: 'x',
                responsePreview: 'p',
                responseLength: 3,
            });
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockImplementation((p: string) => {
                if (String(p).includes('security_violations')) return line + '\n';
                throw new Error('ENOENT');
            });
            const s = m.getViolationStats();

            expect(s.count).toBe(1);
            expect(s.recentViolations[0]?.pattern).toBe('x');
        });
    });

    describe('ValidateEnvVars', () => {
        it('warns when OPENCODE_CONFIG_DIR is unset', async () => {
            expect.hasAssertions();

            const m = await load();
            delete process.env['OPENCODE_CONFIG_DIR'];
            const w = m.validateEnvVars();

            expect(w.some((x) => x.includes('OPENCODE_CONFIG_DIR'))).toBeTruthy();
        });

        it('warns on non-numeric timeout env', async () => {
            expect.hasAssertions();

            const m = await load();
            vi.stubEnv('OPENCODE_CONFIG_DIR', join(tmpdir(), 'vh-test-config-2'));
            vi.stubEnv('VALIDATION_TIMEOUT_MS', 'abc');
            const w = m.validateEnvVars();

            expect(w.some((x) => x.includes('VALIDATION_TIMEOUT_MS'))).toBeTruthy();
        });
    });

    describe('Default plugin export', () => {
        it('validates bash tool commands on tool.execute.before', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const plugin = await (m as unknown as { default: () => Promise<Record<string, unknown>> }).default();
            const handler = plugin['tool.execute.before'] as (
                i: { tool: string },
                o: { args?: { command?: string } },
            ) => Promise<void> | void;

            expect(() => handler({ tool: 'bash' }, { args: { command: 'ls -la src' } })).not.toThrow();
        });

        it('validates write tool content', async () => {
            expect.hasAssertions();

            const m = await load();
            m.clearValidationCache();
            const plugin = await (m as unknown as { default: () => Promise<Record<string, unknown>> }).default();
            const handler = plugin['tool.execute.before'] as (
                i: { tool: string },
                o: { args?: { content?: string } },
            ) => Promise<void> | void;

            expect(() => handler({ tool: 'write' }, { args: { content: 'const z = 1;' } })).not.toThrow();
        });

        it('validates path on read tool', async () => {
            expect.hasAssertions();

            const m = await load();
            const plugin = await (m as unknown as { default: () => Promise<Record<string, unknown>> }).default();
            const handler = plugin['tool.execute.before'] as (
                i: { tool: string },
                o: { args?: { filePath?: string } },
            ) => Promise<void> | void;

            expect(() => handler({ tool: 'read' }, { args: { filePath: 'README.md' } })).not.toThrow();
        });

        it('injects code warnings into chat.message parts', async () => {
            expect.hasAssertions();

            const m = await load();
            const plugin = await (m as unknown as { default: () => Promise<Record<string, unknown>> }).default();
            const handler = plugin['chat.message'] as (
                _i: unknown,
                o: { parts: Array<{ type?: string; text?: string }> },
            ) => Promise<void> | void;
            const part = { type: 'text', text: '```ts\nconst q: any = 1;\n```' };
            await handler({}, { parts: [part] });

            expect(part.text).toContain('CODE WARNING');
        });
    });
});
