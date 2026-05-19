jest.mock('./logger', () => ({
  rootLogger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
  Logger: function() {},
}));

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');

function mockFs(files) {
  const exists = jest.fn(p => p in files);
  const read = jest.fn(p => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p];
  });
  const write = jest.fn((p, data) => { files[p] = data; });
  const rename = jest.fn((from, to) => {
    if (from in files) { files[to] = files[from]; delete files[from]; }
  });
  jest.spyOn(fs, 'existsSync').mockImplementation(exists);
  jest.spyOn(fs, 'readFileSync').mockImplementation(read);
  jest.spyOn(fs, 'writeFileSync').mockImplementation(write);
  jest.spyOn(fs, 'renameSync').mockImplementation(rename);
  return { exists, read, write, rename };
}

describe('State', () => {
  let state;

  beforeEach(() => {
    jest.isolateModules(() => {
      state = require('./state');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('load', () => {
    it('returns empty object when no state file', () => {
      mockFs({});
      const result = state.load();
      expect(result).toEqual({});
    });

    it('returns parsed state when file exists', () => {
      mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'ECSPOL' }) });
      const result = state.load();
      expect(result).toEqual({ lastProject: 'ECSPOL' });
    });
  });

  describe('save', () => {
    it('writes state to backup and main paths', () => {
      const mocks = mockFs({});
      state.save({ lastProject: 'TEST' });
      expect(mocks.write).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('applies mutation and persists', () => {
      mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
      const result = state.update(s => { s.lastProject = 'NEW'; });
      expect(result.lastProject).toBe('NEW');
    });

    it('returns state with applied mutation', () => {
      mockFs({ [STATE_PATH]: JSON.stringify({ lastProject: 'OLD' }) });
      const result = state.update(s => { s.lastProject = 'NEW'; });
      expect(result.lastProject).toBe('NEW');
    });
  });

  describe('backup recovery', () => {
    it('recovers from backup when main file is corrupted', () => {
      const bakPath = STATE_PATH + '.bak';
      mockFs({
        [STATE_PATH]: 'corrupted{json',
        [bakPath]: JSON.stringify({ lastProject: 'RECOVERED' }),
      });
      const result = state.load();
      expect(result).toEqual({ lastProject: 'RECOVERED' });
    });
  });
});
