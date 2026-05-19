const { error, warn, info } = require('./prompt');
const { rootLogger } = require('./logger');

function mask(v) {
  return v ? v.slice(0, 4) + '****' : '';
}

function createValidateEnv(configs) {
  return function validateEnv() {
    const missing = configs.filter(c => !process.env[c.key]);
    if (missing.length === 0) return;
    error('Variaveis obrigatorias nao configuradas:');
    missing.forEach(c => warn(`  * ${c.label}`));
    warn('Crie um arquivo .env na raiz do projeto com:');
    configs.forEach(c => info(`${c.key}=${c.example}`));
    rootLogger._writeFile('ERROR', `Variaveis faltando: ${missing.map(c => c.key).join(', ')}`);
    process.exit(1);
  };
}

function setupSigint(getIsBusy, onExit) {
  process.on('SIGINT', () => {
    if (getIsBusy && getIsBusy()) {
      info('Operacao em andamento. Use Ctrl+C novamente para forcar saida.');
      return;
    }
    if (onExit) onExit();
    info('Ate logo!');
    process.exit(0);
  });
}

module.exports = { mask, createValidateEnv, setupSigint };
