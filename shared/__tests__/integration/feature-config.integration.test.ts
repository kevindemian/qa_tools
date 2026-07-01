/**
 * Integration tests — Feature Config (FT-02)
 *
 * Validates the full lifecycle of feature configuration:
 * - Loading from disk (valid, invalid, missing)
 * - Saving to disk (round-trip)
 * - Per-project config resolution
 * - PR Report config accessors
 * - Sub-feature skip flags
 *
 * Uses real filesystem in isolated temp directories.
 * Mocks process.cwd() to redirect path.resolve() to temp dir.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rootLogger } from '../../logger.js';
import { createFeaturesJsonFixture } from './integration-helpers.js';

let TEST_DIR: string;

describe('Integration: Feature Config', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-feature-config-'));
        vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            rootLogger.warn('Cleanup failed for test dir: ' + String(err));
        }
    });

    describe('FT-02a: loadFeatureConfig round-trip', () => {
        it('loads valid config from disk', async () => {
            expect.hasAssertions();

            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            const fixture = createFeaturesJsonFixture();
            fs.writeFileSync(path.resolve(configPath), JSON.stringify(fixture), 'utf8');

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual(fixture);
            expect(result['test-project']?.gitProvider).toBe('github');
            expect(result['gitlab-project']?.gitProvider).toBe('gitlab');
        });

        it('returns empty store when file does not exist', async () => {
            expect.hasAssertions();

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual({});
        });

        it('returns empty store on invalid JSON', async () => {
            expect.hasAssertions();

            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(path.resolve(configPath), '{broken json!!', 'utf8');

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual({});
        });

        it('returns empty store on schema violation', async () => {
            expect.hasAssertions();

            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(path.resolve(configPath), JSON.stringify({ project: { invalid: true } }), 'utf8');

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual({});
        });
    });

    describe('FT-02b: saveFeatureConfig persistence', () => {
        it('saves and reloads config', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, loadFeatureConfig } = await import('../../feature-config.js');
            const fixture = createFeaturesJsonFixture();
            saveFeatureConfig(fixture);

            const reloaded = loadFeatureConfig();

            expect(reloaded).toStrictEqual(fixture);
        });

        it('creates config directory if missing', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(fs.existsSync(path.join(TEST_DIR, 'config', 'features.json'))).toBeTruthy();
        });
    });

    describe('FT-02c: getProjectFeatureConfig', () => {
        it('returns config for known project', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, getProjectFeatureConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            const result = getProjectFeatureConfig('test-project');

            expect(result).toBeDefined();
            expect(result?.gitProvider).toBe('github');
            expect(result?.features.prReport?.enabled).toBeTruthy();
        });

        it('returns undefined for unknown project', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, getProjectFeatureConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(getProjectFeatureConfig('nonexistent')).toBeUndefined();
        });
    });

    describe('FT-02d: getPrReportConfig', () => {
        it('returns configured PR report config', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, getPrReportConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            const config = getPrReportConfig('test-project');

            expect(config.enabled).toBeTruthy();
            expect(config.publishTarget).toBe('github-actions');
        });

        it('returns default (disabled) for unknown project', async () => {
            expect.hasAssertions();

            const { getPrReportConfig } = await import('../../feature-config.js');
            const config = getPrReportConfig('nonexistent');

            expect(config.enabled).toBeFalsy();
            expect(config.publishTarget).toBe('github-actions');
        });
    });

    describe('FT-02e: isPrReportEnabled', () => {
        it('returns true when enabled', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isPrReportEnabled } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(isPrReportEnabled('test-project')).toBeTruthy();
        });

        it('returns false for disabled project', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isPrReportEnabled } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(isPrReportEnabled('gitlab-project')).toBeFalsy();
        });

        it('returns false for unknown project', async () => {
            expect.hasAssertions();

            const { isPrReportEnabled } = await import('../../feature-config.js');

            expect(isPrReportEnabled('nonexistent')).toBeFalsy();
        });
    });

    describe('FT-02f: setPrReportConfig creates project if needed', () => {
        it('creates new project entry and sets config', async () => {
            expect.hasAssertions();

            const { setPrReportConfig, getProjectFeatureConfig, getPrReportConfig } =
                await import('../../feature-config.js');

            setPrReportConfig('brand-new', { enabled: true, publishTarget: 'gitlab-ci' as const });

            const project = getProjectFeatureConfig('brand-new');

            expect(project).toBeDefined();
            expect(project?.gitProvider).toBe('github');
            expect(project?.features.prReport?.enabled).toBeTruthy();

            const pr = getPrReportConfig('brand-new');

            expect(pr.enabled).toBeTruthy();
            expect(pr.publishTarget).toBe('gitlab-ci');
        });
    });

    describe('FT-02g: resolvePublishTarget fallbacks', () => {
        it('returns configured target when enabled', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, resolvePublishTarget } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(resolvePublishTarget('test-project')).toBe('github-actions');
        });

        it('falls back to gitlab-ci for disabled gitlab project using stored gitProvider', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, resolvePublishTarget } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            // When project is disabled, derive from the project's stored gitProvider
            expect(resolvePublishTarget('gitlab-project')).toBe('gitlab-ci');
        });

        it('falls back to github-actions for unknown project', async () => {
            expect.hasAssertions();

            const { resolvePublishTarget } = await import('../../feature-config.js');

            expect(resolvePublishTarget('nonexistent')).toBe('github-actions');
        });

        it('uses explicit gitProvider hint for unknown project', async () => {
            expect.hasAssertions();

            const { resolvePublishTarget } = await import('../../feature-config.js');

            expect(resolvePublishTarget('nonexistent', 'gitlab')).toBe('gitlab-ci');
        });
    });

    describe('FT-02h: sub-feature skip flags', () => {
        it('isAiSkipped returns false by default', async () => {
            expect.hasAssertions();

            const { isAiSkipped } = await import('../../feature-config.js');

            expect(isAiSkipped('nonexistent')).toBeFalsy();
        });

        it('isAiSkipped returns true when configured', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isAiSkipped } = await import('../../feature-config.js');
            saveFeatureConfig({
                'skip-project': {
                    gitProvider: 'github',
                    features: { prReport: { enabled: true, publishTarget: 'github-actions' as const, skipAi: true } },
                },
            });

            expect(isAiSkipped('skip-project')).toBeTruthy();
        });

        it('isQualitySkipped returns false by default', async () => {
            expect.hasAssertions();

            const { isQualitySkipped } = await import('../../feature-config.js');

            expect(isQualitySkipped('nonexistent')).toBeFalsy();
        });

        it('isFlakySkipped returns false by default', async () => {
            expect.hasAssertions();

            const { isFlakySkipped } = await import('../../feature-config.js');

            expect(isFlakySkipped('nonexistent')).toBeFalsy();
        });
    });
});
