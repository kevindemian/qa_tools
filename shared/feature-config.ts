import fs from 'node:fs';
import path from 'node:path';
import { rootLogger } from './logger.js';
import {
    FeatureConfigStoreSchema,
    type FeatureConfigStore,
    type ProjectFeatureConfig,
    type PrReportFeatureConfig,
    DEFAULT_PR_REPORT_CONFIG,
} from './types/feature-config.js';

/**
 * Resolve the `config/features.json` path relative to a base directory.
 * Defaults to the current working directory (runtime reads from the project
 * where qa-tools runs); the setup wizard passes the target project's `--dir`.
 */
function featureConfigPath(baseDir: string = process.cwd()): string {
    return path.resolve(baseDir, 'config', 'features.json');
}

function ensureDir(configPath: string): void {
    try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    } catch (err) {
        rootLogger.warn(
            'Failed to create config directory. Check write permissions and disk space: ' +
                (err instanceof Error ? err.message : String(err)),
        );
        throw err;
    }
}

/** Load the full feature config store from disk. Returns empty store on failure. */
export function loadFeatureConfig(baseDir: string = process.cwd()): FeatureConfigStore {
    const configPath = featureConfigPath(baseDir);
    try {
        if (!fs.existsSync(configPath)) {
            return {};
        }
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        const result = FeatureConfigStoreSchema.safeParse(parsed);
        if (!result.success) {
            rootLogger.warn(
                'Invalid features.json schema. Fix the file to match the expected schema: ' + result.error.message,
            );
            return {};
        }
        return result.data;
    } catch (err) {
        rootLogger.warn(
            'Failed to load features.json. Verify the file exists and is readable: ' +
                (err instanceof Error ? err.message : String(err)),
        );
        return {};
    }
}

/** Save the full feature config store to disk. */
export function saveFeatureConfig(store: FeatureConfigStore, baseDir: string = process.cwd()): void {
    const configPath = featureConfigPath(baseDir);
    try {
        ensureDir(configPath);
        fs.writeFileSync(configPath, JSON.stringify(store, null, 2) + '\n', 'utf8');
    } catch (err) {
        rootLogger.warn(
            'Failed to save features.json. Check write permissions and disk space: ' +
                (err instanceof Error ? err.message : String(err)),
        );
        throw err;
    }
}

/** Get feature config for a specific project. Returns default config when missing. */
export function getProjectFeatureConfig(projectName: string): ProjectFeatureConfig | undefined {
    const store = loadFeatureConfig();
    const entries = Object.entries(store);
    const entry = entries.find(([k]) => k === projectName);
    return entry?.[1];
}

/** Get PR Report config for a project. Returns default (disabled) when not configured. */
export function getPrReportConfig(projectName: string): PrReportFeatureConfig {
    const projectConfig = getProjectFeatureConfig(projectName);
    return projectConfig?.features.prReport ?? DEFAULT_PR_REPORT_CONFIG;
}

/** Set PR Report config for a project. Creates project entry if it doesn't exist. */
export function setPrReportConfig(
    projectName: string,
    config: PrReportFeatureConfig,
    baseDir: string = process.cwd(),
): void {
    const store = loadFeatureConfig(baseDir);
    const entries = Object.entries(store);
    const existing = entries.find(([k]) => k === projectName);
    if (!existing) {
        entries.push([
            projectName,
            {
                gitProvider: 'github',
                features: {},
            },
        ]);
    }
    const projectEntry = entries.find(([k]) => k === projectName);
    if (projectEntry) {
        projectEntry[1].features.prReport = config;
    }
    saveFeatureConfig(Object.fromEntries(entries), baseDir);
}

/** Check if PR Report is enabled for a given project. */
export function isPrReportEnabled(projectName: string): boolean {
    return getPrReportConfig(projectName).enabled;
}

/** Resolve publish target for a project. Falls back to provider-appropriate default. */
export function resolvePublishTarget(projectName: string, gitProvider?: string): string {
    const config = getPrReportConfig(projectName);
    if (config.enabled) {
        return config.publishTarget;
    }
    // Fallback: derive from project's own gitProvider or explicit hint
    const provider = gitProvider ?? getProjectFeatureConfig(projectName)?.gitProvider;
    if (provider === 'gitlab') {
        return 'gitlab-ci';
    }
    return 'github-actions';
}

/** Get whether AI failure analysis is skipped for a project. Defaults to false (not skipped). */
export function isAiSkipped(projectName: string): boolean {
    return getPrReportConfig(projectName).skipAi ?? false;
}

/** Get whether quality gate is skipped for a project. Defaults to false (not skipped). */
export function isQualitySkipped(projectName: string): boolean {
    return getPrReportConfig(projectName).skipQuality ?? false;
}

/** Get whether flakiness dashboard is skipped for a project. Defaults to false (not skipped). */
export function isFlakySkipped(projectName: string): boolean {
    return getPrReportConfig(projectName).skipFlaky ?? false;
}
