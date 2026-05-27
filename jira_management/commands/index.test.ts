import * as fs from 'fs';
import * as path from 'path';
import { getHandler } from './index';

describe('getHandler', () => {
    it('returns a handler function for known case numbers', () => {
        const handler = getHandler('1');
        expect(handler).toBeInstanceOf(Function);
    });

    it('returns a handler for each case 1-20', () => {
        for (let i = 1; i <= 20; i++) {
            const h = getHandler(String(i));
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
        for (let i = 1; i <= 20; i++) {
            const filename = `case${String(i).padStart(2, '0')}.ts`;
            const filePath = path.join(caseDir, filename);
            expect(fs.existsSync(filePath)).toBe(true);
        }
    });

    it('every case file on disk has a corresponding registered handler', () => {
        const files = fs.readdirSync(caseDir).filter((f) => /^case\d+\.ts$/.test(f) && !f.endsWith('.test.ts'));
        for (const file of files) {
            const match = file.match(/^case0*(\d+)\.ts$/);
            expect(match).not.toBeNull();
            const caseNum = match![1]!;
            const handler = getHandler(caseNum);
            expect(handler).toBeInstanceOf(Function);
        }
    });

    it('every handler module exports a handler function', () => {
        for (let i = 1; i <= 20; i++) {
            const mod = require(`./case${String(i).padStart(2, '0')}`);
            expect(mod.default).toHaveProperty('handler');
            expect(mod.default.handler).toBeInstanceOf(Function);
        }
    });
});
