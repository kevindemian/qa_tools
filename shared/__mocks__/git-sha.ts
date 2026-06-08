export const detectGitDir = vi.fn<(startDir?: string) => string | null>().mockReturnValue('/project');
export const getHeadSha = vi.fn<(env?: NodeJS.ProcessEnv) => string | null>().mockReturnValue('mock-sha-123');
export const getCurrentBranch = vi.fn<(env?: NodeJS.ProcessEnv) => string | null>().mockReturnValue('main');
