// @ts-check
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rootLogger } = require('./logger');

const STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
const TMP_PATH = STATE_PATH + '.tmp';
const BAK_PATH = STATE_PATH + '.bak';

/** @returns {import('./types').StateSchema} */
function load() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    }
  } catch (err) {
    rootLogger.warn('Arquivo de estado corrompido, recuperando backup...');
    try {
      if (fs.existsSync(BAK_PATH)) {
        const backup = JSON.parse(fs.readFileSync(BAK_PATH, 'utf8'));
        fs.writeFileSync(TMP_PATH, JSON.stringify(backup, null, 2), 'utf8');
        fs.renameSync(TMP_PATH, STATE_PATH);
        return backup;
      }
    } catch (err) {
      rootLogger.error('Falha ao recuperar backup de estado: ' + err.message);
    }
    try {
      fs.renameSync(STATE_PATH, BAK_PATH);
      rootLogger.warn('Backup salvo em ' + BAK_PATH + '. Criando novo estado.');
    } catch (err) {
      rootLogger.error('Falha ao salvar backup de estado: ' + err.message);
    }
  }
  return {};
}

/** @param {import('./types').StateSchema} state */
function save(state) {
  try {
    fs.writeFileSync(BAK_PATH, JSON.stringify(state, null, 2), 'utf8');
    fs.writeFileSync(TMP_PATH, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(TMP_PATH, STATE_PATH);
  } catch (err) {
    rootLogger.error('Falha ao salvar estado: ' + err.message);
  }
}

/**
 * @param {(state: import('./types').StateSchema) => void} fn
 * @returns {import('./types').StateSchema}
 */
function update(fn) {
  const state = load();
  const copy = JSON.parse(JSON.stringify(state));
  fn(copy);
  save(copy);
  return copy;
}

module.exports = { load, save, update, STATE_PATH };
