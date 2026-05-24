import { Output, defaultOutput } from './output';
import * as boxModule from './box';

describe('Output', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
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
        (process.stdout as { isTTY?: boolean }).isTTY = true;
        expect(Output.isTTY()).toBe(true);
        (process.stdout as { isTTY?: boolean }).isTTY = original;
    });

    it('print calls console.log', () => {
        const output = new Output();
        output.print('test message');
        expect(consoleLogSpy).toHaveBeenCalledWith('test message');
    });

    it('error calls console.error', () => {
        const output = new Output();
        output.error('error message');
        expect(consoleErrorSpy).toHaveBeenCalledWith('error message');
    });

    it('warn calls console.warn', () => {
        const output = new Output();
        output.warn('warn message');
        expect(consoleWarnSpy).toHaveBeenCalledWith('warn message');
    });

    it('box prints rendered box', () => {
        const boxSpy = jest.spyOn(boxModule, 'box').mockReturnValue('boxed content');
        const output = new Output();
        output.box(['line1'], { width: 20 });
        expect(consoleLogSpy).toHaveBeenCalledWith('boxed content');
        boxSpy.mockRestore();
    });

    it('defaultOutput is an Output instance', () => {
        expect(defaultOutput).toBeInstanceOf(Output);
    });
});
