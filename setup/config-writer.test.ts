import fs from 'fs';
import path from 'path';
import { writeProjectsConfig, writeDotEnvExample } from './config-writer';

jest.mock('fs');
const MockFs = jest.mocked(fs);

describe('writeProjectsConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(MockFs.existsSync).mockReturnValue(false);
        jest.mocked(MockFs.mkdirSync).mockImplementation(jest.fn());
        jest.mocked(MockFs.writeFileSync).mockImplementation(jest.fn());
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
        jest.mocked(MockFs.existsSync).mockReturnValue(true);
        jest.mocked(MockFs.readFileSync).mockReturnValue(JSON.stringify({ existing: '123' }));

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
        jest.mocked(MockFs.existsSync).mockReturnValue(true);
        jest.mocked(MockFs.readFileSync).mockReturnValue(JSON.stringify({ myapp: 'myapp' }));

        const result = writeProjectsConfig({
            projectName: 'myapp',
            gitProvider: 'github',
            repoName: 'myapp',
            repoOwner: 'myorg',
        });
        expect(result.filesSkipped.length).toBe(2);
    });

    it('handles corrupt existing file by overwriting', () => {
        jest.mocked(MockFs.existsSync).mockReturnValue(true);
        jest.mocked(MockFs.readFileSync).mockReturnValue('not json');

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
        jest.mocked(MockFs.existsSync).mockReturnValue(false);
        jest.mocked(MockFs.writeFileSync).mockImplementation(jest.fn());
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
        jest.mocked(MockFs.existsSync).mockReturnValue(true);
        const result = writeDotEnvExample({ projectName: 'myapp', gitProvider: 'github' });
        expect(result.filesSkipped.length).toBe(1);
        expect(MockFs.writeFileSync).not.toHaveBeenCalled();
    });
});
