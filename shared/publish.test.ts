import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecFileSync, mockCpSync, mockMkdirSync, mockLoggerInfo, mockLoggerError } = vi.hoisted(() => ({
    mockExecFileSync: vi.fn<(typeof import('child_process'))['execFileSync']>(),
    mockCpSync: vi.fn<(typeof import('fs'))['cpSync']>(),
    mockMkdirSync: vi.fn<(typeof import('fs'))['mkdirSync']>(),
    mockLoggerInfo: vi.fn(),
    mockLoggerError: vi.fn(),
}));

vi.mock('child_process', () => ({
    default: { execFileSync: mockExecFileSync },
    execFileSync: mockExecFileSync,
}));

vi.mock('fs', () => ({
    default: { cpSync: mockCpSync, mkdirSync: mockMkdirSync },
    cpSync: mockCpSync,
    mkdirSync: mockMkdirSync,
}));

vi.mock('./logger', () => ({
    rootLogger: { info: mockLoggerInfo, warn: vi.fn(), error: mockLoggerError },
}));

import { publishReport, type PublishTarget } from './publish.js';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('PublishReport', () => {
    it('should call aws s3 cp for s3 target', () => {
        process.env['AWS_S3_BUCKET'] = 's3://my-bucket';
        publishReport({ target: 's3', filePath: './report.html' });

        expect(mockExecFileSync).toHaveBeenCalledWith(
            'aws',
            ['s3', 'cp', './report.html', 's3://my-bucket', '--no-progress'],
            { stdio: 'inherit', timeout: 120_000 },
        );
    });

    it('should use explicit destination for s3 target', () => {
        publishReport({ target: 's3', filePath: './report.html', destination: 's3://other' });

        expect(mockExecFileSync).toHaveBeenCalledWith(
            'aws',
            ['s3', 'cp', './report.html', 's3://other', '--no-progress'],
            { stdio: 'inherit', timeout: 120_000 },
        );
    });

    it('should not execute shell when path contains injection characters', () => {
        process.env['AWS_S3_BUCKET'] = 's3://bucket';
        const maliciousPath = './report; rm -rf /; .html';
        publishReport({ target: 's3', filePath: maliciousPath });

        expect(mockExecFileSync).toHaveBeenCalledWith(
            'aws',
            ['s3', 'cp', maliciousPath, 's3://bucket', '--no-progress'],
            { stdio: 'inherit', timeout: 120_000 },
        );
        expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should log error when s3 dest is missing', () => {
        delete process.env['AWS_S3_BUCKET'];
        publishReport({ target: 's3', filePath: './report.html' });

        expect(mockExecFileSync).not.toHaveBeenCalled();
        expect(mockLoggerError).toHaveBeenCalledWith('S3 publish requires either --dest or AWS_S3_BUCKET env var');
    });

    it('should log error when s3 publish fails', () => {
        process.env['AWS_S3_BUCKET'] = 's3://bucket';
        mockExecFileSync.mockImplementationOnce(() => {
            throw new Error('aws failed');
        });
        publishReport({ target: 's3', filePath: './report.html' });

        expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('S3 publish failed'));
    });

    it('should log info about target and file path', () => {
        publishReport({ target: 's3', filePath: './report.html', destination: 's3://b' });

        expect(mockLoggerInfo).toHaveBeenCalledWith('Publishing report to s3: ./report.html');
    });

    it('should handle missing origin url gracefully', () => {
        mockExecFileSync
            .mockImplementationOnce(() => {
                throw new Error('no remote');
            })
            .mockReturnValueOnce('')
            .mockReturnValueOnce('')
            .mockReturnValueOnce('');
        publishReport({ target: 'gh-pages', filePath: './report.html' });

        expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should handle unsupported target gracefully', () => {
        publishReport({ target: 'ftp' as PublishTarget, filePath: './x.html' });

        expect(mockLoggerError).toHaveBeenCalledWith(expect.stringContaining('Unknown publish target'));
        expect(mockExecFileSync).not.toHaveBeenCalled();
    });
});
