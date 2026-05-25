jest.mock('../shared/prompt-ui', () => ({ isQuiet: jest.fn() }));
jest.mock('../shared/output', () => {
    const mockOutput = { print: jest.fn() };
    return {
        Output: { isTTY: jest.fn(), isCI: jest.fn(), columns: jest.fn(() => 80) },
        defaultOutput: mockOutput,
    };
});

const mockSingleBar = { start: jest.fn(), update: jest.fn(), stop: jest.fn() };
jest.mock('cli-progress', () => ({
    SingleBar: jest.fn(() => mockSingleBar),
    Presets: { shades_classic: {} },
}));

import { isQuiet } from '../shared/prompt-ui';
import { Output } from '../shared/output';
import { withSpinner, ProgressBar, __setOraDep } from './spinner';

const mockIsQuiet = isQuiet as jest.Mock;
const mockIsTTY = Output.isTTY as jest.Mock;
const mockIsCI = Output.isCI as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockIsQuiet.mockReturnValue(false);
    mockIsTTY.mockReturnValue(true);
    mockIsCI.mockReturnValue(false);
});

describe('withSpinner', () => {
    const fn = jest.fn().mockResolvedValue(42);

    it('calls fn directly when quiet', async () => {
        mockIsQuiet.mockReturnValue(true);
        const result = await withSpinner('loading', fn);
        expect(result).toBe(42);
    });

    it('calls fn directly when not TTY', async () => {
        mockIsTTY.mockReturnValue(false);
        const result = await withSpinner('loading', fn);
        expect(result).toBe(42);
    });

    it('calls fn directly when CI', async () => {
        mockIsCI.mockReturnValue(true);
        const result = await withSpinner('loading', fn);
        expect(result).toBe(42);
    });

    it('uses ora spinner when TTY and not quiet', async () => {
        const mockSpinner = { start: jest.fn().mockReturnThis(), succeed: jest.fn(), fail: jest.fn() };
        const mockOra = jest.fn(() => mockSpinner);
        __setOraDep(mockOra);

        const result = await withSpinner('loading', fn);
        expect(result).toBe(42);
        expect(mockOra).toHaveBeenCalledWith({ text: 'loading', color: 'cyan', spinner: 'dots' });
        expect(mockSpinner.start).toHaveBeenCalled();
        expect(mockSpinner.succeed).toHaveBeenCalled();
    });

    it('calls spinner.fail on fn rejection', async () => {
        const mockSpinner = { start: jest.fn().mockReturnThis(), succeed: jest.fn(), fail: jest.fn() };
        __setOraDep(jest.fn(() => mockSpinner));
        const failingFn = jest.fn().mockRejectedValue(new Error('fail'));

        await expect(withSpinner('loading', failingFn)).rejects.toThrow('fail');
        expect(mockSpinner.fail).toHaveBeenCalled();
    });
});

describe('ProgressBar', () => {
    beforeEach(() => {
        mockIsTTY.mockReturnValue(true);
    });

    describe('constructor', () => {
        it('creates cli-progress bar when TTY enabled', () => {
            const bar = new ProgressBar(100);
            expect(bar.current).toBe(0);
        });

        it('does not create bar when not TTY', () => {
            mockIsTTY.mockReturnValue(false);
            const bar = new ProgressBar(100);
            expect(bar.current).toBe(0);
        });
    });

    describe('update', () => {
        it('delegates to bar.update when enabled', () => {
            const bar = new ProgressBar(100);
            bar.update(50);
            expect(bar.current).toBe(50);
            expect(mockSingleBar.update).toHaveBeenCalledWith(50);
        });

        it('falls back to output.print when not TTY', () => {
            mockIsTTY.mockReturnValue(false);
            const { defaultOutput } = require('../shared/output');
            const bar = new ProgressBar(100);
            bar.update(50);
            expect(defaultOutput.print).toHaveBeenCalled();
        });
    });

    describe('stop', () => {
        it('calls bar.stop when enabled', () => {
            const bar = new ProgressBar(100);
            bar.stop();
            expect(mockSingleBar.stop).toHaveBeenCalled();
        });

        it('no-ops when not TTY', () => {
            mockIsTTY.mockReturnValue(false);
            const bar = new ProgressBar(100);
            expect(() => bar.stop()).not.toThrow();
        });
    });
});
