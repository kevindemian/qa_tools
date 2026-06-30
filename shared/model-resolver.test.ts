/**
 * Tests for model-resolver.ts — deterministic tier-to-model resolution.
 */
import { describe, it, expect } from 'vitest';
import { resolveModel, getRegistry } from './model-resolver.js';
import type { RegistryModel } from './model-resolver.js';

describe('GetRegistry', () => {
    it('returns a non-empty registry with version', () => {
        const reg = getRegistry();

        expect(reg.version).toBeGreaterThanOrEqual(1);
        expect(reg.updated).toBeTruthy();
    });

    it('contains all known providers', () => {
        expect.hasAssertions();

        const reg = getRegistry();
        const expected = [
            'opencode-go',
            'opencode-zen',
            'openrouter',
            'openai',
            'anthropic',
            'gemini',
            'groq',
            'github-models',
            'nvidia-nim',
            'custom',
        ];
        for (const p of expected) {
            expect(reg.providers).toHaveProperty(p);
        }
    });

    it('each provider has at least one model', () => {
        expect.hasAssertions();

        const reg = getRegistry();
        for (const [provider, models] of Object.entries(reg.providers)) {
            if (provider === 'custom') continue; // custom has no defaults

            expect(models.length).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('ResolveModel', () => {
    it('resolves main tier from registry', () => {
        const result = resolveModel('main', 'openai');

        expect(result.source).toBe('registry');
        expect(result.id).toBeTruthy();
        expect(result.context).toBeGreaterThan(0);
    });

    it('resolves fast tier from registry', () => {
        const result = resolveModel('fast', 'openai');

        expect(result.source).toBe('registry');
        expect(result.id).toContain('mini');
    });

    it('uses profile fallback when registry has no providers', () => {
        const result = resolveModel('main', 'custom', []);

        expect(result.source).toBe('profile');
    });

    it('uses custom model list when provided', () => {
        const models: RegistryModel[] = [
            { id: 'test-model', context: 1000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: ['main'] },
        ];
        const result = resolveModel('main', 'openai', models);

        expect(result.source).toBe('registry');
        expect(result.id).toBe('test-model');
    });

    it('picks model with highest context for tier', () => {
        const models: RegistryModel[] = [
            { id: 'small', context: 8000, costPer1kPrompt: 0.1, costPer1kCompletion: 0.2, tiers: ['main'] },
            { id: 'large', context: 128000, costPer1kPrompt: 0.5, costPer1kCompletion: 1.0, tiers: ['main'] },
        ];
        const result = resolveModel('main', 'openai', models);

        expect(result.id).toBe('large');
        expect(result.context).toBe(128000);
    });

    it('uses cost as tiebreaker when context is equal', () => {
        const models: RegistryModel[] = [
            { id: 'cheap', context: 128000, costPer1kPrompt: 0.1, costPer1kCompletion: 0.2, tiers: ['main'] },
            { id: 'expensive', context: 128000, costPer1kPrompt: 0.5, costPer1kCompletion: 1.0, tiers: ['main'] },
        ];
        const result = resolveModel('main', 'openai', models);

        expect(result.id).toBe('cheap');
    });

    it('handles empty tiers array (model eligible for any tier)', () => {
        const models: RegistryModel[] = [
            { id: 'any-tier', context: 64000, costPer1kPrompt: 0, costPer1kCompletion: 0, tiers: [] },
        ];
        const result = resolveModel('batch', 'openai', models);

        expect(result.source).toBe('registry');
        expect(result.id).toBe('any-tier');
    });

    it('returns empty id on unknown provider with no models', () => {
        const result = resolveModel('main', 'custom');

        expect(result.id).toBe('');
        expect(result.source).toBe('profile');
    });

    it('anthropic resolves main to sonnet', () => {
        const result = resolveModel('main', 'anthropic');

        expect(result.source).toBe('registry');
        expect(result.id).toContain('sonnet');
    });

    it('anthropic resolves fast to haiku', () => {
        const result = resolveModel('fast', 'anthropic');

        expect(result.source).toBe('registry');
        expect(result.id).toContain('haiku');
    });

    it('gemini resolves main to flash-exp', () => {
        const result = resolveModel('main', 'gemini');

        expect(result.source).toBe('registry');
        expect(result.id).toContain('flash');
    });

    it('opencode-go resolves fallback to kimi', () => {
        const result = resolveModel('fallback', 'opencode-go');

        expect(result.source).toBe('registry');
        expect(result.id).toContain('kimi');
    });

    it('github-models resolves all tiers to gpt-4o-mini', () => {
        expect.hasAssertions();

        const tiers = ['main', 'fast', 'reviewer', 'report', 'fallback', 'batch'];
        for (const t of tiers) {
            const result = resolveModel(t, 'github-models');

            expect(result.source).toBe('registry');
            expect(result.id).toBe('gpt-4o-mini');
        }
    });
});
