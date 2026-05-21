// @ts-check
const { success, error, warn, info } = require('./prompt');
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
          rootLogger.warn(`VARIÁVEL COM CREDENCIAL REAL: ${c.key}=${mask(val)}`);
        }
      }
      return;
    }
    error('Variáveis obrigatórias não configuradas:');
    missing.forEach(c => warn(`  * ${c.label}`));
    warn('Crie um arquivo .env na raiz do projeto com:');
    configs.forEach(c => info(`${c.key}=${c.example}`));
    rootLogger.error(`Variáveis faltando: ${missing.map(c => c.key).join(', ')}`);
    throw new Error('Variáveis de ambiente faltando. Configure o .env.');
  };
}

/** @param {string} url @returns {string} */
function sanitizeUrl(url) {
    return url.replace(/token=[^&]+/, 'token=****');
}

/** @param {Function} getIsBusy @param {Function} onExit */
function setupSigint(getIsBusy, onExit) {
  const handler = () => {
    if (getIsBusy && getIsBusy()) {
      info('Operação em andamento. Use Ctrl+C novamente para forcar saida.');
      return;
    }
    if (onExit) onExit();
    info('Ate logo!');
    process.exit(0);
  };
  process.on('SIGINT', handler);
}

/**
 * @param {Array<{status:string}>} sessionCounters
 * @param {string} lastOperation
 * @param {Array<{status:string,op:string,detail:string}>} [history]
 */
function printSessionSummary(sessionCounters, lastOperation, history) {
    const logPath = rootLogger.filePath;
    console.log('');
    console.log('='.repeat(50));
    info('Sessão encerrada.');
    const ok = sessionCounters.filter(c => c.status === 'ok').length;
    const er = sessionCounters.filter(c => c.status === 'error').length;
    if (ok > 0 || er > 0) {
        if (ok > 0) success(ok + ' operação(oes) concluída(s)');
        if (er > 0) error(er + ' operação(oes) com erro');
    }
    if (history && history.length > 0) {
        const last5 = history.slice(-5);
        info('Últimas operacoes:');
        last5.forEach(h => {
            const icon = h.status === 'error' ? 'ERR' : 'OK';
            console.log(`  ${icon} ${h.op}: ${h.detail}`);
        });
    }
    if (lastOperation) info('Última operação: ' + lastOperation);
    if (logPath) info('Log: ' + logPath);
    console.log('='.repeat(50));
    rootLogger.writeFileOnly('INFO', 'Sessão encerrada. ' +
        (ok > 0 ? ok + ' ok, ' : '') +
        (er > 0 ? er + ' erro(s), ' : '') +
        'última: ' + (lastOperation || 'nenhuma'));
}

module.exports = { mask, createValidateEnv, setupSigint, sanitizeUrl, printSessionSummary };
