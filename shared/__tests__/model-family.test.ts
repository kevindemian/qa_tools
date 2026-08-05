import { describe, it, expect } from 'vitest';
import { canonicalModel, familyOf, UNKNOWN_FAMILY } from '../llm/model-family.js';

describe('model-family', () => {
    describe('canonicalModel', () => {
        it('strips provider prefix from OpenRouter ids', () => {
            expect(canonicalModel('google/gemini-2.0-flash-exp')).toBe('gemini-2.0-flash-exp');
            expect(canonicalModel('meta-llama/llama-3.1-8b-instruct')).toBe('llama-3.1-8b-instruct');
            expect(canonicalModel('openai/gpt-4o-mini')).toBe('gpt-4o-mini');
        });

        it('strips router prefix that is not the training lineage', () => {
            expect(canonicalModel('opencode/deepseek-v4-pro')).toBe('deepseek-v4-pro');
        });

        it('keeps bare model ids unchanged', () => {
            expect(canonicalModel('gemini-2.0-flash-exp')).toBe('gemini-2.0-flash-exp');
            expect(canonicalModel('gpt-4o')).toBe('gpt-4o');
        });

        it('returns empty string for empty/whitespace/undefined', () => {
            expect(canonicalModel('')).toBe('');
            expect(canonicalModel('   ')).toBe('');
        });
    });

    describe('familyOf', () => {
        it('classifies known families by declared prefix', () => {
            expect(familyOf('gemini-2.0-flash-exp')).toBe('google');
            expect(familyOf('google/gemini-2.0-flash-exp')).toBe('google');
            expect(familyOf('llama-3.1-8b-instruct')).toBe('meta');
            expect(familyOf('meta-llama/llama-3.1-70b-instruct')).toBe('meta');
            expect(familyOf('gpt-4o-mini')).toBe('openai');
            expect(familyOf('openai/gpt-4o-mini')).toBe('openai');
            expect(familyOf('claude-sonnet-4-20250514')).toBe('anthropic');
            expect(familyOf('deepseek-v4-pro')).toBe('deepseek');
            expect(familyOf('opencode/deepseek-v4-pro')).toBe('deepseek');
            expect(familyOf('kimi-k2.5')).toBe('moonshot');
            expect(familyOf('grok-3')).toBe('xai');
            expect(familyOf('qwen-2.5-72b')).toBe('alibaba');
            expect(familyOf('mimo-7b')).toBe('mimo');
            expect(familyOf('command-r-plus')).toBe('cohere');
            expect(familyOf('phi-4')).toBe('microsoft');
            expect(familyOf('glm-4')).toBe('zhipu');
            expect(familyOf('minimax-m1')).toBe('minimax');
            expect(familyOf('hunyuan-turbo')).toBe('tencent');
            expect(familyOf('ernie-4.0')).toBe('baidu');
            expect(familyOf('yi-34b')).toBe('lingyiwanwu');
            expect(familyOf('step-2')).toBe('stepfun');
            expect(familyOf('nemotron-4')).toBe('nvidia');
            expect(familyOf('codestral-2501')).toBe('mistral');
            expect(familyOf('gemma-3')).toBe('google');
        });

        it('normalizes equivalent formats of the same model to the same family', () => {
            expect(familyOf('gemini-2.0-flash-exp')).toBe(familyOf('google/gemini-2.0-flash-exp'));
        });

        it('resolves org-driven: known org slugs map to canonical families', () => {
            expect(familyOf('meta-llama/llama-3.1-8b-instruct')).toBe('meta');
            expect(familyOf('moonshotai/kimi-k2')).toBe('moonshot');
            expect(familyOf('mistralai/mistral-7b')).toBe('mistral');
            expect(familyOf('deepseek-ai/deepseek-v3')).toBe('deepseek');
            expect(familyOf('x-ai/grok-3')).toBe('xai');
        });

        it('defaults an unknown non-alias org to the org itself (declared lineage)', () => {
            expect(familyOf('somevendor/future-model')).toBe('somevendor');
        });

        it('resolves router alias orgs by base name', () => {
            expect(familyOf('opencode/deepseek-v4-pro')).toBe('deepseek');
            expect(familyOf('opencode-zen/gemini-2.0-flash-exp')).toBe('google');
        });

        it('treats unlisted models as unknown (fail-closed)', () => {
            expect(familyOf('some-future-model-xyz')).toBe(UNKNOWN_FAMILY);
        });

        it('treats empty model as unknown', () => {
            expect(familyOf('')).toBe(UNKNOWN_FAMILY);
            expect(familyOf('   ')).toBe(UNKNOWN_FAMILY);
        });
    });
});
