/**
 * Tests for llm-probe.ts — key detection, API validation, tier auto-assignment.
 *
 * Strategy:
 * - detectProvider: test key pattern matching
 * - probeApiKey: mock fetch responses for each provider format
 * - discoverProvider: test cascade logic
 * - autoAssignTiers: verify tier mapping from profile
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch before importing module
const mockFetch = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

function okResponse(body?: string): Response {
    return new Response(body ?? '{}', { status: 200 });
}
function errorResponse(status: number): Response {
    return new Response('error', { status });
}

import { detectProvider, probeApiKey, discoverProvider, autoAssignTiers } from './llm-probe.js';

describe('DetectProvider', () => {
    it('returns null for empty key', () => {
        expect(detectProvider('')).toBeNull();
    });

    it('returns null for blank key', () => {
        expect(detectProvider('   ')).toBeNull();
    });

    it('detects OpenAI key (sk-...)', () => {
        expect(detectProvider('sk-test123')).toBe('openai');
    });

    it('detects OpenRouter key (sk-or-v1-...)', () => {
        expect(detectProvider('sk-or-v1-test')).toBe('openrouter');
    });

    it('detects Anthropic key (sk-ant-...)', () => {
        expect(detectProvider('sk-ant-test')).toBe('anthropic');
    });

    it('detects Groq key (gsk_...)', () => {
        expect(detectProvider('gsk_test')).toBe('groq');
    });

    it('detects Gemini key (AIza...)', () => {
        expect(detectProvider('AIza-test')).toBe('gemini');
    });

    it('detects NVIDIA key (nvapi-...)', () => {
        expect(detectProvider('nvapi-test')).toBe('nvidia-nim');
    });

    it('trims whitespace before detection', () => {
        expect(detectProvider('  sk-test  ')).toBe('openai');
    });

    it('returns null for unknown key pattern', () => {
        expect(detectProvider('unknown-key-123')).toBeNull();
    });
});

describe('ProbeApiKey', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns valid for OpenAI probe (sk-... → 200)', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await probeApiKey('sk-test', 'openai');

        expect(result.valid).toBeTruthy();
        expect(result.provider).toBe('openai');
        expect(mockFetch).toHaveBeenCalledTimes(1);

        const url = mockFetch.mock.calls[0]?.[0] as string;

        expect(url).toContain('/models');
    });

    it('returns invalid for OpenAI probe (401)', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(errorResponse(401));
        const result = await probeApiKey('sk-bad', 'openai');

        expect(result.valid).toBeFalsy();
    });

    it('returns valid for Gemini probe (200)', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await probeApiKey('AIza-test', 'gemini');

        expect(result.valid).toBeTruthy();
        expect(result.provider).toBe('gemini');

        const url = mockFetch.mock.calls[0]?.[0] as string;

        expect(url).toContain('?key=');
    });

    it('returns invalid for Gemini probe (403)', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(errorResponse(403));
        const result = await probeApiKey('AIza-bad', 'gemini');

        expect(result.valid).toBeFalsy();
    });

    it('validates Anthropic key via POST /v1/messages', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await probeApiKey('sk-ant-test', 'anthropic');

        expect(result.valid).toBeTruthy();

        const url = mockFetch.mock.calls[0]?.[0] as string;

        expect(url).toContain('/messages');

        const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
        const headers = init.headers as Record<string, string> | undefined;

        expect(headers?.['x-api-key']).toBe('sk-ant-test');
    });

    it('returns error for custom provider without baseUrl', async () => {
        expect.hasAssertions();

        const result = await probeApiKey('custom-key', 'custom');

        expect(result.valid).toBeFalsy();
        expect(result.error).toContain('Unsupported provider');
    });

    it('handles network errors', async () => {
        expect.hasAssertions();

        mockFetch.mockRejectedValueOnce(new Error('Network failure'));
        const result = await probeApiKey('sk-test', 'openai');

        expect(result.valid).toBeFalsy();
        expect(result.error).toBe('Network failure');
    });

    it('handles fetch abort (timeout)', async () => {
        expect.hasAssertions();

        const abortError = new DOMException('The operation was aborted', 'AbortError');
        mockFetch.mockRejectedValueOnce(abortError);
        const result = await probeApiKey('sk-test', 'openai');

        expect(result.valid).toBeFalsy();
    });

    it('returns valid on 404 (endpoint not found but key may be valid)', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(errorResponse(404));
        const result = await probeApiKey('sk-test', 'openai');

        expect(result.valid).toBeTruthy();
    });

    it('records latency via recordLlmRequest on successful probe', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(okResponse());

        const { getDefaultMetrics } = await import('./llm-metrics.js');
        const recordSpy = vi.spyOn(getDefaultMetrics(), 'recordLlmRequest');

        const result = await probeApiKey('sk-test', 'openai');

        expect(result.valid).toBeTruthy();

        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy).toHaveBeenCalledWith('probe', expect.any(Number), 'probe:openai');

        recordSpy.mockRestore();
    });
});

describe('DiscoverProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns valid when pattern match + probe succeed', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await discoverProvider('sk-test');

        expect(result.valid).toBeTruthy();
        expect(result.provider).toBe('openai');
    });

    it('falls through to other providers when pattern match fails probe', async () => {
        expect.hasAssertions();

        // First probe (openai) fails with 401
        mockFetch
            .mockResolvedValueOnce(errorResponse(401)) // openai
            .mockResolvedValueOnce(okResponse()); // next provider succeeds
        const result = await discoverProvider('sk-test');

        expect(result.valid).toBeTruthy();
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns failure when no provider accepts the key', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValue(errorResponse(401));
        const result = await discoverProvider('sk-test');

        expect(result.valid).toBeFalsy();
        expect(result.provider).toBe('openai');
    });

    it('skips custom provider during discovery', async () => {
        expect.hasAssertions();

        mockFetch.mockResolvedValue(errorResponse(401));
        const result = await discoverProvider('unknown-key');

        expect(result.valid).toBeFalsy();

        // 'custom' should not be probed
        for (const call of mockFetch.mock.calls) {
            const url = call[0] as string;

            expect(url).not.toContain('/custom');
        }
    });

    it('continues probing after a timeout', async () => {
        expect.hasAssertions();

        const abortError = new DOMException('aborted', 'AbortError');
        mockFetch
            .mockRejectedValueOnce(abortError) // first provider times out
            .mockRejectedValueOnce(errorResponse(401)); // subsequent failure
        const result = await discoverProvider('sk-test');

        expect(result.valid).toBeFalsy();
    });
});

describe('AutoAssignTiers', () => {
    it('returns tier mapping for OpenAI', () => {
        const result = autoAssignTiers('openai');

        expect(result.provider).toBe('openai');
        expect(result.tiers.main).toBe('gpt-4o');
        expect(result.tiers.fast).toBe('gpt-4o-mini');
        expect(result.tiers.reviewer).toBe('gpt-4o-mini');
        expect(result.tiers.report).toBe('gpt-4o');
        expect(result.tiers.fallback).toBe('gpt-4o-mini');
        expect(result.tiers.batch).toBe('gpt-4o-mini');
    });

    it('returns tier mapping for Groq', () => {
        const result = autoAssignTiers('groq');

        expect(result.provider).toBe('groq');
        expect(result.tiers.main).toBe('llama-3.3-70b-versatile');
        expect(result.tiers.fast).toBe('llama-3.1-8b-instant');
    });

    it('throws for unknown provider', () => {
        expect(() => autoAssignTiers('unknown' as never)).toThrow('Unknown provider');
    });

    it('returns a shallow copy of the profile tiers each call', () => {
        const result1 = autoAssignTiers('groq');
        const result2 = autoAssignTiers('groq');

        expect(result1.tiers).not.toBe(result2.tiers);
        expect(result1.tiers.fast).toBe('llama-3.1-8b-instant');
        expect(result2.tiers.fast).toBe('llama-3.1-8b-instant');
    });
});
