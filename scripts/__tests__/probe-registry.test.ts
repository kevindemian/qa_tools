import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('node:fs', () => ({
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
}));

const VALID_REGISTRY = {
    version: 2,
    updated: '2026-06-12',
    providers: {
        openai: [
            {
                id: 'gpt-4o',
                context: 128000,
                costPer1kPrompt: 0.0025,
                costPer1kCompletion: 0.01,
                tiers: ['main', 'report'],
            },
            {
                id: 'gpt-4o-mini',
                context: 128000,
                costPer1kPrompt: 0.00015,
                costPer1kCompletion: 0.0006,
                tiers: ['fast', 'batch'],
            },
        ],
    },
};

function mockRegistryFetch(): void {
    mockReadFileSync.mockReturnValue(JSON.stringify(VALID_REGISTRY));
}

describe('Probe-registry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());
    });

    describe('DiffModels', () => {
        it('detects added models', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const discovered = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
                { id: 'gpt-5', context: 256000, costPer1kPrompt: 0.005, costPer1kCompletion: 0.02, tiers: [] },
            ];
            const existing = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const diff = mod.diffModels(discovered, existing, 'openai');

            expect(diff.provider).toBe('openai');
            expect(diff.added).toHaveLength(1);
            expect(diff.removed).toHaveLength(0);
            expect(diff.added[0]?.model).toBe('gpt-5');
        });

        it('detects removed models', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const discovered = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const existing = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
                { id: 'gpt-3.5-turbo', context: 16385, costPer1kPrompt: 0.001, costPer1kCompletion: 0.002, tiers: [] },
            ];
            const diff = mod.diffModels(discovered, existing, 'openai');

            expect(diff.removed).toHaveLength(1);
            expect(diff.removed[0]?.model).toBe('gpt-3.5-turbo');
        });

        it('detects context changes', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const discovered = [
                { id: 'gpt-4o', context: 256000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const existing = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const diff = mod.diffModels(discovered, existing, 'openai');

            expect(diff.changed).toHaveLength(1);
            expect(diff.changed[0]?.field).toBe('context');
            expect(diff.changed[0]?.old).toBe(128000);
            expect(diff.changed[0]?.new).toBe(256000);
        });

        it('detects cost changes', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const discovered = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.003, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const existing = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const diff = mod.diffModels(discovered, existing, 'openai');
            const costChanges = diff.changed.filter((c: { field: string }) => c.field === 'costPer1kPrompt');

            expect(costChanges).toHaveLength(1);
            expect(costChanges[0]?.old).toBeCloseTo(0.0025);
            expect(costChanges[0]?.new).toBeCloseTo(0.003);
        });

        it('returns empty diff when nothing changed', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const models = [
                { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0.0025, costPer1kCompletion: 0.01, tiers: [] },
            ];
            const diff = mod.diffModels(models, models, 'openai');

            expect(diff.added).toHaveLength(0);
            expect(diff.removed).toHaveLength(0);
            expect(diff.changed).toHaveLength(0);
        });
    });

    describe('WriteMarkdownReport', () => {
        it('writes summary with changes', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const reports = [
                {
                    provider: 'openai',
                    added: [{ model: 'gpt-5' }],
                    removed: [{ model: 'gpt-3.5-turbo' }],
                    changed: [{ model: 'gpt-4o', field: 'context', old: 128000, new: 256000 }],
                },
            ];
            const report = mod.writeMarkdownReport(reports, '2026-06-12');

            expect(report).toContain('+1 / -1 / ~1');
            expect(report).toContain('gpt-5');
            expect(report).toContain('gpt-3.5-turbo');
            expect(report).toContain('gpt-4o');
        });

        it('writes no changes summary', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const reports = [] as Array<{
                provider: string;
                added: Array<{ model: string }>;
                removed: Array<{ model: string }>;
                changed: Array<{ model: string; field: string; old: unknown; new: unknown }>;
            }>;
            const report = mod.writeMarkdownReport(reports, '2026-06-12');

            expect(report).toContain('No changes detected');
        });
    });

    describe('ParseArgs', () => {
        it('parses --provider flag', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            vi.stubGlobal('process', {
                argv: ['node', 'probe-registry.ts', '--provider', 'openai'],
            });
            const mod = await import('../probe-registry.js');
            const args = mod.parseArgs();

            expect(args.provider).toBe('openai');
            expect(args.dryRun).toBeFalsy();
            expect(args.createPr).toBeFalsy();
        });

        it('parses --dry-run flag', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            vi.stubGlobal('process', {
                argv: ['node', 'probe-registry.ts', '--dry-run'],
            });
            const mod = await import('../probe-registry.js');
            const args = mod.parseArgs();

            expect(args.provider).toBeNull();
            expect(args.dryRun).toBeTruthy();
        });

        it('parses --pr flag', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            vi.stubGlobal('process', {
                argv: ['node', 'probe-registry.ts', '--pr'],
            });
            const mod = await import('../probe-registry.js');
            const args = mod.parseArgs();

            expect(args.createPr).toBeTruthy();
        });

        it('returns defaults for no flags', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            vi.stubGlobal('process', {
                argv: ['node', 'probe-registry.ts'],
            });
            const mod = await import('../probe-registry.js');
            const args = mod.parseArgs();

            expect(args.provider).toBeNull();
            expect(args.dryRun).toBeFalsy();
            expect(args.createPr).toBeFalsy();
        });
    });

    describe('GetProviderModels', () => {
        it('returns models for known provider', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const registry = JSON.parse(JSON.stringify(VALID_REGISTRY)) as Record<string, unknown>;
            const models = mod.getProviderModels(registry, 'openai');

            expect(models).toHaveLength(2);
            expect(models[0]?.id).toBe('gpt-4o');
        });

        it('returns empty for unknown provider', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const registry = JSON.parse(JSON.stringify(VALID_REGISTRY)) as Record<string, unknown>;
            const models = mod.getProviderModels(registry, 'unknown');

            expect(models).toStrictEqual([]);
        });

        it('returns empty when providers key is missing', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const models = mod.getProviderModels({}, 'openai');

            expect(models).toStrictEqual([]);
        });
    });

    describe('EnrichFromOpenRouter', () => {
        it('enriches models with context and capabilities', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const models = [{ id: 'gpt-4o', context: 0, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] }];
            const orMap = new Map([['gpt-4o', { context: 128000, capabilities: ['vision'] }]]);
            mod.enrichFromOpenRouter(models, orMap);

            expect(models[0]?.context).toBe(128000);
            expect((models[0] as Record<string, unknown>)['capabilities']).toStrictEqual(['vision']);
        });

        it('skips models not in OpenRouter map', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const models = [{ id: 'unknown-model', context: 0, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] }];
            const orMap = new Map([['gpt-4o', { context: 128000 }]]);
            mod.enrichFromOpenRouter(models, orMap);

            expect(models[0]?.context).toBe(0);
        });

        it('does not override higher context with OpenRouter zero context', async () => {
            expect.hasAssertions();

            mockRegistryFetch();
            const mod = await import('../probe-registry.js');
            const models = [{ id: 'gpt-4o', context: 128000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] }];
            const orMap = new Map([['gpt-4o', { context: 0, capabilities: [] }]]);
            mod.enrichFromOpenRouter(models, orMap);

            expect(models[0]?.context).toBe(128000);
        });
    });
});
