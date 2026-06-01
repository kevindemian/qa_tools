import { publishReport, type PublishTarget } from './publish';

jest.mock('child_process', () => ({
    execFileSync: jest.fn(),
}));

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        cpSync: jest.fn(),
        mkdirSync: jest.fn(),
    };
});

jest.mock('./logger', () => ({
    rootLogger: { info: jest.fn(), error: jest.fn() },
}));

const mockExecFileSync = jest.mocked(jest.requireMock('child_process').execFileSync);
const mockLogger = jest.requireMock('./logger').rootLogger;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('publishReport', () => {
    it('should call aws s3 cp for s3 target', () => {
        process.env.AWS_S3_BUCKET = 's3://my-bucket';
        publishReport({ target: 's3', filePath: './report.html' });
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'aws',
            ['s3', 'cp', './report.html', 's3://my-bucket', '--no-progress'],
            { stdio: 'inherit' },
        );
    });

    it('should use explicit destination for s3 target', () => {
        publishReport({ target: 's3', filePath: './report.html', destination: 's3://other' });
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'aws',
            ['s3', 'cp', './report.html', 's3://other', '--no-progress'],
            { stdio: 'inherit' },
        );
    });

    it('should not execute shell when path contains injection characters', () => {
        process.env.AWS_S3_BUCKET = 's3://bucket';
        const maliciousPath = './report; rm -rf /; .html';
        publishReport({ target: 's3', filePath: maliciousPath });
        expect(mockExecFileSync).toHaveBeenCalledWith(
            'aws',
            ['s3', 'cp', maliciousPath, 's3://bucket', '--no-progress'],
            { stdio: 'inherit' },
        );
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log error when s3 dest is missing', () => {
        delete process.env.AWS_S3_BUCKET;
        publishReport({ target: 's3', filePath: './report.html' });
        expect(mockExecFileSync).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith('S3 publish requires either --dest or AWS_S3_BUCKET env var');
    });

    it('should log error when s3 publish fails', () => {
        process.env.AWS_S3_BUCKET = 's3://bucket';
        mockExecFileSync.mockImplementationOnce(() => {
            throw new Error('aws failed');
        });
        publishReport({ target: 's3', filePath: './report.html' });
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('S3 publish failed'));
    });

    it('should log info about target and file path', () => {
        publishReport({ target: 's3', filePath: './report.html', destination: 's3://b' });
        expect(mockLogger.info).toHaveBeenCalledWith('Publishing report to s3: ./report.html');
    });

    it('should handle missing origin url gracefully', () => {
        mockExecFileSync
            .mockImplementationOnce(() => {
                throw new Error('no remote');
            })
            .mockReturnValueOnce('')
            .mockReturnValueOnce(undefined)
            .mockReturnValueOnce(undefined);
        publishReport({ target: 'gh-pages', filePath: './report.html' });
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle unsupported target gracefully', () => {
        publishReport({ target: 'ftp' as PublishTarget, filePath: './x.html' });
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Unknown publish target'));
        expect(mockExecFileSync).not.toHaveBeenCalled();
    });
});
