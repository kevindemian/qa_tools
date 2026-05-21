// @ts-check
const fs = require('fs');
const { info, success, warn } = require('../shared/prompt');
const { rootLogger } = require('../shared/logger');
const { createTestExecution } = require('./create_tests');

/**
 * @param {string} title - title from test result (e.g. "TC01 - Login valido")
 * @param {Array<{title:string, key:string}>} mappings - from mapping JSON
 * @returns {{title:string, key:string}|null}
 */
function _fuzzyMatch(title, mappings) {
    if (!title) return null;

    const exact = mappings.find(m => m.title === title);
    if (exact) return exact;

    const lower = title.toLowerCase();
    const byContains = mappings.find(m => lower.includes(m.title.toLowerCase()) || m.title.toLowerCase().includes(lower));
    if (byContains) return byContains;

    const normalized = title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return mappings.find(m => m.title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normalized) || null;
}

/**
 * @param {Array<{title:string, state:'passed'|'failed'|'skipped', duration:number}>} results - from parseMochawesome
 * @param {string} mappingJsonPath - path to mapping JSON file
 * @returns {{matched: Array<{key:string, title:string, status:'passed'|'failed'|'skipped', duration:number}>, unmatched: Array<{title:string, state:string}>, stats: {passed:number, failed:number, skipped:number, total:number}}}
 */
function matchResultsToTests(results, mappingJsonPath) {
    let mappings = [];
    try {
        const raw = fs.readFileSync(mappingJsonPath, 'utf8');
        const data = JSON.parse(raw);
        mappings = (data.tests || []).map((/** @type {any} */ t) => ({ title: t.title || '', key: t.key || '' }));
    } catch (err) {
        rootLogger.warn('Nao foi possivel ler mapping JSON: ' + err.message);
        return { matched: [], unmatched: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0 } };
    }

    if (mappings.length === 0) {
        rootLogger.warn('Mapping JSON vazio');
        return { matched: [], unmatched: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0 } };
    }

    const matched = [];
    const unmatched = [];

    for (const r of results) {
        const match = _fuzzyMatch(r.title, mappings);
        if (match) {
            matched.push({ key: match.key, title: r.title, status: r.state, duration: r.duration });
        } else {
            unmatched.push({ title: r.title, state: r.state });
        }
    }

    const passed = matched.filter(m => m.status === 'passed').length;
    const failed = matched.filter(m => m.status === 'failed').length;
    const skipped = matched.filter(m => m.status === 'skipped').length;

    return { matched, unmatched, stats: { passed, failed, skipped, total: matched.length } };
}

/**
 * @param {import('./jira_resource')} jiraResource
 * @param {import('./jira_link_manager')} linkManager
 * @param {string} project_name
 * @param {Array<{key:string, title:string, status:'passed'|'failed'|'skipped', duration:number}>} matchedResults
 * @param {string} csvName
 * @param {{pipelineId?:string|number, branch?:string, provider?:string}} [pipelineInfo]
 * @returns {Promise<{key:string, summary:string, passed:number, failed:number, skipped:number}>}
 */
async function createTestExecutionFromResults(jiraResource, linkManager, project_name, matchedResults, csvName, pipelineInfo) {
    const now = new Date().toLocaleString('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });

    const branch = pipelineInfo?.branch || '';
    const pipelineId = pipelineInfo?.pipelineId || '';
    const provider = pipelineInfo?.provider || '';

    let tag = '';
    if (branch) tag += branch;
    if (pipelineId) tag += (tag ? ' #' : '#') + pipelineId;
    if (tag) tag = ' (' + tag + ')';

    const summary = 'Resultados: ' + (csvName || 'Testes') + tag + ' - ' + now;

    const testKeys = matchedResults.filter(m => m.status !== 'skipped').map(m => m.key);
    const te = await createTestExecution(jiraResource, project_name, testKeys, csvName, summary);

    if (te.key && matchedResults.length > 0) {
        try {
            for (const m of matchedResults) {
                if (m.status === 'skipped') continue;
                await linkManager.createIssueLink(m.key, te.key, 'Tests');
            }
        } catch (err) {
            rootLogger.warn('Falha ao linkar alguns testes: ' + err.message);
        }
    }

    const passed = matchedResults.filter(m => m.status === 'passed').length;
    const failed = matchedResults.filter(m => m.status === 'failed').length;
    const skipped = matchedResults.filter(m => m.status === 'skipped').length;

    return { key: te.key, summary, passed, failed, skipped };
}

module.exports = { matchResultsToTests, createTestExecutionFromResults };
