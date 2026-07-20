import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'node:path';

// Real injector — we want to verify the wizard reconfiguration path actually
// rewrites project-name in an existing ci.yml (root-cause fix for the
// "pr-report hardcoded to qa_tools" defect). No mocking of ci-injector here.
import { injectPostProcessJob } from '../../shared/ci/ci-injector.js';

// Mock only the UI/feature-config/prompt surface; exercise the real fs + injector.
const mocks = vi.hoisted(() => ({
    mockGetPrReportConfig: vi.fn(),
    mockSetPrReportConfig: vi.fn(),
    mockPromptConfirm: vi.fn(),
    mockAsk: vi.fn(),
    mockInfo: vi.fn(),
    mockSuccess: vi.fn(),
    mockWarn: vi.fn(),
    mockTitle: vi.fn(),
    mockDivider: vi.fn(),
    mockPushHistory: vi.fn(),
    mockGetCurrentProject: vi.fn(() => 'client-x'),
    fsFiles: new Map<string, string>(),
}));

vi.mock('../../shared/feature-config.js', () => ({
    getPrReportConfig: mocks.mockGetPrReportConfig,
    setPrReportConfig: mocks.mockSetPrReportConfig,
}));

vi.mock('../../shared/ui/prompt.js', () => ({
    confirm: mocks.mockPromptConfirm,
    prompt: mocks.mockAsk,
    info: mocks.mockInfo,
    success: mocks.mockSuccess,
    warn: mocks.mockWarn,
    title: mocks.mockTitle,
    divider: mocks.mockDivider,
}));

vi.mock('../session-state.js', () => ({
    pushHistory: mocks.mockPushHistory,
}));

vi.mock('../../shared/project-context.js', () => ({
    getCurrentProject: mocks.mockGetCurrentProject,
    setCurrentProject: vi.fn(),
    clearCurrentProject: vi.fn(),
}));

vi.mock('node:fs', () => ({
    default: {
        existsSync: (p: string) => mocks.fsFiles.has(String(p)),
        readFileSync: (p: string) => mocks.fsFiles.get(String(p)) ?? '',
        writeFileSync: (p: string, c: string) => {
            mocks.fsFiles.set(String(p), String(c));
        },
        mkdirSync: vi.fn(),
    },
    existsSync: (p: string) => mocks.fsFiles.has(String(p)),
    readFileSync: (p: string) => mocks.fsFiles.get(String(p)) ?? '',
    writeFileSync: (p: string, c: string) => {
        mocks.fsFiles.set(String(p), String(c));
    },
    mkdirSync: vi.fn(),
}));

import { handlePrReportReconfig } from '../pr-report-setup-handler.js';

const CI_WITH_QA_TOOLS =
    [
        'name: CI',
        '',
        'on: [push]',
        '',
        'jobs:',
        '  test:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - run: npm test',
        '  post-process:',
        "    if: always() && github.event_name != 'schedule'",
        '    needs: [test]',
        '    uses: ./.github/workflows/qa-post-process.yml',
        '    with:',
        '      project-name: qa_tools',
    ].join('\n') + '\n';

describe('Pr Report Reconfig — real injector rewrites project-name', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockGetCurrentProject.mockReturnValue('client-x');
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
        mocks.mockPromptConfirm.mockReturnValue(true);
        mocks.mockAsk.mockReturnValue('github-actions');
        mocks.fsFiles.clear();
        mocks.fsFiles.set(path.resolve(process.cwd(), '.github/workflows/ci.yml'), CI_WITH_QA_TOOLS);
    });

    it('rewrites project-name from qa_tools to the current client project on reconfig', () => {
        expect.hasAssertions();

        handlePrReportReconfig();

        const written = mocks.fsFiles.get(path.resolve(process.cwd(), '.github/workflows/ci.yml')) as string;

        expect(written).toContain('project-name: client-x');
        expect(written).not.toContain('project-name: qa_tools');
        // No duplicate job injected.
        expect(written.match(/^\s{2}post-process:/gm)).toHaveLength(1);
    });

    it('keeps the injector inverse path consistent (unit-level sanity)', () => {
        const updated = injectPostProcessJob(CI_WITH_QA_TOOLS, 'client-x');

        expect(updated).toContain('project-name: client-x');
        expect(updated).not.toContain('project-name: qa_tools');
    });
});
