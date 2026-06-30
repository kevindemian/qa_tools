import https from 'https';

export function createAgent(): https.Agent {
    return new https.Agent({ keepAlive: true });
}
