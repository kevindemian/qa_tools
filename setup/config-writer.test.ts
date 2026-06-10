import fs from 'fs';
import path from 'path';
import { writeProjectsConfig, writeDotEnvExample } from './config-writer.js';

vi.mock('fs');
const MockFs = vi.mocked(fs);

describe('writeProjectsConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(MockFs.existsSync).mockReturnValue(false);
        vi.mocked(MockFs.mkdirSync).mockImplementation(vi.fn());
        vi.mocked(MockFs.writeFileSync).mockImplementation(vi.fn());
    });

    it('creates projects.json and providers.json when neither exists', () => {
        const result = writeProjectsConfig({
            projectName: 'myapp',
            gitProvider: 'github',
            repoName: 'myapp',
            repoOwner: 'myorg',
        });
        expect(result.filesCreated.length).toBe(2);
        expect(result.filesSkipped.length).toBe(0);
        expect(MockFs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('appends new project to existing projects.json', () => {
        vi.mocked(MockFs.existsSync).mockReturnValue(true);
        vi.mocked(MockFs.readFileSync).mockReturnValue(JSON.stringify({ existing: '123' }));

        const result = writeProjectsConfig({
            projectName: 'newapp',
            gitProvider: 'github',
            repoName: 'newapp',
            repoOwner: 'myorg',
        });
        expect(result.filesCreated.length).toBe(2);
        const writeCalls = MockFs.writeFileSync.mock.calls;
        const lastProjectsWrite = (writeCalls[0]?.[1] ?? '') as string;
        expect(lastProjectsWrite).toContain('existing');
        expect(lastProjectsWrite).toContain('newapp');
    });

    it('skips when project already exists', () => {
        vi.mocked(MockFs.existsSync).mockReturnValue(true);
        vi.mocked(MockFs.readFileSync).mockReturnValue(JSON.stringify({ myapp: 'myapp' }));

        const result = writeProjectsConfig({
            projectName: 'myapp',
            gitProvider: 'github',
            repoName: 'myapp',
            repoOwner: 'myorg',
        });
        expect(result.filesSkipped.length).toBe(2);
    });

    it('handles corrupt existing file by overwriting', () => {
        vi.mocked(MockFs.existsSync).mockReturnValue(true);
        vi.mocked(MockFs.readFileSync).mockReturnValue('not json');

        const result = writeProjectsConfig({
            projectName: 'myapp',
            gitProvider: 'gitlab',
            repoName: 'myapp',
            repoOwner: 'myorg',
        });
        expect(result.filesCreated.length).toBe(2);
    });
});

describe('writeDotEnvExample', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(MockFs.existsSync).mockReturnValue(false);
        vi.mocked(MockFs.writeFileSync).mockImplementation(vi.fn());
    });

    it('creates .env.example with GitHub vars', () => {
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'github' });
        expect(result.filesCreated).toContain(path.resolve(process.cwd(), '.env.example'));
        const content = (MockFs.writeFileSync.mock.calls[0]?.[1] ?? '') as string;
        expect(content).toContain('GITHUB_TOKEN');
        expect(content).not.toContain('GIT_TOKEN');
    });

    it('creates .env.example with GitLab vars', () => {
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'gitlab' });
        expect(result.filesCreated.length).toBe(1);
        const content = (MockFs.writeFileSync.mock.calls[0]?.[1] ?? '') as string;
        expect(content).toContain('GIT_TOKEN');
        expect(content).toContain('GIT_BASE_URL');
    });

    it('skips when .env.example already exists', () => {
        vi.mocked(MockFs.existsSync).mockReturnValue(true);
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'github' });
        expect(result.filesSkipped.length).toBe(1);
        expect(MockFs.writeFileSync).not.toHaveBeenCalled();
    });
});
