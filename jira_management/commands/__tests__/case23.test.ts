import { warn, tableView, showSelect } from '../../../shared/ui/prompt.js';
import { recordAiGeneration } from '../../../shared/quality/ai-feedback.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import case23Handler from '../case23.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AiGenerationRecord } from '../../../shared/types.js';

vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');

vi.mock('../../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

const mockShowSelect = vi.mocked(showSelect);
let storeDir: string;
let recordSeq = 0;

function buildRecord(overrides: Partial<AiGenerationRecord> = {}): AiGenerationRecord {
    recordSeq += 1;
    return {
        id: 'rec-' + String(recordSeq),
        generatedAt: '2026-05-29T00:00:00.000Z',
        promptVersion: 'v2',
        userStory: 'As a user',
        acceptanceCriteria: 'some criteria',
        generatedTests: [{ title: 'T1', preConditions: [], stepCount: 1 }],
        preconditionMatches: [],
        ...overrides,
    };
}

describe('Case23', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockShowSelect.mockResolvedValue('0');
        storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-case23-'));
        process.env['XDG_STATE_HOME'] = storeDir;
        recordSeq = 0;
    });

    afterEach(() => {
        delete process.env['XDG_STATE_HOME'];
        fs.rmSync(storeDir, { recursive: true, force: true });
    });

    describe('Case23 — AI Feedback', () => {
        it('shows warning when no feedback records exist', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');

            await case23Handler.handler(makeMockCommandContext());

            expect(warn).toHaveBeenCalledWith('Nenhum registro de feedback de IA encontrado.');
            expect(tableView).not.toHaveBeenCalled();
        });

        it('displays summary when records exist', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('a').mockResolvedValueOnce('0');
            recordAiGeneration(
                buildRecord({
                    generatedTests: [
                        { title: 'T1', preConditions: [], stepCount: 1 },
                        { title: 'T2', preConditions: [], stepCount: 2 },
                    ],
                }),
            );
            recordAiGeneration(
                buildRecord({
                    generatedTests: [
                        { title: 'T3', preConditions: [], stepCount: 1 },
                        { title: 'T4', preConditions: [], stepCount: 2 },
                    ],
                }),
            );
            recordAiGeneration(
                buildRecord({
                    generatedTests: [
                        { title: 'T5', preConditions: [], stepCount: 1 },
                        { title: 'T6', preConditions: [], stepCount: 2 },
                    ],
                }),
            );

            await case23Handler.handler(makeMockCommandContext());

            expect(tableView).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ Métrica: 'Total de registros', Valor: 3 }),
                    expect.objectContaining({ Métrica: 'Testes gerados', Valor: 6 }),
                ]),
                expect.any(Array),
            );
        });

        it('displays recent records', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');
            recordAiGeneration(buildRecord({ userStory: 'As a user I want to login' }));
            recordAiGeneration(buildRecord({ userStory: 'As a user I want to logout' }));

            await case23Handler.handler(makeMockCommandContext());

            expect(tableView).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ 'User Story': 'As a user I want to login' }),
                    expect.objectContaining({ 'User Story': 'As a user I want to logout' }),
                ]),
                expect.arrayContaining(['ID']),
            );
        });

        it('warns when no recent records', async () => {
            expect.hasAssertions();

            mockShowSelect.mockResolvedValueOnce('b').mockResolvedValueOnce('0');

            await case23Handler.handler(makeMockCommandContext());

            expect(warn).toHaveBeenCalledWith('Nenhum registro recente.');
        });
    });
});
