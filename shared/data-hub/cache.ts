/**
 * Data Hub — Session Cache.
 *
 * Module-level cache to avoid redundant API fetches within a session.
 * Used by hub.ts, ci-data.ts, and session-state.ts.
 *
 * Pattern: module-level vars (consistent with existing ci-data.ts pattern).
 */
import type { DataHub } from '../types/data-hub.js';

/** Cached hub entry. */
interface CacheEntry {
    hub: DataHub;
    timestamp: number;
}

/**
 * Cache TTL in milliseconds (5 minutes).
 *
 * NOTE: 5-minute TTL chosen as reasonable default for CLI sessions.
 * If data freshness is critical, consider reducing TTL or exposing
 * as configurable parameter via DataHubOptions.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Module-level cache vars. */
let _cachedHub: CacheEntry | undefined;
let _cachedRepo: string | undefined;

/**
 * Get cached DataHub for a repo if valid.
 *
 * @param repo - Repository identifier.
 * @returns Cached DataHub or undefined if cache miss/expired.
 */
export function getCachedHub(repo: string): DataHub | undefined {
    if (_cachedHub == null || _cachedRepo !== repo) return undefined;

    const age = Date.now() - _cachedHub.timestamp;
    if (age > CACHE_TTL_MS) {
        clearCache();
        return undefined;
    }

    return _cachedHub.hub;
}

/**
 * Store DataHub in cache.
 *
 * @param repo - Repository identifier.
 * @param hub - DataHub to cache.
 */
export function setCachedHub(repo: string, hub: DataHub): void {
    _cachedHub = { hub, timestamp: Date.now() };
    _cachedRepo = repo;
}

/**
 * Clear the session cache.
 */
export function clearCache(): void {
    _cachedHub = undefined;
    _cachedRepo = undefined;
}

/**
 * Check if cache is valid for a repo.
 *
 * @param repo - Repository identifier.
 * @returns true if cache hit, false if miss/expired.
 */
export function isCacheValid(repo: string): boolean {
    if (_cachedHub == null || _cachedRepo !== repo) return false;

    const age = Date.now() - _cachedHub.timestamp;
    return age <= CACHE_TTL_MS;
}
