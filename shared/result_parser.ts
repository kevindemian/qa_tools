import fs from 'fs';

interface MochawesomeSuite {
  tests?: Array<{
    title?: string;
    state?: string;
    duration?: number;
  }>;
  suites?: MochawesomeSuite[];
}

interface MochawesomeData {
  results?: Array<{
    suites?: MochawesomeSuite[];
  }>;
  stats?: {
    duration?: number;
  };
}

export interface FlatTest {
  title: string;
  state: 'passed' | 'failed' | 'skipped';
  duration: number;
}

export interface ParseResult {
  tests: FlatTest[];
  stats: {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
  };
}

export interface ParseResultWithError extends ParseResult {
  error?: string;
}

function _flattenTests(suite: MochawesomeSuite): FlatTest[] {
  const tests: FlatTest[] = [];
  if (suite.tests && Array.isArray(suite.tests)) {
    for (const t of suite.tests) {
      const rawState = t.state || 'pending';
      const state: 'passed' | 'failed' | 'skipped' =
        rawState === 'passed' ? 'passed' : (rawState === 'failed' ? 'failed' : 'skipped');
      tests.push({ title: t.title || '', state, duration: t.duration || 0 });
    }
  }
  if (suite.suites && Array.isArray(suite.suites)) {
    for (const sub of suite.suites) {
      tests.push(..._flattenTests(sub));
    }
  }
  return tests;
}

export function parseMochawesome(jsonData: MochawesomeData): ParseResult {
  if (!jsonData || !jsonData.results || !Array.isArray(jsonData.results)) {
    return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 } };
  }

  const allTests: FlatTest[] = [];
  for (const result of jsonData.results) {
    if (result.suites) {
      for (const suite of result.suites) {
        allTests.push(..._flattenTests(suite));
      }
    }
  }

  const passed = allTests.filter(t => t.state === 'passed').length;
  const failed = allTests.filter(t => t.state === 'failed').length;
  const skipped = allTests.filter(t => t.state === 'skipped').length;
  const stats = jsonData.stats || {};
  const duration = typeof stats.duration === 'number' ? stats.duration : 0;

  return {
    tests: allTests,
    stats: {
      passed,
      failed,
      skipped,
      total: allTests.length,
      duration,
    },
  };
}

export function parseCypressResults(filePath: string): ParseResultWithError {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    return parseMochawesome(json);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { message: string };
    const msg = e.code === 'ENOENT'
      ? 'Arquivo nao encontrado: ' + filePath
      : 'Erro ao ler/parsear arquivo: ' + filePath + ' (' + e.message + ')';
    return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 }, error: msg };
  }
}
