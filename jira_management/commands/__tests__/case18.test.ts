import { expect } from 'vitest';

vi.mock('../../../shared/ui/prompt.js', () => ({
    ask: vi.fn(),
    askMultiline: vi.fn(),
    askConfirm: vi.fn(),
    showSelect: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    printError: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
}));
vi.mock('../../../shared/logger');

vi.mock('../../../shared/llm/llm-client.js', () => ({
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

vi.mock('../../../shared/logger', () => ({
    rootLogger: {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

vi.mock('crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('crypto')>();
    return {
        default: {
            ...actual,
            randomUUID: vi.fn().mockReturnValue('mock-uuid'),
        },
    };
});

vi.mock('fs');

import * as promptModule from '../../../shared/ui/prompt.js';
import * as llmClientModule from '../../../shared/llm/llm-client.js';
import * as fsModule from 'fs';
import os from 'os';
import path from 'path';
import case18Module, { toGeneratedTestCases } from '../case18.js';
import { createMockContext } from '../../../shared/test-utils/factories/context-factory.js';

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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline
                .mockResolvedValueOnce('User wants to login')
                .mockResolvedValueOnce('Must validate credentials');

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
                tier: 'main',
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
            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith('História vazia. Operação cancelada.');
        });

        it('handles LLM error', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');

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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create'); // pagination
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Acceptance criteria');
            prompt.ask.mockResolvedValueOnce('');

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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline
                .mockResolvedValueOnce('User wants to login')
                .mockResolvedValueOnce('Must validate credentials');
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
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
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

            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(createPrecondSpy).toHaveBeenCalledWith('TEST', 'New precondition needed');
            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Pre-condition criada'));
            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('pre-conditions foram criadas'));
        });

        it('resolves matched preconditions to reference without creating', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
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

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(createPrecondSpy).not.toHaveBeenCalled();
            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Nenhuma pre-condition nova foi criada'));
        });

        it('handles failure to list preconditions', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
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

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User wants to login').mockResolvedValueOnce('Must validate');
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
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
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

            createPrecondSpy.mockRejectedValue(new Error('Jira error'));

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao criar pre-condition'));
        });

        it('converts test cases with various precondition resolutions', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
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

            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(createPrecondSpy).toHaveBeenCalledWith('TEST', 'Newly created PC');
        });

        it('preserves multiple pre-conditions per test case in converted output', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');

            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');

            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            listPrecondSpy.mockResolvedValue([]);

            llm.llmPrompt.mockResolvedValue([
                {
                    title: 'Test with multiple preconditions',
                    steps: ['Step 1'],
                    expectedResult: 'Expected result text for validation here',
                    preConditions: [
                        { type: 'create', summary: 'First precondition' },
                        { type: 'create', summary: 'Second precondition' },
                    ],
                },
            ]);

            createPrecondSpy.mockResolvedValueOnce('PC-NEW-1').mockResolvedValueOnce('PC-NEW-2');

            const mod = case18Module;

            await mod.handler(baseContext);

            const writeCall = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
                (call) => typeof call[0] === 'string' && call[0].endsWith('llm-generated-tests.json'),
            );

            expect(writeCall).toBeDefined();

            const content = (writeCall ? writeCall[1] : '') as string;

            const written = JSON.parse(content) as Array<{
                title: string;
                precondition?: string[];
            }>;

            const converted = written.find((t) => t.title === 'Test with multiple preconditions');

            expect(converted).toBeDefined();

            expect(converted?.precondition).toBeDefined();

            expect(converted?.precondition).toHaveLength(2);

            expect(converted?.precondition).toStrictEqual(['PC-NEW-1', 'PC-NEW-2']);
        });

        it('deduplicates identical summaries across test cases', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
            const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
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

            createPrecondSpy.mockResolvedValue('PC-NEW-1');

            const mod = case18Module;
            await mod.handler(baseContext);

            /* Deduplicated: same summary → only one createPrecondition call */
            expect(createPrecondSpy).toHaveBeenCalledTimes(1);
        });

        it('records AI generation after successful test generation', async () => {
            expect.hasAssertions();

            const prevXdg = process.env['XDG_STATE_HOME'];
            process.env['XDG_STATE_HOME'] = path.join(os.tmpdir(), 'qa-tools-case18-feedback');
            try {
                const prompt = vi.mocked(promptModule);
                const llm = vi.mocked(llmClientModule);
                const fs = vi.mocked(fsModule);
                const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
                const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

                prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
                prompt.askMultiline.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
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
                createPrecondSpy.mockResolvedValue('PC-NEW-1');

                const mod = case18Module;
                await mod.handler(baseContext);

                const feedbackWrite = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
                    (call) => typeof call[0] === 'string' && call[0].endsWith('ai-feedback.json.tmp'),
                );

                expect(feedbackWrite).toBeDefined();

                const content = (feedbackWrite ? feedbackWrite[1] : '') as string;
                const parsed = JSON.parse(content) as {
                    records: Array<{
                        promptVersion: string;
                        userStory: string;
                        generatedTests: Array<{ stepCount: number }>;
                    }>;
                };

                const firstRecord = parsed.records[0];

                expect(firstRecord).toBeDefined();
                expect(firstRecord?.userStory).toBe('User story text');

                const firstGeneratedTest = firstRecord?.generatedTests[0];

                expect(firstGeneratedTest?.stepCount).toBe(1);
            } finally {
                if (prevXdg === undefined) delete process.env['XDG_STATE_HOME'];
                else process.env['XDG_STATE_HOME'] = prevXdg;
            }
        });

        it('records gateAction rejected when the user rejects at the gate', async () => {
            expect.hasAssertions();

            const prevXdg = process.env['XDG_STATE_HOME'];
            process.env['XDG_STATE_HOME'] = path.join(os.tmpdir(), 'qa-tools-case18-gate-reject');
            try {
                const prompt = vi.mocked(promptModule);
                const llm = vi.mocked(llmClientModule);
                const fs = vi.mocked(fsModule);
                const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
                const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

                prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValueOnce('reject');
                prompt.askMultiline.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
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

                const mod = case18Module;
                await mod.handler(baseContext);

                expect(createPrecondSpy).not.toHaveBeenCalled();
                expect(baseContext.pushHistory).toHaveBeenCalledWith(
                    'ai-generate-tests',
                    expect.stringContaining('rejeitado'),
                    'error',
                );

                const feedbackWrite = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
                    (call) => typeof call[0] === 'string' && call[0].endsWith('ai-feedback.json.tmp'),
                );

                expect(feedbackWrite).toBeDefined();
                const content = (feedbackWrite ? feedbackWrite[1] : '') as string;
                const parsed = JSON.parse(content) as {
                    records: Array<{ gateAction?: string; qualityMetrics?: Record<string, unknown> }>;
                };
                expect(parsed.records[0]?.gateAction).toBe('rejected');
                expect(parsed.records[0]?.qualityMetrics).toBeDefined();
                expect(Object.keys(parsed.records[0]?.qualityMetrics ?? {})).not.toHaveLength(0);
            } finally {
                if (prevXdg === undefined) delete process.env['XDG_STATE_HOME'];
                else process.env['XDG_STATE_HOME'] = prevXdg;
            }
        });

        it('re-generates with a CORRECTIONS REQUIRED feedback block and records gateAction regenerated', async () => {
            expect.hasAssertions();

            const prevXdg = process.env['XDG_STATE_HOME'];
            process.env['XDG_STATE_HOME'] = path.join(os.tmpdir(), 'qa-tools-case18-gate-regenerate');
            try {
                const prompt = vi.mocked(promptModule);
                const llm = vi.mocked(llmClientModule);
                const fs = vi.mocked(fsModule);
                const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');
                const createPrecondSpy = vi.spyOn(baseContext.linkManager, 'createPrecondition');

                prompt.showSelect
                    .mockResolvedValueOnce('manual')
                    .mockResolvedValueOnce('regenerate')
                    .mockResolvedValueOnce('create');
                prompt.askMultiline.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
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
                createPrecondSpy.mockResolvedValue('PC-NEW-1');

                const mod = case18Module;
                await mod.handler(baseContext);

                expect(llm.llmPrompt).toHaveBeenCalledTimes(2);
                const secondCall = llm.llmPrompt.mock.calls[1]?.[0];
                expect(secondCall?.system).toContain('CORRECTIONS REQUIRED');
                expect(secondCall?.system).toContain('## CORRECTIONS REQUIRED');
                expect(createPrecondSpy).toHaveBeenCalledTimes(1);
                expect(baseContext.pushHistory).toHaveBeenCalledWith(
                    'ai-generate-tests',
                    expect.stringContaining('1 testes'),
                    'ok',
                );

                const feedbackWrites = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.filter(
                    (call) => typeof call[0] === 'string' && call[0].endsWith('ai-feedback.json.tmp'),
                );

                expect(feedbackWrites.length).toBe(2);
                const firstContent = (feedbackWrites[0]?.[1] ?? '') as string;
                const lastContent = (feedbackWrites[feedbackWrites.length - 1]?.[1] ?? '') as string;
                const firstParsed = JSON.parse(firstContent) as {
                    records: Array<{ gateAction?: string; attempt?: number }>;
                };
                const lastParsed = JSON.parse(lastContent) as {
                    records: Array<{ gateAction?: string; attempt?: number }>;
                };
                expect(firstParsed.records[0]?.gateAction).toBe('regenerated');
                expect(firstParsed.records[0]?.attempt).toBe(1);
                expect(lastParsed.records[0]?.gateAction).toBe('created');
                expect(lastParsed.records[0]?.attempt).toBe(2);
            } finally {
                if (prevXdg === undefined) delete process.env['XDG_STATE_HOME'];
                else process.env['XDG_STATE_HOME'] = prevXdg;
            }
        });

        it('refuses the regenerate option on the last attempt', async () => {
            expect.hasAssertions();

            const prevXdg = process.env['XDG_STATE_HOME'];
            process.env['XDG_STATE_HOME'] = path.join(os.tmpdir(), 'qa-tools-case18-gate-last');
            try {
                const prompt = vi.mocked(promptModule);
                const llm = vi.mocked(llmClientModule);
                const fs = vi.mocked(fsModule);
                const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');

                const gateChoicesCalls: Array<Array<{ name: string; value: string }>> = [];
                let gateCallIndex = 0;
                prompt.showSelect.mockImplementation(async (_message, options) => {
                    if (Array.isArray(options) && options.length > 0 && options[0]?.value === 'create') {
                        const current = gateCallIndex;
                        gateCallIndex += 1;
                        gateChoicesCalls.push(options as Array<{ name: string; value: string }>);
                        return current < 2 ? 'regenerate' : 'create';
                    }
                    return 'manual';
                });
                prompt.askMultiline.mockResolvedValueOnce('User story text').mockResolvedValueOnce('Some criteria');
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

                const mod = case18Module;
                await mod.handler(baseContext);

                expect(gateChoicesCalls).toHaveLength(3);
                const lastAttemptChoices = gateChoicesCalls[2] ?? [];
                const regenerateOption = lastAttemptChoices.find((o) => o.value === 'regenerate');
                expect(regenerateOption).toBeUndefined();
                const rejectOption = lastAttemptChoices.find((o) => o.value === 'reject');
                expect(rejectOption).toBeDefined();
            } finally {
                if (prevXdg === undefined) delete process.env['XDG_STATE_HOME'];
                else process.env['XDG_STATE_HOME'] = prevXdg;
            }
        });

        it('fetches user story from Jira successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);

            prompt.showSelect.mockResolvedValueOnce('jira').mockResolvedValue('create'); // pagination
            prompt.ask.mockResolvedValueOnce('PROJ-123');
            const getJiraResourceMock = vi.fn().mockResolvedValueOnce({
                fields: { description: 'As a user, I want to login', summary: 'Login feature' },
            });
            baseContext.jiraResource.getJiraResource = getJiraResourceMock;
            prompt.askConfirm.mockResolvedValueOnce(true);
            prompt.askMultiline.mockResolvedValueOnce('Must validate credentials');

            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            llm.llmPrompt.mockResolvedValueOnce([
                {
                    title: 'Login test',
                    steps: ['Step 1'],
                    expectedResult: 'Expected result',
                },
            ]);

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(getJiraResourceMock).toHaveBeenCalledWith('issue/PROJ-123?fields=description,summary');
            expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
        });

        it('falls back to manual input when Jira fetch fails', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);

            prompt.showSelect.mockResolvedValueOnce('jira').mockResolvedValue('create');
            prompt.ask.mockResolvedValueOnce('PROJ-456');
            baseContext.jiraResource.getJiraResource = vi.fn().mockRejectedValueOnce(new Error('Issue not found'));
            prompt.askMultiline.mockResolvedValueOnce('Manual user story').mockResolvedValueOnce('Criteria');

            fs.readFileSync.mockReturnValue('You are a QA engineer.');

            llm.llmPrompt.mockResolvedValueOnce([
                {
                    title: 'Test',
                    steps: ['Step 1'],
                    expectedResult: 'Expected result',
                },
            ]);

            const mod = case18Module;
            await mod.handler(baseContext);

            expect(prompt.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao buscar issue'));
            expect(baseContext.pushHistory).toHaveBeenCalledWith('ai-generate-tests', expect.any(String), 'ok');
        });

        it('propagates environment/components/priority into converted test cases', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const llm = vi.mocked(llmClientModule);
            const fs = vi.mocked(fsModule);
            const listPrecondSpy = vi.spyOn(baseContext.linkManager, 'listPreconditions');

            prompt.showSelect.mockResolvedValueOnce('manual').mockResolvedValue('create');
            prompt.askMultiline.mockResolvedValueOnce('User story').mockResolvedValueOnce('Criteria');
            fs.readFileSync.mockReturnValue('You are a QA engineer.');
            listPrecondSpy.mockResolvedValue([]);

            llm.llmPrompt.mockResolvedValue([
                {
                    title: 'Test with batch fields',
                    steps: ['Step 1', 'Step 2', 'Step 3'],
                    expectedResult: 'Expected result text here',
                    environment: 'staging',
                    components: ['API', 'Frontend'],
                    priority: 'High',
                },
            ]);

            const mod = case18Module;
            await mod.handler(baseContext);

            const writeCall = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find(
                (call) => typeof call[0] === 'string' && call[0].endsWith('llm-generated-tests.json'),
            );

            expect(writeCall).toBeDefined();

            const content = (writeCall ? writeCall[1] : '') as string;
            const written = JSON.parse(content) as Array<Record<string, unknown>>;
            const converted = written.find((t) => t['title'] === 'Test with batch fields');

            expect(converted?.['environment']).toBe('staging');
            expect(converted?.['components']).toStrictEqual(['API', 'Frontend']);
            expect(converted?.['priority']).toBe('High');
        });
    });

    describe('ToGeneratedTestCases (evaluator input)', () => {
        it('preserves coverage and evidence from LLM output', () => {
            const llmOutput = [
                {
                    title: 'Login test with valid credentials',
                    steps: ['Enter user', 'Enter password'],
                    expectedResult: 'User is redirected to dashboard',
                    coverage: [{ criterionId: 'C-1', criterionText: 'User can log in with valid credentials' }],
                    evidence: ['Login flow authenticates valid users'],
                },
            ];

            const result = toGeneratedTestCases(llmOutput, [[]], new Map());

            expect(result[0]?.coverage).toStrictEqual([
                { criterionId: 'C-1', criterionText: 'User can log in with valid credentials' },
            ]);
            expect(result[0]?.evidence).toStrictEqual(['Login flow authenticates valid users']);
            expect(result[0]?.title).toBe('Login test with valid credentials');
        });

        it('omits coverage/evidence when absent', () => {
            const result = toGeneratedTestCases(
                [{ title: 'Basic test', steps: ['Enter user'], expectedResult: 'User is redirected to dashboard' }],
                [[]],
                new Map(),
            );

            expect(result[0]?.coverage).toBeUndefined();
            expect(result[0]?.evidence).toBeUndefined();
        });
    });
});
