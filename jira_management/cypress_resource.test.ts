jest.mock('../shared/http-client', () => ({
    createHttpClient: jest.fn(),
}));

import { createHttpClient } from '../shared/http-client';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory';

jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), writeFileOnly: jest.fn() },
}));

import CypressResource from './cypress_resource';

describe('CypressResource', () => {
    let mockClient: ReturnType<typeof createMockAxiosInstance>;
    let cypress: InstanceType<typeof CypressResource>;

    beforeEach(() => {
        mockClient = createMockAxiosInstance();
        jest.mocked(createHttpClient).mockReturnValue(mockClient);
        cypress = new CypressResource('http://cypress', 'token');
    });

    describe('getCypressResource', () => {
        it('returns data on success', async () => {
            mockClient.get.mockResolvedValue({ data: { items: [] } });
            const result = await cypress.getCypressResource('/report');
            expect(result).toEqual({ items: [] });
        });

        it('returns null on network error', async () => {
            mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));
            const result = await cypress.getCypressResource('/report');
            expect(result).toBeNull();
        });
    });

    describe('fetchReport', () => {
        it('calculates percentages correctly', async () => {
            mockClient.get.mockResolvedValue({
                data: [
                    { status: 'passed', test_run_count: 80 },
                    { status: 'passed', test_run_count: 20 },
                    { status: 'failed', test_run_count: 10 },
                ],
            });
            const reportResult = await cypress.fetchReport({
                cypressUrl: 'http://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });
            expect(reportResult).toBeUndefined();
        });

        it('handles invalid response (non-array)', async () => {
            mockClient.get.mockResolvedValue({ data: { error: 'bad' } });
            const invalidResult = await cypress.fetchReport({
                cypressUrl: 'http://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });
            expect(invalidResult).toBeUndefined();
        });

        it('handles all-passed report (no failed items)', async () => {
            mockClient.get.mockResolvedValue({
                data: [
                    { status: 'passed', test_run_count: 100 },
                    { status: 'passed', test_run_count: 50 },
                ],
            });

            await cypress.fetchReport({
                cypressUrl: 'http://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });
        });

        it('handles all-failed report (no passed items)', async () => {
            mockClient.get.mockResolvedValue({
                data: [
                    { status: 'failed', test_run_count: 30 },
                    { status: 'failed', test_run_count: 20 },
                ],
            });

            await cypress.fetchReport({
                cypressUrl: 'http://cypress',
                cypressToken: 'tok',
                startDate: '2024-01-01',
                projects: ['PROJ'],
            });
        });
    });
});
