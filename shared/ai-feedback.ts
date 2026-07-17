/** AI Feedback Loop — record and analyze modifications made to AI-generated tests.
 *  Tracks acceptance rates, modification patterns, and per-prompt-version metrics. */
import { formatErr } from './errors.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config-accessor.js';
import { rootLogger } from './logger.js';
import { safeParseJson } from './safe-json.js';
import type { AiGenerationRecord, AiModification } from './types.js';

const STORE_FILE = 'ai-feedback.json';

/** Validate that a resolved path is within the expected store directory. */
function isPathWithinStore(resolvedPath: string, storeDir: string): boolean {
    const normalized = path.resolve(resolvedPath);
    const normalizedBase = path.resolve(storeDir);
    return normalized.startsWith(normalizedBase + path.sep) || normalized === normalizedBase;
}

function getStoreDir(config?: Config): string {
    const xdg = config ? config.get('xdgStateHome') : Config.get('xdgStateHome');
    const base = xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
    return path.join(base, 'feedback');
}

function storePath(config?: Config): string {
    return path.join(getStoreDir(config), STORE_FILE);
}

function tmpPath(config?: Config): string {
    return storePath(config) + '.tmp';
}

function ensureDir(dir: string): void {
    try {
        const resolvedDir = path.resolve(dir);
        if (!isPathWithinStore(resolvedDir, getStoreDir())) {
            rootLogger.error('AI feedback: path traversal blocked');
            return;
        }
        fs.mkdirSync(resolvedDir, { recursive: true });
    } catch (err) {
        rootLogger.error('Failed to create feedback directory: ' + formatErr(err));
    }
}

export interface AiFeedbackStore {
    records: AiGenerationRecord[];
}

function loadStore(config?: Config): AiFeedbackStore {
    try {
        ensureDir(getStoreDir(config));
        const sp = storePath(config);
        const resolvedSp = path.resolve(sp);
        const storeDir = getStoreDir(config);
        if (!isPathWithinStore(resolvedSp, storeDir)) {
            rootLogger.warn('AI feedback: path traversal blocked for store');
            return { records: [] };
        }
        if (!fs.existsSync(resolvedSp)) return { records: [] };
        const raw = fs.readFileSync(resolvedSp, 'utf8');
        return safeParseJson<AiFeedbackStore>(raw, { records: [] });
    } catch (err) {
        rootLogger.warn('Failed to load AI feedback: ' + formatErr(err));
        return { records: [] };
    }
}

function saveStore(store: AiFeedbackStore, config?: Config): void {
    try {
        const dir = getStoreDir(config);
        ensureDir(dir);
        const sp = storePath(config);
        const tp = tmpPath(config);
        const resolvedTp = path.resolve(tp);
        if (!isPathWithinStore(resolvedTp, dir)) {
            rootLogger.error('AI feedback: path traversal blocked for tmp');
            return;
        }
        fs.writeFileSync(resolvedTp, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(resolvedTp, sp);
    } catch (err) {
        rootLogger.error('Failed to save AI feedback: ' + formatErr(err));
        throw new Error('Failed to save AI feedback', { cause: err });
    }
}

export function recordAiGeneration(record: AiGenerationRecord, config?: Config): void {
    const store = loadStore(config);
    store.records.push(record);
    if (store.records.length > 200) {
        store.records = store.records.slice(-200);
    }
    saveStore(store, config);
}

export function recordAiModification(
    recordId: string,
    modification: AiModification,
    config?: Config,
): AiGenerationRecord | null {
    const store = loadStore(config);
    const record = store.records.find((r) => r.id === recordId);
    if (!record) {
        rootLogger.warn('AI feedback record not found: ' + recordId);
        return null;
    }
    if (!record.feedback) record.feedback = [];
    record.feedback.push(modification);
    saveStore(store, config);
    return record;
}

function _aggregateFeedbackStats(records: AiGenerationRecord[]): {
    totalGenerated: number;
    totalModified: number;
    totalDeleted: number;
    versionCounts: Record<string, number>;
} {
    let totalGenerated = 0;
    let totalModified = 0;
    let totalDeleted = 0;
    const versionCounts: Record<string, number> = {};

    for (const record of records) {
        totalGenerated += record.generatedTests.length;
        versionCounts[record.promptVersion] = (versionCounts[record.promptVersion] ?? 0) + 1;
        if (record.feedback) {
            for (const fb of record.feedback) {
                if (fb.action === 'modified') totalModified++;
                if (fb.action === 'deleted') totalDeleted++;
            }
        }
    }

    return { totalGenerated, totalModified, totalDeleted, versionCounts };
}

export function getAiFeedbackSummary(config?: Config): {
    totalRecords: number;
    totalGenerated: number;
    totalModified: number;
    totalDeleted: number;
    acceptanceRate: number;
    topPromptVersion: string;
} {
    const store = loadStore(config);
    if (store.records.length === 0) {
        return {
            totalRecords: 0,
            totalGenerated: 0,
            totalModified: 0,
            totalDeleted: 0,
            acceptanceRate: 0,
            topPromptVersion: '',
        };
    }

    const { totalGenerated, totalModified, totalDeleted, versionCounts } = _aggregateFeedbackStats(store.records);

    const totalReviewed = totalGenerated;
    const acceptanceRate =
        totalReviewed > 0 ? Math.round(((totalReviewed - totalModified - totalDeleted) / totalReviewed) * 100) : 0;

    let topPromptVersion = '';
    let maxCount = 0;
    for (const [ver, count] of Object.entries(versionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            topPromptVersion = ver;
        }
    }

    return {
        totalRecords: store.records.length,
        totalGenerated,
        totalModified,
        totalDeleted,
        acceptanceRate,
        topPromptVersion,
    };
}

export function getRecentAiRecords(count = 10, config?: Config): AiGenerationRecord[] {
    const store = loadStore(config);
    return store.records.slice(-count).reverse();
}
