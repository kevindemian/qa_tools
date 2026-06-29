import fs from 'fs';
import path from 'path';
import { describe, it } from 'vitest';

const tmpDir = path.join(process.cwd(), '.tmp', 'qa-store-backend-test');

describe('Test', () => {
    it('works', () => {
        const dir = path.join(tmpDir, 'sub');
        fs.mkdirSync(dir, { recursive: true });
        fs.existsSync(dir);
    });
});
