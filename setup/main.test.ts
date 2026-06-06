import fs from 'fs';
import type { Mock } from 'vitest';
import * as prompt from '../shared/prompt.js';
import { detectFramework, extractRepoFromGit } from './detector.js';
import { writeProjectsConfig, writeDotEnvExample, writePrePushHook } from './config-writer.js';
import { generateGitHubActions } from './templates/github-ci.js';
import { generateGitLabCI } from './templates/gitlab-ci.js';
import { generatePrePushHook } from './templates/pre-push-hook.js';

vi.mock('../shared/prompt', async () => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    title: vi.fn(),
    info: vi.fn(),
    divider: vi.fn(),
}));

vi.mock('fs');
vi.mock('./detector', async () => ({
    detectFramework: vi.fn(),
    extractRepoFromGit: vi.fn(),
}));
vi.mock('./config-writer', async () => ({
    writeProjectsConfig: vi.fn(),
    writeDotEnvExample: vi.fn(),
    writePrePushHook: vi.fn(),
}));
vi.mock('./templates/github-ci', async () => ({
    generateGitHubActions: vi.fn(),
}));
vi.mock('./templates/gitlab-ci', async () => ({
    generateGitLabCI: vi.fn(),
}));
vi.mock('./templates/pre-push-hook', async () => ({
    generatePrePushHook: vi.fn(),
}));

const MockFs = vi.mocked(fs);
const MockDetect = vi.mocked(detectFramework);
const MockExtract = vi.mocked(extractRepoFromGit);
const MockWriteProjects = vi.mocked(writeProjectsConfig);
const MockWriteEnv = vi.mocked(writeDotEnvExample);
const MockWriteHook = vi.mocked(writePrePushHook);
const MockGenGithub = vi.mocked(generateGitHubActions);
const MockGenGitlab = vi.mocked(generateGitLabCI);
const MockGenHook = vi.mocked(generatePrePushHook);
const MockAsk = prompt.ask as unknown as Mock<typeof prompt.ask>;
const MockAskConfirm = prompt.askConfirm as unknown as Mock<typeof prompt.askConfirm>;

import { main } from './main.js';

function mockGitHubDetect() {
    vi.mocked(MockFs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('.git/config')) {
            return '[remote "origin"]\n\turl = git@github.com:myorg/my-repo.git\n';
        }
        return '';
    });
}

function mockAskForTests(prePush: boolean) {
    MockAsk.mockResolvedValueOnce('myapp')
        .mockResolvedValueOnce('cypress')
        .mockResolvedValueOnce('npx cypress run')
        .mockResolvedValueOnce('npm ci')
        .mockResolvedValueOnce('ctrf-report.json')
        .mockResolvedValueOnce('20');
    MockAskConfirm.mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(prePush);
}

describe('setup main', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(MockFs.existsSync).mockReturnValue(false);
        vi.mocked(MockFs.mkdirSync).mockImplementation(vi.fn());
        vi.mocked(MockFs.writeFileSync).mockImplementation(vi.fn());
        vi.mocked(MockFs.chmodSync).mockImplementation(vi.fn());
        MockDetect.mockReturnValue({
            framework: 'cypress',
            testCmd: 'npx cypress run',
            installCmd: 'npm ci',
            ctrfReportPath: 'cypress/reports/ctrf-report.json',
            nodeVersion: '20',
        });
        MockWriteProjects.mockReturnValue({
            filesCreated: ['config/projects.json', 'config/providers.json'],
            filesSkipped: [],
        });
        MockWriteEnv.mockReturnValue({ filesCreated: ['.env.example'], filesSkipped: [] });
        MockWriteHook.mockReturnValue({ filesCreated: ['.git/hooks/pre-push'], filesSkipped: [] });
        MockGenGithub.mockReturnValue('name: QA\n');
        MockGenGitlab.mockReturnValue('stages:\n  - test\n');
        MockGenHook.mockReturnValue('#!/bin/sh\necho "running"\n');
    });

    it('generates GitHub workflow when repo has owner', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(false);

        await main();

        expect(MockGenGithub).toHaveBeenCalled();
        expect(MockFs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('.github/workflows/qa.yml'),
            expect.any(String),
            'utf8',
        );
    });

    it('generates GitLab CI when user picks gitlab', async () => {
        MockExtract.mockReturnValue({ owner: '', repo: '' });
        MockAsk.mockResolvedValueOnce('myapp')
            .mockResolvedValueOnce('gitlab')
            .mockResolvedValueOnce('myorg')
            .mockResolvedValueOnce('cypress')
            .mockResolvedValueOnce('npx cypress run')
            .mockResolvedValueOnce('npm ci')
            .mockResolvedValueOnce('ctrf-report.json')
            .mockResolvedValueOnce('20');
        MockAskConfirm.mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);

        await main();

        expect(MockGenGitlab).toHaveBeenCalled();
    });

    it('writes .env.example via config-writer', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(false);

        await main();

        expect(MockWriteEnv).toHaveBeenCalled();
    });

    it('creates pre-push hook when feature is enabled', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(true);

        await main();

        expect(MockGenHook).toHaveBeenCalled();
        expect(MockWriteHook).toHaveBeenCalled();
    });

    it('does not create pre-push hook when feature is disabled', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(false);

        await main();

        expect(MockGenHook).not.toHaveBeenCalled();
    });

    it('skips existing GitLab pipeline file', async () => {
        MockExtract.mockReturnValue({ owner: '', repo: '' });
        MockAsk.mockResolvedValueOnce('myapp')
            .mockResolvedValueOnce('gitlab')
            .mockResolvedValueOnce('myorg')
            .mockResolvedValueOnce('cypress')
            .mockResolvedValueOnce('npx cypress run')
            .mockResolvedValueOnce('npm ci')
            .mockResolvedValueOnce('ctrf-report.json')
            .mockResolvedValueOnce('20');
        MockAskConfirm.mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        vi.mocked(MockFs.existsSync).mockImplementation((p: string | Buffer | URL) => {
            return p.toString().includes('.gitlab-ci.yml');
        });

        await main();

        expect(MockGenGitlab).toHaveBeenCalled();
        expect(MockFs.writeFileSync).not.toHaveBeenCalledWith(
            expect.stringContaining('.gitlab-ci.yml'),
            expect.any(String),
            'utf8',
        );
    });
});
