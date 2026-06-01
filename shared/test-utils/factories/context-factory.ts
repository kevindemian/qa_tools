import { jest } from '@jest/globals';
import type { CommandContext } from '../../../jira_management/commands/context';
import { createMockJiraResource } from './jira-resource-factory';
import { createMockLinkManager } from './link-manager-factory';

type MockProxy<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown
        ? jest.Mock
        : T[P] extends object
          ? MockProxy<T[P]>
          : T[P];
};

export function createMockContext(overrides?: Partial<MockProxy<CommandContext>>): jest.Mocked<CommandContext> {
    // Cast 1/1: jest.Mocked<T> is a mapped type that cannot be constructed manually.
    // TypeScript cannot prove structural equivalence between the literal and the mapped type.

    const base = {
        jiraResource: createMockJiraResource(),
        jiraResourceXray: createMockJiraResource(),
        linkManager: createMockLinkManager(),
        linkManagerXray: createMockLinkManager(),
        csvResource: {
            detectSeparator: jest.fn(),
            readCsvFromString: jest.fn(),
            parseDescription: jest.fn(),
            parseGroup: jest.fn(),
            parsePrecondition: jest.fn(),
            parseLinkedIssues: jest.fn(),
            readBulkCsv: jest.fn(),
        },
        packageManager: undefined,
        ctx: {
            isBusy: false,
            lastOperation: '',
            sessionCounters: [],
            packageManager: undefined,
            git_directory: 'no_dir_selected',
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            project_name: 'TEST',
            results: [],
            resetResults: jest.fn(),
            withBusy: jest.fn(),
            pushHistory: jest.fn(),
            buildContextLine: jest.fn(),
        },
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: 'https://jira.test.com',
        sessionLog: {
            context: {} as Record<string, unknown>,
            _logDir: null,
            _filePathCached: null,
            _fileError: false,
            _bytesWritten: 0,
            _maxLogSize: 0,
            _config: null,
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            child: jest.fn(),
            writeFileOnly: jest.fn(),
            filePath: null,
            _ensureDir: jest.fn(),
            _rotateIfNeeded: jest.fn(),
            _writeConsole: jest.fn(),
            _writeFile: jest.fn(),
            _write: jest.fn(),
        },
    } as unknown as jest.Mocked<CommandContext>;
    return { ...base, ...(overrides as Partial<MockProxy<CommandContext>>) } as unknown as jest.Mocked<CommandContext>;
}
