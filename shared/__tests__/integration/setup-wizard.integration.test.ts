import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const GIT_BIN = '/usr/bin/git';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as prompt from '../../prompt.js';
import { main, parseCliDir } from '../../../setup/main.js';
import { listProjects, removeProject } from '../../project-registry.js';
import { projectEnvPath } from '../../project-paths.js';

/**
 * Teste de INTEGRAÇÃO end-to-end (Fase 9.094): o Setup Wizard disparado com
 * `--dir <projDir>` DEVE registrar o projeto no registry XDG e escrever o
 * overlay `.env` do projeto, mesmo sem interação humana (prompts com defaults).
 *
 * RED: este teste reproduz o defeito em que o wizard exige TTY e, em modo
 * headless (CI/--dir), não registra nem escreve o .env.
 */

vi.mock('../../prompt.js', () => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    askFilePath: vi.fn(),
    askMultiline: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    warn: vi.fn(),
}));

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-wizard-e2e-'));
}

const MockAsk = vi.mocked(prompt).ask as unknown as ReturnType<typeof vi.fn>;
const MockAskConfirm = vi.mocked(prompt).askConfirm as unknown as ReturnType<typeof vi.fn>;

/** Aplica respostas determinísticas ao wizard (todos os prompts têm default). */
function applyWizardAnswers(answers: Record<string, string | boolean>): void {
    MockAsk.mockImplementation((message?: string) => {
        const m = (message ?? '').toLowerCase();
        if (m.includes('repo owner')) return String(answers['repoOwner'] ?? 'myorg');
        if (m.includes('test framework')) return String(answers['framework'] ?? 'tsx');
        if (m.includes('test command')) return String(answers['test command'] ?? 'npm test');
        if (m.includes('install command')) return String(answers['install command'] ?? 'npm install');
        if (m.includes('test report path')) return String(answers['testReportPath'] ?? 'ctrf/results.json');
        if (m.includes('artifact name')) return String(answers['artifactName'] ?? 'test-report');
        if (m.includes('node version')) return String(answers['node version'] ?? '20');
        if (m.includes('jira project key')) return String(answers['jiraKey'] ?? '');
        if (m.includes('target de publicação')) return String(answers['prReportPublishTarget'] ?? 'github-actions');
        if (m.includes('project name') || m.includes('nome')) return String(answers['projectName'] ?? 'meu-projeto');
        return '';
    });
    MockAskConfirm.mockImplementation((message?: string) => {
        const m = (message ?? '').toLowerCase();
        if (m.includes('pr report')) return Boolean(answers['prReport'] ?? true);
        if (m.includes('quality gate')) return Boolean(answers['qualityGate'] ?? true);
        if (m.includes('flakiness')) return Boolean(answers['flakinessDashboard'] ?? true);
        if (m.includes('análise de falhas')) return Boolean(answers['aiFailureAnalysis'] ?? true);
        if (m.includes('pre-push')) return Boolean(answers['prePushHook'] ?? false);
        if (m.includes('llm')) return false;
        if (m.includes('sobrescrever')) return false;
        if (m.includes('configurar provedores')) return false;
        return true;
    });
}

describe('Setup-wizard integration (Fase 9.094)', () => {
    let tmp: string;
    let xdg: string;

    beforeEach(() => {
        tmp = makeTempDir();
        // Repo git real para exercitar detecção real de repo/owner (não mocada).
        execFileSync(GIT_BIN, ['init', '-q'], { cwd: tmp });
        execFileSync(GIT_BIN, ['config', 'user.email', 't@t.com'], { cwd: tmp });
        execFileSync(GIT_BIN, ['config', 'user.name', 't'], { cwd: tmp });
        execFileSync(GIT_BIN, ['remote', 'add', 'origin', 'https://github.com/myorg/my-repo.git'], {
            cwd: tmp,
        });
        xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-xdg-'));
        process.env['XDG_CONFIG_HOME'] = xdg;
        MockAsk.mockReset();
        MockAskConfirm.mockReset();
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(xdg, { recursive: true, force: true });
        for (const p of listProjects()) {
            try {
                removeProject(p.name);
            } catch {
                /* ignore */
            }
        }
    });

    it('parseCliDir extrai --dir corretamente', () => {
        expect(parseCliDir(['--dir', '/foo'])).toBe('/foo');
        expect(parseCliDir(['--dir=/foo'])).toBe('/foo');
        expect(parseCliDir([])).toBeNull();
    });

    it('registra projeto no registry XDG e escreve .env overlay quando chamado com --dir', async () => {
        expect.hasAssertions();

        applyWizardAnswers({ projectName: 'proj-e2e', repoOwner: 'myorg', jiraKey: 'PROJ' });

        await main(['--dir', tmp]);

        const names = listProjects().map((p) => p.name);

        expect(names).toContain('proj-e2e');

        const entry = listProjects().find((p) => p.name === 'proj-e2e');

        expect(entry?.dir).toBe(tmp);
        expect(entry?.jiraKey).toBe('PROJ');

        const envFile = projectEnvPath('proj-e2e');

        expect(fs.existsSync(envFile)).toBeTruthy();

        const content = fs.readFileSync(envFile, 'utf8');

        expect(content).toContain('QA_PROJECT_PROVIDER');
        expect(content).toContain('QA_PROJECT_JIRA_KEY=PROJ');
    });
});
