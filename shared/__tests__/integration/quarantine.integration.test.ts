/**
 * Integration Tests — Quarantine (FT-36)
 *
 * FT-36a: Create quarantine -> verify file written
 * FT-36b: Expire entry -> verify removed
 * FT-36c: Permanent entry survives expiry
 * FT-36d: Pipeline quarantine with totalTests produces correct ratio/warning
 * FT-36e: Corrupt store -> graceful fallback
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const { MOCK_STATE_HOME } = vi.hoisted(() => ({
    MOCK_STATE_HOME: '/tmp/qa-tools-quarantine-integration',
}));

vi.mock('../../config', () => ({
    __esModule: true,
    default: {
        xdgStateHome: MOCK_STATE_HOME,
        get(key: string) {
            return Reflect.get(this, key) as string;
        },
    },
}));

import {
    quarantineTest,
    isQuarantined,
    expireQuarantine,
    quarantineRatio,
    generatePipelineQuarantine,
    loadQuarantine,
    markPermanent,
} from '../../quarantine.js';
import { nonNull } from '../../test-utils.js';

function storePath(): string {
    return path.join(MOCK_STATE_HOME, 'qa-tools', 'quarantine', 'quarantine.json');
}

function pipelineFilePath(): string {
    return path.join(process.cwd(), 'qa-quarantine.json');
}

describe('Quarantine.Integration', () => {
    beforeEach(() => {
        try {
            fs.rmSync(MOCK_STATE_HOME, { recursive: true, force: true });
        } catch {
            /* ok */
        }
        try {
            fs.unlinkSync(pipelineFilePath());
        } catch {
            /* ok */
        }
    });

    afterEach(() => {
        try {
            fs.rmSync(MOCK_STATE_HOME, { recursive: true, force: true });
        } catch {
            /* ok */
        }
        try {
            fs.unlinkSync(pipelineFilePath());
        } catch {
            /* ok */
        }
    });

    describe('FT-36a — Create quarantine', () => {
        it('creates entry and persists to disk', () => {
            quarantineTest({
                testTitle: 'login.spec.ts',
                reason: 'flaky rate > 5%',
                quarantinedBy: 'system',
                flakyRate: 0.7,
                bugUrl: 'https://jira/PROJ-42',
            });

            const entry = isQuarantined('login.spec.ts');

            expect(entry).toBeDefined();
            expect(nonNull(entry).testTitle).toBe('login.spec.ts');
            expect(nonNull(entry).reason).toBe('flaky rate > 5%');
            expect(nonNull(entry).flakyRate).toBeCloseTo(0.7);
            expect(nonNull(entry).bugUrl).toBe('https://jira/PROJ-42');
            expect(nonNull(entry).reviewRequired).toBeTruthy();
            expect(nonNull(entry).permanent).toBeFalsy();

            expect(fs.existsSync(storePath())).toBeTruthy();
        });

        it('persists pipeline file to disk', () => {
            quarantineTest({
                testTitle: 'login.spec.ts',
                reason: 'flaky rate > 5%',
                quarantinedBy: 'system',
                flakyRate: 0.7,
                bugUrl: 'https://jira/PROJ-42',
            });

            expect(fs.existsSync(pipelineFilePath())).toBeTruthy();
        });
    });

    describe('FT-36b — Expire entry', () => {
        it('removes entry past TTL', async () => {
            expect.hasAssertions();

            vi.useFakeTimers();
            quarantineTest({
                testTitle: 'expirable.spec.ts',
                reason: 'flaky',
                quarantinedBy: 'system',
                flakyRate: 0.5,
                ttlDays: 0,
            });

            await vi.advanceTimersByTimeAsync(1000);

            const expired = expireQuarantine();

            expect(expired).toBe(1);
            expect(isQuarantined('expirable.spec.ts')).toBeUndefined();

            const store = loadQuarantine();

            expect(store.entries).toHaveLength(0);

            vi.useRealTimers();
        });
    });

    describe('FT-36c — Permanent entry survives expiry', () => {
        it('keeps permanent entry after expiry runs', async () => {
            expect.hasAssertions();

            quarantineTest({
                testTitle: 'permanent.spec.ts',
                reason: 'known flaky',
                quarantinedBy: 'admin',
                flakyRate: 0.8,
                ttlDays: 0,
            });

            markPermanent('permanent.spec.ts');

            vi.useFakeTimers();
            await vi.advanceTimersByTimeAsync(1000);

            const expired = expireQuarantine();

            expect(expired).toBe(0);

            const permanentEntry = isQuarantined('permanent.spec.ts');

            expect(permanentEntry).toBeDefined();
            expect(nonNull(permanentEntry).permanent).toBeTruthy();

            vi.useRealTimers();
        });
    });

    describe('FT-36d — Pipeline quarantine with ratio', () => {
        it('generates pipeline JSON with correct ratio and warning', () => {
            quarantineTest({
                testTitle: 'flaky1.spec.ts',
                reason: 'flaky',
                quarantinedBy: 'system',
                flakyRate: 0.6,
            });
            quarantineTest({
                testTitle: 'flaky2.spec.ts',
                reason: 'flaky',
                quarantinedBy: 'system',
                flakyRate: 0.7,
            });

            const pipeline = generatePipelineQuarantine(undefined, 20);

            expect(pipeline.excluded).toHaveLength(2);
            expect(pipeline.metadata.totalExcluded).toBe(2);
            expect(pipeline.metadata.totalTests).toBe(20);
            expect(pipeline.metadata.ratio).toBeCloseTo(0.1);
            expect(pipeline.metadata.warning).toContain('exceed 5%');
        });

        it('does not warn when ratio is within threshold', () => {
            quarantineTest({
                testTitle: 'flaky1.spec.ts',
                reason: 'flaky',
                quarantinedBy: 'test',
                flakyRate: 0.5,
            });

            const pipeline = generatePipelineQuarantine(undefined, 100);

            expect(pipeline.metadata.ratio).toBeCloseTo(0.01);
            expect(pipeline.metadata.warning).toBe('');
        });
    });

    describe('FT-36e — Corrupt store recovery', () => {
        it('returns empty store for corrupt JSON', () => {
            const dir = path.dirname(storePath());
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(storePath(), 'not-valid-json', 'utf8');
            const store = loadQuarantine();

            expect(store.entries).toStrictEqual([]);
        });

        it('returns empty store when file missing', () => {
            const store = loadQuarantine();

            expect(store.entries).toStrictEqual([]);
        });
    });

    describe('QuarantineRatio — pure calculation', () => {
        it('returns count=0 ratio=0 when no entries', () => {
            const meta = quarantineRatio(100);

            expect(meta.count).toBe(0);
            expect(meta.ratio).toBe(0);
            expect(meta.warning).toBe('');
        });
    });

});
