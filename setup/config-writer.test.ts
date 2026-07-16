import fs from 'fs';
import path from 'path';
import { writeDotEnvExample, writeFeaturesConfig } from './config-writer.js';

vi.mock('fs');
const MockFs = vi.mocked(fs);

const mockSetPrReportConfig = vi.hoisted(() => vi.fn());
vi.mock('../shared/feature-config.js', () => ({
    setPrReportConfig: mockSetPrReportConfig,
}));

describe('WriteDotEnvExample', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(MockFs, 'existsSync').mockReturnValue(false);
        vi.spyOn(MockFs, 'writeFileSync').mockImplementation(vi.fn());
    });

    it('creates .env.example with GitHub vars', () => {
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'github' });

        expect(result.filesCreated).toContain(path.resolve(process.cwd(), '.env.example'));

        const content = (MockFs.writeFileSync.mock.calls[0]?.[1] ?? '') as string;

        expect(content).toContain('GITHUB_TOKEN');
        expect(content).not.toContain('GIT_TOKEN');
    });

    it('creates .env.example with GitLab vars', () => {
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'gitlab' });

        expect(result.filesCreated).toHaveLength(1);

        const content = (MockFs.writeFileSync.mock.calls[0]?.[1] ?? '') as string;

        expect(content).toContain('GIT_TOKEN');
        expect(content).toContain('GIT_BASE_URL');
    });

    it('skips when .env.example already exists', () => {
        vi.spyOn(MockFs, 'existsSync').mockReturnValue(true);
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'github' });

        expect(result.filesSkipped).toHaveLength(1);
        expect(MockFs.writeFileSync).not.toHaveBeenCalled();
    });
});

describe('WriteFeaturesConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSetPrReportConfig.mockClear();
    });

    it('returns empty result when prReport is disabled', () => {
        const ctx = {
            projectName: 'myapp',
            features: {
                prReport: false,
                prReportPublishTarget: 'github-actions',
                qualityGate: true,
                flakinessDashboard: true,
                aiFailureAnalysis: true,
                prePushHook: false,
            },
        } as Parameters<typeof writeFeaturesConfig>[0];

        const result = writeFeaturesConfig(ctx);

        expect(result.filesCreated).toHaveLength(0);
        expect(result.filesSkipped).toHaveLength(0);
        expect(mockSetPrReportConfig).not.toHaveBeenCalled();
    });

    it('calls setPrReportConfig with correct args when prReport enabled', () => {
        const ctx = {
            projectName: 'myapp',
            features: {
                prReport: true,
                prReportPublishTarget: 'github-actions',
                qualityGate: true,
                flakinessDashboard: true,
                aiFailureAnalysis: true,
                prePushHook: false,
            },
        } as Parameters<typeof writeFeaturesConfig>[0];

        const result = writeFeaturesConfig(ctx);

        expect(result.filesCreated).toContain(path.resolve(process.cwd(), 'config', 'features.json'));
        expect(mockSetPrReportConfig).toHaveBeenCalledWith(
            'myapp',
            {
                enabled: true,
                publishTarget: 'github-actions',
                skipAi: false,
                skipQuality: false,
                skipFlaky: false,
            },
            process.cwd(),
        );
    });

    it('persists inverted skip flags correctly', () => {
        const ctx = {
            projectName: 'myapp',
            features: {
                prReport: true,
                prReportPublishTarget: 'gitlab-ci',
                qualityGate: false,
                flakinessDashboard: false,
                aiFailureAnalysis: false,
                prePushHook: false,
            },
        } as Parameters<typeof writeFeaturesConfig>[0];

        writeFeaturesConfig(ctx);

        expect(mockSetPrReportConfig).toHaveBeenCalledWith(
            'myapp',
            {
                enabled: true,
                publishTarget: 'gitlab-ci',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
            },
            process.cwd(),
        );
    });

    it('handles mixed skip flags correctly', () => {
        const ctx = {
            projectName: 'myapp',
            features: {
                prReport: true,
                prReportPublishTarget: 'github-actions',
                qualityGate: true,
                flakinessDashboard: false,
                aiFailureAnalysis: true,
                prePushHook: false,
            },
        } as Parameters<typeof writeFeaturesConfig>[0];

        writeFeaturesConfig(ctx);

        expect(mockSetPrReportConfig).toHaveBeenCalledWith(
            'myapp',
            {
                enabled: true,
                publishTarget: 'github-actions',
                skipAi: false,
                skipQuality: false,
                skipFlaky: true,
            },
            process.cwd(),
        );
    });
});
