/**
 * Data Hub — Session Cache.
 *
 * Module-level cache to avoid redundant API fetches within a session.
 * Supports multiple repos simultaneously via Map-based storage.
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

/** Module-level cache — Map keyed by repo identifier. */
const _cache = new Map<string, CacheEntry>();

/**
 * Get cached DataHub for a repo if valid.
 *
 * @param repo - Repository identifier.
 * @returns Cached DataHub or undefined if cache miss/expired.
 */
export function getCachedHub(repo: string): DataHub | undefined {
    const entry = _cache.get(repo);
    if (entry == null) return undefined;

    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL_MS) {
        _cache.delete(repo);
        return undefined;
    }

    return entry.hub;
}

/**
 * Store DataHub in cache.
 *
 * @param repo - Repository identifier.
 * @param hub - DataHub to cache.
 */
export function setCachedHub(repo: string, hub: DataHub): void {
    _cache.set(repo, { hub, timestamp: Date.now() });
}

/**
 * Clear the entire session cache.
 */
export function clearCache(): void {
    _cache.clear();
}

/**
 * Clear cache entry for a specific repo.
 *
 * @param repo - Repository identifier to evict.
 */
export function clearRepoCache(repo: string): void {
    _cache.delete(repo);
}

/**
 * Check if cache is valid for a repo.
 *
 * @param repo - Repository identifier.
 * @returns true if cache hit, false if miss/expired.
 */
export function isCacheValid(repo: string): boolean {
    const entry = _cache.get(repo);
    if (entry == null) return false;

    const age = Date.now() - entry.timestamp;
    return age <= CACHE_TTL_MS;
}

/**
 * Get the number of cached repos (for diagnostics).
 *
 * @returns Count of active cache entries.
 */
export function getCacheSize(): number {
    return _cache.size;
}
