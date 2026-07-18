import https from 'https';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Corporate networks (Zscaler) perform TLS interception. Without the
// intercepting CA in the trust store, requests routed through the egress
// proxy fail with UNABLE_TO_GET_ISSUER_CERT_LOCALLY. Load the project's
// Zscaler root CA and append it to Node's default CA bundle.
let zscalerCa: Buffer[] = [];
try {
    zscalerCa = [fs.readFileSync(path.resolve(currentDir, '..', 'shared_docker', 'zscaler.crt'))];
} catch {
    zscalerCa = [];
}

export function createAgent(): https.Agent {
    return new https.Agent({
        keepAlive: true,
        ca: [...zscalerCa, ...tls.rootCertificates],
    });
}
