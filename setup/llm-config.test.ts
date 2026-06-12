/**
 * Tests for setup/llm-config.ts — Smart LLM configuration wizard.
 */
import fs from 'fs';
import * as prompt from '../shared/prompt.js';
import { probeApiKey } from '../shared/llm-probe.js';

vi.mock('fs');
vi.mock('../shared/prompt', () => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    title: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    divider: vi.fn(),
}));
vi.mock('../shared/llm-probe', () => ({
    probeApiKey: vi.fn(),
    autoAssignTiers: vi.fn(),
}));
vi.mock('../shared/logger', () => ({
    rootLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const MockFs = vi.mocked(fs);
const MockAsk = vi.mocked(prompt.ask);
const MockAskConfirm = vi.mocked(prompt.askConfirm);
const MockProbe = vi.mocked(probeApiKey);

import { configureLlm } from './llm-config.js';

describe('configureLlm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MockFs.readFileSync.mockReturnValue('EXISTING_VAR=old\n');
        MockFs.writeFileSync.mockImplementation(vi.fn());
        MockProbe.mockResolvedValue({ valid: true, provider: 'openai', detected: true });
    });

    it('skips when user provides empty key', async () => {
        MockAsk.mockResolvedValueOnce('');
        const result = await configureLlm();
        expect(result).toBe(false);
        expect(MockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('detects provider, probes, and writes .env.local', async () => {
        MockAsk.mockResolvedValueOnce('sk-test123');
        MockAskConfirm.mockResolvedValueOnce(true); // accept auto config
        const { autoAssignTiers } = await import('../shared/llm-probe.js');
        vi.mocked(autoAssignTiers).mockReturnValue({
            provider: 'openai',
            tiers: {
                main: 'gpt-4o',
                fast: 'gpt-4o-mini',
                reviewer: 'gpt-4o-mini',
                report: 'gpt-4o',
                fallback: 'gpt-4o-mini',
                batch: 'gpt-4o-mini',
            },
        });

        const result = await configureLlm();

        expect(result).toBe(true);
        const writtenContent = (MockFs.writeFileSync.mock.calls[0]?.[1] ?? '') as string;
        expect(MockFs.writeFileSync).toHaveBeenCalledWith(
            '.env.local.tmp',
            expect.stringContaining('LLM_PROVIDER=openai'),
            'utf8',
        );
        expect(writtenContent).toContain('LLM_API_KEY=sk-test123');
    });

    it('preserves non-LLM existing env vars', async () => {
        MockFs.readFileSync.mockReturnValue('JIRA_TOKEN=abc\nLLM_OLD_KEY=old\n# comment\n');
        MockAsk.mockResolvedValueOnce('sk-new-key');
        MockAskConfirm.mockResolvedValueOnce(true);
        const { autoAssignTiers } = await import('../shared/llm-probe.js');
        vi.mocked(autoAssignTiers).mockReturnValue({
            provider: 'openai',
            tiers: {
                main: 'gpt-4o',
                fast: 'gpt-4o-mini',
                reviewer: 'gpt-4o-mini',
                report: 'gpt-4o',
                fallback: 'gpt-4o-mini',
                batch: 'gpt-4o-mini',
            },
        });

        await configureLlm();

        const writtenContent = (MockFs.writeFileSync.mock.calls[0]?.[1] ?? '') as string;
        expect(writtenContent).toContain('JIRA_TOKEN=abc');
        expect(writtenContent).toContain('# comment');
        expect(writtenContent).toContain('LLM_PROVIDER=openai');
    });

    it('enters advanced mode when user rejects auto config', async () => {
        MockAsk.mockResolvedValueOnce('sk-test') // API key
            .mockResolvedValueOnce('anthropic'); // manual provider
        MockAskConfirm.mockResolvedValueOnce(false) // reject auto config
            .mockResolvedValueOnce(true); // confirm advanced choice
        const { autoAssignTiers } = await import('../shared/llm-probe.js');
        vi.mocked(autoAssignTiers).mockReturnValue({
            provider: 'anthropic',
            tiers: {
                main: 'claude-sonnet-4-20250514',
                fast: 'claude-haiku-3-5-20241022',
                reviewer: 'claude-haiku-3-5-20241022',
                report: 'claude-sonnet-4-20250514',
                fallback: 'claude-haiku-3-5-20241022',
                batch: 'claude-haiku-3-5-20241022',
            },
        });

        await configureLlm();

        expect(MockFs.writeFileSync).toHaveBeenCalledWith(
            '.env.local.tmp',
            expect.stringContaining('LLM_PROVIDER=anthropic'),
            'utf8',
        );
    });

    it('probes key on discovery when pattern not recognized', async () => {
        MockAsk.mockResolvedValueOnce('some-unknown-key');
        MockAskConfirm.mockResolvedValueOnce(true); // accept whatever is found
        // First provider in KNOWN_PROVIDERS is 'opencode-go' — make it valid
        MockProbe.mockResolvedValue({ valid: true, provider: 'opencode-go', detected: true });
        const { autoAssignTiers } = await import('../shared/llm-probe.js');
        vi.mocked(autoAssignTiers).mockReturnValue({
            provider: 'opencode-go',
            tiers: {
                main: 'gpt-4o',
                fast: 'gpt-4o-mini',
                reviewer: 'gpt-4o-mini',
                report: 'gpt-4o',
                fallback: 'gpt-4o-mini',
                batch: 'gpt-4o-mini',
            },
        });

        await configureLlm();

        // Atomic write: first to .tmp, then rename
        expect(MockFs.writeFileSync).toHaveBeenCalledWith(
            '.env.local.tmp',
            expect.stringContaining('LLM_PROVIDER=opencode-go'),
            'utf8',
        );
        expect(MockFs.chmodSync).toHaveBeenCalledWith('.env.local.tmp', 0o600);
        expect(MockFs.renameSync).toHaveBeenCalledWith('.env.local.tmp', '.env.local');
    });
});
