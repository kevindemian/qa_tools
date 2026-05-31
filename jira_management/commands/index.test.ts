import * as fs from 'fs';
import * as path from 'path';
import { getHandler } from './index';

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

describe('getHandler', () => {
    it('returns a handler function for known case numbers', () => {
        const handler = getHandler('1');
        expect(handler).toBeInstanceOf(Function);
    });

    it('returns a handler for each known case', () => {
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

describe('handler contract (bidirectional)', () => {
    const caseDir = __dirname;

    it('every registered handler has a corresponding file on disk', () => {
        for (const num of KNOWN_CASES) {
            const filename = `case${String(num).padStart(2, '0')}.ts`;
            const filePath = path.join(caseDir, filename);
            expect(fs.existsSync(filePath)).toBe(true);
        }
    });

    it('every case file on disk has a corresponding registered handler', () => {
        const files = fs.readdirSync(caseDir).filter((f) => /^case\d+\.ts$/.test(f) && !f.endsWith('.test.ts'));
        for (const file of files) {
            const rawNum = file.match(/^case(\d+)\.ts$/)?.[1] || '';
            const handler = getHandler(rawNum) || getHandler(rawNum.replace(/^0+/, '') || '0');
            expect(handler).toBeInstanceOf(Function);
        }
    });

    it('every handler module exports a handler function', () => {
        for (const num of KNOWN_CASES) {
            const mod = require(`./case${String(num).padStart(2, '0')}`);
            expect(mod.default).toHaveProperty('handler');
            expect(mod.default.handler).toBeInstanceOf(Function);
        }
    });
});
