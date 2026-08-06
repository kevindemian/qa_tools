import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFixture } from '../artifact-fixtures.js';

const FIXTURES_DIR = join(import.meta.dirname, '..', '__fixtures__', 'artefactos');

// F0.7: only fixtures of surviving + reconstructed artifacts remain.
const KNOWN_ARTIFACTS = [
    'incident-report',
    'impact-alert',
    'backlog-health',
    'pipeline-cost',
    'release-score',
    'defect-trend',
    'defect-seasonality',
    'developer-profile',
    'coverage-gap',
];

function makeTempDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'artifact-fixtures-'));
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(dir, name), content);
    }
    return dir;
}

describe('LoadFixture', () => {
    it('parses every committed artifact fixture as valid non-empty JSON', () => {
        expect.hasAssertions();

        for (const id of KNOWN_ARTIFACTS) {
            const data = loadFixture<unknown>(id, FIXTURES_DIR);

            expect(data).toBeDefined();
            expect(data).not.toBeNull();
        }
    });

    it('throws an explicit error when the fixture file is missing', () => {
        const dir = makeTempDir({});
        try {
            expect(() => loadFixture('no-such-artifact', dir)).toThrow(/not found/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('throws an explicit error when the fixture is malformed JSON', () => {
        const dir = makeTempDir({ 'broken.json': '{ not valid json' });
        try {
            expect(() => loadFixture('broken', dir)).toThrow(/malformed JSON/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('throws when the fixture root value is empty', () => {
        const dir = makeTempDir({ 'empty.json': 'null' });
        try {
            expect(() => loadFixture('empty', dir)).toThrow(/empty root value/);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
