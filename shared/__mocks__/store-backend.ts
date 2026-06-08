function createMockBackend() {
    return {
        init: vi.fn(),
        read: vi.fn<(relPath: string) => Buffer | null>().mockReturnValue(null),
        write: vi.fn<(relPath: string, data: Buffer) => void>(),
        exists: vi.fn<(relPath: string) => boolean>().mockReturnValue(false),
        flush: vi.fn<(message: string) => void>(),
    };
}

export const detectStoreBackend = vi.fn<(projectDir?: string) => ReturnType<typeof createMockBackend>>(() =>
    createMockBackend(),
);
export const detectProjectGitDir = vi.fn<(startDir?: string) => string | null>().mockReturnValue(null);
export const GitStoreBackend = vi.fn();
export const FsStoreBackend = vi.fn();
