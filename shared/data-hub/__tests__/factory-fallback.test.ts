/**
 * F1-T5 — Wiring test for the `createDataHubFromFallback` factory entry.
 *
 * Verifica o call-site Layer-7 ponta-a-ponta: entry de factory real ->
 * `DataHubImpl.create([], ...)` real -> mock apenas de `askTestSource`
 * (fronteira externa prompt/fs, Rule 26). Lógica interna roda de verdade.
 *
 * Desfechos:
 *   (1) arquivo manual fornecido -> hub ok com parsedArtifacts + source preservado.
 *   (2) contexto não-interativo (NO_TTY) -> `Layer7UnavailableError` explícito,
 *       nunca skip silencioso (Rule 25).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataHubFromFallback } from '../factory.js';
import { makeDataHubPersistenceMock } from '../../test-utils/factories/data-hub-mock.js';
import type { ParseResult } from '../../result_parser.js';

const mockAskTestSource = vi.hoisted(() => vi.fn());

vi.mock('../test-source-fallback.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../test-source-fallback.js')>();
    return { ...actual, askTestSource: mockAskTestSource };
});

const parseResult: ParseResult = {
    tests: [{ title: 'sample test', state: 'passed', duration: 50 }],
    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 50 },
};

describe('CreateDataHubFromFallback (call-site wiring)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAskTestSource.mockReset();
    });

    it('builds an ok hub from the manual file provided by the user', async () => {
        expect.hasAssertions();

        mockAskTestSource.mockResolvedValue({ data: parseResult, source: 'manual.json' });

        const result = await createDataHubFromFallback('test/repo', {
            persistence: makeDataHubPersistenceMock(),
        });

        expect(mockAskTestSource).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('ok');
        expect(result.hub.raw.parsedArtifacts?.size).toBe(1);

        const entry = result.hub.raw.parsedArtifacts?.get(0)?.[0];

        expect(entry?.fileName).toBe('manual.json');
    });

    it('propagates explicit Layer7UnavailableError in non-interactive context', async () => {
        expect.hasAssertions();

        mockAskTestSource.mockResolvedValue({ data: null, error: 'NO_TTY' });

        const promise = createDataHubFromFallback('test/repo', {
            persistence: makeDataHubPersistenceMock(),
        });

        await expect(promise).rejects.toMatchObject({ name: 'Layer7UnavailableError' });
    });
});
