/** Extract hostname from a URL for per-host throttling. */
export function extractHost(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname;
    } catch {
        return 'unknown';
    }
}

/** Per-host semaphore for concurrent request limiting. */
export class HostSemaphore {
    private readonly maxConcurrency: number;
    private readonly inflight = new Map<string, number>();
    private readonly queues = new Map<string, Array<() => void>>();
    private readonly releaseTimestamps = new Map<string, number[]>();
    private readonly minIntervalMs = 200;

    constructor(maxConcurrency: number) {
        this.maxConcurrency = maxConcurrency;
    }

    /** Acquire a slot for the given host. Returns a promise that resolves when a slot is available. */
    async acquire(host: string): Promise<void> {
        await this.rateLimitWait(host);
        const current = this.inflight.get(host) ?? 0;
        if (current < this.maxConcurrency) {
            this.inflight.set(host, current + 1);
            return;
        }
        return new Promise((resolve) => {
            if (!this.queues.has(host)) this.queues.set(host, []);
            this.queues.get(host)?.push(resolve);
        });
    }

    /** Release a slot for the given host, allowing a queued request to proceed. */
    release(host: string): void {
        const current = this.inflight.get(host) ?? 0;
        if (current > 0) this.inflight.set(host, current - 1);
        const ts = Date.now();
        if (!this.releaseTimestamps.has(host)) this.releaseTimestamps.set(host, []);
        this.releaseTimestamps.get(host)?.push(ts);
        this.dispatchNext(host);
    }

    private dispatchNext(host: string): void {
        const queue = this.queues.get(host);
        if (queue && queue.length > 0 && (this.inflight.get(host) ?? 0) < this.maxConcurrency) {
            const next = queue.shift();
            if (next) {
                this.inflight.set(host, (this.inflight.get(host) ?? 0) + 1);
                next();
            }
        }
    }

    /** Ensure minimum interval between requests to the same host. */
    private async rateLimitWait(host: string): Promise<void> {
        const releases = this.releaseTimestamps.get(host);
        if (!releases || releases.length === 0) return;
        const last = releases[releases.length - 1];
        if (last === undefined) return;
        const elapsed = Date.now() - last;
        if (elapsed < this.minIntervalMs) {
            await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
        }
    }
}
