const { SessionContext } = require('./session-context');

describe('SessionContext', () => {
  let ctx;

  beforeEach(() => {
    ctx = new SessionContext();
  });

  it('initializes with defaults', () => {
    expect(ctx.isBusy).toBe(false);
    expect(ctx.lastOperation).toBe('');
    expect(ctx.sessionCounters).toEqual([]);
    expect(ctx.packageManager).toBeUndefined();
    expect(ctx.git_directory).toBe('no_dir_selected');
    expect(ctx.inMemoryTasksId).toEqual([]);
    expect(ctx.inMemoryTasksText).toEqual([]);
    expect(ctx.project_name).toBe('');
    expect(ctx.results).toEqual([]);
  });

  it('resetResults clears results array', () => {
    ctx.results.push({ status: 'ok', label: 'T1', message: '' });
    ctx.resetResults();
    expect(ctx.results).toEqual([]);
  });

  it('withBusy sets isBusy during execution', async () => {
    expect(ctx.isBusy).toBe(false);

    const result = await ctx.withBusy(async () => {
      expect(ctx.isBusy).toBe(true);
      return 42;
    });

    expect(result).toBe(42);
    expect(ctx.isBusy).toBe(false);
  });

  it('withBusy ensures isBusy is false on error', async () => {
    await expect(ctx.withBusy(async () => {
      throw new Error('fail');
    })).rejects.toThrow('fail');

    expect(ctx.isBusy).toBe(false);
  });

  it('pushHistory appends to sessionCounters', () => {
    ctx.pushHistory('test-op', 'detail-1', 'ok');
    expect(ctx.sessionCounters).toEqual([
      { op: 'test-op', detail: 'detail-1', status: 'ok' }
    ]);
  });

  it('pushHistory appends multiple entries', () => {
    ctx.pushHistory('op1', 'd1', 'ok');
    ctx.pushHistory('op2', 'd2', 'error');
    expect(ctx.sessionCounters.length).toBe(2);
    expect(ctx.sessionCounters[0].op).toBe('op1');
    expect(ctx.sessionCounters[1].op).toBe('op2');
  });
});
