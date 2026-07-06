import type { CommandContext } from '../../../jira_management/commands/context.js';
import type { Mock, Mocked } from 'vitest';
import type { LogContext } from '../../types/common.js';
import { createMockJiraResource } from './jira-resource-factory.js';
import { createMockLinkManager } from './link-manager-factory.js';
import { PROJECT_MANAGEMENT_PATH } from '../constants.js';

type MockProxy<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown ? Mock : T[P] extends object ? MockProxy<T[P]> : T[P];
};

export function createMockContext(overrides?: Partial<MockProxy<CommandContext>>): Mocked<CommandContext> {
    // Cast 1/1: Mocked<T> is a mapped type that cannot be constructed manually.
    // TypeScript cannot prove structural equivalence between the literal and the mapped type.

    const base = {
        jiraResource: createMockJiraResource(),
        jiraResourceXray: createMockJiraResource(),
        linkManager: createMockLinkManager(),
        linkManagerXray: createMockLinkManager(),
        csvResource: {
            detectSeparator: vi.fn(),
            readCsvFromString: vi.fn(),
            parseDescription: vi.fn(),
            parseGroup: vi.fn(),
            parsePrecondition: vi.fn(),
            parseLinkedIssues: vi.fn(),
            readBulkCsv: vi.fn(),
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
            resetResults: vi.fn(),
            withBusy: vi.fn(),
            pushHistory: vi.fn(),
            buildContextLine: vi.fn(),
        },
        pushHistory: vi.fn(),
        printSessionSummary: vi.fn(),
        base_url: PROJECT_MANAGEMENT_PATH.BASE_URL,
        sessionLog: {
            context: {} as LogContext,
            _logDir: null,
            _filePathCached: null,
            _fileError: false,
            _bytesWritten: 0,
            _maxLogSize: 0,
            _config: null,
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: vi.fn(),
            writeFileOnly: vi.fn(),
            filePath: null,
            _ensureDir: vi.fn(),
            _rotateIfNeeded: vi.fn(),
            _writeConsole: vi.fn(),
            _writeFile: vi.fn(),
            _write: vi.fn(),
        },
    } as unknown as Mocked<CommandContext>;
    return { ...base, ...(overrides as Partial<MockProxy<CommandContext>>) } as unknown as Mocked<CommandContext>;
}
