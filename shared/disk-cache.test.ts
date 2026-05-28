import fs from 'fs';
import path from 'path';
import os from 'os';
import { diskCacheGet, diskCacheSet, clearDiskCache } from './disk-cache';

const origEnv = { ...process.env };
let cacheDir = '';

beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-disk-cache-'));
    process.env.LLM_DISK_CACHE_DIR = cacheDir;
});

afterEach(() => {
    process.env = { ...origEnv };
    try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch {
        // ok
    }
});

describe('diskCacheGet / diskCacheSet', () => {
    it('returns null for missing key', () => {
        expect(diskCacheGet('nonexistent')).toBeNull();
    });

    it('stores and retrieves a value', () => {
        diskCacheSet('abc123', 'hello world');
        expect(diskCacheGet('abc123')).toBe('hello world');
    });

    it('returns null for expired entry', () => {
        // Manually write an expired entry (createdAt in the past)
        const file = path.join(cacheDir, 'exp-key.json');
        const expired = JSON.stringify({ response: 'stale', createdAt: Date.now() - 60 * 60 * 1000 - 1 });
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(file, expired, 'utf-8');
        expect(diskCacheGet('exp-key')).toBeNull();
        // Stale file should have been deleted
        expect(fs.existsSync(file)).toBe(false);
    });

    it('overwrites existing key', () => {
        diskCacheSet('key', 'first');
        diskCacheSet('key', 'second');
        expect(diskCacheGet('key')).toBe('second');
    });
});

describe('clearDiskCache', () => {
    it('removes all cached files', () => {
        diskCacheSet('a', '1');
        diskCacheSet('b', '2');
        clearDiskCache();
        expect(diskCacheGet('a')).toBeNull();
        expect(diskCacheGet('b')).toBeNull();
    });
});
