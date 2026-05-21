/**
 * @template T
 * @typedef {Object} SessionCountersItem
 * @property {string} op
 * @property {string} detail
 * @property {string} status
 */

class SessionContext {
  constructor() {
    this.isBusy = false;
    this.lastOperation = '';
    this.sessionCounters = [];
    this.packageManager = undefined;
    this.git_directory = 'no_dir_selected';
    this.inMemoryTasksId = [];
    this.inMemoryTasksText = [];
    this.project_name = '';
    this.results = [];
  }

  resetResults() {
    this.results = [];
  }

  async withBusy(fn, label) {
    const { withSpinner } = require('./prompt');
    this.isBusy = true;
    try {
      if (label) return await withSpinner(label, fn);
      return await fn();
    } finally {
      this.isBusy = false;
    }
  }

  pushHistory(op, detail, status) {
    this.sessionCounters.push({ op, detail, status });
    this.lastOperation = op + ': ' + detail;
  }

  buildContextLine(projectName) {
    const ok = this.sessionCounters.filter(c => c.status === 'ok').length;
    const er = this.sessionCounters.filter(c => c.status === 'error').length;
    const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
    const prefix = projectName || '';
    return prefix + (this.lastOperation ? ' | ' + this.lastOperation : '') + counts;
  }
}

module.exports = { SessionContext };
