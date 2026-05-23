jest.mock('../shared/logger', () => ({
    rootLogger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import fs from 'fs';
import CypressTest from './cypress_test';
import { rootLogger } from '../shared/logger';

describe('CypressTest', () => {
    let cypressTest: CypressTest;

    beforeEach(() => {
        cypressTest = new CypressTest('/fake/report/dir');
        jest.clearAllMocks();
    });

    describe('parseResults', () => {
        it('parses a single block correctly', async () => {
            const content = '10\n20\n30\n40';
            jest.spyOn(fs, 'readFile').mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, data?: string) => void;
                cb(null, content);
            });

            const result = await cypressTest.parseResults('/fake/path');
            expect(result.avgPassed).toBe(30);
            expect(result.avgFailed).toBe(40);
            expect(result.percentPassed).toBe(42.86);
        });

        it('returns zeros for empty file with no delimiter', async () => {
            jest.spyOn(fs, 'readFile').mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, data?: string) => void;
                cb(null, '');
            });

            const result = await cypressTest.parseResults('/fake/path');
            expect(result).toEqual({ avgPassed: 0, avgFailed: 0, percentPassed: 0 });
        });

        it('averages correctly across multiple blocks', async () => {
            const content = [
                "Merge branch 'rel_cand' into 'main'",
                '10',
                '20',
                '30',
                '40',
                "Merge branch 'rel_cand' into 'main'",
                '50',
                '60',
                '70',
                '80',
            ].join('\n');
            jest.spyOn(fs, 'readFile').mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, data?: string) => void;
                cb(null, content);
            });

            const result = await cypressTest.parseResults('/fake/path');
            expect(result.avgPassed).toBe(50);
            expect(result.avgFailed).toBe(60);
            expect(result.percentPassed).toBe(45.45);
        });

        it('rejects on file read error', async () => {
            jest.spyOn(fs, 'readFile').mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, data?: string) => void;
                cb(new Error('ENOENT'));
            });

            await expect(cypressTest.parseResults('/nonexistent')).rejects.toThrow('ENOENT');
        });

        it('skips block with not enough numeric lines and logs warning', async () => {
            const content = '10\n20';
            jest.spyOn(fs, 'readFile').mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, data?: string) => void;
                cb(null, content);
            });

            const result = await cypressTest.parseResults('/fake/path');
            expect(rootLogger.warn).toHaveBeenCalledWith('Skipping block 1: not enough numeric lines');
            expect(result).toEqual({ avgPassed: 0, avgFailed: 0, percentPassed: 0 });
        });

        it('returns zero percent when total tests is zero', async () => {
            const content = '0\n0\n0\n0';
            jest.spyOn(fs, 'readFile').mockImplementation((...args: unknown[]) => {
                const cb = args[args.length - 1] as (err: Error | null, data?: string) => void;
                cb(null, content);
            });

            const result = await cypressTest.parseResults('/fake/path');
            expect(result.avgPassed).toBe(0);
            expect(result.avgFailed).toBe(0);
            expect(result.percentPassed).toBe(0);
        });
    });
});
