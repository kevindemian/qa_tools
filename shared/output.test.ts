import { Output, defaultOutput } from './output.js';
import type { Mock } from 'vitest';
import * as boxModule from './box.js';

describe('Output', () => {
    let stdoutWriteSpy: Mock;
    let stderrWriteSpy: Mock;

    beforeEach(() => {
        stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        stdoutWriteSpy.mockRestore();
        stderrWriteSpy.mockRestore();
    });

    it('rows returns stdout.rows or 24', () => {
        const original = process.stdout.rows;
        (process.stdout as { rows?: number }).rows = 50;

        expect(Output.rows()).toBe(50);

        (process.stdout as { rows?: number }).rows = original;
    });

    it('rows defaults to 24', () => {
        const original = process.stdout.rows;
        delete (process.stdout as { rows?: number }).rows;

        expect(Output.rows()).toBe(24);

        (process.stdout as { rows?: number }).rows = original;
    });

    it('columns returns stdout.columns or 80', () => {
        const original = process.stdout.columns;
        (process.stdout as { columns?: number }).columns = 120;

        expect(Output.columns()).toBe(120);

        (process.stdout as { columns?: number }).columns = original;
    });

    it('isTTY returns stdout.isTTY', () => {
        const original = process.stdout.isTTY;
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

        expect(Output.isTTY()).toBeTruthy();

        Object.defineProperty(process.stdout, 'isTTY', { value: original, configurable: true });
    });

    it('print writes to stdout with newline', () => {
        const output = new Output();
        output.print('test message');

        expect(stdoutWriteSpy).toHaveBeenCalledWith('test message\n');
    });

    it('error writes to stderr with newline', () => {
        const output = new Output();
        output.error('error message');

        expect(stderrWriteSpy).toHaveBeenCalledWith('error message\n');
    });

    it('warn writes to stderr with newline', () => {
        const output = new Output();
        output.warn('warn message');

        expect(stderrWriteSpy).toHaveBeenCalledWith('warn message\n');
    });

    it('box prints rendered box to stdout', () => {
        const boxSpy = vi.spyOn(boxModule, 'box').mockReturnValue('boxed content');
        const output = new Output();
        output.box(['line1'], { width: 20 });

        expect(stdoutWriteSpy).toHaveBeenCalledWith('boxed content\n');

        boxSpy.mockRestore();
    });

    it('defaultOutput is an Output instance', () => {
        expect(defaultOutput).toBeInstanceOf(Output);
    });
});
