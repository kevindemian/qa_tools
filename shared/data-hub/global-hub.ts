import type { DataHub } from '../types/data-hub.js';
import type { RawData } from '../types/data-hub.js';
import { hasDataChanged as defaultHasDataChanged } from './hub.js';

let _dataHub: DataHub | undefined;

/**
 * Get the global DataHub instance.
 * @throws Error if DataHub has not been initialized via setDataHub() or ensureDataHub().
 */
export function getDataHub(): DataHub {
    if (!_dataHub) {
        throw new Error('DataHub not initialized. Call setDataHub() or ensureDataHub() before accessing getDataHub().');
    }
    return _dataHub;
}

/**
 * Check if DataHub is initialized without throwing.
 * Use only when undefined is an acceptable state (e.g., optional dependency).
 */
export function isDataHubInitialized(): boolean {
    return _dataHub !== undefined;
}

export function setDataHub(hub: DataHub | undefined): void {
    _dataHub = hub;
}

interface FreshnessOptions {
    hasDataChanged?: (cached: DataHub, newRaw: RawData) => boolean;
    cachedHub?: DataHub;
    maxStalenessMs?: number;
}

/**
 * Ensure DataHub is initialized and fresh.
 * @throws Error if fetchFn fails or returns undefined.
 */
export async function ensureDataHub(
    fetchFn: () => Promise<DataHub | undefined>,
    options?: FreshnessOptions,
): Promise<DataHub> {
    const maxStaleness = options?.maxStalenessMs ?? 5 * 60 * 1000;
    const hasDataChangedFn = options?.hasDataChanged ?? defaultHasDataChanged;

    if (_dataHub) {
        const age = Date.now() - _dataHub.timestamp.getTime();
        if (age > maxStaleness) {
            const freshHub = await fetchFn();
            if (!freshHub) {
                throw new Error('ensureDataHub: fetchFn returned undefined — cannot refresh DataHub');
            }
            if (hasDataChangedFn(_dataHub, freshHub.raw)) {
                _dataHub = freshHub;
            }
        }
        return _dataHub;
    }

    const hub = await fetchFn();
    if (!hub) {
        throw new Error('ensureDataHub: fetchFn returned undefined — cannot initialize DataHub');
    }
    _dataHub = hub;
    return _dataHub;
}
