import os from 'os';
import fs from 'fs';
import path from 'path';
import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';

const mockOpenWithFallback =
    vi.fn<(filePath: string, label: string, logInfo: (msg: string) => void) => Promise<void>>();
const mockGetDocsOutputDir = vi.fn<() => string | null>();

vi.mock('../open.js', () => ({
    openWithFallback: (...args: [string, string, (msg: string) => void]) => mockOpenWithFallback(...args),
    getDocsOutputDir: () => mockGetDocsOutputDir(),
}));

let tempOutDir: string;
let docsDir: string;

async function loadModule() {
    return import('../report/show-docs.js');
}

describe('Show docs (integrated)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tempOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-show-docs-'));
        docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-docs-src-'));
        mockGetDocsOutputDir.mockReturnValue(tempOutDir);
    });

    afterEach(() => {
        fs.rmSync(tempOutDir, { recursive: true, force: true });
        fs.rmSync(docsDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('converts real markdown docs to html and writes them to the output dir', async () => {
        expect.hasAssertions();

        fs.writeFileSync(path.join(docsDir, '01-intro.md'), '# Intro\n');
        fs.writeFileSync(path.join(docsDir, '02-setup.md'), '# Setup\n');
        fs.writeFileSync(path.join(docsDir, '03-advanced.md'), '# Advanced\n');

        const { showDocs } = await loadModule();
        await showDocs(docsDir);

        const indexFile = path.join(tempOutDir, 'index.html');
        const introHtml = path.join(tempOutDir, '01-intro.html');
        const setupHtml = path.join(tempOutDir, '02-setup.html');

        expect(fs.existsSync(indexFile)).toBeTruthy();

        expect(fs.existsSync(introHtml)).toBeTruthy();

        expect(fs.existsSync(setupHtml)).toBeTruthy();

        const indexContent = fs.readFileSync(indexFile, 'utf8');

        expect(indexContent).toContain('Documentação');

        expect(indexContent).toContain('01-intro.html');

        const introContent = fs.readFileSync(introHtml, 'utf8');

        expect(introContent).toContain('Intro');

        expect(mockOpenWithFallback).toHaveBeenCalledWith(indexFile, 'Documentação', expect.any(Function));
    });

    it('reports error when docs dir does not exist and writes no output', async () => {
        expect.hasAssertions();

        const missingDir = path.join(os.tmpdir(), 'qa-docs-missing-' + Date.now());
        const indexFile = path.join(tempOutDir, 'index.html');

        expect(fs.existsSync(indexFile)).toBeFalsy();

        const { showDocs } = await loadModule();
        await showDocs(missingDir);

        expect(fs.existsSync(indexFile)).toBeFalsy();

        expect(mockOpenWithFallback).not.toHaveBeenCalled();
    });

    it('warns and returns when no docs match the required pattern', async () => {
        expect.hasAssertions();

        fs.writeFileSync(path.join(docsDir, 'readme.md'), '# Readme');
        fs.writeFileSync(path.join(docsDir, 'notes.txt'), 'notes');

        const { showDocs } = await loadModule();
        await showDocs(docsDir);

        expect(mockOpenWithFallback).not.toHaveBeenCalled();

        expect(fs.existsSync(path.join(tempOutDir, 'index.html'))).toBeFalsy();
    });

    it('skips a doc that fails to read and still writes the remaining ones', async () => {
        expect.hasAssertions();

        fs.writeFileSync(path.join(docsDir, '01-good.md'), '# Good 1');
        fs.writeFileSync(path.join(docsDir, '03-good.md'), '# Good 3');

        const brokenLink = path.join(docsDir, '02-bad.md');
        try {
            fs.symlinkSync(path.join(docsDir, 'does-not-exist-xyz.md'), brokenLink);
        } catch {
            fs.writeFileSync(brokenLink, '');
            fs.chmodSync(brokenLink, 0o000);
        }

        const { showDocs } = await loadModule();
        await showDocs(docsDir);

        expect(fs.existsSync(path.join(tempOutDir, '01-good.html'))).toBeTruthy();

        expect(fs.existsSync(path.join(tempOutDir, '03-good.html'))).toBeTruthy();

        expect(fs.existsSync(path.join(tempOutDir, '02-bad.html'))).toBeFalsy();
    });

    it('reports error when output dir cannot be determined', async () => {
        expect.hasAssertions();

        fs.writeFileSync(path.join(docsDir, '01-intro.md'), '# Intro');
        mockGetDocsOutputDir.mockReturnValue(null);

        const { showDocs } = await loadModule();
        await showDocs(docsDir);

        expect(fs.existsSync(path.join(tempOutDir, 'index.html'))).toBeFalsy();

        expect(mockOpenWithFallback).not.toHaveBeenCalled();
    });
});
