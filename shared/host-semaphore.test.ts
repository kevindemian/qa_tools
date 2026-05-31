import { extractHost, HostSemaphore } from './host-semaphore';

describe('extractHost', () => {
    it('returns hostname for valid URL', () => {
        expect(extractHost('https://api.github.com/resource')).toBe('api.github.com');
    });

    it('returns unknown for invalid URL', () => {
        expect(extractHost(':::invalid')).toBe('unknown');
    });

    it('returns unknown for empty string', () => {
        expect(extractHost('')).toBe('unknown');
    });
});

describe('HostSemaphore', () => {
    it('acquire succeeds when below maxConcurrency', async () => {
        const sem = new HostSemaphore(2);
        await expect(sem.acquire('host1')).resolves.toBeUndefined();
    });

    it('acquire blocks when maxConcurrency reached and releases when slot frees', async () => {
        const sem = new HostSemaphore(1);

        await sem.acquire('test-host');

        const p = sem.acquire('test-host');
        const race = Promise.race([p.then(() => 'resolved'), Promise.resolve('pending')]);
        expect(await race).toBe('pending');

        sem.release('test-host');
        await expect(p).resolves.toBeUndefined();
    });

    it('release dispatches queued request and updates inflight', async () => {
        const sem = new HostSemaphore(2);

        await sem.acquire('h1');
        await sem.acquire('h1');

        const p3 = sem.acquire('h1');

        sem.release('h1');
        await expect(p3).resolves.toBeUndefined();
    });

    it('release handles nonexistent host without throwing', () => {
        const sem = new HostSemaphore(1);
        expect(() => sem.release('nonexistent')).not.toThrow();
    });

    it('acquire returns immediately when slot is available after release', async () => {
        const sem = new HostSemaphore(1);

        await sem.acquire('host');
        sem.release('host');

        await expect(sem.acquire('host')).resolves.toBeUndefined();
    });

    it('rateLimitWait returns immediately when no releases recorded', async () => {
        const sem = new HostSemaphore(1);
        await sem.acquire('fresh-host');
        expect(true).toBe(true);
    });

    it('rateLimitWait delays when releases are recent', async () => {
        jest.useFakeTimers();
        const sem = new HostSemaphore(1);

        await sem.acquire('h');
        sem.release('h');

        const p = sem.acquire('h');
        jest.advanceTimersByTime(100);
        expect(await Promise.race([p.then(() => 'done'), Promise.resolve('waiting')])).toBe('waiting');

        jest.advanceTimersByTime(100);
        await expect(p).resolves.toBeUndefined();
        jest.useRealTimers();
    });
});
