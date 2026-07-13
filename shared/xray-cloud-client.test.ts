/** Unit tests for XrayCloudClient proxy propagation.
 *
 *  Xray Cloud lives behind the corporate egress proxy in Euronext's network.
 *  The client must honor the same `QA_PROXY_URL` config as the Jira client
 *  (shared/proxy-config.ts fallback chain), so a single proxy config drives
 *  all egress. Regression guard for the inconsistency where Xray ignored
 *  `QA_PROXY_URL` and only honored HTTPS_PROXY/HTTP_PROXY env vars.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateThrottledClient } = vi.hoisted(() => ({
    mockCreateThrottledClient: vi.fn(() => ({ post: vi.fn() })),
}));

vi.mock('../shared/http-client', () => ({
    createThrottledClient: mockCreateThrottledClient,
}));

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../shared/config', () => ({
    default: {
        get: mockGet,
        getDefault: () => ({ get: mockGet }),
    },
}));

import { XrayCloudClient } from '../shared/xray-cloud-client.js';

describe('XrayCloudClient proxy propagation', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGet.mockImplementation((key: string) => {
            if (key === 'xrayCloudUrl') return 'https://xray.cloud.getxray.app';
            return '';
        });
    });

    it('passes QA_PROXY_URL as proxyUrl to the HTTP client', () => {
        mockGet.mockImplementation((key: string) => {
            if (key === 'proxyUrl') return 'http://127.0.0.1:9000';
            if (key === 'xrayCloudUrl') return 'https://xray.cloud.getxray.app';
            return '';
        });

        const client = new XrayCloudClient();

        expect(client).toBeInstanceOf(XrayCloudClient);
        expect(mockCreateThrottledClient).toHaveBeenCalledWith(
            expect.objectContaining({ proxyUrl: 'http://127.0.0.1:9000' }),
        );
    });

    it('propagates empty proxyUrl without breaking when proxy is unset', () => {
        const client = new XrayCloudClient();

        expect(client).toBeInstanceOf(XrayCloudClient);
        expect(mockCreateThrottledClient).toHaveBeenCalledWith(expect.objectContaining({ proxyUrl: '' }));
    });
});
