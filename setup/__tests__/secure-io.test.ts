import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfigFileSafe, MAX_CONFIG_BYTES } from '../secure-io.js';

describe('Secure-io readConfigFileSafe — integração real (fs verdadeiro)', () => {
    let root: string;
    let outside: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'secure-io-root-'));
        outside = mkdtempSync(join(tmpdir(), 'secure-io-outside-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
    });

    describe('Happy path', () => {
        it('lê o conteúdo UTF-8 de um arquivo real dentro da raiz', async () => {
            expect.assertions(1);

            writeFileSync(join(root, 'config.json'), '{"reporter":"x"}');

            await expect(readConfigFileSafe(root, 'config.json')).resolves.toBe('{"reporter":"x"}');
        });

        it('lê arquivo em subdiretório contido na raiz', async () => {
            expect.assertions(1);

            mkdirSync(join(root, 'nested'));
            writeFileSync(join(root, 'nested', 'c.json'), 'ok');

            await expect(readConfigFileSafe(root, 'nested/c.json')).resolves.toBe('ok');
        });
    });

    describe('Ausência é sentinela segura (não erro)', () => {
        it('retorna null quando o arquivo não existe', async () => {
            expect.assertions(1);
            await expect(readConfigFileSafe(root, 'missing.json')).resolves.toBeNull();
        });

        it('retorna null quando projectRoot não pode ser resolvido', async () => {
            expect.assertions(1);
            await expect(readConfigFileSafe(join(root, 'no-such-dir'), 'config.json')).resolves.toBeNull();
        });

        it('retorna null quando o caminho aponta para um diretório, não arquivo', async () => {
            expect.assertions(1);

            mkdirSync(join(root, 'adir'));

            await expect(readConfigFileSafe(root, 'adir')).resolves.toBeNull();
        });

        it('retorna null para symlink quebrado (aponta para inexistente)', async () => {
            expect.assertions(1);

            symlinkSync(join(root, 'ghost'), join(root, 'link.json'));

            await expect(readConfigFileSafe(root, 'link.json')).resolves.toBeNull();
        });
    });

    describe('PROPRIEDADE DE SEGURANÇA: symlink containment', () => {
        it('recusa symlink que escapa da raiz para arquivo externo (path traversal)', async () => {
            expect.assertions(1);

            const secret = join(outside, 'secret.txt');
            writeFileSync(secret, 'TOP SECRET');
            symlinkSync(secret, join(root, 'evil.json'));

            await expect(readConfigFileSafe(root, 'evil.json')).resolves.toBeNull();
        });

        it('recusa symlink que escapa via diretório externo', async () => {
            expect.assertions(1);

            writeFileSync(join(outside, 'x.json'), 'leak');
            symlinkSync(outside, join(root, 'outlink'));

            await expect(readConfigFileSafe(root, 'outlink/x.json')).resolves.toBeNull();
        });

        it('recusa traversal via ../ para arquivo real fora da raiz', async () => {
            expect.assertions(1);

            writeFileSync(join(outside, 'y.json'), 'leak');
            const relativeToRoot = join('..', outside.split('/').pop() ?? '', 'y.json');

            await expect(readConfigFileSafe(root, relativeToRoot)).resolves.toBeNull();
        });

        it('aceita symlink que permanece dentro da raiz', async () => {
            expect.assertions(1);

            writeFileSync(join(root, 'target.json'), 'inside');
            symlinkSync(join(root, 'target.json'), join(root, 'alias.json'));

            await expect(readConfigFileSafe(root, 'alias.json')).resolves.toBe('inside');
        });
    });

    describe('PROPRIEDADE DE SEGURANÇA: DoS guard por tamanho', () => {
        it('lê arquivo exatamente no limite MAX_CONFIG_BYTES', async () => {
            expect.assertions(2);

            const content = 'a'.repeat(MAX_CONFIG_BYTES);
            writeFileSync(join(root, 'atlimit.json'), content);

            const result = await readConfigFileSafe(root, 'atlimit.json');

            expect(result).not.toBeNull();
            expect(result?.length).toBe(MAX_CONFIG_BYTES);
        });

        it('recusa arquivo que excede MAX_CONFIG_BYTES em 1 byte', async () => {
            expect.assertions(1);

            writeFileSync(join(root, 'toobig.json'), 'a'.repeat(MAX_CONFIG_BYTES + 1));

            await expect(readConfigFileSafe(root, 'toobig.json')).resolves.toBeNull();
        });

        it('lê arquivo vazio (tamanho 0) sem falhar', async () => {
            expect.assertions(1);

            writeFileSync(join(root, 'empty.json'), '');

            await expect(readConfigFileSafe(root, 'empty.json')).resolves.toBe('');
        });
    });
});
