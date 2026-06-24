import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFileSync = vi.fn();

vi.mock('node:fs', () => ({
    readFileSync: mockReadFileSync,
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    chmodSync: vi.fn(),
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
                capabilities: ['vision', 'structured_outputs'],
            },
            {
                id: 'gpt-4o-mini',
                context: 128000,
                costPer1kPrompt: 0.00015,
                costPer1kCompletion: 0.0006,
                tiers: ['fast', 'batch'],
            },
        ],
        anthropic: [
            {
                id: 'claude-sonnet-4-20250514',
                context: 200000,
                costPer1kPrompt: 0.003,
                costPer1kCompletion: 0.015,
                tiers: ['main'],
                capabilities: ['vision', 'function_calling'],
            },
        ],
    },
};

function mockReadFile(data: unknown): void {
    mockReadFileSync.mockReturnValue(JSON.stringify(data));
}

describe('Verify-registry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('passes for a valid registry with capabilities', async () => {
        mockReadFile(VALID_REGISTRY);

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors).toHaveLength(0);
    });

    it('reports error for invalid JSON', async () => {
        mockReadFileSync.mockReturnValue('not valid json');

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]?.message).toContain('Invalid JSON');
    });

    it('reports error when root is not an object', async () => {
        mockReadFileSync.mockReturnValue(JSON.stringify('string'));

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.length).toBeGreaterThan(0);
    });

    it('reports error when version is missing', async () => {
        const noVersion: Record<string, unknown> = { ...VALID_REGISTRY };
        delete noVersion['version'];
        mockReadFile(noVersion);

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.length).toBeGreaterThan(0);
    });

    it('reports error when updated date is invalid', async () => {
        mockReadFile({ ...VALID_REGISTRY, updated: 'invalid-date' });

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.length).toBeGreaterThan(0);
    });

    it('reports error for tier not in valid set', async () => {
        mockReadFile({
            ...VALID_REGISTRY,
            providers: {
                openai: [
                    {
                        id: 'gpt-4o',
                        context: 128000,
                        costPer1kPrompt: 0.0025,
                        costPer1kCompletion: 0.01,
                        tiers: ['invalid-tier'],
                    },
                ],
            },
        });

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.some((e: { message: string }) => e.message.includes('Invalid tier'))).toBeTruthy();
    });

    it('reports error when capabilities is not an array', async () => {
        mockReadFile({
            ...VALID_REGISTRY,
            providers: {
                openai: [
                    {
                        id: 'gpt-4o',
                        context: 128000,
                        costPer1kPrompt: 0.0025,
                        costPer1kCompletion: 0.01,
                        tiers: ['main'],
                        capabilities: 'not-an-array',
                    },
                ],
            },
        });

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.some((e: { message: string }) => e.message.includes('array of strings'))).toBeTruthy();
    });

    it('reports error when capabilities items are not strings', async () => {
        mockReadFile({
            ...VALID_REGISTRY,
            providers: {
                openai: [
                    {
                        id: 'gpt-4o',
                        context: 128000,
                        costPer1kPrompt: 0.0025,
                        costPer1kCompletion: 0.01,
                        tiers: ['main'],
                        capabilities: [123],
                    },
                ],
            },
        });

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.some((e: { message: string }) => e.message.includes('array of strings'))).toBeTruthy();
    });

    it('handles file read error gracefully', async () => {
        mockReadFileSync.mockImplementation(() => {
            throw new Error('ENOENT');
        });

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors.some((e: { message: string }) => e.message.includes('Cannot read'))).toBeTruthy();
    });

    it('accepts empty capabilities array', async () => {
        mockReadFile({
            ...VALID_REGISTRY,
            providers: {
                openai: [
                    {
                        id: 'gpt-4o',
                        context: 128000,
                        costPer1kPrompt: 0.0025,
                        costPer1kCompletion: 0.01,
                        tiers: ['main'],
                        capabilities: [],
                    },
                ],
            },
        });

        const mod = await import('../verify-registry.js');
        const errors = mod.validateRegistry();

        expect(errors).toHaveLength(0);
    });
});
