const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
const TMP_PATH = STATE_PATH + '.tmp';

function load() {
  try {
    if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (_) {
    try { fs.unlinkSync(STATE_PATH); } catch (_) {}
  }
  return {};
}

function save(state) {
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(TMP_PATH, STATE_PATH);
  } catch (_) {}
}

function update(fn) {
  const state = load();
  fn(state);
  save(state);
  return state;
}

module.exports = { load, save, update, STATE_PATH };
