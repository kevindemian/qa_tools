// @ts-check
const fs = require('fs');
const path = require('path');
const os = require('os');
const { info, warn } = require('../shared/prompt');
const { rootLogger } = require('../shared/logger');

const FALLBACK_LINK_TYPES = [
  { id: '11701', name: 'Relates', inward: 'relates to', outward: 'relates to' },
  { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' },
  { id: '10200', name: 'Tested by', inward: 'tested by', outward: 'tests' },
];

class JiraLinkManager {
  /** @param {import('./jira_resource')} jiraResource */
  constructor(jiraResource) {
    this.jiraResource = jiraResource;
    this.linkTypesCache = null;
    this.cacheFilePath = path.join(os.homedir(), '.qa_tools_link_types_cache.json');
  }

  /** @returns {Promise<Object[]>} */
  async getIssueLinkTypes() {
    if (this.linkTypesCache) return this.linkTypesCache;

    try {
      const data = await this.jiraResource.getJiraResource('issueLinkType');
      if (data && data.issueLinkTypes) {
        this.linkTypesCache = data.issueLinkTypes;
        try {
          fs.writeFileSync(this.cacheFilePath, JSON.stringify(data.issueLinkTypes), 'utf8');
        } catch (err) {
          rootLogger.warn('Falha ao escrever cache de link types: ' + err.message);
        }
        return this.linkTypesCache;
      }
    } catch (err) {
      rootLogger.warn('getIssueLinkTypes — API falhou, verificando cache local...');
    }

    try {
      if (fs.existsSync(this.cacheFilePath)) {
        this.linkTypesCache = JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf8'));
        return this.linkTypesCache;
      }
    } catch (err) {
      rootLogger.warn('Falha ao ler cache de link types: ' + err.message);
    }

    this.linkTypesCache = FALLBACK_LINK_TYPES;
    return this.linkTypesCache;
  }

  /** @param {string} linkTypeName @returns {Promise<string>} */
  async resolveLinkTypeId(linkTypeName) {
    const types = await this.getIssueLinkTypes();
    const lowerName = linkTypeName.toLowerCase().trim();

    const match = types.find(t =>
      (t.name && t.name.toLowerCase() === lowerName) ||
      (t.inward && t.inward.toLowerCase() === lowerName) ||
      (t.outward && t.outward.toLowerCase() === lowerName)
    );

    if (match) return match.id;

    rootLogger.warn(`Tipo de link '${linkTypeName}' nao encontrado, usando 'relates to' como fallback`);
    return '11701';
  }

  /** @param {string} sourceKey @param {Array<{key:string,linkType:string}>} linkedIssues @returns {Promise<void>} */
  async linkIssues(sourceKey, linkedIssues) {
    for (const li of linkedIssues) {
      const linkTypeId = await this.resolveLinkTypeId(li.linkType);
      const payload = {
        type: { id: linkTypeId },
        inwardIssue: { key: sourceKey },
        outwardIssue: { key: li.key }
      };
      info(`Linkando ${sourceKey} -> ${li.key} (tipo: ${li.linkType})...`);
      await this.jiraResource.postJiraResource('issueLink', payload);
    }
  }

  /** @param {string} testKey @param {string} preconditionKey @returns {Promise<Object>} */
  async associatePrecondition(testKey, preconditionKey) {
    const payload = { issueKey: preconditionKey };
    info(`Associando pre-condition ${preconditionKey} ao teste ${testKey}...`);
    return await this.jiraResource.postJiraResource(`test/${testKey}/precondition`, payload);
  }
}

module.exports = JiraLinkManager;
