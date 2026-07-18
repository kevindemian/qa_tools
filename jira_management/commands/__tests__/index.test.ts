import * as fs from 'fs';
import * as path from 'path';
import { getHandler } from '../index.js';

const KNOWN_CASES = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '20',
    '21',
    '22',
    '23',
];

describe('GetHandler', () => {
    it('returns a handler function for known case numbers', () => {
        const handler = getHandler('1');

        expect(handler).toBeInstanceOf(Function);
    });

    it('returns a handler for each known case', () => {
        expect.hasAssertions();

        for (const num of KNOWN_CASES) {
            const h = getHandler(num);

            expect(h).toBeInstanceOf(Function);
        }
    });

    it('returns null for unknown case number', () => {
        const handler = getHandler('99');

        expect(handler).toBeNull();
    });

    it('returns null for empty string', () => {
        const handler = getHandler('');

        expect(handler).toBeNull();
    });
});

describe('Handler contract (bidirectional)', () => {
    const caseDir = path.join(import.meta.dirname, '..');

    it('every registered handler has a corresponding file on disk', () => {
        expect.hasAssertions();

        for (const num of KNOWN_CASES) {
            const filename = `case${String(num).padStart(2, '0')}.ts`;
            const filePath = path.join(caseDir, filename);

            expect(fs.existsSync(path.resolve(filePath))).toBeTruthy();
        }
    });

    it('every case file on disk has a corresponding registered handler', () => {
        expect.hasAssertions();

        const files = fs.readdirSync(caseDir).filter((f) => /^case\d+\.ts$/.test(f) && !f.endsWith('.test.ts'));
        for (const file of files) {
            const rawNum = /^case(\d+)\.ts$/.exec(file)?.[1] ?? '';
            const handler = getHandler(rawNum) || getHandler(rawNum.replace(/^0+/, '') || '0');

            expect(handler).toBeInstanceOf(Function);
        }
    });

    it('every handler module exports a handler function', async () => {
        expect.hasAssertions();

        for (const num of KNOWN_CASES) {
            const padded = String(num).padStart(2, '0');
            const mod = await vi.importActual<{ default: { handler: (...args: unknown[]) => unknown } }>(
                `../case${padded}`,
            );

            expect(mod.default).toHaveProperty('handler');
            expect(mod.default.handler).toBeInstanceOf(Function);
        }
    });
});
