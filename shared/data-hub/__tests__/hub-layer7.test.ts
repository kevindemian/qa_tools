/**
 * F1-T4 — Layer 7 (User Fallback) integration tests at the DataHub boundary.
 *
 * The manual fallback (pedido de dados) is a DataHub responsibility. These tests
 * exercise the REAL `DataHubImpl.create` path with the ONLY external boundary
 * mocked: `askTestSource` (user prompt / fs). Internal Layer-7 logic runs for real.
 *
 * Covered outcomes:
 *   (a) raw already has parsed artifacts  -> fallback not invoked.
 *   (b) manual file provided              -> parsedArtifacts populated + framework default.
 *   (c) NO_TTY / NO_DATA_SOURCE           -> explicit Layer7UnavailableError, never silent skip.
 *   (d) allowEmpty:true                   -> resilient empty hub (warning NO_DATA).
 *   (e) allowEmpty:false                  -> explicit throw (PR report main path).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataHubImpl } from '../hub.js';
import { makeDataHubPersistenceMock } from '../../test-utils/factories/data-hub-mock.js';
import type { ParseResult } from '../../result_parser.js';
import type { RawData } from '../../types/data-hub.js';
import type { ArtifactParseResult } from '../artifact-parser.js';

const mockAskTestSource = vi.hoisted(() => vi.fn());

vi.mock('../test-source-fallback.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../test-source-fallback.js')>();
    return { ...actual, askTestSource: mockAskTestSource };
});

function createMockPersistence(): ReturnType<typeof makeDataHubPersistenceMock> {
    return makeDataHubPersistenceMock();
}

const parseResult: ParseResult = {
    tests: [{ title: 'sample test', state: 'passed', duration: 120 }],
    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 120 },
};

function rawWithParsedArtifacts(): RawData {
    const entry: ArtifactParseResult = { fileName: 'ci-report.json', data: parseResult, format: 'ctrf' };
    return {
        runs: [],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
        parsedArtifacts: new Map([[0, [entry]]]),
    };
}

describe('DataHubImpl Layer 7 (User Fallback)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAskTestSource.mockReset();
    });

    it('(a) skips Layer 7 when raw already has parsed artifacts', async () => {
        expect.hasAssertions();

        const provider = {
            name: 'test-provider',
            source: 'github' as const,
            fetchRawData: vi.fn().mockResolvedValue(rawWithParsedArtifacts()),
        };

        const result = await DataHubImpl.create([provider], { repo: 'test/repo' }, createMockPersistence());

        expect(result.status).toBe('ok');
        expect(result.hub.raw.parsedArtifacts?.size).toBe(1);
        expect(mockAskTestSource).not.toHaveBeenCalled();
    });

    it('(b) populates parsedArtifacts from the manual file and defaults framework', async () => {
        expect.hasAssertions();

        mockAskTestSource.mockResolvedValue({ data: parseResult, source: 'user-report.json' });

        const result = await DataHubImpl.create([], { repo: 'test/repo' }, createMockPersistence());

        expect(mockAskTestSource).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('ok');
        expect(result.hub.raw.parsedArtifacts?.size).toBe(1);

        const entry = result.hub.raw.parsedArtifacts?.get(0)?.[0];

        expect(entry?.fileName).toBe('user-report.json');
        expect(result.hub.raw.framework).toBe('unknown');
    });

    it('(c) throws explicit Layer7UnavailableError on NO_TTY (never silent skip)', async () => {
        expect.hasAssertions();

        mockAskTestSource.mockResolvedValue({ data: null, error: 'NO_TTY' });

        const promise = DataHubImpl.create([], { repo: 'test/repo' }, createMockPersistence());

        await expect(promise).rejects.toMatchObject({ name: 'Layer7UnavailableError' });
    });

    it('(e) throws explicit Layer7UnavailableError on NO_DATA_SOURCE (never silent skip)', async () => {
        expect.hasAssertions();

        mockAskTestSource.mockResolvedValue({ data: null, error: 'NO_DATA_SOURCE' });

        const promise = DataHubImpl.create([], { repo: 'test/repo' }, createMockPersistence());

        await expect(promise).rejects.toMatchObject({ name: 'Layer7UnavailableError' });
    });

    it('(d) returns resilient empty hub (warning NO_DATA) when allowEmpty is set', async () => {
        expect.hasAssertions();

        mockAskTestSource.mockResolvedValue({ data: null, error: 'NO_TTY' });

        const result = await DataHubImpl.create([], { repo: 'test/repo', allowEmpty: true }, createMockPersistence());

        expect(mockAskTestSource).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('warning');
        expect(result.warning?.code).toBe('NO_DATA');
        expect(result.hub.getRuns()).toHaveLength(0);
    });
});
