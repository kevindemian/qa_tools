vi.mock('../shared/prompt-ui', () => ({ isQuiet: vi.fn() }));
vi.mock('../shared/output', () => {
    const mockOutput = { print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn(), columns: vi.fn(() => 80) },
        defaultOutput: mockOutput,
    };
});

const mockSingleBar = vi.hoisted(() => ({ start: vi.fn(), update: vi.fn(), stop: vi.fn() }));
vi.mock('cli-progress', () => ({
    default: {
        SingleBar: vi.fn(function () {
            return mockSingleBar;
        }),
        Presets: { shades_classic: {} },
    },
}));

import { isQuiet } from '../shared/prompt-ui.js';
import { Output, defaultOutput } from '../shared/output.js';
import { withSpinner, ProgressBar, __setOraDep } from './spinner.js';

const mockIsQuiet = vi.mocked(isQuiet);
const mockIsTTY = vi.spyOn(Output, 'isTTY');
const mockIsCI = vi.spyOn(Output, 'isCI');

describe('Spinner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsQuiet.mockReturnValue(false);
        mockIsTTY.mockReturnValue(true);
        mockIsCI.mockReturnValue(false);
    });

    describe('WithSpinner', () => {
        const fn = vi.fn().mockResolvedValue(42);

        it('calls fn directly when quiet', async () => {expect.hasAssertions();

            mockIsQuiet.mockReturnValue(true);
            const result = await withSpinner('loading', fn);

            expect(result).toBe(42);
        });

        it('calls fn directly when not TTY', async () => {expect.hasAssertions();

            mockIsTTY.mockReturnValue(false);
            const result = await withSpinner('loading', fn);

            expect(result).toBe(42);
        });

        it('calls fn directly when CI', async () => {expect.hasAssertions();

            mockIsCI.mockReturnValue(true);
            const result = await withSpinner('loading', fn);

            expect(result).toBe(42);
        });

        it('uses ora spinner when TTY and not quiet', async () => {expect.hasAssertions();

            const mockSpinner = { start: vi.fn().mockReturnThis(), succeed: vi.fn(), fail: vi.fn() };
            const mockOra = vi.fn(() => mockSpinner);
            __setOraDep(mockOra);

            const result = await withSpinner('loading', fn);

            expect(result).toBe(42);
            expect(mockOra).toHaveBeenCalledWith({ text: 'loading', color: 'cyan', spinner: 'dots' });
            expect(mockSpinner.start).toHaveBeenCalled();
            expect(mockSpinner.succeed).toHaveBeenCalled();
        });

        it('calls spinner.fail on fn rejection', async () => {expect.hasAssertions();

            const mockSpinner = { start: vi.fn().mockReturnThis(), succeed: vi.fn(), fail: vi.fn() };
            __setOraDep(vi.fn(() => mockSpinner));
            const failingFn = vi.fn().mockRejectedValue(new Error('fail'));

            await expect(withSpinner('loading', failingFn)).rejects.toThrow('fail');
            expect(mockSpinner.fail).toHaveBeenCalled();
        });
    });

    describe('ProgressBar', () => {
        beforeEach(() => {
            mockIsTTY.mockReturnValue(true);
        });

        describe('Constructor', () => {
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

        describe('Update', () => {
            it('delegates to bar.update when enabled', () => {
                const bar = new ProgressBar(100);
                bar.update(50);

                expect(bar.current).toBe(50);
                expect(mockSingleBar.update).toHaveBeenCalledWith(50);
            });

            it('falls back to output.print when not TTY', () => {
                mockIsTTY.mockReturnValue(false);
                const printSpy = vi.spyOn(defaultOutput, 'print');
                const bar = new ProgressBar(100);
                bar.update(50);

                expect(printSpy).toHaveBeenCalled();
            });
        });

        describe('Stop', () => {
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

});
