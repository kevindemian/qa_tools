import https from 'https';

describe('createAgent', () => {
    it('returns an https.Agent with keepAlive true', () => {
        const agent = require('./tls').createAgent() as https.Agent;
        expect(agent).toBeInstanceOf(https.Agent);
        expect((agent as https.Agent & { keepAlive: boolean }).keepAlive).toBe(true);
    });
});
