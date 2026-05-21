// @ts-check
const readlineSync = require('readline-sync');
const { rootLogger } = require('./logger');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const isQuiet = () => process.env.QUIET === 'true';

function success(msg) {
  console.log(`${GREEN}OK${RESET} ${msg}`);
  rootLogger.writeFileOnly('INFO', msg);
}

function error(msg) {
  console.log(`${RED}ERR${RESET} ${msg}`);
  rootLogger.writeFileOnly('ERROR', msg);
}

function warn(msg) {
  console.log(`${YELLOW}!${RESET} ${msg}`);
  rootLogger.writeFileOnly('WARN', msg);
}

function info(msg) {
  if (!isQuiet()) console.log(`${CYAN}i${RESET} ${msg}`);
  rootLogger.writeFileOnly('INFO', msg);
}

function title(msg) {
  console.log(`\n${BOLD}${msg}${RESET}`);
}

function prompt(label, options = {}) {
  const { default: def, hint } = options;
  let text = `\n${CYAN}->${RESET} ${label}`;
  if (hint) text += ` ${YELLOW}(${hint})${RESET}`;
  if (def) text += ` ${YELLOW}[${def}]${RESET}`;
  return readlineSync.question(text + ': ', { defaultInput: def }).trim();
}

function confirm(label, defaultYes = false) {
  const def = defaultYes ? 'Y' : 'N';
  const text = `\n${YELLOW}?${RESET} ${label} ${YELLOW}(${def})${RESET}`;
  const answer = readlineSync.question(text + ': ', { defaultInput: def.toLowerCase() });
  return ['y', 'yes', 'sim', 's'].includes(answer.toLowerCase().trim());
}

function divider() {
  console.log('-'.repeat(50));
}

const NAV_CMDS = ['/back', '/menu', '/exit', '/sair'];

function smartPrompt(label, options = {}, helpCallback) {
  let retries = 0;
  const maxRetries = options.maxRetries || 3;
  while (retries < maxRetries) {
    const value = prompt(label, options);
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '/help' || trimmed === '/h') {
      if (helpCallback) helpCallback();
      continue;
    }
    if (NAV_CMDS.includes(trimmed)) {
      return value;
    }
    if (!trimmed) {
      retries++;
      continue;
    }
    return value;
  }
  warn('Numero maximo de tentativas excedido.');
  return '';
}

class ProgressBar {
  constructor(total, options = {}) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
    this.width = options.width || 20;
  }

  update(current) {
    this.current = current;
    const pct = this.total > 0 ? current / this.total : 0;
    const filled = Math.round(pct * this.width);
    let bar;
    if (filled >= this.width) {
      bar = '='.repeat(this.width);
    } else if (filled <= 0) {
      bar = '>' + ' '.repeat(this.width - 1);
    } else {
      bar = '='.repeat(filled) + '>' + ' '.repeat(this.width - filled - 1);
    }
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    let eta;
    if (current === 0 || elapsed === 0) {
      eta = '?';
    } else {
      eta = Math.round(elapsed / current * (this.total - current));
    }
    if (process.stdout.isTTY) {
      process.stdout.write('\r[' + bar + '] ' + current + '/' + this.total + ' ' + eta + 's');
    }
  }

  stop() {
    if (process.stdout.isTTY) {
      process.stdout.write('\r\x1b[K\n');
    }
  }
}

class Spinner {
  constructor() {
    this.frames = ['-', '\\', '|', '/'];
    this.interval = null;
    this.i = 0;
  }

  start(msg) {
    if (isQuiet()) { process.stdout.write(msg + '...\n'); return; }
    this.i = 0;
    process.stdout.write(this.frames[0] + ' ' + msg);
    this.interval = setInterval(() => {
      this.i = (this.i + 1) % this.frames.length;
      process.stdout.write('\r' + this.frames[this.i] + ' ' + msg);
    }, 200);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r');
    }
  }
}

const KNOWN_ERRORS = [
  { test: /rate limit|too many requests/i, msg: 'Rate limit atingido', hint: 'Aguarde alguns segundos e tente novamente.' },
  { test: /issue type.*not found|not a valid issue type/i, msg: 'Tipo de issue nao encontrado', hint: 'Verifique se o tipo esta habilitado nas configuracoes do projeto Jira.' },
  { test: /project.*not found/i, msg: 'Projeto nao encontrado', hint: 'Verifique se o nome do projeto esta correto.' },
  { test: /field.*not found|unknown field/i, msg: 'Campo nao encontrado', hint: 'Verifique se o campo existe no schema do projeto.' },
  { test: /permission|forbidden|403/i, msg: 'Sem permissao', hint: 'Verifique se seu token tem acesso a esta operação.' },
  { test: /unauthorized|401/i, msg: 'Token inválido ou expirado', hint: 'Verifique seu token de autenticacao no arquivo .env.' },
  { test: /econnreset|econnrefused|enotfound|timeout|econnaborted/i, msg: 'Erro de conexão', hint: 'Verifique se a URL do Jira esta correta e acessivel.' },
  { test: /version.*not found/i, msg: 'Versão nao encontrada', hint: 'Verifique se o nome da versão esta correto.' },
  { test: /already exists/i, msg: 'Item ja existe', hint: 'Escolha um nome diferente.' },
];

function humanizeError(message) {
  if (!message) return { msg: 'Erro desconhecido', hint: 'Verifique os logs acima para mais detalhes.' };
  for (const known of KNOWN_ERRORS) {
    if (known.test.test(message)) return known;
  }
  return null;
}

function extractErrorMessage(err) {
  if (!err) return 'Erro desconhecido';
  try {
    return (err.response?.data?.errorMessages?.[0]
      || err.response?.data?.message
      || (typeof err.response?.data === 'string' ? err.response.data : null)
      || err.message
      || '').toString();
  } catch {
    return 'Erro desconhecido';
  }
}

function printError(context, err) {
  const raw = extractErrorMessage(err);
  const known = humanizeError(raw);
  if (known) {
    error(`${context}: ${known.msg}`);
    console.log(`  ${YELLOW}->${RESET} ${known.hint}`);
  } else {
    error(`${context}: ${raw || 'Erro inesperado'}`);
    console.log(`  ${YELLOW}->${RESET} Verifique sua configuração e tente novamente.`);
  }
}

/** @param {import('./types').TestResult[]} results */
function printSummary(results) {
  divider();
  const passed = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;

  if (failed === 0) {
    console.log(`  ${GREEN}${BOLD}TUDO CERTO!${RESET}`);
    success(`${passed} de ${results.length} operação(oes) concluída(s) com sucesso`);
    rootLogger.info(`Resumo: ${passed}/${results.length} ok`);
  } else {
    const logPath = rootLogger.filePath;
    console.log(`  ${YELLOW}${BOLD}OPERACAO PARCIAL${RESET}`);
    warn(`${passed} concluídas, ${failed} com erro`);
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  ${RED}*${RESET} ${r.label}: ${r.message}`);
    });
    if (logPath) {
      console.log(`  ${YELLOW}->${RESET} Consulte o log: ${logPath}`);
    }
    rootLogger.warn(`Resumo: ${passed}/${results.length} ok, ${failed} erro(s)`);
  }
  divider();
}

/** @param {string} context @param {Error} err @param {{retry?:boolean,details?:boolean}} [options] @returns {Promise<'abort'|'skip'|'retry'>} */
async function onError(context, err, options = {}) {
  const { retry: canRetry = false, details: canDetails = false } = options;
  const raw = extractErrorMessage(err);
  const known = humanizeError(raw);
  const msg = known ? known.msg : (raw || 'Erro inesperado');

  error(`${context}: ${msg}`);

  if (process.env.AUTO_CONFIRM === 'true') {
    const autoAction = process.env.ON_ERROR || 'abort';
    if (autoAction === 'skip') warn('Modo automatico: pulando...');
    else error('Modo automatico: abortando...');
    return /** @type {'abort' | 'skip' | 'retry'} */ (autoAction);
  }

  while (true) {
    const opts = [];
    if (canRetry) opts.push('[R]etry');
    opts.push('[S]kip');
    opts.push('[A]bort');
    if (canDetails) opts.push('[D]etails');

    console.log('  ' + '-'.repeat(45));
    console.log('    ' + opts.join('   '));
    console.log('  ' + '-'.repeat(45));
    const answer = readlineSync.question('  Escolha: ').trim().toLowerCase();

    if (answer === 'r' && canRetry) return 'retry';
    if (answer === 's') return 'skip';
    if (answer === 'a') return 'abort';
    if (answer === 'd' && canDetails) {
      divider();
      console.log(`  Status: ${/** @type {any} */ (err).response?.status || 'N/A'}`);
      if (/** @type {any} */ (err).response?.data) {
        console.log(`  Resposta: ${JSON.stringify(/** @type {any} */ (err).response.data, null, 2)}`);
      }
      if (err.stack) {
        const lines = err.stack.split('\n').slice(0, 4);
        console.log(`  Stack: ${lines.join('\n    ')}`);
      }
      divider();
      continue;
    }
    warn('Opção invalida. Escolha ' + opts.join(', '));
  }
}

// ---------------------------------------------------------------------------
// TUI wrappers (async, @inquirer/select when TTY)
// ---------------------------------------------------------------------------

/** @type {any} */
let _inquirerMod = null;

async function _loadInquirer() {
    if (_inquirerMod !== null) return _inquirerMod;
    try {
        _inquirerMod = await import('@inquirer/select');
        return _inquirerMod;
    } catch {
        _inquirerMod = false;
        return false;
    }
}

const isTTY = () => process.stdout.isTTY && process.env.QUIET !== 'true';

/**
 * @typedef {Object} SelectChoice
 * @property {string} [name]
 * @property {string} [value]
 * @property {string} [description]
 * @property {boolean|string} [disabled]
 * @property {'separator'} [type]
 * @property {string} [line]
 */

/**
 * @param {string} label
 * @param {Array<SelectChoice>} choices
 * @param {{pageSize?:number, default?:string}} [options]
 * @returns {Promise<string>}
 */
async function showSelect(label, choices, options = {}) {
    const mod = await _loadInquirer();
    if (mod && isTTY()) {
        const processed = choices.map(c => {
            if (c.type === 'separator') return new mod.Separator(c.line);
            return c;
        });
        try {
            const answer = await mod.default({
                message: label,
                choices: processed,
                pageSize: options.pageSize || 14,
                loop: false,
                default: options.default,
            });
            return answer;
        } catch (err) {
            if (err.name === 'ExitPromptError' || err.message?.includes('cancel')) {
                return '0';
            }
            throw err;
        }
    }
    // Fallback: plain numbered list + readline-sync
    console.log('');
    for (const c of choices) {
        if (c.type === 'separator') {
            if (c.line) console.log(' ' + c.line);
            continue;
        }
        const desc = c.description ? '  ' + c.description : '';
        console.log('  ' + c.name + desc);
    }
    return prompt(label).trim();
}

/**
 * @param {Array<Object>} data
 * @param {string[]} [columns]
 */
function tableView(data, columns) {
    if (!data || data.length === 0) {
        warn('Nenhum dado para exibir.');
        return;
    }
    if (columns) {
        const filtered = data.map(row => {
            /** @type {Record<string, any>} */
            const obj = {};
            for (const col of columns) {
                if (col in row) obj[col] = row[col];
            }
            return obj;
        });
        console.table(filtered);
    } else {
        console.table(data);
    }
}

module.exports = {
  success, error, warn, info, title, divider,
  prompt, confirm, printError, printSummary, smartPrompt, extractErrorMessage,
  humanizeError, onError, Spinner, ProgressBar, isQuiet,
  showSelect, tableView
};
