jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    prompt: jest.fn(),
    confirm: jest.fn(),
    printError: jest.fn(),
    withSpinner: jest.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
}));

const mockState = { currentProvider: 'gitlab', currentProjectName: '' };

jest.mock('./session-state', () => ({
    pushHistory: jest.fn(),
    displayProjects: jest.fn(),
    displayRecentPipelines: jest.fn(),
    createManagerForProject: jest.fn(() => mockManager),
    getProviderForProject: jest.fn(() => 'gitlab'),
    setCurrentProjectName: jest.fn(),
    setProjectId: jest.fn(),
    setManager: jest.fn(),
    getProjects: jest.fn(() => ({})),
    get currentProvider() {
        return mockState.currentProvider;
    },
    get currentProjectName() {
        return mockState.currentProjectName;
    },
}));

jest.mock('../shared/metrics', () => ({
    loadMetrics: jest.fn(() => ({ runs: [] })),
    calculateFlakiness: jest.fn(() => []),
}));

jest.mock('../shared/flakiness-dashboard', () => ({ generateFlakinessHtml: jest.fn(() => '<html>') }));

jest.mock('../shared/open', () => ({ openWithFallback: jest.fn() }));

jest.mock('../shared/state', () => ({ update: jest.fn() }));

jest.mock('fs', () => ({
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    existsSync: jest.fn(),
    rmSync: jest.fn(),
}));

import { success, warn, info, print, prompt, printError } from '../shared/prompt';
import { pushHistory, getProjects } from './session-state';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import {
    handleListSchedules,
    handleRunSchedule,
    handleChangeProject,
    handleFlakinessDashboard,
} from './schedule-handler';
import { createMockGitProvider } from '../shared/test-utils/factories';

const mockPrompt = jest.mocked(prompt);
const mockPushHistory = jest.mocked(pushHistory);
const mockPrintError = jest.mocked(printError);
const mockWarn = jest.mocked(warn);
const mockInfo = jest.mocked(info);
const mockLoadMetrics = jest.mocked(loadMetrics);
const mockCalculateFlakiness = jest.mocked(calculateFlakiness);
const mockGenerateHtml = jest.mocked(generateFlakinessHtml);

const mockManager = createMockGitProvider();

beforeEach(() => {
    jest.clearAllMocks();
    mockState.currentProvider = 'gitlab';
    mockState.currentProjectName = '';
});

beforeAll(() => {
    const openModule = require('../shared/open');
    if (!jest.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
});

describe('handleListSchedules', () => {
    it('lists schedules for gitlab', async () => {
        const schedules = [
            { id: '1', description: 'Nightly', next_run_at: '2026-01-01' },
            { id: '2', description: '' },
        ];
        jest.mocked(mockManager.getSchedules).mockResolvedValue(schedules);

        await handleListSchedules(mockManager);

        expect(info).toHaveBeenCalledWith(expect.stringContaining('Schedules'));
        expect(print).toHaveBeenCalledTimes(2);
        expect(mockPushHistory).toHaveBeenCalledWith('list-schedules', '2 schedules', 'ok');
    });

    it('warns on empty schedules', async () => {
        jest.mocked(mockManager.getSchedules).mockResolvedValue([]);

        await handleListSchedules(mockManager);

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum schedule'));
    });

    it('warns for github provider', async () => {
        mockState.currentProvider = 'github';

        await handleListSchedules(mockManager);

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('GitHub'));
        expect(mockManager.getSchedules).not.toHaveBeenCalled();
    });

    it('handles error', async () => {
        jest.mocked(mockManager.getSchedules).mockRejectedValue(new Error('API error'));

        await handleListSchedules(mockManager);

        expect(mockPrintError).toHaveBeenCalled();
    });
});

describe('handleRunSchedule', () => {
    it('runs schedule for gitlab', async () => {
        mockPrompt.mockReturnValue('schedule-1');
        jest.mocked(mockManager.runSchedule).mockResolvedValue({ status: 'success' });

        await handleRunSchedule(mockManager);

        expect(mockManager.runSchedule).toHaveBeenCalledWith('schedule-1');
        expect(success).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('schedule-run', 'schedule-1', 'ok');
    });

    it('warns for github provider', async () => {
        mockState.currentProvider = 'github';

        await handleRunSchedule(mockManager);

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('GitHub'));
        expect(mockManager.runSchedule).not.toHaveBeenCalled();
    });

    it('handles error', async () => {
        mockPrompt.mockReturnValue('sched-1');
        jest.mocked(mockManager.runSchedule).mockRejectedValue(new Error('fail'));

        await handleRunSchedule(mockManager);

        expect(mockPrintError).toHaveBeenCalled();
    });
});

describe('handleChangeProject', () => {
    const names = ['proj1', 'proj2'];

    it('changes to valid project', async () => {
        mockPrompt.mockReturnValue('1');
        jest.mocked(getProjects).mockReturnValue({ proj1: '1', proj2: '2' });

        await handleChangeProject(names);

        const { setCurrentProjectName, setProjectId, setManager } = require('./session-state');
        expect(setCurrentProjectName).toHaveBeenCalledWith('proj1');
        expect(setProjectId).toHaveBeenCalledWith('1');
        expect(setManager).toHaveBeenCalled();
        expect(success).toHaveBeenCalledWith(expect.stringContaining('proj1'));
    });

    it('warns on invalid index', async () => {
        mockPrompt.mockReturnValue('99');

        await handleChangeProject(names);

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });
    it('warns on NaN', async () => {
        mockPrompt.mockReturnValue('abc');

        await handleChangeProject(names);

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('inválida'));
    });
});

describe('handleFlakinessDashboard', () => {
    it('warns when no project selected', () => {
        void handleFlakinessDashboard();

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
    });

    it('warns when less than 2 runs', () => {
        mockState.currentProjectName = 'proj1';
        mockLoadMetrics.mockReturnValue({
            runs: [
                { project: 'proj1', timestamp: '', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, tests: [] },
            ],
        });

        void handleFlakinessDashboard();

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2'));
    });

    it('informs when no flaky tests', () => {
        mockState.currentProjectName = 'proj1';
        mockLoadMetrics.mockReturnValue({
            runs: [
                { project: 'proj1', timestamp: '', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, tests: [] },
                { project: 'proj1', timestamp: '', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, tests: [] },
            ],
        });
        mockCalculateFlakiness.mockReturnValue([]);

        void handleFlakinessDashboard();

        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste flaky'));
    });

    it('generates dashboard HTML and opens browser', async () => {
        mockState.currentProjectName = 'proj1';
        mockLoadMetrics.mockReturnValue({
            runs: [
                { project: 'proj1', timestamp: '', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, tests: [] },
                { project: 'proj1', timestamp: '', total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, tests: [] },
            ],
        });
        mockCalculateFlakiness.mockReturnValue([
            { title: 't1', rate: 0.5, passCount: 1, failCount: 0, skipCount: 0, totalRuns: 1 },
        ]);

        await handleFlakinessDashboard();

        expect(mockGenerateHtml).toHaveBeenCalled();
        const { writeFileSync } = require('fs');
        expect(writeFileSync).toHaveBeenCalled();
        const { openWithFallback } = require('../shared/open');
        expect(openWithFallback).toHaveBeenCalledWith(expect.stringContaining('flakiness'), 'Dashboard de flaky', info);
    });
});
