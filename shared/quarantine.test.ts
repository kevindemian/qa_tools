/** Tests for quarantine module — CRUD operations, expiry, pipeline file generation, and edge cases. */
import fs from 'fs';
import path from 'path';

const TEST_TITLE = 'tests/login.spec.ts';
const MOCK_STATE_HOME = '/tmp/qa-tools-quarantine-test-mock';

jest.mock('./config', () => ({
    __esModule: true,
    default: {
        xdgStateHome: '/tmp/qa-tools-quarantine-test-mock',
        get(key: string) {
            return (this as Record<string, unknown>)[key] as string;
        },
    },
}));

import {
    quarantineTest,
    isQuarantined,
    removeQuarantine,
    expireQuarantine,
    listQuarantined,
    quarantineRatio,
    generatePipelineQuarantine,
    loadQuarantine,
    markPermanent,
} from './quarantine';
import { nonNull } from '../shared/test-utils';

function quarantineStorePath(): string {
    return path.join(MOCK_STATE_HOME, 'qa-tools', 'quarantine', 'quarantine.json');
}

function pipelineFilePath(): string {
    return path.join(process.cwd(), 'qa-quarantine.json');
}

beforeAll(() => {
    try {
        fs.rmSync(MOCK_STATE_HOME, { recursive: true, force: true });
    } catch {
        /* best effort */
    }
    try {
        fs.unlinkSync(pipelineFilePath());
    } catch {
        /* best effort */
    }
});

afterEach(() => {
    try {
        fs.rmSync(MOCK_STATE_HOME, { recursive: true, force: true });
    } catch {
        /* best effort */
    }
    try {
        fs.unlinkSync(pipelineFilePath());
    } catch {
        /* best effort */
    }
});

describe('quarantineTest / isQuarantined', () => {
    it('adds and retrieves a quarantine entry', () => {
        quarantineTest({ testTitle: TEST_TITLE, reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.7 });
        const entry = isQuarantined(TEST_TITLE);
        expect(entry).toBeDefined();
        expect(nonNull(entry).testTitle).toBe(TEST_TITLE);
        expect(nonNull(entry).flakyRate).toBe(0.7);
        expect(nonNull(entry).reviewRequired).toBe(true);
        expect(nonNull(entry).permanent).toBe(false);
    });

    it('returns undefined for non-quarantined test', () => {
        expect(isQuarantined('nonexistent')).toBeUndefined();
    });

    it('updates existing non-permanent entry', () => {
        quarantineTest({ testTitle: TEST_TITLE, reason: 'first', quarantinedBy: 'test', flakyRate: 0.5 });
        quarantineTest({ testTitle: TEST_TITLE, reason: 'updated', quarantinedBy: 'test', flakyRate: 0.8 });
        const entry = isQuarantined(TEST_TITLE);
        expect(nonNull(entry).reason).toBe('updated');
        expect(nonNull(entry).flakyRate).toBe(0.8);
    });
});

describe('removeQuarantine', () => {
    it('removes an existing entry', () => {
        quarantineTest({ testTitle: TEST_TITLE, reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        expect(removeQuarantine(TEST_TITLE)).toBe(true);
        expect(isQuarantined(TEST_TITLE)).toBeUndefined();
    });

    it('returns false for non-existent entry', () => {
        expect(removeQuarantine('nonexistent')).toBe(false);
    });
});

describe('expireQuarantine', () => {
    it('expires entries past their TTL', () => {
        jest.useFakeTimers();
        quarantineTest({ testTitle: TEST_TITLE, reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5, ttlDays: 0 });
        jest.advanceTimersByTime(1000);
        const expired = expireQuarantine();
        expect(expired).toBe(1);
        expect(isQuarantined(TEST_TITLE)).toBeUndefined();
        jest.useRealTimers();
    });

    it('does not expire permanent entries', () => {
        quarantineTest({ testTitle: 'perm-test', reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        markPermanent('perm-test');
        jest.useFakeTimers();
        jest.advanceTimersByTime(400 * 24 * 60 * 60 * 1000);
        const expired = expireQuarantine();
        expect(expired).toBe(0);
        const entry = isQuarantined('perm-test');
        expect(entry).toBeDefined();
        expect(nonNull(entry).permanent).toBe(true);
        jest.useRealTimers();
    });
});

describe('listQuarantined', () => {
    it('returns all non-expired entries', () => {
        quarantineTest({ testTitle: 'test-1', reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        quarantineTest({ testTitle: 'test-2', reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.6 });
        const list = listQuarantined();
        expect(list.length).toBe(2);
    });
});

describe('quarantineRatio', () => {
    it('calculates ratio and warns above 5%', () => {
        quarantineTest({ testTitle: 't1', reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        quarantineTest({ testTitle: 't2', reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        const meta = quarantineRatio(10);
        expect(meta.count).toBe(2);
        expect(meta.ratio).toBe(0.2);
        expect(meta.warning).toContain('exceed 5%');
    });

    it('returns empty warning below 5%', () => {
        quarantineTest({ testTitle: 't1', reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        const meta = quarantineRatio(100);
        expect(meta.ratio).toBe(0.01);
        expect(meta.warning).toBe('');
    });
});

describe('generatePipelineQuarantine', () => {
    it('generates valid pipeline JSON file', () => {
        quarantineTest({
            testTitle: TEST_TITLE,
            reason: 'flaky',
            quarantinedBy: 'detection',
            flakyRate: 0.7,
            bugUrl: 'https://jira/bug-1',
        });

        const raw = fs.readFileSync(pipelineFilePath(), 'utf8');
        const parsed = JSON.parse(raw) as {
            excluded: { test: string; bugUrl: string }[];
            metadata: { totalExcluded: number; warning: string };
        };

        expect(parsed.excluded).toHaveLength(1);
        expect(parsed.excluded[0]?.test).toBe(TEST_TITLE);
        expect(parsed.excluded[0]?.bugUrl).toBe('https://jira/bug-1');
        expect(parsed.metadata.totalExcluded).toBe(1);
        expect(parsed.metadata.warning).toContain('exceed 5%');
    });

    it('generates empty list when no entries', () => {
        const pipeline = generatePipelineQuarantine();
        expect(pipeline.excluded).toHaveLength(0);
    });
});

describe('markPermanent', () => {
    it('marks entry as permanent', () => {
        quarantineTest({ testTitle: TEST_TITLE, reason: 'flaky', quarantinedBy: 'test', flakyRate: 0.5 });
        expect(markPermanent(TEST_TITLE)).toBe(true);
        const entry = isQuarantined(TEST_TITLE);
        expect(nonNull(entry).permanent).toBe(true);
    });

    it('returns false for non-existent entry', () => {
        expect(markPermanent('nonexistent')).toBe(false);
    });
});

describe('loadQuarantine', () => {
    it('returns empty store for corrupt data', () => {
        fs.mkdirSync(path.dirname(quarantineStorePath()), { recursive: true });
        fs.writeFileSync(quarantineStorePath(), 'not-json', 'utf8');
        const store = loadQuarantine();
        expect(store.entries).toEqual([]);
    });

    it('returns empty store for missing file', () => {
        const store = loadQuarantine();
        expect(store.entries).toEqual([]);
    });
});
