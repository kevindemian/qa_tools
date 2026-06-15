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
        } catch {
            /* best effort */
        }
    });

    describe('FT-02a: loadFeatureConfig round-trip', () => {
        it('loads valid config from disk', async () => {
            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            const fixture = createFeaturesJsonFixture();
            fs.writeFileSync(configPath, JSON.stringify(fixture), 'utf8');

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toEqual(fixture);
            expect(result['test-project']?.gitProvider).toBe('github');
            expect(result['gitlab-project']?.gitProvider).toBe('gitlab');
        });

        it('returns empty store when file does not exist', async () => {
            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();
            expect(result).toEqual({});
        });

        it('returns empty store on invalid JSON', async () => {
            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, '{broken json!!', 'utf8');

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();
            expect(result).toEqual({});
        });

        it('returns empty store on schema violation', async () => {
            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify({ project: { invalid: true } }), 'utf8');

            const { loadFeatureConfig } = await import('../../feature-config.js');
            const result = loadFeatureConfig();
            expect(result).toEqual({});
        });
    });

    describe('FT-02b: saveFeatureConfig persistence', () => {
        it('saves and reloads config', async () => {
            const { saveFeatureConfig, loadFeatureConfig } = await import('../../feature-config.js');
            const fixture = createFeaturesJsonFixture();
            saveFeatureConfig(fixture);

            const reloaded = loadFeatureConfig();
            expect(reloaded).toEqual(fixture);
        });

        it('creates config directory if missing', async () => {
            const { saveFeatureConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(fs.existsSync(path.join(TEST_DIR, 'config', 'features.json'))).toBe(true);
        });
    });

    describe('FT-02c: getProjectFeatureConfig', () => {
        it('returns config for known project', async () => {
            const { saveFeatureConfig, getProjectFeatureConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            const result = getProjectFeatureConfig('test-project');
            expect(result).toBeDefined();
            expect(result?.gitProvider).toBe('github');
            expect(result?.features.prReport?.enabled).toBe(true);
        });

        it('returns undefined for unknown project', async () => {
            const { saveFeatureConfig, getProjectFeatureConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            expect(getProjectFeatureConfig('nonexistent')).toBeUndefined();
        });
    });

    describe('FT-02d: getPrReportConfig', () => {
        it('returns configured PR report config', async () => {
            const { saveFeatureConfig, getPrReportConfig } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());

            const config = getPrReportConfig('test-project');
            expect(config.enabled).toBe(true);
            expect(config.publishTarget).toBe('github-actions');
        });

        it('returns default (disabled) for unknown project', async () => {
            const { getPrReportConfig } = await import('../../feature-config.js');
            const config = getPrReportConfig('nonexistent');
            expect(config.enabled).toBe(false);
            expect(config.publishTarget).toBe('github-actions');
        });
    });

    describe('FT-02e: isPrReportEnabled', () => {
        it('returns true when enabled', async () => {
            const { saveFeatureConfig, isPrReportEnabled } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());
            expect(isPrReportEnabled('test-project')).toBe(true);
        });

        it('returns false for disabled project', async () => {
            const { saveFeatureConfig, isPrReportEnabled } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());
            expect(isPrReportEnabled('gitlab-project')).toBe(false);
        });

        it('returns false for unknown project', async () => {
            const { isPrReportEnabled } = await import('../../feature-config.js');
            expect(isPrReportEnabled('nonexistent')).toBe(false);
        });
    });

    describe('FT-02f: setPrReportConfig creates project if needed', () => {
        it('creates new project entry and sets config', async () => {
            const { setPrReportConfig, getProjectFeatureConfig, getPrReportConfig } =
                await import('../../feature-config.js');

            setPrReportConfig('brand-new', { enabled: true, publishTarget: 'gitlab-ci' as const });

            const project = getProjectFeatureConfig('brand-new');
            expect(project).toBeDefined();
            expect(project?.gitProvider).toBe('github');
            expect(project?.features.prReport?.enabled).toBe(true);

            const pr = getPrReportConfig('brand-new');
            expect(pr.enabled).toBe(true);
            expect(pr.publishTarget).toBe('gitlab-ci');
        });
    });

    describe('FT-02g: resolvePublishTarget fallbacks', () => {
        it('returns configured target when enabled', async () => {
            const { saveFeatureConfig, resolvePublishTarget } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());
            expect(resolvePublishTarget('test-project')).toBe('github-actions');
        });

        it('falls back to github-actions for disabled gitlab project without hint', async () => {
            const { saveFeatureConfig, resolvePublishTarget } = await import('../../feature-config.js');
            saveFeatureConfig(createFeaturesJsonFixture());
            // When project is disabled and no explicit gitProvider hint, falls back to github-actions
            expect(resolvePublishTarget('gitlab-project')).toBe('github-actions');
        });

        it('falls back to github-actions for unknown project', async () => {
            const { resolvePublishTarget } = await import('../../feature-config.js');
            expect(resolvePublishTarget('nonexistent')).toBe('github-actions');
        });

        it('uses explicit gitProvider hint for unknown project', async () => {
            const { resolvePublishTarget } = await import('../../feature-config.js');
            expect(resolvePublishTarget('nonexistent', 'gitlab')).toBe('gitlab-ci');
        });
    });

    describe('FT-02h: sub-feature skip flags', () => {
        it('isAiSkipped returns false by default', async () => {
            const { isAiSkipped } = await import('../../feature-config.js');
            expect(isAiSkipped('nonexistent')).toBe(false);
        });

        it('isAiSkipped returns true when configured', async () => {
            const { saveFeatureConfig, isAiSkipped } = await import('../../feature-config.js');
            saveFeatureConfig({
                'skip-project': {
                    gitProvider: 'github',
                    features: { prReport: { enabled: true, publishTarget: 'github-actions' as const, skipAi: true } },
                },
            });
            expect(isAiSkipped('skip-project')).toBe(true);
        });

        it('isQualitySkipped returns false by default', async () => {
            const { isQualitySkipped } = await import('../../feature-config.js');
            expect(isQualitySkipped('nonexistent')).toBe(false);
        });

        it('isFlakySkipped returns false by default', async () => {
            const { isFlakySkipped } = await import('../../feature-config.js');
            expect(isFlakySkipped('nonexistent')).toBe(false);
        });
    });
});
