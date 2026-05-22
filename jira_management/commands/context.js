// @ts-check

/**
 * @typedef {import('../jira_resource')} JiraResource
 * @typedef {import('../jira_link_manager')} JiraLinkManager
 * @typedef {import('../csv_resource')} CsvResource
 * @typedef {import('../package_version_manager')} PackageVersionManager
 * @typedef {import('../../shared/session-context').SessionContext} SessionContext
 * @typedef {import('../../shared/logger').Logger} Logger
 *
 * @typedef {Object} CommandContext
 * @property {JiraResource} jiraResource
 * @property {JiraResource} jiraResourceXray
 * @property {JiraLinkManager} linkManager
 * @property {JiraLinkManager} linkManagerXray
 * @property {CsvResource} csvResource
 * @property {PackageVersionManager} [packageManager]
 * @property {SessionContext} ctx
 * @property {(op:string,detail:string,status:string) => void} pushHistory
 * @property {() => void} printSessionSummary
 * @property {string} base_url
 * @property {Logger} sessionLog
 */

module.exports = {};
