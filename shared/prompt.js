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
  rootLogger._writeFile('INFO', msg);
}

function error(msg) {
  console.log(`${RED}ERR${RESET} ${msg}`);
  rootLogger._writeFile('ERROR', msg);
}

function warn(msg) {
  console.log(`${YELLOW}!${RESET} ${msg}`);
  rootLogger._writeFile('WARN', msg);
}

function info(msg) {
  if (!isQuiet()) console.log(`${CYAN}i${RESET} ${msg}`);
  rootLogger._writeFile('INFO', msg);
}

function title(msg) {
  console.log(`\n${BOLD}${msg}${RESET}`);
}

function prompt(label, options = {}) {
  const { default: def, hint } = options;
  let text = `\n${CYAN}->${RESET} ${label}`;
  if (hint) text += ` ${YELLOW}(${hint})${RESET}`;
  if (def) text += ` ${YELLOW}[${def}]${RESET}`;
  return readlineSync.question(text + ': ', { defaultInput: def });
}

function confirm(label, defaultYes = false) {
  const def = defaultYes ? 'Y' : 'N';
  const text = `\n${YELLOW}?${RESET} ${label} ${YELLOW}(${def})${RESET}`;
  const answer = readlineSync.question(text + ': ', { defaultInput: def.toLowerCase() });
  return answer.toLowerCase() === 'y';
}

function divider() {
  console.log('-'.repeat(50));
}

function smartPrompt(label, options = {}, helpCallback) {
  let retries = 0;
  const maxRetries = options.maxRetries || 3;
  while (retries < maxRetries) {
    const value = prompt(label, options);
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '/help' || trimmed === '/h') {
      if (helpCallback) helpCallback();
      retries++;
      continue;
    }
    return value;
  }
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
    process.stdout.write('\r[' + bar + '] ' + current + '/' + this.total + ' ' + eta + 's');
  }

  stop() {
    process.stdout.write('\n');
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
  { test: /permission|forbidden|403/i, msg: 'Sem permissao', hint: 'Verifique se seu token tem acesso a esta operacao.' },
  { test: /unauthorized|401/i, msg: 'Token invalido ou expirado', hint: 'Verifique seu token de autenticacao no arquivo .env.' },
  { test: /econnreset|econnrefused|enotfound|timeout/i, msg: 'Erro de conexao', hint: 'Verifique se a URL do Jira esta correta e acessivel.' },
  { test: /version.*not found/i, msg: 'Versao nao encontrada', hint: 'Verifique se o nome da versao esta correto.' },
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
    console.log(`  ${YELLOW}->${RESET} Verifique sua configuracao e tente novamente.`);
  }
}

function printSummary(results) {
  divider();
  const passed = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;

  if (failed === 0) {
    console.log(`  ${GREEN}${BOLD}TUDO CERTO!${RESET}`);
    success(`${passed} de ${results.length} operacao(oes) concluida(s) com sucesso`);
    rootLogger._writeFile('INFO', `Resumo: ${passed}/${results.length} ok`);
    if (passed >= 5 && Math.random() < 0.33) {
      const cheers = ['', ' > Tudo nos conformes!', '', ' > Show de bola!', ''];
      console.log(`  ${GREEN}${cheers[Math.floor(Math.random() * cheers.length)]}${RESET}`);
    }
  } else {
    const logPath = rootLogger.filePath;
    console.log(`  ${YELLOW}${BOLD}OPERACAO PARCIAL${RESET}`);
    warn(`${passed} concluidas, ${failed} com erro`);
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  ${RED}*${RESET} ${r.label}: ${r.message}`);
    });
    if (logPath) {
      console.log(`  ${YELLOW}->${RESET} Consulte o log: ${logPath}`);
    }
    rootLogger._writeFile('WARN', `Resumo: ${passed}/${results.length} ok, ${failed} erro(s)`);
  }
  divider();
}

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
    return autoAction;
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
      console.log(`  Status: ${err.response?.status || 'N/A'}`);
      if (err.response?.data) {
        console.log(`  Resposta: ${JSON.stringify(err.response.data, null, 2)}`);
      }
      if (err.stack) {
        const lines = err.stack.split('\n').slice(0, 4);
        console.log(`  Stack: ${lines.join('\n    ')}`);
      }
      divider();
      continue;
    }
    warn('Opcao invalida. Escolha ' + opts.join(', '));
  }
}

module.exports = {
  success, error, warn, info, title, divider,
  prompt, confirm, printError, printSummary, smartPrompt, extractErrorMessage,
  onError, Spinner, ProgressBar, isQuiet
};
