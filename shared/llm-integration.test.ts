/**
 * Integration tests for LLM API calls.
 * Skip by default. Run with: INTEGRATION=true npx jest shared/llm-integration.test.ts
 * Requires LLM_API_KEY (and optionally LLM_FAST_API_KEY) in environment.
 */
import { llmPrompt } from './llm-client';

const runIntegration = process.env.INTEGRATION === 'true';

const itMaybe = runIntegration ? it : it.skip;

beforeAll(() => {
    if (!runIntegration) {
        console.log('Skipping integration tests. Set INTEGRATION=true to run.');
    }
});

describe('LLM Integration', () => {
    itMaybe(
        'fast tier responds (Groq)',
        async () => {
            const result = await llmPrompt(
                'fast',
                'You are a helpful assistant.',
                'Say "ok" and nothing else.',
                'integration-test',
            );
            expect(result.toLowerCase()).toContain('ok');
        },
        15000,
    );

    itMaybe(
        'main tier responds (OpenRouter)',
        async () => {
            const result = await llmPrompt(
                'main',
                'You are a helpful assistant.',
                'Say "ok" and nothing else.',
                'integration-test',
            );
            expect(result.toLowerCase()).toContain('ok');
        },
        15000,
    );
});
