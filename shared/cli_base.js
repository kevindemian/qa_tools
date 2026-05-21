// @ts-check
const { error, warn, info } = require('./prompt');
const { rootLogger } = require('./logger');

/** @param {string} v @returns {string} */
function mask(v) {
  return v ? v.slice(0, 4) + '****' : '';
}

/** @param {{key:string,label:string,example:string}[]} configs @returns {Function} */
function createValidateEnv(configs) {
  return function validateEnv() {
    const missing = configs.filter(c => !process.env[c.key]);
    if (missing.length === 0) {
      for (const c of configs) {
        const val = process.env[c.key] || '';
        if (val.length > 20 && !val.includes('placeholder') && !val.includes('seu-') && !val.includes('your-')) {
          rootLogger.warn(`VARIAVEL COM CREDENCIAL REAL: ${c.key}=${mask(val)}`);
        }
      }
      return;
    }
    error('Variaveis obrigatorias nao configuradas:');
    missing.forEach(c => warn(`  * ${c.label}`));
    warn('Crie um arquivo .env na raiz do projeto com:');
    configs.forEach(c => info(`${c.key}=${c.example}`));
    rootLogger.error(`Variaveis faltando: ${missing.map(c => c.key).join(', ')}`);
    throw new Error('Variaveis de ambiente faltando. Configure o .env.');
  };
}

/** @param {Function} getIsBusy @param {Function} onExit */
function setupSigint(getIsBusy, onExit) {
  const handler = () => {
    if (getIsBusy && getIsBusy()) {
      info('Operacao em andamento. Use Ctrl+C novamente para forcar saida.');
      return;
    }
    if (onExit) onExit();
    info('Ate logo!');
    process.exit(0);
  };
  process.on('SIGINT', handler);
}

module.exports = { mask, createValidateEnv, setupSigint };
