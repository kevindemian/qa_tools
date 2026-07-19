import { describe, it, expect } from 'vitest';
import { validateLlmResponse } from '../llm/llm-validation.js';
import { LlmError } from '../errors.js';

describe('ValidateLlmResponse (hermetic, local-hook-absent path)', () => {
    it('rejects an empty response (fail-loud, never silent)', async () => {
        expect.hasAssertions();
        await expect(validateLlmResponse('')).rejects.toBeInstanceOf(LlmError);
        await expect(validateLlmResponse('')).rejects.toThrow(/empty response/);
    });

    it('accepts a non-empty response when the local validation hook is absent (CI is the safety net)', async () => {
        expect.hasAssertions();
        // In CI / any environment without ~/.config/opencode/validation_hook.ts the validator is a
        // pass-through. We never create the protected hook file here.
        await expect(validateLlmResponse('some model output')).resolves.toBeUndefined();
    });

    it('accepts multi-line / structured content without modification path errors', async () => {
        expect.hasAssertions();

        const payload = '{"analysis": "ok", "confidence": 0.9}\n';

        await expect(validateLlmResponse(payload)).resolves.toBeUndefined();
    });
});
