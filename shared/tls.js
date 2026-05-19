// @ts-check
const https = require('https');

/** @returns {https.Agent} */
function createAgent() {
  return new https.Agent({ keepAlive: true });
}

module.exports = { createAgent };
