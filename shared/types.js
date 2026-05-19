/**
 * @typedef {Object} TestResult
 * @property {'ok'|'error'} status
 * @property {string} label
 * @property {string} message
 */

/**
 * @typedef {Object} TestStep
 * @property {Object} fields
 * @property {string} [fields.Action]
 * @property {string} [fields.Data]
 * @property {string} [fields.ExpectedResult]
 */

/**
 * @typedef {Object} TestCase
 * @property {string} title
 * @property {string} [description]
 * @property {TestStep[]} steps
 * @property {{ type: 'inline'|'reference', value: string }} [precondition]
 * @property {string} [group]
 * @property {{ key: string, linkType: string }[]} [linkedIssues]
 */

/**
 * @typedef {Object} JiraIssue
 * @property {string} key
 * @property {Object} fields
 * @property {string} [fields.description]
 * @property {string} [fields.summary]
 * @property {Object} [fields.project]
 * @property {string} [fields.project.key]
 * @property {Object} [fields.issuetype]
 * @property {string} [fields.issuetype.name]
 * @property {string[]} [fields.labels]
 */

/**
 * @typedef {Object} StateSchema
 * @property {string} [lastChoice]
 * @property {string} [lastProject]
 * @property {string} [lastLabels]
 * @property {string} [lastCsvPath]
 * @property {Array<{op:string,detail:string,status:string,ts:string}>} [history]
 * @property {Object} [_checkpoint]
 * @property {string} [_checkpoint.csvPath]
 * @property {string} [_checkpoint.project]
 * @property {number} [_checkpoint.csvLength]
 * @property {Array<{key:string,title:string}>} [_checkpoint.done]
 * @property {string} [_checkpoint.ts]
 */

/**
 * @typedef {Object} ApiConfig
 * @property {string} baseUrl
 * @property {string} token
 * @property {import('./logger').Logger} [logger]
 */

module.exports = {};
