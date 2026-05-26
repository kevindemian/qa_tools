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
import type { GitProvider } from '../shared/types';

const mockPrompt = prompt as jest.Mock;
const mockPushHistory = pushHistory as jest.Mock;
const mockPrintError = printError as jest.Mock;
const mockWarn = warn as jest.Mock;
const mockInfo = info as jest.Mock;
const mockLoadMetrics = loadMetrics as jest.Mock;
const mockCalculateFlakiness = calculateFlakiness as jest.Mock;
const mockGenerateHtml = generateFlakinessHtml as jest.Mock;

const mockManager = {
    getSchedules: jest.fn(),
    runSchedule: jest.fn(),
} as unknown as GitProvider;

beforeEach(() => {
    jest.clearAllMocks();
    mockState.currentProvider = 'gitlab';
    mockState.currentProjectName = '';
});

describe('handleListSchedules', () => {
    it('lists schedules for gitlab', async () => {
        const schedules = [
            { id: '1', description: 'Nightly', next_run_at: '2026-01-01' },
            { id: '2', description: '', next_run_at: null },
        ];
        (mockManager.getSchedules as jest.Mock).mockResolvedValue(schedules);

        await handleListSchedules(mockManager);

        expect(info).toHaveBeenCalledWith(expect.stringContaining('Schedules'));
        expect(print).toHaveBeenCalledTimes(2);
        expect(mockPushHistory).toHaveBeenCalledWith('list-schedules', '2 schedules', 'ok');
    });

    it('warns on empty schedules', async () => {
        (mockManager.getSchedules as jest.Mock).mockResolvedValue([]);

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
        (mockManager.getSchedules as jest.Mock).mockRejectedValue(new Error('API error'));

        await handleListSchedules(mockManager);

        expect(mockPrintError).toHaveBeenCalled();
    });
});

describe('handleRunSchedule', () => {
    it('runs schedule for gitlab', async () => {
        mockPrompt.mockReturnValue('schedule-1');
        (mockManager.runSchedule as jest.Mock).mockResolvedValue({ status: 'success' });

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
        (mockManager.runSchedule as jest.Mock).mockRejectedValue(new Error('fail'));

        await handleRunSchedule(mockManager);

        expect(mockPrintError).toHaveBeenCalled();
    });
});

describe('handleChangeProject', () => {
    const names = ['proj1', 'proj2'];

    it('changes to valid project', async () => {
        mockPrompt.mockReturnValue('1');
        (getProjects as jest.Mock).mockReturnValue({ proj1: '1', proj2: '2' });

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
        handleFlakinessDashboard();

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Nenhum projeto'));
    });

    it('warns when less than 2 runs', () => {
        mockState.currentProjectName = 'proj1';
        mockLoadMetrics.mockReturnValue({ runs: [{ project: 'proj1' }] });

        handleFlakinessDashboard();

        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Menos de 2'));
    });

    it('informs when no flaky tests', () => {
        mockState.currentProjectName = 'proj1';
        mockLoadMetrics.mockReturnValue({ runs: [{ project: 'proj1' }, { project: 'proj1' }] });
        mockCalculateFlakiness.mockReturnValue([]);

        handleFlakinessDashboard();

        expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste flaky'));
    });

    it('generates dashboard HTML', () => {
        mockState.currentProjectName = 'proj1';
        mockLoadMetrics.mockReturnValue({ runs: [{ project: 'proj1' }, { project: 'proj1' }] });
        mockCalculateFlakiness.mockReturnValue([{ test: 't1', rate: 0.5 }]);

        handleFlakinessDashboard();

        expect(mockGenerateHtml).toHaveBeenCalled();
        const { writeFileSync } = require('fs');
        expect(writeFileSync).toHaveBeenCalled();
        expect(success).toHaveBeenCalledWith(expect.stringContaining('Dashboard'));
    });
});
