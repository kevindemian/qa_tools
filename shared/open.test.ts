jest.mock('child_process', () => {
    const mockSpawn = jest.fn();
    return { spawn: mockSpawn };
});

import { spawn } from 'child_process';
import { openWithOsOrFallback } from './open';

const mockSpawn = spawn as jest.Mock;

function makeMockChild() {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    return {
        on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
            handlers[event] = handler;
        }),
        unref: jest.fn(),
        trigger(event: string, ...args: unknown[]) {
            const fn = handlers[event] as (...args: unknown[]) => void;
            fn(...args);
        },
    };
}

let defaultChild: ReturnType<typeof makeMockChild>;

describe('openWithOsOrFallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultChild = makeMockChild();
        mockSpawn.mockReturnValue(defaultChild);
    });

    it('calls fallback on spawn error', async () => {
        const fallback = jest.fn();
        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);

        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('error');

        const result = await promise;
        expect(result).toBe(false);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('calls fallback on non-zero exit code', async () => {
        const fallback = jest.fn();
        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);

        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('exit', 1);

        const result = await promise;
        expect(result).toBe(false);
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('returns true on successful open (exit 0)', async () => {
        const fallback = jest.fn();
        const child = makeMockChild();
        mockSpawn.mockReturnValue(child);

        const promise = openWithOsOrFallback('/some/file', fallback);
        child.trigger('exit', 0);

        const result = await promise;
        expect(result).toBe(true);
        expect(fallback).not.toHaveBeenCalled();
    });

    it('calls fallback when no handler is attached (spawn returns undefined)', async () => {
        mockSpawn.mockReturnValueOnce(undefined);
        const fallback = jest.fn();
        const result = await openWithOsOrFallback('/some/file', fallback);
        expect(result).toBe(false);
        expect(fallback).toHaveBeenCalledTimes(1);
    });
});
