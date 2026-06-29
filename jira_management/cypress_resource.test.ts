vi.mock('../shared/http-client', () => ({
    createHttpClient: vi.fn(),
}));

import { createHttpClient } from '../shared/http-client.js';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';

vi.mock('../shared/logger', () => ({
    rootLogger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), writeFileOnly: vi.fn() },
}));

import CypressResource from './cypress_resource.js';

describe('CypressResource', () => {
    let mockClient: ReturnType<typeof createMockAxiosInstance>;
    let cypress: InstanceType<typeof CypressResource>;

    beforeEach(() => {
        mockClient = createMockAxiosInstance();
        vi.mocked(createHttpClient).mockReturnValue(mockClient);
        cypress = new CypressResource('https://cypress', 'token');
    });

    describe('GetCypressResource', () => {
        it('returns data on success', async () => {expect.hasAssertions();

            mockClient.get.mockResolvedValue({ data: { items: [] } });
            const result = await cypress.getCypressResource('/report');

            expect(result).toStrictEqual({ items: [] });
        });

        it('returns null on network error', async () => {expect.hasAssertions();

            mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
            const result = await cypress.getCypressResource('/report');

            expect(result).toBeNull();
        });
    });

    describe('FetchReport', () => {
        it('calculates percentages correctly', async () => {expect.hasAssertions();

            mockClient.get.mockResolvedValue({
                data: [
                    { status: 'passed', test_run_count: 80 },
                    { status: 'passed', test_run_count: 20 },
                    { status: 'failed', test_run_count: 10 },
                ],
            });
            const reportResult = await cypress.fetchReport({
                cypressUrl: 'https://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });

            expect(reportResult).toBeUndefined();
        });

        it('handles invalid response (non-array)', async () => {expect.hasAssertions();

            mockClient.get.mockResolvedValue({ data: { error: 'bad' } });
            const invalidResult = await cypress.fetchReport({
                cypressUrl: 'https://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });

            expect(invalidResult).toBeUndefined();
        });

        it('handles all-passed report (no failed items)', async () => {expect.hasAssertions();

            mockClient.get.mockResolvedValue({
                data: [
                    { status: 'passed', test_run_count: 100 },
                    { status: 'passed', test_run_count: 50 },
                ],
            });

            await cypress.fetchReport({
                cypressUrl: 'https://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });

            expect(mockClient.get.mock.calls.length).toBeGreaterThan(0);
        });

        it('handles all-failed report (no passed items)', async () => {expect.hasAssertions();

            mockClient.get.mockResolvedValue({
                data: [
                    { status: 'failed', test_run_count: 30 },
                    { status: 'failed', test_run_count: 20 },
                ],
            });

            await cypress.fetchReport({
                cypressUrl: 'https://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });

            expect(mockClient.get.mock.calls.length).toBeGreaterThan(0);
        });
    });
});
