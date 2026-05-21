// @ts-check

/**
 * @param {Object} suite
 * @returns {Array<{title:string, state:'passed'|'failed'|'skipped', duration:number}>}
 */
function _flattenTests(suite) {
    /** @type {Array<{title:string, state:'passed'|'failed'|'skipped', duration:number}>} */
    const tests = [];
    if (suite.tests && Array.isArray(suite.tests)) {
        for (const t of suite.tests) {
            const rawState = t.state || 'pending';
            const state = /** @type {'passed'|'failed'|'skipped'} */ (rawState === 'passed' ? 'passed' : (rawState === 'failed' ? 'failed' : 'skipped'));
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

/**
 * @param {Object} jsonData
 * @returns {{tests: Array<{title:string, state:'passed'|'failed'|'skipped', duration:number}>, stats: {passed:number, failed:number, skipped:number, total:number, duration:number}}}
 */
function parseMochawesome(jsonData) {
    if (!jsonData || !jsonData.results || !Array.isArray(jsonData.results)) {
        return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 } };
    }

    const allTests = [];
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

/**
 * @param {string} filePath
 * @returns {{tests: Array<{title:string, state:'passed'|'failed'|'skipped', duration:number}>, stats: {passed:number, failed:number, skipped:number, total:number, duration:number}, error?: string}}
 */
function parseCypressResults(filePath) {
    const fs = require('fs');
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        return parseMochawesome(json);
    } catch (err) {
        const msg = err.code === 'ENOENT'
            ? 'Arquivo nao encontrado: ' + filePath
            : 'Erro ao ler/parsear arquivo: ' + filePath + ' (' + err.message + ')';
        return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 }, error: msg };
    }
}

module.exports = { parseMochawesome, parseCypressResults };
