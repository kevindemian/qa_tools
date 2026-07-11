/**
 * Unit tests — XrayDataProvider (XR-1).
 * XrayCloudClient is mocked at the module level so no network is touched.
 * Verifies GraphQL response → RawXrayData mapping and empty-result handling.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../xray-cloud-client.js', () => ({
    XrayCloudClient: class {
        graphql = vi.fn();
    },
}));

import { XrayDataProvider } from '../providers/xray-provider.js';

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
                            test: { jira: { key: 'CALC-1' } },
                            startedOn: 't1',
                            finishedOn: 't2',
                        },
                        { id: 'r2', status: { name: 'FAILED' }, test: { jira: { key: 'CALC-2' } } },
                    ],
                },
            },
        ],
    },
};

describe('XrayDataProvider', () => {
    it('maps test executions with aggregated counts', async () => {
        expect.hasAssertions();

        const { XrayCloudClient } = await import('../../xray-cloud-client.js');
        const client = new XrayCloudClient();
        (client.graphql as ReturnType<typeof vi.fn>).mockResolvedValue(GRAPHQL_RESPONSE);
        const provider = new XrayDataProvider(client, 'id', 'secret', 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeDefined();

        const xray = raw.xray as NonNullable<typeof raw.xray>;

        expect(xray.testExecutions).toHaveLength(1);
        expect(xray.testExecutions[0]?.key).toBe('CALC-456');
        expect(xray.testExecutions[0]?.status).toBe('EXECUTING');
        expect(xray.testExecutions[0]?.total).toBe(2);
        expect(xray.testExecutions[0]?.passed).toBe(1);
        expect(xray.testExecutions[0]?.failed).toBe(1);
        expect(xray.testExecutions[0]?.testRunCount).toBe(2);
    });

    it('maps test runs with status and identity', async () => {
        expect.hasAssertions();

        const { XrayCloudClient } = await import('../../xray-cloud-client.js');
        const client = new XrayCloudClient();
        (client.graphql as ReturnType<typeof vi.fn>).mockResolvedValue(GRAPHQL_RESPONSE);
        const provider = new XrayDataProvider(client, 'id', 'secret', 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeDefined();

        const xray = raw.xray as NonNullable<typeof raw.xray>;

        expect(xray.testRuns).toHaveLength(2);
        expect(xray.testRuns[0]?.testKey).toBe('CALC-1');
        expect(xray.testRuns[0]?.status).toBe('PASSED');
        expect(xray.testRuns[1]?.status).toBe('FAILED');
    });

    it('omits xray when graphql returns null (auth/network failure)', async () => {
        expect.hasAssertions();

        const { XrayCloudClient } = await import('../../xray-cloud-client.js');
        const client = new XrayCloudClient();
        (client.graphql as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const provider = new XrayDataProvider(client, 'id', 'secret', 'CALC');
        const raw = await provider.fetchRawData({ repo: 'CALC' });

        expect(raw.xray).toBeUndefined();
    });
});
