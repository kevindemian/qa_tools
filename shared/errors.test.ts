import { describe, expect, it } from 'vitest';
import {
    classifyGitError,
    formatErr,
    getErrorMessage,
    humanizeError,
    isCancelError,
    ExternalError,
    LlmError,
    LlmRateLimitError,
    LlmProviderError,
    LlmTimeoutError,
    LlmAuthError,
    DataIntegrityError,
    DataFetchError,
} from './errors.js';
import type { ExternalErrorContext } from './errors.js';

const CTX: ExternalErrorContext = { operation: 'list pipelines' };

describe('Shared/errors', () => {
    describe('ClassifyGitError', () => {
        it('classifies 401 as auth with remediation', () => {
            expect.hasAssertions();

            const e = classifyGitError({ response: { status: 401 }, config: { url: '/x' } }, CTX);

            expect(e.kind).toBe('auth');
            expect(e.status).toBe(401);
            expect(e.remediation).toMatch(/Token inválido/);
        });

        it('classifies 403 with scope note and scoped remediation', () => {
            expect.hasAssertions();

            const e = classifyGitError(
                { response: { status: 403 }, config: { url: '/x' } },
                { ...CTX, scope: 'contents:read' },
            );

            expect(e.kind).toBe('permission');
            expect(e.remediation).toContain('contents:read');
        });

        it('classifies 403 without scope using generic remediation', () => {
            expect.hasAssertions();

            const e = classifyGitError({ response: { status: 403 }, config: { url: '/x' } }, CTX);

            expect(e.kind).toBe('permission');
            expect(e.remediation).toContain('escopo necessário');
        });

        it('classifies 404 as notFound', () => {
            expect.hasAssertions();

            const e = classifyGitError({ response: { status: 404 }, config: { url: '/x' } }, CTX);

            expect(e.kind).toBe('notFound');
        });

        it('classifies 429 as rateLimit', () => {
            expect.hasAssertions();

            const e = classifyGitError({ response: { status: 429 }, config: { url: '/x' } }, CTX);

            expect(e.kind).toBe('rateLimit');
            expect(e.remediation).toMatch(/Aguarde/);
        });

        it('classifies 5xx as server', () => {
            expect.hasAssertions();

            const e = classifyGitError({ response: { status: 503 }, config: { url: '/x' } }, CTX);

            expect(e.kind).toBe('server');
        });

        it('classifies network error codes as network', () => {
            expect.hasAssertions();

            const e = classifyGitError({ code: 'ECONNRESET', message: 'reset' }, CTX);

            expect(e.kind).toBe('network');
            expect(e.remediation).toMatch(/rede/);
        });

        it('falls back to unknown when nothing matches', () => {
            expect.hasAssertions();

            const e = classifyGitError({ message: 'weird' }, CTX);

            expect(e.kind).toBe('unknown');
        });
    });

    describe('FormatErr / getErrorMessage / humanizeError', () => {
        it('extracts message from Error objects', () => {
            expect.hasAssertions();
            expect(formatErr(new Error('boom'))).toBe('boom');
        });

        it('stringifies non-Error thrown values', () => {
            expect.hasAssertions();
            expect(formatErr('plain string')).toBe('plain string');
            expect(formatErr(42)).toBe('42');
        });

        it('getErrorMessage aliases formatErr', () => {
            expect.hasAssertions();
            expect(getErrorMessage({ message: 'm' })).toBe('m');
        });

        it('humanizeError prefixes the context', () => {
            expect.hasAssertions();
            expect(humanizeError(new Error('x'), 'ctx')).toBe('ctx: x');
        });
    });

    describe('IsCancelError', () => {
        it('returns true for a CancelError-shaped value', () => {
            expect.hasAssertions();
            expect(isCancelError({ name: 'CancelError' })).toBeTruthy();
        });

        it('returns false for other values', () => {
            expect.hasAssertions();
            expect(isCancelError(null)).toBeFalsy();
            expect(isCancelError({ name: 'Other' })).toBeFalsy();
        });
    });

    describe('Error classes', () => {
        it('sets names on LLM error hierarchy', () => {
            expect.hasAssertions();
            expect(new LlmError('a').name).toBe('LlmError');
            expect(new LlmRateLimitError('a').name).toBe('LlmRateLimitError');
            expect(new LlmProviderError('a').name).toBe('LlmProviderError');
            expect(new LlmTimeoutError('a').name).toBe('LlmTimeoutError');
            expect(new LlmAuthError('a').name).toBe('LlmAuthError');
        });

        it('dataIntegrityError and DataFetchError carry messages', () => {
            expect.hasAssertions();
            expect(new DataIntegrityError('bad').message).toBe('bad');
            expect(new DataFetchError('no', { cause: 'x' }).message).toBe('no');
            expect(new DataFetchError('no').name).toBe('DataFetchError');
        });

        it('externalError exposes kind/status/operation', () => {
            expect.hasAssertions();

            const e = new ExternalError('auth', 'm', { operation: 'op', status: 401 });

            expect(e).toBeInstanceOf(Error);
            expect(e.kind).toBe('auth');
            expect(e.operation).toBe('op');
            expect(e.status).toBe(401);
        });
    });
});
