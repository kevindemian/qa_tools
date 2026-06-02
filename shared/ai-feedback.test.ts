jest.mock('fs', () => {
    const actual = jest.requireActual<typeof import('fs')>('fs');
    return {
        ...actual,
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
        writeFileSync: jest.fn(),
        renameSync: jest.fn(),
        mkdirSync: jest.fn(),
    };
});
jest.mock('./logger', () => ({
    rootLogger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { recordAiGeneration, recordAiModification, getAiFeedbackSummary, getRecentAiRecords } from './ai-feedback';
import { nonNull } from './test-utils';
import type { AiGenerationRecord, AiModification } from './types';

const mockExistsSync = jest.mocked(existsSync);
const mockReadFileSync = jest.mocked(readFileSync);
const mockWriteFileSync = jest.mocked(writeFileSync);
const mockRenameSync = jest.mocked(renameSync);
const mockMkdirSync = jest.mocked(mkdirSync);

function makeRecord(id: string, overrides?: Partial<AiGenerationRecord>): AiGenerationRecord {
    return {
        id,
        generatedAt: '2026-05-29T00:00:00.000Z',
        promptVersion: 'v2',
        userStory: 'As a user I want to login',
        acceptanceCriteria: 'User can login with valid credentials',
        generatedTests: [{ title: 'Login with valid credentials', preConditions: ['User exists'], stepCount: 3 }],
        preconditionMatches: [{ summary: 'User exists', matchType: 'exact' }],
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockMkdirSync.mockImplementation(() => undefined);
    mockWriteFileSync.mockImplementation(() => undefined);
    mockRenameSync.mockImplementation(() => undefined);
});

describe('recordAiGeneration', () => {
    it('saves a new record', () => {
        const record = makeRecord('rec-1');
        recordAiGeneration(record);

        expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
        const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { records: AiGenerationRecord[] };
        expect(written.records).toHaveLength(1);
        expect(written.records[0].id).toBe('rec-1');
    });

    it('appends to existing records', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records: [makeRecord('rec-1')] }));

        recordAiGeneration(makeRecord('rec-2'));

        const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { records: AiGenerationRecord[] };
        expect(written.records).toHaveLength(2);
    });

    it('trims store to 200 records max', () => {
        const existing: AiGenerationRecord[] = Array.from({ length: 200 }, (_, i) => makeRecord('rec-' + i));
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records: existing }));

        recordAiGeneration(makeRecord('rec-200'));

        const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as { records: AiGenerationRecord[] };
        expect(written.records).toHaveLength(200);
        expect(written.records[0].id).toBe('rec-1');
    });
});

describe('recordAiModification', () => {
    it('adds feedback to existing record', () => {
        const record = makeRecord('rec-1');
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records: [record] }));

        const mod: AiModification = {
            testKey: 'TEST-1',
            recordedAt: new Date().toISOString(),
            action: 'kept',
            reason: 'All good',
        };
        const updated = recordAiModification('rec-1', mod);

        expect(updated).not.toBeNull();
        expect(nonNull(updated).feedback).toHaveLength(1);
        expect(nonNull(nonNull(updated).feedback![0]).action).toBe('kept');
    });

    it('returns null for unknown record', () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records: [] }));

        const result = recordAiModification('unknown', { testKey: 'T-1', recordedAt: '', action: 'kept' });
        expect(result).toBeNull();
    });
});

describe('getAiFeedbackSummary', () => {
    it('returns zeros for empty store', () => {
        mockExistsSync.mockReturnValue(false);
        const summary = getAiFeedbackSummary();
        expect(summary.totalRecords).toBe(0);
        expect(summary.acceptanceRate).toBe(0);
    });

    it('calculates acceptance rate correctly', () => {
        const records = [
            makeRecord('r1', {
                generatedTests: [
                    { title: 'T1', preConditions: [], stepCount: 1 },
                    { title: 'T2', preConditions: [], stepCount: 1 },
                    { title: 'T3', preConditions: [], stepCount: 1 },
                ],
                feedback: [
                    { testKey: '', recordedAt: '', action: 'kept' as const },
                    { testKey: '', recordedAt: '', action: 'modified' as const },
                ],
            }),
        ];
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records }));

        const summary = getAiFeedbackSummary();
        expect(summary.totalGenerated).toBe(3);
        expect(summary.totalModified).toBe(1);
        expect(summary.totalDeleted).toBe(0);
        expect(summary.acceptanceRate).toBe(67);
    });

    it('identifies top prompt version', () => {
        const records = [
            makeRecord('r1', { promptVersion: 'v1' }),
            makeRecord('r2', { promptVersion: 'v2' }),
            makeRecord('r3', { promptVersion: 'v2' }),
        ];
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records }));

        const summary = getAiFeedbackSummary();
        expect(summary.topPromptVersion).toBe('v2');
    });
});

describe('getRecentAiRecords', () => {
    it('returns most recent records in reverse order', () => {
        const records = [
            makeRecord('r1', { generatedAt: '2026-01-01T00:00:00.000Z' }),
            makeRecord('r2', { generatedAt: '2026-01-02T00:00:00.000Z' }),
            makeRecord('r3', { generatedAt: '2026-01-03T00:00:00.000Z' }),
        ];
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue(JSON.stringify({ records }));

        const recent = getRecentAiRecords(2);
        expect(recent).toHaveLength(2);
        expect(nonNull(recent[0]).id).toBe('r3');
        expect(nonNull(recent[1]).id).toBe('r2');
    });
});
