import { expect } from 'vitest';

vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

vi.mock('../../shared/llm-client', () => ({
    llmPrompt: vi.fn(),
    getLlmClientMetrics: vi.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: vi.fn(),
    parseRetryAfter: vi.fn(() => 2000),
}));

vi.mock('../../shared/logger', () => ({
    rootLogger: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

vi.mock('../../shared/ai-feedback', () => ({
    recordAiGeneration: vi.fn(),
}));

vi.mock('crypto', () => ({
    default: {
        randomUUID: vi.fn().mockReturnValue('mock-uuid'),
    },
}));

vi.mock('fs');

vi.mock('../jira_link_manager', () => ({
    matchPreconditionByDualThreshold: vi.fn(),
}));

import * as promptModule from '../../shared/prompt.js';
import * as llmClientModule from '../../shared/llm-client.js';
import * as jiraLinkManagerModule from '../jira_link_manager.js';
import * as aiFeedbackModule from '../../shared/ai-feedback.js';
import * as fsModule from 'fs';
import case18Module from './case18.js';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';

const baseContext = createMockContext();

describe('Case18', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Case18 — AI tests generator', () => {
        it('generates tests with AI successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);

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
                system: expect.stringContaining('You are a QA engineer') as string,
                user: expect.stringContaining('User wants to login') as string,
                callerId: 'case18',
                schema: expect.anything() as unknown,
            });
            expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
        });

        it('handles empty user story', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            prompt.ask.mockResolvedValueOnce('');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('História vazia. Operação cancelada.');
        });

        it('handles LLM error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);

            prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

            fs.readFileSync.mockReturnValueOnce('template');

            llm.llmPrompt.mockRejectedValueOnce(new Error('LLM API error'));

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledWith('Falha ao gerar casos de teste com IA', expect.any(Error));
        });

        it('handles template read error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const fs = vi.mocked(fsModule);

            prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

            fs.readFileSync.mockImplementationOnce(() => {
                throw new Error('File not found');
            });

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledWith('Erro ao ler template de prompt', expect.any(Error));
        });

        it('handles valid test cases from llmPrompt', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);

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
            expect.hasAssertions();

            const llmPrompt = vi.mocked(llmClientModule).llmPrompt;
            const printError = vi.mocked(promptModule).printError;
            const prompt = vi.mocked(promptModule);
            const fs = vi.mocked(fsModule);

            prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
            fs.readFileSync.mockReturnValueOnce('You are a QA engineer.');

            llmPrompt.mockRejectedValueOnce(new Error('LLM response failed schema validation after retry'));

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(printError).toHaveBeenCalledWith('Falha ao gerar casos de teste com IA', expect.any(Error));
        });

        it('warns when project name is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
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
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');

            prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate credentials');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

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
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const jiraLM = vi.mocked(jiraLinkManagerModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([{ key: 'PC-1', summary: 'User must be logged in' }]);

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

            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalledWith(
                'New precondition needed',
                expect.any(Array),
            );
            expect(createPrecondSpy).toHaveBeenCalledWith('TEST', 'New precondition needed');
            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Pre-condition criada'));
            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('pre-conditions foram criadas'));
        });

        it('resolves matched preconditions to reference without creating', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const jiraLM = vi.mocked(jiraLinkManagerModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([{ key: 'PC-1', summary: 'User must be logged in' }]);

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
            expect(createPrecondSpy).not.toHaveBeenCalled();
            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Nenhuma pre-condition nova foi criada'));
        });

        it('handles failure to list preconditions', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');

            prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockRejectedValue(new Error('Jira unavailable'));

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
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');

            prompt.ask.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([]);

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
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const jiraLM = vi.mocked(jiraLinkManagerModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

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

            createPrecondSpy.mockRejectedValue(new Error('Jira error'));

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao criar pre-condition'));
        });

        it('converts test cases with various precondition resolutions', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const jiraLM = vi.mocked(jiraLinkManagerModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([{ key: 'PC-1', summary: 'User is logged in' }]);

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

            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(createPrecondSpy).toHaveBeenCalledWith('TEST', 'Newly created PC');
        });

        it('deduplicates identical summaries across test cases', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const jiraLM = vi.mocked(jiraLinkManagerModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.ask.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([]);

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

            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            /* Deduplicated: same summary → only one createPrecondition call */
            expect(jiraLM.matchPreconditionByDualThreshold).toHaveBeenCalledTimes(1);
            expect(createPrecondSpy).toHaveBeenCalledTimes(1);
        });

        it('records AI generation after successful test generation', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const jiraLM = vi.mocked(jiraLinkManagerModule);
            const aiFeedback = vi.mocked(aiFeedbackModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.ask.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');
            listPrecondSpy.mockResolvedValue([]);

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
            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(aiFeedback.recordAiGeneration).toHaveBeenCalledWith(
                expect.objectContaining({
                    promptVersion: 'v2',
                    userStory: 'User story text',
                    acceptanceCriteria: 'Some criteria',
                    generatedTests: expect.arrayContaining([
                        expect.objectContaining({ title: 'Generated Test', stepCount: 1 }),
                    ]) as Array<{ title: string; stepCount: number }>,
                }),
            );
        });
    });
});
