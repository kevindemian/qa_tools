/**
 * Unit tests — XrayDataProvider XR-2 (requirement coverage + defects extraction).
 * XrayCloudClient is mocked (vi.fn) so no real creds / network are touched.
 * Verifies GraphQL response → RawXrayData.requirementCoverage / defects mapping,
 * positive shape, and negative/edge behavior (null, empty, missing fields).
 */
import { describe, it, expect, vi } from 'vitest';
import { XrayDataProvider } from '../../providers/xray-provider.js';
import type { XrayCloudClient } from '../../../jira/xray-cloud-client.js';

/** Fixture with executions, a test run carrying defects + requirement coverage,
 *  and a second run repeating a requirement (must be deduped). */
const GRAPHQL_RESPONSE = {
    getTestExecutions: {
        results: [
            {
                issueId: '1',
                jira: { key: 'CALC-456', summary: 'Exec A', status: { name: 'EXECUTING' } },
                tests: {
                    results: [
                        {
                            id: 'r1',
                            status: { name: 'PASSED' },
                            startedOn: 't1',
                            finishedOn: 't2',
                            test: {
                                jira: { key: 'CALC-1' },
                                requirementStatuses: [
                                    { requirement: { jira: { key: 'CALC-REQ-1' } }, status: { name: 'COVERED' } },
                                    { requirement: { jira: { key: 'CALC-REQ-2' } }, status: { name: 'NOT_COVERED' } },
                                ],
                            },
                            defects: [{ key: 'CALC-BUG-1', summary: 'Defect A', status: { name: 'OPEN' } }],
                        },
                        {
                            id: 'r2',
                            status: { name: 'FAILED' },
                            test: {
                                jira: { key: 'CALC-2' },
                                requirementStatuses: [
                                    { requirement: { jira: { key: 'CALC-REQ-1' } }, status: { name: 'COVERED' } },
                                ],
                            },
                            defects: [],
                        },
                    ],
                },
            },
        ],
    },
};

function makeProvider(response: unknown): XrayDataProvider {
    const graphql = vi.fn().mockResolvedValue(response);
    const client = { graphql } as unknown as XrayCloudClient;
    return new XrayDataProvider(client, 'id', 'secret', 'CALC');
}

describe('XrayDataProvider XR-2 (requirement coverage + defects)', () => {
    it('extracts requirement coverage and defects with correct shape', async () => {
        expect.hasAssertions();

        const raw = await makeProvider(GRAPHQL_RESPONSE).fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeDefined();

        const xray = raw.xray as NonNullable<typeof raw.xray>;

        // CALC-REQ-1 appears in both runs → deduped to a single entry.
        expect(xray.requirementCoverage).toHaveLength(2);
        expect(xray.requirementCoverage).toContainEqual({
            requirementKey: 'CALC-REQ-1',
            testKey: 'CALC-1',
            status: 'COVERED',
            confidence: 0.8,
        });
        expect(xray.requirementCoverage).toContainEqual({
            requirementKey: 'CALC-REQ-2',
            testKey: 'CALC-1',
            status: 'NOT_COVERED',
            confidence: 0.8,
        });

        expect(xray.defects).toHaveLength(1);

        const firstDefect = xray.defects ? xray.defects[0] : undefined;

        expect(firstDefect).toMatchObject({
            id: 'CALC-BUG-1',
            testKey: 'CALC-1',
            title: 'Defect A',
            status: 'OPEN',
            confidence: 0.8,
        });
    });

    it('records provenance for xray-requirement-coverage and xray-defects', async () => {
        expect.hasAssertions();

        const raw = await makeProvider(GRAPHQL_RESPONSE).fetchRawData({ repo: 'CALC' });

        expect(raw.provenance).toBeDefined();
        expect(raw.provenance?.get('xray-requirement-coverage')).toMatchObject({
            source: 'xray-api',
            confidence: 0.8,
        });
        expect(raw.provenance?.get('xray-defects')).toMatchObject({
            source: 'xray-api',
            confidence: 0.8,
        });
    });

    it('returns empty arrays when graphql returns null (auth/network failure)', async () => {
        expect.hasAssertions();

        const raw = await makeProvider(null).fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeUndefined();
    });

    it('returns empty arrays when response has no executions', async () => {
        expect.hasAssertions();

        const raw = await makeProvider({ getTestExecutions: { results: [] } }).fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeUndefined();
    });

    it('drops coverage/defects entries that lack required fields', async () => {
        expect.hasAssertions();

        const fixture = {
            getTestExecutions: {
                results: [
                    {
                        issueId: '1',
                        jira: { key: 'CALC-456', summary: 'Exec A', status: { name: 'EXECUTING' } },
                        tests: {
                            results: [
                                // requirementStatuses present but missing requirement key → dropped
                                {
                                    id: 'r1',
                                    status: { name: 'PASSED' },
                                    test: {
                                        jira: { key: 'CALC-1' },
                                        requirementStatuses: [{ status: { name: 'COVERED' } }],
                                    },
                                    // defects present but missing key → dropped
                                    defects: [{ summary: 'no key', status: { name: 'OPEN' } }],
                                },
                                // run with neither test nor defects → no entries
                                { id: 'r2', status: { name: 'FAILED' } },
                            ],
                        },
                    },
                ],
            },
        };

        const raw = await makeProvider(fixture).fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeDefined();

        const xray = raw.xray as NonNullable<typeof raw.xray>;

        expect(xray.requirementCoverage).toHaveLength(0);
        expect(xray.defects).toHaveLength(0);
        // no xr2 data → provenance must not claim it (provenance omitted entirely)
        expect(raw.provenance).toBeUndefined();
    });

    it('drops malformed (non-array / wrong shape) requirement + defect nodes', async () => {
        expect.hasAssertions();

        const fixture = {
            getTestExecutions: {
                results: [
                    {
                        issueId: '1',
                        jira: { key: 'CALC-456' },
                        tests: {
                            results: [
                                {
                                    id: 'r1',
                                    status: { name: 'PASSED' },
                                    test: {
                                        jira: { key: 'CALC-1' },
                                        requirementStatuses: 'not-an-array',
                                    },
                                    defects: 'not-an-array',
                                },
                            ],
                        },
                    },
                ],
            },
        };

        const raw = await makeProvider(fixture).fetchRawData({ repo: 'CALC' });
        const xray = raw.xray as NonNullable<typeof raw.xray>;

        expect(xray.requirementCoverage).toHaveLength(0);
        expect(xray.defects).toHaveLength(0);
    });
});
