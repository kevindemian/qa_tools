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

describe('detectProvider', () => {
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

describe('probeApiKey', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns valid for OpenAI probe (sk-... → 200)', async () => {
        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await probeApiKey('sk-test', 'openai');
        expect(result.valid).toBe(true);
        expect(result.provider).toBe('openai');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const url = mockFetch.mock.calls[0]?.[0] as string;
        expect(url).toContain('/models');
    });

    it('returns invalid for OpenAI probe (401)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(401));
        const result = await probeApiKey('sk-bad', 'openai');
        expect(result.valid).toBe(false);
    });

    it('returns valid for Gemini probe (200)', async () => {
        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await probeApiKey('AIza-test', 'gemini');
        expect(result.valid).toBe(true);
        expect(result.provider).toBe('gemini');
        const url = mockFetch.mock.calls[0]?.[0] as string;
        expect(url).toContain('?key=');
    });

    it('returns invalid for Gemini probe (403)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(403));
        const result = await probeApiKey('AIza-bad', 'gemini');
        expect(result.valid).toBe(false);
    });

    it('validates Anthropic key via POST /v1/messages', async () => {
        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await probeApiKey('sk-ant-test', 'anthropic');
        expect(result.valid).toBe(true);
        const url = mockFetch.mock.calls[0]?.[0] as string;
        expect(url).toContain('/messages');
        const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
        const headers = init.headers as Record<string, string> | undefined;
        expect(headers?.['x-api-key']).toBe('sk-ant-test');
    });

    it('returns error for custom provider without baseUrl', async () => {
        const result = await probeApiKey('custom-key', 'custom');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Unsupported provider');
    });

    it('handles network errors', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network failure'));
        const result = await probeApiKey('sk-test', 'openai');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Network failure');
    });

    it('handles fetch abort (timeout)', async () => {
        const abortError = new DOMException('The operation was aborted', 'AbortError');
        mockFetch.mockRejectedValueOnce(abortError);
        const result = await probeApiKey('sk-test', 'openai');
        expect(result.valid).toBe(false);
    });

    it('returns valid on 404 (endpoint not found but key may be valid)', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse(404));
        const result = await probeApiKey('sk-test', 'openai');
        expect(result.valid).toBe(true);
    });
});

describe('discoverProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns valid when pattern match + probe succeed', async () => {
        mockFetch.mockResolvedValueOnce(okResponse());
        const result = await discoverProvider('sk-test');
        expect(result.valid).toBe(true);
        expect(result.provider).toBe('openai');
    });

    it('falls through to other providers when pattern match fails probe', async () => {
        // First probe (openai) fails with 401
        mockFetch
            .mockResolvedValueOnce(errorResponse(401)) // openai
            .mockResolvedValueOnce(okResponse()); // next provider succeeds
        const result = await discoverProvider('sk-test');
        expect(result.valid).toBe(true);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns failure when no provider accepts the key', async () => {
        mockFetch.mockResolvedValue(errorResponse(401));
        const result = await discoverProvider('sk-test');
        expect(result.valid).toBe(false);
        expect(result.provider).toBe('openai');
    });

    it('skips custom provider during discovery', async () => {
        mockFetch.mockResolvedValue(errorResponse(401));
        const result = await discoverProvider('unknown-key');
        expect(result.valid).toBe(false);
        // 'custom' should not be probed
        for (const call of mockFetch.mock.calls) {
            const url = call[0] as string;
            expect(url).not.toContain('/custom');
        }
    });

    it('continues probing after a timeout', async () => {
        const abortError = new DOMException('aborted', 'AbortError');
        mockFetch
            .mockRejectedValueOnce(abortError) // first provider times out
            .mockRejectedValueOnce(errorResponse(401)); // subsequent failure
        const result = await discoverProvider('sk-test');
        expect(result.valid).toBe(false);
    });
});

describe('autoAssignTiers', () => {
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
