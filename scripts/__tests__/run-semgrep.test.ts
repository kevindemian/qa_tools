import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    resolveSemgrepBin,
    getSemgrepVersion,
    buildSemgrepArgs,
    classifySemgrepExit,
    ROOT,
    RULES_PATH,
} from '../run-semgrep.js';

describe('Run-semgrep', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = mkdtempSync(join(tmpdir(), 'run-semgrep-test-'));
    });

    afterEach(() => {
        rmSync(tmp, { recursive: true, force: true });
    });

    describe('ResolveSemgrepBin', () => {
        it('retorna SEMGREP_BIN quando o caminho existe (fs real)', () => {
            const bin = join(tmp, 'semgrep');
            writeFileSync(bin, '#!/bin/sh\n');
            chmodSync(bin, 0o755);

            expect(resolveSemgrepBin({ SEMGREP_BIN: bin })).toBe(bin);
        });

        it('lança erro explícito quando SEMGREP_BIN aponta para caminho inexistente (nao mascara)', () => {
            const missing = join(tmp, 'does-not-exist');

            expect(() => resolveSemgrepBin({ SEMGREP_BIN: missing })).toThrow(
                `[run-semgrep] SEMGREP_BIN aponta para caminho inexistente: ${missing}`,
            );
        });

        it('encontra semgrep percorrendo o PATH quando SEMGREP_BIN ausente', () => {
            const bin = join(tmp, 'semgrep');
            writeFileSync(bin, '#!/bin/sh\n');
            chmodSync(bin, 0o755);
            const otherDir = join(tmp, 'empty');
            writeFileSync(join(tmp, 'placeholder'), '');

            expect(resolveSemgrepBin({ PATH: `${otherDir}:${tmp}` })).toBe(bin);
        });

        it('lança erro explícito quando semgrep nao esta no PATH (nunca "sem achados")', () => {
            expect(() => resolveSemgrepBin({ PATH: tmp })).toThrow(
                '[run-semgrep] binario `semgrep` nao encontrado no PATH.',
            );
        });

        it('trata PATH ausente como vazio e falha explicitamente', () => {
            expect(() => resolveSemgrepBin({})).toThrow('nao encontrado no PATH');
        });

        it('ignora segmentos vazios do PATH sem crashar', () => {
            expect(() => resolveSemgrepBin({ PATH: '::' })).toThrow('nao encontrado no PATH');
        });
    });

    describe('GetSemgrepVersion', () => {
        it('lê e faz trim da versão do arquivo (fs real)', () => {
            const vpath = join(tmp, 'version');
            writeFileSync(vpath, '  1.55.2\n');

            expect(getSemgrepVersion(vpath)).toBe('1.55.2');
        });

        it('retorna "unknown" quando o arquivo nao existe (degradacao explicita, nao crash)', () => {
            expect(getSemgrepVersion(join(tmp, 'nope'))).toBe('unknown');
        });

        it('retorna string vazia normalizada para "" quando arquivo vazio', () => {
            const vpath = join(tmp, 'empty-version');
            writeFileSync(vpath, '   \n');

            expect(getSemgrepVersion(vpath)).toBe('');
        });
    });

    describe('BuildSemgrepArgs', () => {
        it('modo repo inteiro: inclui ROOT e exclui *.test.ts, sem flags de diff', () => {
            const args = buildSemgrepArgs({ diffMode: false, jsonMode: false });

            expect(args).toStrictEqual([
                'scan',
                '--config',
                RULES_PATH,
                '--error',
                '--severity',
                'ERROR',
                ROOT,
                '--exclude',
                '*.test.ts',
            ]);
        });

        it('modo diff: usa baseline origin/dev + --diff e NAO passa ROOT', () => {
            const args = buildSemgrepArgs({ diffMode: true, jsonMode: false });

            expect(args).toStrictEqual([
                'scan',
                '--config',
                RULES_PATH,
                '--error',
                '--severity',
                'ERROR',
                '--baseline-commit',
                'origin/dev',
                '--diff',
            ]);
            expect(args).not.toContain(ROOT);
        });

        it('jsonMode adiciona --json antes das flags de modo', () => {
            const args = buildSemgrepArgs({ diffMode: false, jsonMode: true });

            expect(args).toContain('--json');
            expect(args.indexOf('--json')).toBeLessThan(args.indexOf(ROOT));
        });

        it('json + diff combinam ambos os flags', () => {
            const args = buildSemgrepArgs({ diffMode: true, jsonMode: true });

            expect(args).toContain('--json');
            expect(args).toContain('--diff');
            expect(args).toContain('--baseline-commit');
        });
    });

    describe('ClassifySemgrepExit (§25 distincao findings vs erro de tool)', () => {
        it('exit 1 = supressoes encontradas → exitCode 1 e mensagem de causa raiz', () => {
            const d = classifySemgrepExit(1);

            expect(d.exitCode).toBe(1);
            expect(d.message).toContain('encontrou supressoes');
        });

        it('exit 2 = erro do tool → exitCode 2 e mensagem distinta (NAO scan)', () => {
            const d = classifySemgrepExit(2);

            expect(d.exitCode).toBe(2);
            expect(d.message).toContain('NAO e resultado de scan');
        });

        it('exit indefinido (tool ausente/crash) → exitCode default 2, nunca 0', () => {
            const d = classifySemgrepExit(undefined);

            expect(d.exitCode).toBe(2);
            expect(d.exitCode).not.toBe(0);
            expect(d.message).toContain('exit ?');
        });

        it('exit >2 preserva o codigo original (nao normaliza para 2)', () => {
            expect(classifySemgrepExit(7).exitCode).toBe(7);
        });

        it('nunca classifica exit 0 como findings — trata como erro de tool distinto', () => {
            const d = classifySemgrepExit(0);

            expect(d.exitCode).toBe(0);
            expect(d.message).toContain('NAO e resultado de scan');
        });
    });
});
