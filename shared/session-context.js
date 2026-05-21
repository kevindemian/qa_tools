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
    const { Spinner } = require('./prompt');
    this.isBusy = true;
    const spinner = label ? new Spinner() : null;
    if (spinner) spinner.start(label);
    try {
      return await fn();
    } finally {
      if (spinner) spinner.stop();
      this.isBusy = false;
    }
  }

  pushHistory(op, detail, status) {
    this.sessionCounters.push({ op, detail, status });
  }
}

module.exports = { SessionContext };
