const https = require('https');

function createAgent() {
  return new https.Agent({
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
  });
}

module.exports = { createAgent };
