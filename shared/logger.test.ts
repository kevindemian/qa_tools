import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import fs from 'fs';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from './logger.js';
import Config from './config.js';

class StubConfig {
    private readonly map: Record<string, unknown>;
    constructor(map: Record<string, unknown>) {
        this.map = map;
    }
    get(key: string): unknown {
        return key in this.map ? this.map[key] : undefined;
    }
    set(): void {}
}

describe('Logger file level filter — LOG-02', () => {
    let dir: string;
    let appendSpy: MockInstance<typeof fs.appendFileSync>;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'logl2-'));
        appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => undefined);
    });

    afterEach(() => {
        appendSpy.mockRestore();
        rmSync(dir, { recursive: true, force: true });
    });

    it('arquivo respeita logLevel (info nao eh escrito quando nivel=error)', () => {
        const cfg = new StubConfig({
            logLevel: 'error',
            logDir: dir,
            logFile: join(dir, 'app.log'),
            logMaxSize: 10 * 1024 * 1024,
        });
        const logger = new Logger({}, cfg as unknown as Config);

        logger.info('mensagem info');

        expect(appendSpy.mock.calls).toHaveLength(0);

        logger.error('mensagem erro');

        expect(appendSpy.mock.calls.length).toBeGreaterThan(0);
    });

    it('arquivo escreve info quando nivel=info', () => {
        const cfg = new StubConfig({
            logLevel: 'info',
            logDir: dir,
            logFile: join(dir, 'app.log'),
            logMaxSize: 10 * 1024 * 1024,
        });
        const logger = new Logger({}, cfg as unknown as Config);

        logger.info('mensagem info');

        expect(appendSpy.mock.calls.length).toBeGreaterThan(0);
    });
});

describe('Logger file error recovery — LOG-03', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'logl3-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('depois de falha de escrita transitória, o mesmo logger recupera (nao morre permanentemente)', () => {
        const cfg = new StubConfig({
            logLevel: 'info',
            logDir: dir,
            logFile: join(dir, 'app.log'),
            logMaxSize: 10 * 1024 * 1024,
        });
        const logger = new Logger({}, cfg as unknown as Config);

        const realAppend = fs.appendFileSync.bind(fs);
        let failNext = true;
        const spy = vi.spyOn(fs, 'appendFileSync').mockImplementation((...args: unknown[]) => {
            if (failNext) {
                failNext = false;
                throw new Error('EIO simulated');
            }
            return realAppend(...(args as [fs.PathOrFileDescriptor, string | Uint8Array, fs.WriteFileOptions?]));
        });

        logger.error('falha esperada (transitoria)');

        expect(logger._fileError).toBeTruthy();

        logger.error('deve escrever apos recuperacao');

        expect(logger._fileError).toBeFalsy();

        spy.mockRestore();

        const filePath = logger._filePathCached;

        expect(filePath).not.toBeNull();
        expect(existsSync(filePath as string)).toBeTruthy();

        const content = readFileSync(filePath as string, 'utf8');

        expect(content).toContain('deve escrever apos recuperacao');
    });
});

describe('Logger file cache validity — LOG-06', () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'logl6-'));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('arquivo apagado externamente e recriado em escrita subsequente (cache nao mascara falta)', () => {
        const cfg = new StubConfig({
            logLevel: 'info',
            logDir: dir,
            logFile: join(dir, 'app.log'),
            logMaxSize: 10 * 1024 * 1024,
        });
        const logger = new Logger({}, cfg as unknown as Config);

        logger.error('primeira escrita');
        const filePath = logger._filePathCached;

        expect(filePath).not.toBeNull();
        expect(existsSync(filePath as string)).toBeTruthy();

        rmSync(filePath as string, { force: true });

        logger.error('segunda escrita apos remocao');

        expect(existsSync(filePath as string)).toBeTruthy();

        const content = readFileSync(filePath as string, 'utf8');

        expect(content).toContain('segunda escrita apos remocao');
    });
});
