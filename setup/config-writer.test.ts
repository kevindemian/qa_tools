import fs from 'fs';
import path from 'path';
import { writeProjectsConfig, writeDotEnvExample } from './config-writer';

jest.mock('fs');
const MockFs = fs as jest.Mocked<typeof fs>;

describe('writeProjectsConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (MockFs.existsSync as jest.Mock).mockReturnValue(false);
        (MockFs.mkdirSync as jest.Mock).mockImplementation(jest.fn());
        (MockFs.writeFileSync as jest.Mock).mockImplementation(jest.fn());
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
        (MockFs.existsSync as jest.Mock).mockReturnValue(true);
        (MockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ existing: '123' }));

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
        (MockFs.existsSync as jest.Mock).mockReturnValue(true);
        (MockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ myapp: 'myapp' }));

        const result = writeProjectsConfig({
            projectName: 'myapp',
            gitProvider: 'github',
            repoName: 'myapp',
            repoOwner: 'myorg',
        });
        expect(result.filesSkipped.length).toBe(2);
    });

    it('handles corrupt existing file by overwriting', () => {
        (MockFs.existsSync as jest.Mock).mockReturnValue(true);
        (MockFs.readFileSync as jest.Mock).mockReturnValue('not json');

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
        jest.clearAllMocks();
        (MockFs.existsSync as jest.Mock).mockReturnValue(false);
        (MockFs.writeFileSync as jest.Mock).mockImplementation(jest.fn());
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
        (MockFs.existsSync as jest.Mock).mockReturnValue(true);
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'github' });
        expect(result.filesSkipped.length).toBe(1);
        expect(MockFs.writeFileSync).not.toHaveBeenCalled();
    });
});
