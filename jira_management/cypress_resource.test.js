const { createHttpClient } = require('../shared/http-client');

jest.mock('../shared/http-client', () => ({
    createHttpClient: jest.fn()
}));

jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

const CypressResource = require('./cypress_resource');

describe('CypressResource', () => {
    let mockClient;
    let cypress;

    beforeEach(() => {
        mockClient = { get: jest.fn() };
        createHttpClient.mockReturnValue(mockClient);
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
                ]
            });
            await expect(cypress.fetchReport({
                cypressUrl: 'http://cypress', cypressToken: 'tok',
                startDate: '2024-01-01', projects: ['PROJ']
            })).resolves.not.toThrow();
        });

        it('handles invalid response (non-array)', async () => {
            mockClient.get.mockResolvedValue({ data: { error: 'bad' } });
            await expect(cypress.fetchReport({
                cypressUrl: 'http://cypress', cypressToken: 'tok',
                startDate: '2024-01-01', projects: ['PROJ']
            })).resolves.not.toThrow();
        });
    });
});
