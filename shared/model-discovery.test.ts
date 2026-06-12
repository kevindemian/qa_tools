import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverModels, assignTierHints } from './model-discovery.js';
import type { RegistryModel } from './model-resolver.js';

function mockFetch(body: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
    });
}

function mockFetchReject(error: Error) {
    globalThis.fetch = vi.fn().mockRejectedValue(error);
}

function mockFetchError(status: number, body: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: vi.fn().mockResolvedValue(body),
    });
}

describe('discoverModels', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns empty array for unknown provider', async () => {
        const result = await discoverModels('custom', 'test-key');
        expect(result).toEqual([]);
    });

    it('returns empty array when fetch fails', async () => {
        mockFetchReject(new Error('network error'));
        const result = await discoverModels('openai', 'sk-test');
        expect(result).toEqual([]);
    });

    it('returns empty array on non-ok response', async () => {
        mockFetchError(401, { error: 'unauthorized' });
        const result = await discoverModels('openai', 'sk-test');
        expect(result).toEqual([]);
    });

    it('returns models from OpenAI adapter response', async () => {
        mockFetch({
            data: [
                { id: 'gpt-4o', object: 'model' },
                { id: 'gpt-4o-mini', object: 'model' },
            ],
        });
        const result = await discoverModels('openai', 'sk-test');
        expect(result.length).toBe(2);
        expect(result[0]?.id).toBe('gpt-4o');
        expect(result[0]?.context).toBe(0);
    });

    it('returns models with context from Gemini adapter', async () => {
        mockFetch({
            models: [{ name: 'models/gemini-2.0-flash', inputTokenLimit: 1048576 }],
        });
        const result = await discoverModels('gemini', 'AIza-test');
        expect(result.length).toBe(1);
        expect(result[0]?.id).toBe('gemini-2.0-flash');
        expect(result[0]?.context).toBe(1048576);
    });

    it('returns models with capabilities from Anthropic adapter', async () => {
        mockFetch({
            data: [
                {
                    id: 'claude-sonnet-4-20250514',
                    max_input_tokens: 200000,
                    capabilities: {
                        tools: { supported: true },
                        structured_outputs: { supported: true },
                        image_input: { supported: true },
                    },
                },
            ],
        });
        const result = await discoverModels('anthropic', 'sk-ant-test');
        expect(result.length).toBe(1);
        expect(result[0]?.id).toBe('claude-sonnet-4-20250514');
        expect(result[0]?.context).toBe(200000);
    });

    it('returns empty for unknown adapter (no buildProbeRequest)', async () => {
        const result = await discoverModels('opencode-go', 'test');
        expect(result).toEqual([]);
    });
});

describe('assignTierHints', () => {
    it('returns empty for empty input', () => {
        expect(assignTierHints([])).toEqual([]);
    });

    it('assigns all tiers to a single model', () => {
        const models: RegistryModel[] = [
            { id: 'single-model', context: 64000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
        ];
        const result = assignTierHints(models);
        expect(result.length).toBe(1);
        const model = result[0] as RegistryModel;
        expect(model.tiers.length).toBe(6);
        expect(model.tiers).toContain('main');
        expect(model.tiers).toContain('fast');
        expect(model.tiers).toContain('reviewer');
        expect(model.tiers).toContain('report');
        expect(model.tiers).toContain('fallback');
        expect(model.tiers).toContain('batch');
    });

    it('assigns tiers respecting per-tier uniqueness', () => {
        const models: RegistryModel[] = [
            { id: 'gpt-4o', context: 128000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
            { id: 'gpt-4o-mini', context: 128000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
        ];
        const result = assignTierHints(models);
        expect(result).toHaveLength(2);
        for (const m of result) {
            expect(m.tiers.length).toBe(6);
        }
    });

    it('does not assign the same model to the same tier twice', () => {
        const models: RegistryModel[] = [
            { id: 'model-a', context: 64000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
            { id: 'model-b', context: 32000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
        ];
        const result = assignTierHints(models);
        const tierCount = new Map<string, number>();
        for (const m of result) {
            for (const t of m.tiers) {
                tierCount.set(t, (tierCount.get(t) || 0) + 1);
            }
        }
        for (const [, count] of tierCount) {
            expect(count).toBe(1);
        }
    });

    it('assigns high-context models when no keyword match', () => {
        const models: RegistryModel[] = [
            { id: 'small-ctx', context: 8000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
            { id: 'large-ctx', context: 128000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
        ];
        const result = assignTierHints(models);
        const large = result.find((m) => m.id === 'large-ctx');
        const small = result.find((m) => m.id === 'small-ctx');
        expect(large).toBeDefined();
        expect(small).toBeDefined();
        if (!large || !small) return;
        expect(large.tiers).toContain('main');
        expect(small.tiers).not.toContain('main');
    });
});
