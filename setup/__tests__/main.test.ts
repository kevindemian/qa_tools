import fs from 'fs';
import path from 'path';
import * as prompt from '../../shared/prompt.js';
import { detectFramework, extractRepoFromGit } from '../detector.js';
import { writeDotEnvExample, writePrePushHook } from '../config-writer.js';
import { generateCIWorkflow } from '../templates/github-ci.js';
import { generateGitLabCI } from '../templates/gitlab-ci.js';
import { generatePrePushHook } from '../templates/pre-push-hook.js';
import { generateQaPostProcessWorkflow } from '../templates/qa-post-process-workflow.js';
import { injectPostProcessJob } from '../../shared/ci-injector.js';

vi.mock('../../shared/prompt.js', () => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    title: vi.fn(),
    info: vi.fn(),
    divider: vi.fn(),
}));

vi.mock('fs');
vi.mock('../detector.js', () => ({
    detectFramework: vi.fn(),
    extractRepoFromGit: vi.fn(),
}));
vi.mock('../config-writer.js', () => ({
    writeDotEnvExample: vi.fn(),
    writePrePushHook: vi.fn(),
    writeFeaturesConfig: vi.fn(() => ({ filesCreated: [], filesSkipped: [] })),
}));
vi.mock('../templates/github-ci.js', () => ({
    generateCIWorkflow: vi.fn(() => 'name: CI\n'),
    generateQaPostProcessAction: vi.fn(() => 'name: QA Tools Post-Process\n'),
}));
vi.mock('../templates/gitlab-ci.js', () => ({
    generateGitLabCI: vi.fn(),
}));
vi.mock('../templates/pre-push-hook.js', () => ({
    generatePrePushHook: vi.fn(),
}));
vi.mock('../templates/qa-post-process-workflow.js', () => ({
    generateQaPostProcessWorkflow: vi.fn(() => 'name: QA Post-Process\n'),
}));
vi.mock('../../shared/ci-injector.js', () => ({
    injectPostProcessJob: vi.fn((content: string) => content),
}));
vi.mock('../../shared/state.js', () => ({
    loadTypedState: vi.fn(() => ({ lastProject: '' })),
}));
vi.mock('../../scripts/smartwizard-llm.js', () => ({
    main: vi.fn(),
}));

const MockFs = vi.mocked(fs);
const MockDetect = vi.mocked(detectFramework);
const MockExtract = vi.mocked(extractRepoFromGit);
const MockWriteEnv = vi.mocked(writeDotEnvExample);
const MockWriteHook = vi.mocked(writePrePushHook);
const MockGenGithub = vi.mocked(generateCIWorkflow);
const MockGenGitlab = vi.mocked(generateGitLabCI);
const MockGenHook = vi.mocked(generatePrePushHook);
const MockGenPostProcess = vi.mocked(generateQaPostProcessWorkflow);
const MockInjectPostProcess = vi.mocked(injectPostProcessJob);

import { main, parseCliDir } from '../main.js';
import * as projectRegistry from '../../shared/project-registry.js';
import * as envLoader from '../../shared/env-loader.js';

import { main as configureLlm } from '../../scripts/smartwizard-llm.js';
const MockConfigureLlm = vi.mocked(configureLlm);

const MockAddProject = vi.spyOn(projectRegistry, 'addProject');
const MockWriteEnvOverlay = vi.spyOn(envLoader, 'writeProjectEnvOverlay');
const MockAsk = vi.mocked(prompt).ask;
const MockAskConfirm = vi.mocked(prompt).askConfirm;

/**
 * Factory de respostas para o wizard. Estado compartilhado (`wizardAnswers`)
 * definido por teste e lido pelas implementações de mock fixadas em beforeEach.
 * Respostas determinísticas (nunca `undefined`) — sem dessincronização de posição.
 */
interface WizardAnswers {
    gitProvider?: 'github' | 'gitlab';
    repoOwner?: string;
    jiraKey?: string;
    prReport?: boolean;
    qualityGate?: boolean;
    flakinessDashboard?: boolean;
    aiFailureAnalysis?: boolean;
    prePushHook?: boolean;
    configureLlm?: boolean;
    overwriteGitlab?: boolean;
}

let wizardAnswers: WizardAnswers = {};

function setupWizardAnswers(a: WizardAnswers): void {
    wizardAnswers = a;
}

function applyWizardMockImplementations(): void {
    MockAsk.mockImplementation((question?: string) => {
        const q = (question ?? '').toLowerCase();
        let value = '';
        if (q.includes('git provider')) value = wizardAnswers.gitProvider ?? 'github';
        else if (q.includes('repo owner')) value = wizardAnswers.repoOwner ?? 'myorg';
        else if (q.includes('jira project key')) value = wizardAnswers.jiraKey ?? '';
        else if (q.includes('target de publicação')) {
            const target = (wizardAnswers.gitProvider ?? 'github') === 'github' ? 'github-actions' : 'gitlab-ci';
            value = target;
        } else if (q.includes('project name')) value = 'myapp';
        else if (q.includes('test framework')) value = 'cypress';
        else if (q.includes('test command')) value = 'npx cypress run';
        else if (q.includes('install command')) value = 'npm ci';
        else if (q.includes('test report path')) value = 'ctrf-report.json';
        else if (q.includes('artifact name')) value = 'test-report';
        else if (q.includes('node version')) value = '20';
        return Promise.resolve(value);
    });

    MockAskConfirm.mockImplementation((message?: string) => {
        const m = (message ?? '').toLowerCase();
        let value = false;
        if (m.includes('pr report')) value = wizardAnswers.prReport ?? true;
        else if (m.includes('quality gate')) value = wizardAnswers.qualityGate ?? true;
        else if (m.includes('flakiness')) value = wizardAnswers.flakinessDashboard ?? true;
        else if (m.includes('análise de falhas')) value = wizardAnswers.aiFailureAnalysis ?? true;
        else if (m.includes('pre-push')) value = wizardAnswers.prePushHook ?? false;
        else if (m.includes('llm')) value = wizardAnswers.configureLlm ?? false;
        else if (m.includes('sobrescrever') || m.includes('overwrite')) value = wizardAnswers.overwriteGitlab ?? false;
        return Promise.resolve(value);
    });
}

function mockGitHubDetect() {
    vi.spyOn(MockFs, 'readFileSync').mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('.git/config')) {
            return '[remote "origin"]\n\turl = git@github.com:myorg/my-repo.git\n';
        }
        return '';
    });
}

describe('Setup main', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        wizardAnswers = {};
        vi.spyOn(MockFs, 'existsSync').mockImplementation(
            (p: fs.PathOrFileDescriptor) => p.toString() === process.cwd(),
        );
        vi.spyOn(MockFs, 'mkdirSync').mockImplementation(vi.fn());
        vi.spyOn(MockFs, 'writeFileSync').mockImplementation(vi.fn());
        vi.spyOn(MockFs, 'chmodSync').mockImplementation(vi.fn());
        MockDetect.mockResolvedValue({
            framework: 'cypress',
            testCmd: 'npx cypress run',
            installCmd: 'npm ci',
            testReportPath: 'cypress/reports/ctrf-report.json',
            nodeVersion: '20',
            testReportSource: 'cli-flag',
        });
        MockWriteEnv.mockReturnValue({ filesCreated: ['.env.example'], filesSkipped: [] });
        MockWriteHook.mockReturnValue({ filesCreated: ['.git/hooks/pre-push'], filesSkipped: [] });
        MockGenGithub.mockReturnValue('name: QA\n');
        MockGenGitlab.mockReturnValue('stages:\n  - test\n');
        MockGenHook.mockReturnValue('#!/bin/sh\necho "running"\n');
        MockGenPostProcess.mockReturnValue('name: QA Post-Process\n');
        MockInjectPostProcess.mockImplementation((content: string) => content);
        applyWizardMockImplementations();
    });

    it('generates GitHub workflow when repo has owner', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: false });

        await main();

        expect(MockGenGithub).toHaveBeenCalledTimes(1);
        expect(MockFs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('.github/workflows/ci.yml'),
            expect.any(String),
            'utf8',
        );
    });

    it('registers project in XDG registry and writes per-project .env overlay', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: false });

        await main();

        expect(MockAddProject).toHaveBeenCalledTimes(1);

        const entry = MockAddProject.mock.calls[0]?.[0];

        expect(entry).toBeDefined();
        expect(entry?.name).toBe('myapp');
        expect(entry?.provider).toBe('github');
        expect(entry?.projectId).toBe('my-repo');
        expect(entry?.framework).toBe('cypress');
        expect(entry?.jiraKey).toBeUndefined();
        expect(Array.isArray(entry?.features)).toBeTruthy();
    });

    it('writes per-project .env overlay with the registered entry', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: false });

        await main();

        expect(MockWriteEnvOverlay).toHaveBeenCalledTimes(1);

        const overlayEntry = MockWriteEnvOverlay.mock.calls[0]?.[1];

        expect(overlayEntry?.name).toBe('myapp');
    });

    it('captures jiraKey when provided', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ jiraKey: 'PROJ', prePushHook: false, configureLlm: false });

        await main();

        const entry = MockAddProject.mock.calls[0]?.[0];

        expect(entry?.jiraKey).toBe('PROJ');
    });

    it('generates GitLab CI when user picks gitlab', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: '', repo: '' });
        setupWizardAnswers({ gitProvider: 'gitlab', repoOwner: 'myorg', prePushHook: false, configureLlm: false });

        await main();

        expect(MockGenGitlab).toHaveBeenCalledTimes(1);
        expect(MockAddProject.mock.calls[0]?.[0]?.provider).toBe('gitlab');
    });

    it('writes .env.example via config-writer', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: false });

        await main();

        expect(MockWriteEnv).toHaveBeenCalledTimes(1);
    });

    it('creates pre-push hook when feature is enabled', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: true, configureLlm: false });

        await main();

        expect(MockGenHook).toHaveBeenCalledTimes(1);
        expect(MockWriteHook).toHaveBeenCalledTimes(1);
    });

    it('does not create pre-push hook when feature is disabled', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: false });

        await main();

        expect(MockGenHook).not.toHaveBeenCalled();
    });

    it('asks to configure LLM and does so when accepted', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: true });

        await main();

        expect(MockConfigureLlm).toHaveBeenCalledTimes(1);
    });

    it('skips LLM config when user declines', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: false, configureLlm: false });

        await main();

        expect(MockConfigureLlm).not.toHaveBeenCalled();
    });

    it('skips existing GitLab pipeline file when overwrite declined', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: '', repo: '' });
        setupWizardAnswers({
            gitProvider: 'gitlab',
            repoOwner: 'myorg',
            prePushHook: false,
            configureLlm: false,
            overwriteGitlab: false,
        });
        vi.spyOn(MockFs, 'existsSync').mockImplementation(
            (p: fs.PathOrFileDescriptor) => p.toString() === process.cwd() || p.toString().includes('.gitlab-ci.yml'),
        );

        await main();

        expect(MockGenGitlab).toHaveBeenCalledTimes(1);
        expect(MockFs.writeFileSync).not.toHaveBeenCalledWith(
            expect.stringContaining('.gitlab-ci.yml'),
            expect.any(String),
            'utf8',
        );
    });
});

describe('Setup main — pr-report workflow generation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        wizardAnswers = {};
        vi.spyOn(MockFs, 'existsSync').mockImplementation(
            (p: fs.PathOrFileDescriptor) => p.toString() === process.cwd(),
        );
        vi.spyOn(MockFs, 'mkdirSync').mockImplementation(vi.fn());
        vi.spyOn(MockFs, 'writeFileSync').mockImplementation(vi.fn());
        vi.spyOn(MockFs, 'chmodSync').mockImplementation(vi.fn());
        MockDetect.mockResolvedValue({
            framework: 'cypress',
            testCmd: 'npx cypress run',
            installCmd: 'npm ci',
            testReportPath: 'cypress/reports/ctrf-report.json',
            nodeVersion: '20',
            testReportSource: 'cli-flag',
        });
        MockWriteEnv.mockReturnValue({ filesCreated: ['.env.example'], filesSkipped: [] });
        MockWriteHook.mockReturnValue({ filesCreated: ['.git/hooks/pre-push'], filesSkipped: [] });
        MockGenGithub.mockReturnValue('name: CI\n');
        MockGenGitlab.mockReturnValue('stages:\n  - test\n');
        MockGenHook.mockReturnValue('#!/bin/sh\necho "running"\n');
        MockGenPostProcess.mockReturnValue('name: QA Post-Process\n');
        MockInjectPostProcess.mockImplementation((content: string) => content);
        applyWizardMockImplementations();
    });

    it('generates qa-post-process.yml when prReport enabled', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: true, configureLlm: false });

        await main();

        expect(MockGenPostProcess).toHaveBeenCalledTimes(1);
        expect(MockFs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('qa-post-process.yml'),
            'name: QA Post-Process\n',
            'utf8',
        );
    });

    it('does not generate qa-post-process.yml when prReport disabled', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prReport: false, configureLlm: false });

        await main();

        expect(MockGenPostProcess).not.toHaveBeenCalled();
    });

    it('injects post-process job into existing ci.yml', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prReport: true, configureLlm: false });
        vi.spyOn(MockFs, 'existsSync').mockImplementation(
            (p: fs.PathOrFileDescriptor) => p.toString() === process.cwd() || p.toString().includes('ci.yml'),
        );
        vi.spyOn(MockFs, 'readFileSync').mockReturnValue('name: CI\n\njobs:\n  test:\n');

        await main();

        expect(MockInjectPostProcess).toHaveBeenCalledTimes(1);
    });

    it('passes correct context to generateQaPostProcessWorkflow', async () => {
        expect.hasAssertions();

        MockExtract.mockReturnValue({ owner: 'myorg', repo: 'my-repo' });
        mockGitHubDetect();
        setupWizardAnswers({ prePushHook: true, configureLlm: false });

        await main();

        expect(MockGenPostProcess).toHaveBeenCalledTimes(1);

        const ctx = MockGenPostProcess.mock.calls[0]?.[0];

        expect(ctx).toBeDefined();
        expect(ctx?.projectName).toBe('myapp');
        expect(ctx?.nodeVersion).toBe('20');
        expect(ctx?.installCmd).toBe('npm ci');
        expect(ctx?.gitProvider).toBe('github');
        expect(ctx?.repoOwner).toBe('myorg');
    });
});

describe('ParseCliDir', () => {
    it('returns null when --dir is absent', () => {
        expect(parseCliDir([])).toBeNull();
        expect(parseCliDir(['--batch', '--project', 'x'])).toBeNull();
    });

    it('returns resolved path for --dir', () => {
        expect(parseCliDir(['--dir', '/abs/path'])).toBe('/abs/path');
        expect(parseCliDir(['-d', 'rel'])).toBe(path.resolve('rel'));
    });

    it('throws when --dir has no value', () => {
        expect(() => parseCliDir(['--dir'])).toThrow(/caminho/);
    });
});
