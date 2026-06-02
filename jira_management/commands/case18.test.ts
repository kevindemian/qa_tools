import { expect } from '@jest/globals';

jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

jest.mock('../../shared/llm-client', () => ({
    llmPrompt: jest.fn(),
    getLlmClientMetrics: jest.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: jest.fn(),
    parseRetryAfter: jest.fn(() => 2000),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        warn: jest.fn(),
        info: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../../shared/ai-feedback', () => ({
    recordAiGeneration: jest.fn(),
}));

jest.mock('crypto', () => ({
    randomUUID: jest.fn().mockReturnValue('mock-uuid'),
}));

jest.mock('fs');

jest.mock('../jira_link_manager', () => ({
    matchPreconditionByDualThreshold: jest.fn(),
}));

import * as promptModule from '../../shared/prompt';
import * as llmClientModule from '../../shared/llm-client';
import * as jiraLinkManagerModule from '../jira_link_manager';
import * as aiFeedbackModule from '../../shared/ai-feedback';
import * as fsModule from 'fs';
import case18Module from './case18';
import { createMockContext } from '../../shared/test-utils/factories/context-factory';

const baseContext = createMockContext();

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case18 — AI tests generator', () => {
    it('generates tests with AI successfully', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate credentials');

        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llm.llmPrompt.mockResolvedValueOnce([
            {
                title: 'Login test with valid credentials',
                steps: ['Enter valid user', 'Enter valid password', 'Click login'],
                expectedResult: 'User is redirected to dashboard and sees welcome message',
            },
        ]);

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(llm.llmPrompt).toHaveBeenCalledWith({
            tier: 'fast',
            system: expect.stringContaining('You are a QA engineer'),
            user: expect.stringContaining('User wants to login'),
            callerId: 'case18',
            schema: expect.anything(),
        });
        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('handles empty user story', async () => {
        const prompt = jest.mocked(promptModule);
        prompt.ask.mockResolvedValueOnce('');

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith('História vazia. Operação cancelada.');
    });

    it('handles LLM error', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

        fs.readFileSync.mockReturnValueOnce('template');

        llm.llmPrompt.mockRejectedValueOnce(new Error('LLM API error'));

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalled();
    });

    it('handles template read error', async () => {
        const prompt = jest.mocked(promptModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

        fs.readFileSync.mockImplementationOnce(() => {
            throw new Error('File not found');
        });

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalled();
    });

    it('handles valid test cases from llmPrompt', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llm.llmPrompt.mockResolvedValueOnce([
            {
                title: 'Login test with valid credentials',
                steps: ['Enter valid user'],
                expectedResult: 'User is redirected to dashboard',
            },
        ]);

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('23.14: prints error when llmPrompt throws (Zod validation failed after retry)', async () => {
        const llmPrompt = jest.mocked(llmClientModule).llmPrompt;
        const printError = jest.mocked(promptModule).printError;
        const prompt = jest.mocked(promptModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

        llmPrompt.mockRejectedValueOnce(new Error('LLM response failed schema validation after retry'));

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(printError).toHaveBeenCalledWith('Falha ao gerar casos de teste com IA', expect.any(Error));
    });

    it('warns when project name is empty', async () => {
        const prompt = jest.mocked(promptModule);
        const origProjectName = baseContext.ctx.project_name;
        baseContext.ctx.project_name = '';

        prompt.ask
            .mockResolvedValueOnce('User story')
            .mockResolvedValueOnce('Acceptance criteria')
            .mockResolvedValueOnce('');

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith('Projeto vazio. Operação cancelada.');
        baseContext.ctx.project_name = origProjectName;
    });

    it('lists preconditions from Jira project', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate credentials');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test with valid credentials',
                steps: ['Enter valid user', 'Click login'],
                expectedResult: 'Expected result text for validation',
            },
        ]);

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('pre-conditions encontradas'));
    });

    it('creates new preconditions when dual-threshold returns create', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const jiraLM = jest.mocked(jiraLinkManagerModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([
            { key: 'PC-1', summary: 'User must be logged in' },
        ]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
                preConditions: [{ type: 'create', summary: 'New precondition needed' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'New precondition needed',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition.mockResolvedValue('PC-NEW-1');

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalled();
        expect(baseContext.linkManager.createPrecondition).toHaveBeenCalledWith('TEST', 'New precondition needed');
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Pre-condition criada'));
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('pre-conditions foram criadas'));
    });

    it('resolves matched preconditions to reference without creating', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const jiraLM = jest.mocked(jiraLinkManagerModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([
            { key: 'PC-1', summary: 'User must be logged in' },
        ]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
                preConditions: [{ type: 'create', summary: 'User must be logged in' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: 'PC-1',
            summary: 'User must be logged in',
            matchType: 'exact',
        });

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalledWith(
            'User must be logged in',
            expect.any(Array),
        );
        expect(baseContext.linkManager.createPrecondition).not.toHaveBeenCalled();
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Nenhuma pre-condition nova foi criada'));
    });

    it('handles failure to list preconditions', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockRejectedValue(new Error('Jira unavailable'));

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Login test',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
            },
        ]);

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Não foi possível buscar pre-conditions'));
    });

    it('handles various precondition types in converted test cases', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test without precondition',
                steps: ['Step 1'],
                expectedResult: 'Expected result one text here',
            },
            {
                title: 'Test with reference precondition',
                steps: ['Step 1'],
                expectedResult: 'Expected result two text here',
                preConditions: [{ type: 'reference', key: 'PC-1' }],
            },
            {
                title: 'Test with create precondition no key',
                steps: ['Step 1'],
                expectedResult: 'Expected result three text here',
                preConditions: [{ type: 'create', summary: 'New precondition text' }],
            },
        ]);

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
    });

    it('handles precondition creation failure', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const jiraLM = jest.mocked(jiraLinkManagerModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test with preconditions',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation',
                preConditions: [{ type: 'create', summary: 'New precondition' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'New precondition',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition.mockRejectedValue(new Error('Jira error'));

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao criar pre-condition'));
    });

    it('converts test cases with various precondition resolutions', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const jiraLM = jest.mocked(jiraLinkManagerModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test with create matching createdKeys',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation here',
                preConditions: [{ type: 'create', summary: 'Newly created PC' }],
            },
            {
                title: 'Test with reference no key',
                steps: ['Step 1'],
                expectedResult: 'Expected result text for validation there',
                preConditions: [{ type: 'reference' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'Newly created PC',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition.mockResolvedValue('PC-NEW-1');

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(baseContext.linkManager.createPrecondition).toHaveBeenCalledWith('TEST', 'Newly created PC');
    });

    it('deduplicates identical summaries across test cases', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const jiraLM = jest.mocked(jiraLinkManagerModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');

        baseContext.linkManager.listPreconditions.mockResolvedValue([]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Test 1',
                steps: ['Step 1'],
                expectedResult: 'Expected result one',
                preConditions: [{ type: 'create', summary: 'User must be logged in' }],
            },
            {
                title: 'Test 2',
                steps: ['Step 1'],
                expectedResult: 'Expected result two',
                preConditions: [{ type: 'create', summary: 'User must be logged in' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'User must be logged in',
            matchType: 'create',
        });

        baseContext.linkManager.createPrecondition.mockResolvedValue('PC-NEW-1');

        const mod = case18Module;
        await mod.handler(baseContext);

        /* Deduplicated: same summary → only one createPrecondition call */
        expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalledTimes(1);
        expect(baseContext.linkManager.createPrecondition).toHaveBeenCalledTimes(1);
    });

    it('records AI generation after successful test generation', async () => {
        const prompt = jest.mocked(promptModule);
        const llm = jest.mocked(llmClientModule);
        const jiraLM = jest.mocked(jiraLinkManagerModule);
        const aiFeedback = jest.mocked(aiFeedbackModule);
        const fs = jest.mocked(fsModule);

        prompt.ask.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
        fs.readFileSync.mockReturnValue('You are a QA engineer.');
        baseContext.linkManager.listPreconditions.mockResolvedValue([]);

        llm.llmPrompt.mockResolvedValue([
            {
                title: 'Generated Test',
                steps: ['Step 1'],
                expectedResult: 'Expected result',
                preConditions: [{ type: 'create', summary: 'Precondition A' }],
            },
        ]);
        jiraLM.matchPreconditionByDualThreshold.mockReturnValue({
            key: '__create__',
            summary: 'Precondition A',
            matchType: 'create',
        });
        baseContext.linkManager.createPrecondition.mockResolvedValue('PC-NEW-1');

        const mod = case18Module;
        await mod.handler(baseContext);

        expect(aiFeedback.recordAiGeneration).toHaveBeenCalledWith(
            expect.objectContaining({
                promptVersion: 'v2',
                userStory: 'User story text',
                acceptanceCriteria: 'Some criteria',
                generatedTests: expect.arrayContaining([
                    expect.objectContaining({ title: 'Generated Test', stepCount: 1 }),
                ]),
            }),
        );
    });
});
