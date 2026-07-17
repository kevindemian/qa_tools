import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writePrePushHook, writeDotEnvExample } from '../config-writer.js';

describe('Config-writer — integração real (fs verdadeiro)', () => {
    let base: string;

    beforeEach(() => {
        base = mkdtempSync(join(tmpdir(), 'config-writer-int-'));
    });

    afterEach(() => {
        rmSync(base, { recursive: true, force: true });
    });

    describe('WritePrePushHook', () => {
        it('cria .git/hooks/pre-push com o script gerado', () => {
            const result = writePrePushHook({ projectName: 'myapp' }, base);

            const hookPath = join(base, '.git', 'hooks', 'pre-push');

            expect(result.filesCreated).toStrictEqual([hookPath]);
            expect(result.filesSkipped).toStrictEqual([]);
            expect(existsSync(hookPath)).toBeTruthy();
        });

        it('cria o diretório .git/hooks recursivamente quando ausente', () => {
            expect(existsSync(join(base, '.git'))).toBeFalsy();

            writePrePushHook({ projectName: 'myapp' }, base);

            expect(existsSync(join(base, '.git', 'hooks'))).toBeTruthy();
        });

        it('efeito colateral: o hook é gravado com permissão 0o600 (owner-only)', () => {
            writePrePushHook({ projectName: 'myapp' }, base);

            const mode = statSync(join(base, '.git', 'hooks', 'pre-push')).mode & 0o777;

            expect(mode).toBe(0o600);
        });

        it('o script contém o comando de execução com o projectName injetado', () => {
            writePrePushHook({ projectName: 'my-special-proj' }, base);

            const content = readFileSync(join(base, '.git', 'hooks', 'pre-push'), 'utf8');

            expect(content).toContain('--project my-special-proj');
            expect(content).toContain('git_triggers/main.ts --batch');
            expect(content.startsWith('#!/bin/sh')).toBeTruthy();
        });

        it('o script bloqueia o push com exit 1 quando os testes falham', () => {
            writePrePushHook({ projectName: 'app' }, base);

            const content = readFileSync(join(base, '.git', 'hooks', 'pre-push'), 'utf8');

            expect(content).toContain('if [ $EXIT_CODE -ne 0 ]');
            expect(content).toContain('exit 1');
            expect(content).toContain('Push blocked');
        });

        it('idempotência: não sobrescreve um pre-push existente (skip)', () => {
            const hooksDir = join(base, '.git', 'hooks');
            mkdirSync(hooksDir, { recursive: true });
            const hookPath = join(hooksDir, 'pre-push');
            writeFileSync(hookPath, 'CUSTOM USER HOOK');

            const result = writePrePushHook({ projectName: 'app' }, base);

            expect(result.filesSkipped).toStrictEqual([hookPath]);
            expect(result.filesCreated).toStrictEqual([]);
            expect(readFileSync(hookPath, 'utf8')).toBe('CUSTOM USER HOOK');
        });
    });

    describe('WriteDotEnvExample', () => {
        it('efeito colateral: grava .env.example real com vars GitHub', () => {
            const result = writeDotEnvExample({ projectName: 'app', gitProvider: 'github' }, base);

            const envPath = join(base, '.env.example');

            expect(result.filesCreated).toStrictEqual([envPath]);

            const content = readFileSync(envPath, 'utf8');

            expect(content).toContain('GITHUB_TOKEN=');
            expect(content).not.toContain('GIT_TOKEN=');
            expect(content).toContain('JIRA_BASE_URL=');
            expect(content.endsWith('\n')).toBeTruthy();
        });

        it('efeito colateral: grava vars GitLab quando provider=gitlab', () => {
            writeDotEnvExample({ projectName: 'app', gitProvider: 'gitlab' }, base);

            const content = readFileSync(join(base, '.env.example'), 'utf8');

            expect(content).toContain('GIT_TOKEN=');
            expect(content).toContain('GIT_BASE_URL=https://gitlab.com');
            expect(content).not.toContain('GITHUB_TOKEN=');
        });

        it('idempotência: não sobrescreve .env.example existente', () => {
            const envPath = join(base, '.env.example');
            writeFileSync(envPath, 'USER CONTENT');

            const result = writeDotEnvExample({ projectName: 'app', gitProvider: 'github' }, base);

            expect(result.filesSkipped).toStrictEqual([envPath]);
            expect(readFileSync(envPath, 'utf8')).toBe('USER CONTENT');
        });
    });
});
