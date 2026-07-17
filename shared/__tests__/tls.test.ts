import https from 'https';
import { createAgent } from '../tls.js';

describe('CreateAgent', () => {
    it('returns an https.Agent with keepAlive true', () => {
        const agent = createAgent();

        expect(agent).toBeInstanceOf(https.Agent);
        expect((agent as https.Agent & { keepAlive: boolean }).keepAlive).toBeTruthy();
    });
});
