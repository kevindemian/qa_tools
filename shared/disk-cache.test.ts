import { vi } from 'vitest';
import path from 'path';

vi.mock('fs', async () => {
    const memfs = await import('memfs');
    const mfs = memfs.fs;
    return { default: mfs, ...mfs };
});

import fs from 'fs';
import { diskCacheGet, diskCacheSet, clearDiskCache } from './disk-cache.js';

const origEnv = { ...process.env };
let cacheDir = '';

beforeAll(() => {
    fs.mkdirSync('/tmp', { recursive: true });
});

beforeEach(() => {
    cacheDir = '/tmp/llm-disk-cache-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    fs.mkdirSync(cacheDir, { recursive: true });
    process.env['LLM_DISK_CACHE_DIR'] = cacheDir;
});

afterEach(() => {
    process.env = { ...origEnv };
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
        const file = path.join(cacheDir, 'exp-key.json');
        const expired = JSON.stringify({ response: 'stale', createdAt: Date.now() - 60 * 60 * 1000 - 1 });
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(file, expired, 'utf-8');

        expect(diskCacheGet('exp-key')).toBeNull();
        expect(fs.existsSync(file)).toBeFalsy();
    });

    it('overwrites existing key', () => {
        diskCacheSet('key', 'first');
        diskCacheSet('key', 'second');

        expect(diskCacheGet('key')).toBe('second');
    });

    it('stores and retrieves encrypted content when LLM_CACHE_KEY is set', () => {
        process.env['LLM_CACHE_KEY'] = 'test-secret-key-32bytes!';
        diskCacheSet('enc-key', 'encrypted-value');

        expect(diskCacheGet('enc-key')).toBe('encrypted-value');
    });

    it('returns null for corrupt JSON data', () => {
        const file = path.join(cacheDir, 'corrupt.json');
        fs.writeFileSync(file, 'not-json', 'utf-8');

        expect(diskCacheGet('corrupt')).toBeNull();
    });

    it('returns null for invalid encrypted payload (missing fields)', () => {
        process.env['LLM_CACHE_KEY'] = 'test-secret-key-32bytes!';
        const file = path.join(cacheDir, 'bad-enc.json');
        const bad = JSON.stringify({ e: 'base64', iv: 'base64' });
        fs.writeFileSync(file, bad, 'utf-8');

        expect(diskCacheGet('bad-enc')).toBeNull();
        expect(fs.existsSync(file)).toBeFalsy();
    });

    it('returns null when decrypt fails on non-JSON with cache key set', () => {
        process.env['LLM_CACHE_KEY'] = 'test-secret-key-32bytes!';
        const file = path.join(cacheDir, 'corrupt-enc.json');
        fs.writeFileSync(file, 'not-json', 'utf-8');

        expect(diskCacheGet('corrupt-enc')).toBeNull();
    });

    it('handles write failure gracefully (readonly dir)', () => {
        fs.chmodSync(cacheDir, 0o444);

        expect(() => diskCacheSet('fail-key', 'value')).not.toThrow();
    });

    it('uses fallback cache dir when env not set', () => {
        delete process.env['LLM_DISK_CACHE_DIR'];
        diskCacheSet('fallback-key', 'val');

        expect(diskCacheGet('fallback-key')).toBe('val');
    });

    it('creates cache dir if it does not exist', () => {
        const newDir = '/tmp/llm-cache-new-' + Date.now();
        process.env['LLM_DISK_CACHE_DIR'] = newDir;

        expect(fs.existsSync(newDir)).toBeFalsy();

        diskCacheSet('new-dir-key', 'val');

        expect(fs.existsSync(newDir)).toBeTruthy();
        expect(diskCacheGet('new-dir-key')).toBe('val');
    });

    it('handles cache dir init failure gracefully', () => {
        fs.mkdirSync('/dev', { recursive: true });
        fs.writeFileSync('/dev/null', '');
        process.env['LLM_DISK_CACHE_DIR'] = '/dev/null/cache';

        expect(() => diskCacheSet('fail-init', 'val')).not.toThrow();
        expect(diskCacheGet('fail-init')).toBeNull();
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

    it('handles non-existent directory gracefully', () => {
        const fakeDir = '/tmp/nonexistent-cache-' + Date.now();
        process.env['LLM_DISK_CACHE_DIR'] = fakeDir;

        expect(() => clearDiskCache()).not.toThrow();
    });

    it('handles clear failure when cache dir is a file', () => {
        const fileDir = '/tmp/llm-cache-file-' + Date.now();
        fs.writeFileSync(fileDir, '');
        process.env['LLM_DISK_CACHE_DIR'] = fileDir;

        expect(() => clearDiskCache()).not.toThrow();

        fs.unlinkSync(fileDir);
    });
});
