import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { readConfigFileSafe, MAX_CONFIG_BYTES } from './secure-io.js';
import { detectTestReporter } from './detector.js';

const created: string[] = [];
function tmpDir(prefix: string): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    created.push(d);
    return d;
}

describe('SecureReporterDetection', () => {
    afterEach(() => {
        for (const d of created.splice(0)) {
            fs.rmSync(d, { recursive: true, force: true });
        }
    });

    describe('ReadConfigFileSafe — symlink containment', () => {
        it('rejects a config symlinked OUTSIDE projectRoot', async () => {
            expect.hasAssertions();

            const root = tmpDir('qa-sec-');
            const outside = tmpDir('qa-outside-');
            const secret = path.join(outside, 'secret.txt');
            fs.writeFileSync(secret, 'stolen', 'utf8');
            const link = path.join(root, 'evil.config.ts');
            fs.symlinkSync(secret, link);

            const content = await readConfigFileSafe(root, 'evil.config.ts');

            expect(content).toBeNull();
        });

        it('accepts a config symlinked INSIDE projectRoot', async () => {
            expect.hasAssertions();

            const root = tmpDir('qa-sec-');
            const real = path.join(root, 'real.config.ts');
            fs.writeFileSync(real, `export default { reporters: ['ctrf'] };`, 'utf8');
            const link = path.join(root, 'link.config.ts');
            fs.symlinkSync(real, link);

            const content = await readConfigFileSafe(root, 'link.config.ts');

            expect(content).toContain('ctrf');
        });
    });

    describe('ReadConfigFileSafe — size guard', () => {
        it('skips files larger than MAX_CONFIG_BYTES', async () => {
            expect.hasAssertions();

            const root = tmpDir('qa-sec-');
            const big = path.join(root, 'huge.config.ts');
            fs.writeFileSync(big, 'x'.repeat(MAX_CONFIG_BYTES + 10), 'utf8');

            const content = await readConfigFileSafe(root, 'huge.config.ts');

            expect(content).toBeNull();
        });
    });

    describe('DetectTestReporter — cwd independence', () => {
        it('produces correct, independent results across parallel roots', async () => {
            expect.hasAssertions();

            const withReporter = tmpDir('qa-a-');
            fs.writeFileSync(
                path.join(withReporter, 'vitest.config.ts'),
                `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { reporters: ['ctrf'] } });`,
                'utf8',
            );

            const withoutReporter = tmpDir('qa-b-');
            fs.writeFileSync(
                path.join(withoutReporter, 'vitest.config.ts'),
                `import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { reporters: ['default'] } });`,
                'utf8',
            );

            const [a, b] = await Promise.all([detectTestReporter(withReporter), detectTestReporter(withoutReporter)]);

            expect(a).toBeTruthy();
            expect(b).toBeFalsy();
        });
    });
});
