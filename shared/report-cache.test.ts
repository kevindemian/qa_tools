import fs from 'fs';
import path from 'path';
import os from 'os';
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import Config from './config.js';

vi.mock('./config', async () => ({
    default: {
        get: vi.fn(),
    },
}));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-report-cache-test-'));
vi.mocked(Config.get).mockImplementation((key: string) => {
    if (key === 'qaToolsReportsDir') return tmpDir;
    if (key === 'REPORT_CACHE_MAX') return '100';
    return undefined;
});

import { cacheReport, listReports, loadReport, pruneReports } from './report-cache.js';

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
    const dir = tmpDir;
    if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
            const fp = path.join(dir, f);
            const stat = fs.statSync(fp);
            if (stat.isDirectory()) {
                fs.rmSync(fp, { recursive: true });
            } else {
                fs.unlinkSync(fp);
            }
        }
    }
    vi.clearAllMocks();
});

function makeTests(n: number): Array<{ title: string; state: 'passed' | 'failed'; duration: number }> {
    return Array.from({ length: n }, (_, i) => ({
        title: `test-${i}`,
        state: (i % 2 === 0 ? 'passed' : 'failed') as 'passed' | 'failed',
        duration: 100 + i,
    }));
}

describe('report-cache', () => {
    it('cacheReport writes data file and updates index', () => {
        const tests = makeTests(3);
        const id = cacheReport('proj-x', 'pipeline-1', tests, { passed: 2, failed: 1, skipped: 0, total: 3 });
        expect(id).toBeTruthy();
        expect(typeof id).toBe('string');
        const reportDir = path.join(tmpDir, 'qa-tools', 'reports');
        const dp = path.join(reportDir, id + '.json');
        expect(fs.existsSync(dp)).toBe(true);
        const raw = JSON.parse(fs.readFileSync(dp, 'utf-8'));
        expect(raw.tests).toHaveLength(3);
        expect(raw.stats.passed).toBe(2);

        const idxPath = path.join(reportDir, 'index.json');
        expect(fs.existsSync(idxPath)).toBe(true);
        const idx = JSON.parse(fs.readFileSync(idxPath, 'utf-8'));
        expect(idx.reports).toHaveLength(1);
        expect(idx.reports[0].id).toBe(id);
    });

    it('cacheReport returns unique ids for consecutive calls', () => {
        const tests = makeTests(1);
        const id1 = cacheReport('proj-x', 'p1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        const id2 = cacheReport('proj-x', 'p2', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        expect(id1).not.toBe(id2);
    });

    it('listReports returns entries in reverse chronological order', () => {
        const tests = makeTests(1);
        cacheReport('proj', 'p1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        cacheReport('proj', 'p2', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        const list = listReports('proj');
        expect(list).toHaveLength(2);
        const entry0 = list[0];
        const entry1 = list[1];
        expect(entry0).toBeDefined();
        expect(entry1).toBeDefined();
        if (entry0) expect(entry0.pipelineId).toBe('p2');
        if (entry1) expect(entry1.pipelineId).toBe('p1');
    });

    it('listReports filters by project', () => {
        const tests = makeTests(1);
        cacheReport('alpha', 'p1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        cacheReport('beta', 'b1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        expect(listReports('alpha')).toHaveLength(1);
        expect(listReports('beta')).toHaveLength(1);
        expect(listReports('gamma')).toHaveLength(0);
    });

    it('listReports without project returns all', () => {
        const tests = makeTests(1);
        cacheReport('alpha', 'p1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        cacheReport('beta', 'b1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        expect(listReports()).toHaveLength(2);
    });

    it('loadReport returns stored data', () => {
        const tests = makeTests(2);
        const id = cacheReport('proj', 'p1', tests, { passed: 1, failed: 1, skipped: 0, total: 2 });
        const loaded = loadReport(id);
        expect(loaded).not.toBeNull();
        if (loaded) {
            expect(loaded.tests).toHaveLength(2);
            expect(loaded.stats.passed).toBe(1);
            expect(loaded.stats.failed).toBe(1);
            expect(loaded.stats.total).toBe(2);
        }
    });

    it('loadReport for nonexistent id returns null', () => {
        expect(loadReport('nonexistent')).toBeNull();
    });

    it('loadReport handles corrupted data file gracefully', () => {
        const tests = makeTests(1);
        const id = cacheReport('proj', 'p1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        const reportDir = path.join(tmpDir, 'qa-tools', 'reports');
        const dp = path.join(reportDir, id + '.json');
        fs.writeFileSync(dp, '{invalid json}', 'utf-8');
        expect(loadReport(id)).toBeNull();
    });

    it('pruneReports removes oldest entries beyond max', () => {
        const tests = makeTests(1);
        for (let i = 0; i < 7; i++) {
            cacheReport('proj', 'p' + i, tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        }
        const removed = pruneReports(3);
        expect(removed).toBe(4);
        expect(listReports('proj')).toHaveLength(3);
    });

    it('pruneReports with no excess returns 0 and keeps all', () => {
        const tests = makeTests(1);
        for (let i = 0; i < 3; i++) {
            cacheReport('proj', 'p' + i, tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        }
        const removed = pruneReports(5);
        expect(removed).toBe(0);
        expect(listReports('proj')).toHaveLength(3);
    });

    it('survives corrupted index.json and rebuilds from data files', () => {
        const tests = makeTests(1);
        cacheReport('proj', 'p1', tests, { passed: 1, failed: 0, skipped: 0, total: 1 });
        const ip = path.join(tmpDir, 'index.json');
        fs.writeFileSync(ip, '{corrupted}', 'utf-8');
        const list = listReports('proj');
        expect(list).toBeDefined();
        expect(Array.isArray(list)).toBe(true);
    });

    it('multiple projects coexist without interference', () => {
        const ta = makeTests(1);
        const tb = makeTests(2);
        cacheReport('alpha', 'a1', ta, { passed: 1, failed: 0, skipped: 0, total: 1 });
        cacheReport('beta', 'b1', tb, { passed: 2, failed: 0, skipped: 0, total: 2 });
        expect(listReports('alpha')).toHaveLength(1);
        expect(listReports('beta')).toHaveLength(1);
        const aMeta = listReports('alpha')[0];
        expect(aMeta).toBeDefined();
        if (aMeta) {
            const aLoaded = loadReport(aMeta.id);
            expect(aLoaded).not.toBeNull();
            if (aLoaded) expect(aLoaded.tests).toHaveLength(1);
        }
        const bMeta = listReports('beta')[0];
        expect(bMeta).toBeDefined();
        if (bMeta) {
            const bLoaded = loadReport(bMeta.id);
            expect(bLoaded).not.toBeNull();
            if (bLoaded) expect(bLoaded.tests).toHaveLength(2);
        }
    });
});
