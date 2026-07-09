import type { DataHub } from '../types/data-hub.js';
import type { RawData } from '../types/data-hub.js';
import { hasDataChanged as defaultHasDataChanged } from './hub.js';

let _dataHub: DataHub | undefined;

export function getDataHub(): DataHub | undefined {
    return _dataHub;
}

export function setDataHub(hub: DataHub | undefined): void {
    _dataHub = hub;
}

interface FreshnessOptions {
    hasDataChanged?: (cached: DataHub, newRaw: RawData) => boolean;
    cachedHub?: DataHub;
    maxStalenessMs?: number;
}

export async function ensureDataHub(
    fetchFn: () => Promise<DataHub | undefined>,
    options?: FreshnessOptions,
): Promise<DataHub | undefined> {
    const maxStaleness = options?.maxStalenessMs ?? 5 * 60 * 1000;
    const hasDataChangedFn = options?.hasDataChanged ?? defaultHasDataChanged;

    if (_dataHub) {
        const age = Date.now() - _dataHub.timestamp.getTime();
        if (age > maxStaleness) {
            try {
                const freshHub = await fetchFn();
                if (freshHub && hasDataChangedFn(_dataHub, freshHub.raw)) {
                    _dataHub = freshHub;
                    return _dataHub;
                }
                return _dataHub;
            } catch {
                return _dataHub;
            }
        }
        return _dataHub;
    }

    try {
        const hub = await fetchFn();
        if (hub) _dataHub = hub;
        return _dataHub;
    } catch {
        return undefined;
    }
}
