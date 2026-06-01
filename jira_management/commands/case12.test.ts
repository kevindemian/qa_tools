jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

jest.mock('../../shared/cli_base', () => ({
    sanitizeUrl: jest.fn((url: string) => url),
}));

jest.mock('../../shared/palette', () => ({
    palette: { red: jest.fn(), green: jest.fn(), yellow: jest.fn(), blue: jest.fn() },
}));

jest.mock('../../shared/output', () => ({
    defaultOutput: { print: jest.fn() },
}));

jest.mock('../../shared/metrics', () => ({
    loadMetrics: jest.fn().mockReturnValue({ runs: [] }),
}));

import case12 from './case12';
import { makeMockCommandContext } from '../../shared/test-utils';

const mockJiraResource = {
    axiosInstance: {
        get: jest.fn().mockResolvedValue({ status: 200 }),
        post: jest.fn().mockResolvedValue({}),
    },
};

const mockContext = makeMockCommandContext({ jiraResource: mockJiraResource });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case12 — diagnostic connection', () => {
    it('exports a handler function', () => {
        expect(case12).toBeDefined();
        expect(typeof case12.handler).toBe('function');
    });

    it('executes without error with basic context', async () => {
        const result = await case12.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
    });

    it('shows health score warning when metrics and endpoints both fail', async () => {
        const metrics = require('../../shared/metrics');
        const { palette } = require('../../shared/palette');
        const output = require('../../shared/output');

        metrics.loadMetrics.mockReturnValueOnce({ runs: [], coverageHistory: [] });

        mockJiraResource.axiosInstance.get
            .mockRejectedValueOnce(new Error('error 1'))
            .mockRejectedValueOnce(new Error('error 2'))
            .mockRejectedValueOnce(new Error('error 3'));

        await case12.handler(mockContext);

        expect(palette.yellow).toHaveBeenCalledWith(
            expect.stringContaining('Dica: rode pipelines para acumular métricas'),
        );
        expect(output.defaultOutput.print).toHaveBeenCalled();
    });

    it('shows health score ready when enough runs exist', async () => {
        const metrics = require('../../shared/metrics');
        const { palette } = require('../../shared/palette');

        const runs = Array.from({ length: 10 }, (_, i) => ({
            timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
            project: 'TEST',
            total: 10,
            passed: 8,
            failed: 2,
            skipped: 0,
            duration: 100,
            tests: [],
        }));
        metrics.loadMetrics.mockReturnValueOnce({ runs, coverageHistory: [{ date: '2024-01-01', pct: 80 }] });

        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 });

        await case12.handler(mockContext);

        expect(palette.yellow).not.toHaveBeenCalledWith(expect.stringContaining('Dica: rode pipelines'));
    });

    it('shows health score with runs but no coverage', async () => {
        const metrics = require('../../shared/metrics');
        const prompt = require('../../shared/prompt');

        const runs = Array.from({ length: 10 }, (_, i) => ({
            timestamp: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
            project: 'TEST',
            total: 10,
            passed: 8,
            failed: 2,
            skipped: 0,
            duration: 100,
            tests: [],
        }));
        metrics.loadMetrics.mockReturnValueOnce({ runs });

        await case12.handler(mockContext);

        expect(prompt.tableView).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ Endpoint: 'Health Score', Status: expect.stringContaining('sem snapshots') }),
            ]),
            expect.any(Array),
            expect.any(String),
        );
    });

    it('shows health score with coverage but too few runs', async () => {
        const metrics = require('../../shared/metrics');
        const prompt = require('../../shared/prompt');

        metrics.loadMetrics.mockReturnValueOnce({
            runs: [
                {
                    timestamp: '2024-01-01T10:00:00Z',
                    project: 'TEST',
                    total: 10,
                    passed: 8,
                    failed: 2,
                    skipped: 0,
                    duration: 100,
                    tests: [],
                },
            ],
            coverageHistory: [{ date: '2024-01-01', pct: 80 }],
        });

        await case12.handler(mockContext);

        expect(prompt.tableView).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ Endpoint: 'Health Score', Status: expect.stringContaining('1/10 runs') }),
            ]),
            expect.any(Array),
            expect.any(String),
        );
    });
});
