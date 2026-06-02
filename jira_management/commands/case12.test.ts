jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

jest.mock('../../shared/cli_base', () => ({
    sanitizeUrl: jest.fn((url: string) => url),
}));

const mockLoadMetrics = jest.fn<object, []>().mockReturnValue({ runs: [] });
const mockPrint = jest.fn<void, [string]>();
const mockPaletteYellow = jest.fn<string, [string]>();

jest.mock('../../shared/palette', () => ({
    palette: {
        red: jest.fn<string, [string]>(),
        green: jest.fn<string, [string]>(),
        yellow: mockPaletteYellow,
        blue: jest.fn<string, [string]>(),
    },
}));

jest.mock('../../shared/output', () => ({
    defaultOutput: { print: mockPrint },
}));

jest.mock('../../shared/metrics', () => ({
    loadMetrics: mockLoadMetrics,
}));

import { tableView } from '../../shared/prompt';
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
        mockLoadMetrics.mockReturnValueOnce({ runs: [], coverageHistory: [] });

        mockJiraResource.axiosInstance.get
            .mockRejectedValueOnce(new Error('error 1'))
            .mockRejectedValueOnce(new Error('error 2'))
            .mockRejectedValueOnce(new Error('error 3'));

        await case12.handler(mockContext);

        expect(mockPaletteYellow).toHaveBeenCalledWith(
            expect.stringContaining('Dica: rode pipelines para acumular métricas'),
        );
        expect(mockPrint).toHaveBeenCalled();
    });

    it('shows health score ready when enough runs exist', async () => {
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
        mockLoadMetrics.mockReturnValueOnce({
            runs,
            coverageHistory: [
                {
                    timestamp: '2024-01-01T00:00:00Z',
                    project: 'TEST',
                    totalIssues: 0,
                    mappedIssues: 0,
                    coveragePct: 80,
                },
            ],
        });

        mockJiraResource.axiosInstance.get
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 })
            .mockResolvedValueOnce({ status: 200 });

        await case12.handler(mockContext);

        expect(mockPaletteYellow).not.toHaveBeenCalledWith(expect.stringContaining('Dica: rode pipelines'));
    });

    it('shows health score with runs but no coverage', async () => {
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
        mockLoadMetrics.mockReturnValueOnce({ runs });

        await case12.handler(mockContext);

        expect(jest.mocked(tableView)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    Endpoint: 'Health Score',
                    Status: '🟡 insuficiente (sem snapshots de cobertura)',
                }),
            ]),
            expect.any(Array),
            expect.any(String),
        );
    });

    it('shows health score with coverage but too few runs', async () => {
        mockLoadMetrics.mockReturnValueOnce({
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
            coverageHistory: [
                {
                    timestamp: '2024-01-01T00:00:00Z',
                    project: 'TEST',
                    totalIssues: 0,
                    mappedIssues: 0,
                    coveragePct: 80,
                },
            ],
        });

        await case12.handler(mockContext);

        expect(jest.mocked(tableView)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ Endpoint: 'Health Score', Status: '🟡 insuficiente (1/10 runs)' }),
            ]),
            expect.any(Array),
            expect.any(String),
        );
    });
});
