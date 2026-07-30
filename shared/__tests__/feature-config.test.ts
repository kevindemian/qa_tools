import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    loadFeatureConfig,
    saveFeatureConfig,
    getProjectFeatureConfig,
    getPrReportConfig,
    setPrReportConfig,
    isPrReportEnabled,
    resolvePublishTarget,
    isAiSkipped,
    isQualitySkipped,
    isFlakySkipped,
} from '../feature-config.js';
import { DEFAULT_PR_REPORT_CONFIG } from '../types/feature-config.js';

describe('Feature-config (hermetic, fs-backed, baseDir-isolated)', () => {
    let TMP: string;

    beforeEach(() => {
        TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-config-test-'));
    });

    afterEach(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    it('loadFeatureConfig returns empty store when features.json is absent (NOT an explicit disable)', () => {
        expect.hasAssertions();

        const store = loadFeatureConfig(TMP);

        expect(store).toStrictEqual({});
    });

    it('loadFeatureConfig returns empty store when features.json has invalid schema', () => {
        expect.hasAssertions();

        fs.mkdirSync(path.join(TMP, 'config'), { recursive: true });
        fs.writeFileSync(
            path.join(TMP, 'config', 'features.json'),
            JSON.stringify({ someProject: { gitProvider: 'not-a-provider' } }),
            'utf8',
        );

        expect(loadFeatureConfig(TMP)).toStrictEqual({});
    });

    it('saveFeatureConfig then loadFeatureConfig round-trips without data loss', () => {
        expect.hasAssertions();

        const store = {
            alpha: {
                gitProvider: 'github' as const,
                features: { prReport: { enabled: true, publishTarget: 'github-actions' as const } },
            },
        };
        saveFeatureConfig(store, TMP);

        expect(loadFeatureConfig(TMP)).toStrictEqual(store);
    });

    it('getPrReportConfig returns DEFAULT_PR_REPORT_CONFIG (disabled) when project has no entry', () => {
        expect.hasAssertions();
        expect(getPrReportConfig('ghost', TMP)).toStrictEqual(DEFAULT_PR_REPORT_CONFIG);
        expect(isPrReportEnabled('ghost', TMP)).toBeFalsy();
    });

    it('isPrReportEnabled reflects an enabled project config', () => {
        expect.hasAssertions();

        setPrReportConfig('beta', { enabled: true, publishTarget: 'gitlab-ci' }, TMP);

        expect(isPrReportEnabled('beta', TMP)).toBeTruthy();

        const cfg = getPrReportConfig('beta', TMP);

        expect(cfg.enabled).toBeTruthy();
        expect(cfg.publishTarget).toBe('gitlab-ci');
    });

    it('setPrReportConfig creates the project entry when missing and preserves other projects', () => {
        expect.hasAssertions();

        setPrReportConfig('p1', { enabled: false, publishTarget: 's3' }, TMP);
        setPrReportConfig('p2', { enabled: true, publishTarget: 'slack' }, TMP);
        const p1 = getProjectFeatureConfig('p1', TMP);
        const p2 = getProjectFeatureConfig('p2', TMP);

        expect(p1?.features.prReport?.publishTarget).toBe('s3');
        expect(p2?.features.prReport?.enabled).toBeTruthy();
        expect(Object.keys(loadFeatureConfig(TMP)).sort((a, b) => a.localeCompare(b))).toStrictEqual(['p1', 'p2']);
    });

    it('resolvePublishTarget returns config target when enabled', () => {
        expect.hasAssertions();

        setPrReportConfig('gh', { enabled: true, publishTarget: 'gh-pages' }, TMP);

        expect(resolvePublishTarget('gh', undefined, TMP)).toBe('gh-pages');
    });

    it('resolvePublishTarget falls back to gitlab-ci when disabled and provider is gitlab', () => {
        expect.hasAssertions();

        setPrReportConfig('gl', { enabled: false, publishTarget: 'github-actions' }, TMP);

        expect(resolvePublishTarget('gl', 'gitlab', TMP)).toBe('gitlab-ci');
    });

    it('resolvePublishTarget falls back to github-actions when disabled and provider unknown', () => {
        expect.hasAssertions();

        setPrReportConfig('x', { enabled: false, publishTarget: 's3' }, TMP);

        expect(resolvePublishTarget('x', undefined, TMP)).toBe('github-actions');
    });

    it('skip flags default to false (not skipped) and reflect config when set', () => {
        expect.hasAssertions();
        expect(isAiSkipped('absent', TMP)).toBeFalsy();
        expect(isQualitySkipped('absent', TMP)).toBeFalsy();
        expect(isFlakySkipped('absent', TMP)).toBeFalsy();

        setPrReportConfig(
            'sk',
            {
                enabled: true,
                publishTarget: 'github-actions',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
            },
            TMP,
        );

        expect(isAiSkipped('sk', TMP)).toBeTruthy();
        expect(isQualitySkipped('sk', TMP)).toBeTruthy();
        expect(isFlakySkipped('sk', TMP)).toBeTruthy();
    });
});
