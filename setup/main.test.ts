import fs from 'fs';
import * as prompt from '../shared/prompt';
import { detectFramework, extractRepoFromGit } from './detector';
import { writeProjectsConfig, writeDotEnvExample, writePrePushHook } from './config-writer';
import { generateGitHubActions } from './templates/github-ci';
import { generateGitLabCI } from './templates/gitlab-ci';
import { generatePrePushHook } from './templates/pre-push-hook';

jest.mock('../shared/prompt', () => ({
    ask: jest.fn(),
    askConfirm: jest.fn(),
    title: jest.fn(),
    info: jest.fn(),
    divider: jest.fn(),
}));

jest.mock('fs');
jest.mock('./detector', () => ({
    detectFramework: jest.fn(),
    extractRepoFromGit: jest.fn(),
}));
jest.mock('./config-writer', () => ({
    writeProjectsConfig: jest.fn(),
    writeDotEnvExample: jest.fn(),
    writePrePushHook: jest.fn(),
}));
jest.mock('./templates/github-ci', () => ({
    generateGitHubActions: jest.fn(),
}));
jest.mock('./templates/gitlab-ci', () => ({
    generateGitLabCI: jest.fn(),
}));
jest.mock('./templates/pre-push-hook', () => ({
    generatePrePushHook: jest.fn(),
}));

const MockFs = fs as jest.Mocked<typeof fs>;
const MockDetect = detectFramework as jest.MockedFunction<typeof detectFramework>;
const MockExtract = extractRepoFromGit as jest.MockedFunction<typeof extractRepoFromGit>;
const MockWriteProjects = writeProjectsConfig as jest.MockedFunction<typeof writeProjectsConfig>;
const MockWriteEnv = writeDotEnvExample as jest.MockedFunction<typeof writeDotEnvExample>;
const MockWriteHook = writePrePushHook as jest.MockedFunction<typeof writePrePushHook>;
const MockGenGithub = generateGitHubActions as jest.MockedFunction<typeof generateGitHubActions>;
const MockGenGitlab = generateGitLabCI as jest.MockedFunction<typeof generateGitLabCI>;
const MockGenHook = generatePrePushHook as jest.MockedFunction<typeof generatePrePushHook>;
const MockAsk = prompt.ask as jest.MockedFunction<typeof prompt.ask>;
const MockAskConfirm = prompt.askConfirm as jest.MockedFunction<typeof prompt.askConfirm>;

import setupModule from './main';

function mockGitHubDetect() {
    (MockFs.readFileSync as jest.Mock).mockImplementation((p: string | Buffer | URL) => {
        if (p.toString().includes('.git/config')) {
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
        jest.clearAllMocks();
        (MockFs.existsSync as jest.Mock).mockReturnValue(false);
        (MockFs.mkdirSync as jest.Mock).mockImplementation(jest.fn());
        (MockFs.writeFileSync as jest.Mock).mockImplementation(jest.fn());
        (MockFs.chmodSync as jest.Mock).mockImplementation(jest.fn());
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

        await setupModule.main();

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

        await setupModule.main();

        expect(MockGenGitlab).toHaveBeenCalled();
    });

    it('writes .env.example via config-writer', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(false);

        await setupModule.main();

        expect(MockWriteEnv).toHaveBeenCalled();
    });

    it('creates pre-push hook when feature is enabled', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(true);

        await setupModule.main();

        expect(MockGenHook).toHaveBeenCalled();
        expect(MockWriteHook).toHaveBeenCalled();
    });

    it('does not create pre-push hook when feature is disabled', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        mockAskForTests(false);

        await setupModule.main();

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
        (MockFs.existsSync as jest.Mock).mockImplementation((p: string | Buffer | URL) => {
            return p.toString().includes('.gitlab-ci.yml');
        });

        await setupModule.main();

        expect(MockGenGitlab).toHaveBeenCalled();
        expect(MockFs.writeFileSync).not.toHaveBeenCalledWith(
            expect.stringContaining('.gitlab-ci.yml'),
            expect.any(String),
            'utf8',
        );
    });
});
