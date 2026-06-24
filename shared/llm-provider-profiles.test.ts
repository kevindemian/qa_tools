/**
 * Tests for llm-provider-profiles.ts.
 * Pure data module — no mocks needed.
 */
import { describe, it, expect } from 'vitest';

describe('PROVIDER_PROFILES', () => {
    it('contains all known providers', async () => {
        const { PROVIDER_PROFILES, KNOWN_PROVIDERS } = await import('./llm-provider-profiles.js');
        for (const p of KNOWN_PROVIDERS) {
            expect(PROVIDER_PROFILES[p]).toBeDefined();
        }
    });

    it('each profile has required fields', async () => {
        const { PROVIDER_PROFILES } = await import('./llm-provider-profiles.js');
        for (const [id, profile] of Object.entries(PROVIDER_PROFILES)) {
            expect(profile.displayName).toBeTruthy();
            expect(profile.format).toMatch(/^(openai|gemini|anthropic)$/);
            expect(profile.tiers.main).toBeDefined();
            expect(profile.tiers.fast).toBeDefined();
            expect(profile.tiers.reviewer).toBeDefined();
            expect(profile.tiers.report).toBeDefined();
            expect(profile.tiers.fallback).toBeDefined();
            expect(profile.tiers.batch).toBeDefined();

            if (id !== 'custom') {
                expect(profile.baseUrl).toBeTruthy();
                expect(profile.keyHint).toBeTruthy();
            }
        }
    });

    it('opencode-go is default (non-free)', async () => {
        const { PROVIDER_PROFILES } = await import('./llm-provider-profiles.js');
        const go = PROVIDER_PROFILES['opencode-go'];

        expect(go.free).toBeUndefined();
        expect(go.baseUrl).toContain('opencode.ai/zen/go');
    });

    it('free providers are marked', async () => {
        const { PROVIDER_PROFILES } = await import('./llm-provider-profiles.js');

        expect(PROVIDER_PROFILES['groq'].free).toBeTruthy();
        expect(PROVIDER_PROFILES['github-models'].free).toBeTruthy();
        expect(PROVIDER_PROFILES['nvidia-nim'].free).toBeTruthy();
    });

    it('custom provider has empty baseUrl and requiresBaseUrl', async () => {
        const { PROVIDER_PROFILES } = await import('./llm-provider-profiles.js');
        const c = PROVIDER_PROFILES['custom'];

        expect(c.baseUrl).toBe('');
        expect(c.requiresBaseUrl).toBeTruthy();
    });
});

describe('IsKnownProvider', () => {
    it('returns true for known providers', async () => {
        const { isKnownProvider } = await import('./llm-provider-profiles.js');

        expect(isKnownProvider('openrouter')).toBeTruthy();
        expect(isKnownProvider('openai')).toBeTruthy();
        expect(isKnownProvider('anthropic')).toBeTruthy();
    });

    it('returns false for unknown providers', async () => {
        const { isKnownProvider } = await import('./llm-provider-profiles.js');

        expect(isKnownProvider('unknown')).toBeFalsy();
        expect(isKnownProvider('')).toBeFalsy();
    });
});

describe('GetProviderProfile', () => {
    it('returns profile for known provider', async () => {
        const { getProviderProfile } = await import('./llm-provider-profiles.js');
        const p = getProviderProfile('openrouter');

        expect(p).toBeDefined();
        expect(p && p.displayName).toBe('OpenRouter');
    });

    it('returns undefined for unknown provider', async () => {
        const { getProviderProfile } = await import('./llm-provider-profiles.js');

        expect(getProviderProfile('nonexistent')).toBeUndefined();
    });
});

describe('InferProviderFromKey', () => {
    it('detects OpenRouter keys', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('sk-or-v1-abc123')).toBe('openrouter');
    });

    it('detects Anthropic keys', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('sk-ant-abc123')).toBe('anthropic');
    });

    it('detects Groq keys', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('gsk_abc123')).toBe('groq');
    });

    it('detects Gemini keys', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('AIzaSyABC123')).toBe('gemini');
    });

    it('detects NVIDIA NIM keys', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('nvapi-abc123')).toBe('nvidia-nim');
    });

    it('detects OpenAI keys', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('sk-abc123')).toBe('openai');
    });

    it('returns null for unknown key patterns', async () => {
        const { inferProviderFromKey } = await import('./llm-provider-profiles.js');

        expect(inferProviderFromKey('unknown-key-format')).toBeNull();
        expect(inferProviderFromKey('')).toBeNull();
    });
});

describe('FormatProviderList', () => {
    it('returns a non-empty string with provider names', async () => {
        const { formatProviderList } = await import('./llm-provider-profiles.js');
        const list = formatProviderList();

        expect(list).toContain('openrouter');
        expect(list).toContain('OpenRouter');
        expect(list).toContain('groq');
        expect(list).not.toContain('custom');
    });
});
