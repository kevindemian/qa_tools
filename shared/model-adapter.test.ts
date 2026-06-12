import { describe, it, expect, assert } from 'vitest';
import { getAdapter, getRegisteredAdapters, type ModelAdapter } from './model-adapter.js';
import type { LlmProvider } from './llm-provider-profiles.js';

function expectAdapter(provider: LlmProvider): ModelAdapter {
    const adapter = getAdapter(provider);
    assert(adapter !== null, `adapter for ${provider} should exist`);
    return adapter;
}

describe('model-adapter', () => {
    describe('getRegisteredAdapters', () => {
        it('returns all known providers', () => {
            const adapters = getRegisteredAdapters();
            expect(adapters).toContain('openai');
            expect(adapters).toContain('anthropic');
            expect(adapters).toContain('gemini');
            expect(adapters).toContain('openrouter');
            expect(adapters).toContain('groq');
            expect(adapters).toContain('github-models');
            expect(adapters).toContain('nvidia-nim');
            expect(adapters).toContain('custom');
        });
    });

    describe('getAdapter', () => {
        it('returns null for unknown provider', () => {
            expect(getAdapter('unknown' as never)).toBeNull();
        });

        it('returns adapter for openai', () => {
            const adapter = getAdapter('openai');
            expect(adapter).not.toBeNull();
            expect(adapter?.name).toBe('openai');
        });
    });

    describe('openai adapter', () => {
        const adapter = expectAdapter('openai');

        it('parses standard OpenAI response', () => {
            const result = adapter.parseListResponse({
                data: [
                    { id: 'gpt-4o', object: 'model', created: 1686588894 },
                    { id: 'gpt-4o-mini', object: 'model', created: 1694200000 },
                ],
            });
            expect(result).toHaveLength(2);
            const [first, second] = [result[0], result[1]];
            assert(first !== undefined);
            assert(second !== undefined);
            expect(first.id).toBe('gpt-4o');
            expect(second.id).toBe('gpt-4o-mini');
            expect(first.context).toBeUndefined();
            expect(first.capabilities).toBeUndefined();
        });

        it('returns empty for missing data', () => {
            expect(adapter.parseListResponse({})).toEqual([]);
            expect(adapter.parseListResponse({ data: null })).toEqual([]);
            expect(adapter.parseListResponse({ data: 'not-array' })).toEqual([]);
        });

        it('filters out entries without id', () => {
            const result = adapter.parseListResponse({
                data: [{ id: 'valid-model' }, { notId: 'broken' }, { id: 123 }],
            });
            expect(result).toHaveLength(1);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('valid-model');
        });
    });

    describe('anthropic adapter', () => {
        const adapter = expectAdapter('anthropic');

        it('parses Anthropic response with context and capabilities', () => {
            const result = adapter.parseListResponse({
                data: [
                    {
                        id: 'claude-sonnet-4-20250514',
                        display_name: 'Claude Sonnet 4',
                        max_input_tokens: 200000,
                        capabilities: {
                            tools: { supported: true },
                            structured_outputs: { supported: true },
                            image_input: { supported: true },
                        },
                    },
                ],
            });
            expect(result).toHaveLength(1);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('claude-sonnet-4-20250514');
            expect(first.context).toBe(200000);
            expect(first.capabilities).toContain('function_calling');
            expect(first.capabilities).toContain('structured_outputs');
            expect(first.capabilities).toContain('vision');
        });

        it('handles empty capabilities gracefully', () => {
            const result = adapter.parseListResponse({
                data: [
                    {
                        id: 'claude-opus-4-6',
                        max_input_tokens: 500000,
                        capabilities: {},
                    },
                ],
            });
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('claude-opus-4-6');
            expect(first.context).toBe(500000);
            expect(first.capabilities).toBeUndefined();
        });

        it('omits context when max_input_tokens is missing', () => {
            const result = adapter.parseListResponse({
                data: [{ id: 'claude-model' }],
            });
            const first = result[0];
            assert(first !== undefined);
            expect(first.context).toBeUndefined();
        });

        it('returns empty for missing data', () => {
            expect(adapter.parseListResponse({})).toEqual([]);
        });
    });

    describe('gemini adapter', () => {
        const adapter = expectAdapter('gemini');

        it('parses Gemini response with inputTokenLimit', () => {
            const result = adapter.parseListResponse({
                models: [
                    {
                        name: 'models/gemini-2.0-flash',
                        version: '2.0',
                        displayName: 'Gemini 2.0 Flash',
                        inputTokenLimit: 1048576,
                        outputTokenLimit: 8192,
                        supportedGenerationMethods: ['generateContent', 'countTokens'],
                    },
                ],
            });
            expect(result).toHaveLength(1);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('gemini-2.0-flash');
            expect(first.context).toBe(1048576);
            expect(first.capabilities).toContain('chat');
        });

        it('handles name without models/ prefix', () => {
            const result = adapter.parseListResponse({
                models: [{ name: 'gemini-pro', inputTokenLimit: 32000 }],
            });
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('gemini-pro');
        });

        it('filters models with no name', () => {
            const result = adapter.parseListResponse({
                models: [{ name: 'models/gemini-a', inputTokenLimit: 64000 }, { notName: true }],
            });
            expect(result).toHaveLength(1);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('gemini-a');
        });

        it('returns empty for missing models key', () => {
            expect(adapter.parseListResponse({})).toEqual([]);
            expect(adapter.parseListResponse({ data: [] })).toEqual([]);
        });
    });

    describe('openrouter adapter', () => {
        const adapter = expectAdapter('openrouter');

        it('parses OpenRouter response with context and capabilities', () => {
            const result = adapter.parseListResponse({
                data: [
                    {
                        id: 'openai/gpt-4o',
                        name: 'GPT-4o',
                        context_length: 128000,
                        supported_parameters: ['temperature', 'tools', 'structured_outputs'],
                        architecture: { input_modalities: ['text', 'image'] },
                    },
                ],
            });
            expect(result).toHaveLength(1);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('gpt-4o');
            expect(first.context).toBe(128000);
            expect(first.capabilities).toContain('function_calling');
            expect(first.capabilities).toContain('structured_outputs');
            expect(first.capabilities).toContain('vision');
        });

        it('strips provider prefix from IDs', () => {
            const result = adapter.parseListResponse({
                data: [
                    { id: 'google/gemini-2.0-flash' },
                    { id: 'anthropic/claude-sonnet-4' },
                    { id: 'meta-llama/llama-3.1-8b' },
                ],
            });
            expect(result).toHaveLength(3);
            const [first, second, third] = [result[0], result[1], result[2]];
            assert(first !== undefined);
            assert(second !== undefined);
            assert(third !== undefined);
            expect(first.id).toBe('gemini-2.0-flash');
            expect(second.id).toBe('claude-sonnet-4');
            expect(third.id).toBe('llama-3.1-8b');
        });

        it('handles IDs without prefix', () => {
            const result = adapter.parseListResponse({
                data: [{ id: 'gpt-4o' }],
            });
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('gpt-4o');
        });

        it('returns empty for missing data', () => {
            expect(adapter.parseListResponse({})).toEqual([]);
        });
    });

    describe('groq adapter', () => {
        const adapter = expectAdapter('groq');

        it('parses OpenAI-compatible response', () => {
            const result = adapter.parseListResponse({
                data: [
                    { id: 'llama-3.1-70b-versatile', object: 'model' },
                    { id: 'mixtral-8x7b-32768', object: 'model' },
                ],
            });
            expect(result).toHaveLength(2);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('llama-3.1-70b-versatile');
        });

        it('returns empty for missing data', () => {
            expect(adapter.parseListResponse({})).toEqual([]);
        });
    });

    describe('github-models adapter', () => {
        const adapter = expectAdapter('github-models');

        it('parses OpenAI-compatible response', () => {
            const result = adapter.parseListResponse({
                data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
            });
            expect(result).toHaveLength(2);
        });
    });

    describe('nvidia-nim adapter', () => {
        const adapter = expectAdapter('nvidia-nim');

        it('parses OpenAI-compatible response', () => {
            const result = adapter.parseListResponse({
                data: [{ id: 'meta/llama-3.1-8b-instruct' }],
            });
            expect(result).toHaveLength(1);
            const first = result[0];
            assert(first !== undefined);
            expect(first.id).toBe('meta/llama-3.1-8b-instruct');
        });
    });

    describe('custom adapter', () => {
        const adapter = expectAdapter('custom');

        it('parses OpenAI-compatible response', () => {
            expect(adapter.name).toBe('custom');
            expect(adapter.parseListResponse({ data: [{ id: 'test' }] })).toEqual([{ id: 'test' }]);
            expect(adapter.parseListResponse({ data: [{ id: 'test', extra: true }] })).toEqual([{ id: 'test' }]);
            expect(adapter.parseListResponse({ data: [{ id: 'a' }, { id: 'b' }] })).toEqual([{ id: 'a' }, { id: 'b' }]);
            expect(adapter.parseListResponse({ data: 'invalid' })).toEqual([]);
            expect(adapter.parseListResponse({})).toEqual([]);
            expect(adapter.parseListResponse(null)).toEqual([]);
            expect(adapter.parseListResponse(undefined)).toEqual([]);
        });
    });
});
