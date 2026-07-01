/**
 * Tests for feature-config.ts — feature configuration loader and accessor.
 *
 * CRITICAL: These tests MUST use a temporary directory to avoid affecting
 * the real project's config/features.json. We mock process.cwd() to redirect
 * path.resolve('config', 'features.json') to a temp directory, and use
 * vi.resetModules() to force module re-evaluation with the mocked cwd.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rootLogger } from '../logger.js';

/** Temporary directory for test isolation — prevents real project file mutation. */
let TEST_DIR: string;

const VALID_CONFIG = {
    'my-project': {
        gitProvider: 'github' as const,
        repo: 'owner/my-project',
        features: {
            prReport: {
                enabled: true,
                publishTarget: 'github-actions' as const,
            },
        },
    },
};

const VALID_CONFIG_WITH_JIRA = {
    'my-project': {
        gitProvider: 'gitlab' as const,
        repo: 'owner/my-project',
        jiraKey: 'PROJ',
        features: {
            prReport: {
                enabled: true,
                publishTarget: 'gitlab-ci' as const,
                jiraKey: 'PROJ',
            },
        },
    },
};

describe('Feature-config', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        // Create isolated temp directory for each test
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-config-test-'));
        // Mock process.cwd() so path.resolve('config', 'features.json')
        // resolves to TEST_DIR/config/features.json instead of project root
        vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            rootLogger.warn('Cleanup failed for test dir: ' + String(err));
        }
    });

    describe('LoadFeatureConfig', () => {
        it('returns empty object when file does not exist', async () => {
            expect.hasAssertions();

            const { loadFeatureConfig } = await import('../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual({});
        });

        it('returns parsed config when file exists with valid schema', async () => {
            expect.hasAssertions();

            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(path.resolve(configPath), JSON.stringify(VALID_CONFIG), 'utf8');

            const { loadFeatureConfig } = await import('../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual(VALID_CONFIG);
        });

        it('returns empty object when file has invalid JSON', async () => {
            expect.hasAssertions();

            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(path.resolve(configPath), 'not valid json', 'utf8');

            const { loadFeatureConfig } = await import('../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual({});
        });

        it('returns empty object when file has invalid schema', async () => {
            expect.hasAssertions();

            const configPath = path.join(TEST_DIR, 'config', 'features.json');
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(path.resolve(configPath), JSON.stringify({ 'my-project': { invalid: true } }), 'utf8');

            const { loadFeatureConfig } = await import('../feature-config.js');
            const result = loadFeatureConfig();

            expect(result).toStrictEqual({});
        });
    });

    describe('SaveFeatureConfig', () => {
        it('writes config to disk', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, loadFeatureConfig } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            const saved = loadFeatureConfig();

            expect(saved).toStrictEqual(VALID_CONFIG);
        });

        it('creates directory if missing', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, loadFeatureConfig } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            const configPath = path.join(TEST_DIR, 'config', 'features.json');

            expect(fs.existsSync(path.dirname(configPath))).toBeTruthy();

            const saved = loadFeatureConfig();

            expect(saved).toStrictEqual(VALID_CONFIG);
        });
    });

    describe('GetProjectFeatureConfig', () => {
        it('returns config for existing project', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, getProjectFeatureConfig } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            const result = getProjectFeatureConfig('my-project');

            expect(result).toBeDefined();
            expect(result?.gitProvider).toBe('github');
            expect(result?.features.prReport?.enabled).toBeTruthy();
        });

        it('returns undefined for unknown project', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, getProjectFeatureConfig } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            const result = getProjectFeatureConfig('unknown-project');

            expect(result).toBeUndefined();
        });
    });

    describe('GetPrReportConfig', () => {
        it('returns configured pr-report config when present', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, getPrReportConfig } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            const result = getPrReportConfig('my-project');

            expect(result.enabled).toBeTruthy();
            expect(result.publishTarget).toBe('github-actions');
        });

        it('returns default disabled config when project has no feature config', async () => {
            expect.hasAssertions();

            const { getPrReportConfig } = await import('../feature-config.js');
            const result = getPrReportConfig('unknown-project');

            expect(result.enabled).toBeFalsy();
            expect(result.publishTarget).toBe('github-actions');
        });

        it('returns default when project exists but prReport is not configured', async () => {
            expect.hasAssertions();

            const configWithoutPr = {
                'my-project': {
                    gitProvider: 'github' as const,
                    features: {},
                },
            };
            const { saveFeatureConfig, getPrReportConfig } = await import('../feature-config.js');
            saveFeatureConfig(configWithoutPr);

            const result = getPrReportConfig('my-project');

            expect(result.enabled).toBeFalsy();
            expect(result.publishTarget).toBe('github-actions');
        });
    });

    describe('SetPrReportConfig', () => {
        it('sets pr-report config for existing project', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, setPrReportConfig, getPrReportConfig } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            setPrReportConfig('my-project', { enabled: false, publishTarget: 'github-actions' as const });
            const result = getPrReportConfig('my-project');

            expect(result.enabled).toBeFalsy();
        });

        it('creates project entry and sets pr-report config for new project', async () => {
            expect.hasAssertions();

            const { setPrReportConfig, getPrReportConfig, getProjectFeatureConfig } =
                await import('../feature-config.js');

            setPrReportConfig('new-project', { enabled: true, publishTarget: 'gitlab-ci' as const, jiraKey: 'NEW' });

            const projectConfig = getProjectFeatureConfig('new-project');

            expect(projectConfig?.gitProvider).toBe('github');
            expect(projectConfig?.features.prReport?.enabled).toBeTruthy();
            expect(projectConfig?.features.prReport?.publishTarget).toBe('gitlab-ci');
            expect(projectConfig?.features.prReport?.jiraKey).toBe('NEW');

            const prConfig = getPrReportConfig('new-project');

            expect(prConfig.enabled).toBeTruthy();
        });
    });

    describe('IsPrReportEnabled', () => {
        it('returns true when pr-report is enabled', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isPrReportEnabled } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            expect(isPrReportEnabled('my-project')).toBeTruthy();
        });

        it('returns false when pr-report is not enabled', async () => {
            expect.hasAssertions();

            const { isPrReportEnabled } = await import('../feature-config.js');

            expect(isPrReportEnabled('unknown-project')).toBeFalsy();
        });

        it('returns false when pr-report is explicitly disabled', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, setPrReportConfig, isPrReportEnabled } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            setPrReportConfig('my-project', { enabled: false, publishTarget: 'github-actions' as const });

            expect(isPrReportEnabled('my-project')).toBeFalsy();
        });
    });

    describe('ResolvePublishTarget', () => {
        it('returns configured publish target when enabled', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, resolvePublishTarget } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            const result = resolvePublishTarget('my-project');

            expect(result).toBe('github-actions');
        });

        it('falls back to gitlab-ci for gitlab projects', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, resolvePublishTarget } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG_WITH_JIRA);

            const result = resolvePublishTarget('my-project');

            expect(result).toBe('gitlab-ci');
        });

        it('falls back to github-actions for unknown projects', async () => {
            expect.hasAssertions();

            const { resolvePublishTarget } = await import('../feature-config.js');
            const result = resolvePublishTarget('unknown-project');

            expect(result).toBe('github-actions');
        });

        it('uses explicit gitProvider hint when project has no config', async () => {
            expect.hasAssertions();

            const { resolvePublishTarget } = await import('../feature-config.js');
            const result = resolvePublishTarget('unknown-project', 'gitlab');

            expect(result).toBe('gitlab-ci');
        });
    });

    describe('IsAiSkipped', () => {
        it('returns false when skipAi is not configured', async () => {
            expect.hasAssertions();

            const { isAiSkipped } = await import('../feature-config.js');

            expect(isAiSkipped('unknown-project')).toBeFalsy();
        });

        it('returns true when skipAi is explicitly true', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isAiSkipped } = await import('../feature-config.js');
            const configWithSkip = {
                'my-project': {
                    gitProvider: 'github' as const,
                    features: {
                        prReport: {
                            enabled: true,
                            publishTarget: 'github-actions' as const,
                            skipAi: true,
                        },
                    },
                },
            };
            saveFeatureConfig(configWithSkip);

            expect(isAiSkipped('my-project')).toBeTruthy();
        });

        it('returns false when skipAi is explicitly false', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isAiSkipped } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            expect(isAiSkipped('my-project')).toBeFalsy();
        });
    });

    describe('IsQualitySkipped', () => {
        it('returns false when skipQuality is not configured', async () => {
            expect.hasAssertions();

            const { isQualitySkipped } = await import('../feature-config.js');

            expect(isQualitySkipped('unknown-project')).toBeFalsy();
        });

        it('returns true when skipQuality is explicitly true', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isQualitySkipped } = await import('../feature-config.js');
            const configWithSkip = {
                'my-project': {
                    gitProvider: 'github' as const,
                    features: {
                        prReport: {
                            enabled: true,
                            publishTarget: 'github-actions' as const,
                            skipQuality: true,
                        },
                    },
                },
            };
            saveFeatureConfig(configWithSkip);

            expect(isQualitySkipped('my-project')).toBeTruthy();
        });

        it('returns false when skipQuality is explicitly false', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isQualitySkipped } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            expect(isQualitySkipped('my-project')).toBeFalsy();
        });
    });

    describe('IsFlakySkipped', () => {
        it('returns false when skipFlaky is not configured', async () => {
            expect.hasAssertions();

            const { isFlakySkipped } = await import('../feature-config.js');

            expect(isFlakySkipped('unknown-project')).toBeFalsy();
        });

        it('returns true when skipFlaky is explicitly true', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isFlakySkipped } = await import('../feature-config.js');
            const configWithSkip = {
                'my-project': {
                    gitProvider: 'github' as const,
                    features: {
                        prReport: {
                            enabled: true,
                            publishTarget: 'github-actions' as const,
                            skipFlaky: true,
                        },
                    },
                },
            };
            saveFeatureConfig(configWithSkip);

            expect(isFlakySkipped('my-project')).toBeTruthy();
        });

        it('returns false when skipFlaky is explicitly false', async () => {
            expect.hasAssertions();

            const { saveFeatureConfig, isFlakySkipped } = await import('../feature-config.js');
            saveFeatureConfig(VALID_CONFIG);

            expect(isFlakySkipped('my-project')).toBeFalsy();
        });
    });
});
