import fs from 'fs';
import * as prompt from '../shared/prompt.js';
import { detectFramework, extractRepoFromGit } from './detector.js';
import { writeProjectsConfig, writeDotEnvExample, writePrePushHook } from './config-writer.js';
import { generateGitHubActions } from './templates/github-ci.js';
import { generateGitLabCI } from './templates/gitlab-ci.js';
import { generatePrePushHook } from './templates/pre-push-hook.js';

vi.mock('../shared/prompt', () => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    title: vi.fn(),
    info: vi.fn(),
    divider: vi.fn(),
}));

vi.mock('fs');
vi.mock('./detector', () => ({
    detectFramework: vi.fn(),
    extractRepoFromGit: vi.fn(),
}));
vi.mock('./config-writer', () => ({
    writeProjectsConfig: vi.fn(),
    writeDotEnvExample: vi.fn(),
    writePrePushHook: vi.fn(),
}));
vi.mock('./templates/github-ci', () => ({
    generateGitHubActions: vi.fn(),
}));
vi.mock('./templates/gitlab-ci', () => ({
    generateGitLabCI: vi.fn(),
}));
vi.mock('./templates/pre-push-hook', () => ({
    generatePrePushHook: vi.fn(),
}));
vi.mock('../scripts/smartwizard-llm', () => ({
    main: vi.fn(),
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
const MockAsk = vi.spyOn(prompt, 'ask');
const MockAskConfirm = vi.spyOn(prompt, 'askConfirm');

import { main } from './main.js';

import { main as configureLlm } from '../scripts/smartwizard-llm.js';
const MockConfigureLlm = vi.mocked(configureLlm);

function mockGitHubDetect() {
    vi.spyOn(MockFs, 'readFileSync').mockImplementation((p: fs.PathOrFileDescriptor) => {
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
        .mockResolvedValueOnce(prePush)
        .mockResolvedValueOnce(false);
}

describe('setup main', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(MockFs, 'existsSync').mockReturnValue(false);
        vi.spyOn(MockFs, 'mkdirSync').mockImplementation(vi.fn());
        vi.spyOn(MockFs, 'writeFileSync').mockImplementation(vi.fn());
        vi.spyOn(MockFs, 'chmodSync').mockImplementation(vi.fn());
        MockDetect.mockReturnValue({
            framework: 'cypress',
            testCmd: 'npx cypress run',
            installCmd: 'npm ci',
            ctrfReportPath: 'cypress/reports/ctrf-report.json',
            nodeVersion: '20',
            ctrfSource: 'cli-flag',
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
            .mockResolvedValueOnce(false)
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

    it('asks to configure LLM and does so when accepted', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        MockAsk.mockResolvedValueOnce('myapp')
            .mockResolvedValueOnce('cypress')
            .mockResolvedValueOnce('npx cypress run')
            .mockResolvedValueOnce('npm ci')
            .mockResolvedValueOnce('ctrf-report.json')
            .mockResolvedValueOnce('20');
        MockAskConfirm.mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true); // configure LLM = yes

        await main();

        expect(MockConfigureLlm).toHaveBeenCalled();
    });

    it('skips LLM config when user declines', async () => {
        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        MockAsk.mockResolvedValueOnce('myapp')
            .mockResolvedValueOnce('cypress')
            .mockResolvedValueOnce('npx cypress run')
            .mockResolvedValueOnce('npm ci')
            .mockResolvedValueOnce('ctrf-report.json')
            .mockResolvedValueOnce('20');
        MockAskConfirm.mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false); // configure LLM = no

        await main();

        expect(MockConfigureLlm).not.toHaveBeenCalled();
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
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(false);
        vi.spyOn(MockFs, 'existsSync').mockImplementation((p: string | Buffer | URL) => {
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
