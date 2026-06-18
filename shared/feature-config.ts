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

const CONFIG_PATH = path.resolve('config', 'features.json');

function ensureDir(): void {
    try {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    } catch (err) {
        rootLogger.warn('Failed to create config directory: ' + (err instanceof Error ? err.message : String(err)));
        throw err;
    }
}

/** Load the full feature config store from disk. Returns empty store on failure. */
export function loadFeatureConfig(): FeatureConfigStore {
    try {
        if (!fs.existsSync(CONFIG_PATH)) {
            return {};
        }
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        const result = FeatureConfigStoreSchema.safeParse(parsed);
        if (!result.success) {
            rootLogger.warn('Invalid features.json schema: ' + result.error.message);
            return {};
        }
        return result.data;
    } catch (err) {
        rootLogger.warn('Failed to load features.json: ' + (err instanceof Error ? err.message : String(err)));
        return {};
    }
}

/** Save the full feature config store to disk. */
export function saveFeatureConfig(store: FeatureConfigStore): void {
    try {
        ensureDir();
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
    } catch (err) {
        rootLogger.warn('Failed to save features.json: ' + (err instanceof Error ? err.message : String(err)));
        throw err;
    }
}

/** Get feature config for a specific project. Returns default config when missing. */
export function getProjectFeatureConfig(projectName: string): ProjectFeatureConfig | undefined {
    const store = loadFeatureConfig();
    return store[projectName];
}

/** Get PR Report config for a project. Returns default (disabled) when not configured. */
export function getPrReportConfig(projectName: string): PrReportFeatureConfig {
    const projectConfig = getProjectFeatureConfig(projectName);
    return projectConfig?.features.prReport ?? DEFAULT_PR_REPORT_CONFIG;
}

/** Set PR Report config for a project. Creates project entry if it doesn't exist. */
export function setPrReportConfig(projectName: string, config: PrReportFeatureConfig): void {
    const store = loadFeatureConfig();
    if (!store[projectName]) {
        store[projectName] = {
            gitProvider: 'github',
            features: {},
        };
    }
    store[projectName].features.prReport = config;
    saveFeatureConfig(store);
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
