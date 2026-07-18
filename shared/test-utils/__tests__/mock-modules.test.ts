import { describe, it, expect, vi } from 'vitest';
import {
    mockLoggerModule,
    mockPromptModule,
    mockPromptModuleMinimal,
    mockGitProviderError,
    mockHttpClientModule,
    mockSessionStateModule,
    mockStateModule,
    mockConfigModule,
} from '../mock-modules.js';

describe('Mock Modules', () => {
    describe('Mock Logger Module', () => {
        it('returns object with Logger and rootLogger', () => {
            const mock = mockLoggerModule();

            expect(mock).toHaveProperty('Logger');
            expect(mock).toHaveProperty('rootLogger');
        });

        it('logger is a vi.fn()', () => {
            const mock = mockLoggerModule();

            expect(typeof mock.Logger).toBe('function');
        });

        it('rootLogger.error is a vi.fn()', () => {
            const mock = mockLoggerModule();

            expect(typeof mock.rootLogger.error).toBe('function');
        });

        it('rootLogger.warn is a vi.fn()', () => {
            const mock = mockLoggerModule();

            expect(typeof mock.rootLogger.warn).toBe('function');
        });
    });

    describe('Mock Prompt Module', () => {
        it('returns object with core functions', () => {
            const mock = mockPromptModule();

            expect(mock).toHaveProperty('print');
            expect(mock).toHaveProperty('success');
            expect(mock).toHaveProperty('warn');
            expect(mock).toHaveProperty('info');
            expect(mock).toHaveProperty('title');
            expect(mock).toHaveProperty('prompt');
            expect(mock).toHaveProperty('confirm');
            expect(mock).toHaveProperty('printError');
        });

        it('returns object with error and spinner functions', () => {
            const mock = mockPromptModule();

            expect(mock).toHaveProperty('error');
            expect(mock).toHaveProperty('withSpinner');
            expect(mock).toHaveProperty('extractErrorMessage');
            expect(mock).toHaveProperty('smartPrompt');
            expect(mock).toHaveProperty('ask');
        });

        it('withSpinner returns fn() directly', async () => {
            expect.assertions(1);

            const mock = mockPromptModule();
            const testFn = vi.fn().mockResolvedValue('result');

            const result: unknown = await mock.withSpinner('test', testFn);

            expect(result).toBe('result');
        });

        it('supports overrides', () => {
            const customInfo = vi.fn();
            const mock = mockPromptModule({ info: customInfo });

            expect(mock.info).toBe(customInfo);
        });

        it('extractErrorMessage returns error message', () => {
            const mock = mockPromptModule();
            const result: unknown = mock.extractErrorMessage(new Error('test error'));

            expect(result).toBe('test error');
        });

        it('extractErrorMessage returns default message for empty error', () => {
            const mock = mockPromptModule();
            const result: unknown = mock.extractErrorMessage(new Error());

            expect(result).toBe('Erro desconhecido');
        });
    });

    describe('Mock Prompt Module Minimal', () => {
        it('returns object with info and extractErrorMessage', () => {
            const mock = mockPromptModuleMinimal();

            expect(mock).toHaveProperty('info');
            expect(mock).toHaveProperty('extractErrorMessage');
        });

        it('extractErrorMessage returns error message', () => {
            const mock = mockPromptModuleMinimal();
            const result = mock.extractErrorMessage(new Error('test error'));

            expect(result).toBe('test error');
        });
    });

    describe('Mock Git Provider Error', () => {
        it('returns object with handleError', () => {
            const mock = mockGitProviderError();

            expect(mock).toHaveProperty('handleError');
        });

        it('handleError throws the error', () => {
            const mock = mockGitProviderError();
            const error = new Error('test error');

            expect(() => mock.handleError(error)).toThrow('test error');
        });
    });

    describe('Mock HttpClient Module', () => {
        it('returns object with HttpClient', () => {
            const mock = mockHttpClientModule();

            expect(mock).toHaveProperty('HttpClient');
        });

        it('httpClient is a vi.fn()', () => {
            const mock = mockHttpClientModule();

            expect(typeof mock.HttpClient).toBe('function');
        });
    });

    describe('Mock Session State Module', () => {
        it('returns object with session state functions', () => {
            const mock = mockSessionStateModule();

            expect(mock).toHaveProperty('pushHistory');
            expect(mock).toHaveProperty('printSessionSummary');
            expect(mock).toHaveProperty('createManagerForProject');
            expect(mock).toHaveProperty('setProjectId');
            expect(mock).toHaveProperty('setManager');
            expect(mock).toHaveProperty('getProjects');
        });

        it('has default values', () => {
            const mock = mockSessionStateModule();

            expect(mock.currentProvider).toBe('gitlab');
        });

        it('supports overrides', () => {
            const mock = mockSessionStateModule({ currentProvider: 'custom' });

            expect(mock.currentProvider).toBe('custom');
        });
    });

    describe('Mock State Module', () => {
        it('returns object with load and update', () => {
            const mock = mockStateModule();

            expect(mock).toHaveProperty('load');
            expect(mock).toHaveProperty('update');
        });

        it('load returns empty object', () => {
            const mock = mockStateModule();

            expect(mock.load()).toStrictEqual({});
        });

        it('update calls function and returns result', () => {
            const mock = mockStateModule();
            const result = mock.update((s) => {
                s['test'] = 'value';
            });

            expect(result).toStrictEqual({ test: 'value' });
        });
    });

    describe('Mock Config Module', () => {
        it('returns object with __esModule and default', () => {
            const mock = mockConfigModule();

            expect(mock).toHaveProperty('__esModule', true);
            expect(mock).toHaveProperty('default');
        });

        it('default has jiraProject', () => {
            const mock = mockConfigModule();

            expect(mock.default.jiraProject).toBe('TEST');
        });

        it('default.get is a vi.fn()', () => {
            const mock = mockConfigModule();

            expect(typeof mock.default.get).toBe('function');
        });

        it('supports overrides', () => {
            const mock = mockConfigModule({ jiraProject: 'CUSTOM' });

            expect(mock.default.jiraProject).toBe('CUSTOM');
        });
    });
});
