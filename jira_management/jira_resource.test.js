const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');

jest.mock('axios');

describe('JiraResource', () => {
  let jiraResource;

  beforeEach(() => {
    jiraResource = new JiraResource('fake-token', 'https://jira.test.com/rest/api/2');
  });

  describe('constructor', () => {
    it('creates instance without link-related state', () => {
      expect(jiraResource.linkTypesCache).toBeUndefined();
      expect(jiraResource.cacheFilePath).toBeUndefined();
    });
  });
});

describe('JiraLinkManager', () => {
  let linkManager;
  let mockJiraResource;

  beforeEach(() => {
    mockJiraResource = {
      getJiraResource: jest.fn(),
      postJiraResource: jest.fn()
    };
    linkManager = new JiraLinkManager(mockJiraResource);
    linkManager.linkTypesCache = null;
    linkManager.cacheFilePath = '/tmp/test-cache.json';
  });

  describe('getIssueLinkTypes', () => {
    it('returns fallback link types when API call fails', async () => {
      mockJiraResource.getJiraResource.mockRejectedValue(new Error('Network error'));

      const types = await linkManager.getIssueLinkTypes();
      expect(types).toBeDefined();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
    });

    it('returns API result when available', async () => {
      const apiResult = {
        issueLinkTypes: [
          { id: '10000', name: 'Custom Link', inward: 'is linked to', outward: 'links' }
        ]
      };
      mockJiraResource.getJiraResource.mockResolvedValue(apiResult);

      const types = await linkManager.getIssueLinkTypes();
      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('Custom Link');
    });
  });

  describe('resolveLinkTypeId', () => {
    it('matches by name', async () => {
      jest.spyOn(linkManager, 'getIssueLinkTypes').mockResolvedValue([
        { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }
      ]);

      const id = await linkManager.resolveLinkTypeId('Tests');
      expect(id).toBe('10201');
    });

    it('matches by inward description', async () => {
      jest.spyOn(linkManager, 'getIssueLinkTypes').mockResolvedValue([
        { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }
      ]);

      const id = await linkManager.resolveLinkTypeId('is tested by');
      expect(id).toBe('10201');
    });

    it('is case insensitive', async () => {
      jest.spyOn(linkManager, 'getIssueLinkTypes').mockResolvedValue([
        { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }
      ]);

      const id = await linkManager.resolveLinkTypeId('IS TESTED BY');
      expect(id).toBe('10201');
    });

    it('falls back to relates to for unknown types', async () => {
      jest.spyOn(linkManager, 'getIssueLinkTypes').mockResolvedValue([]);

      const id = await linkManager.resolveLinkTypeId('nonexistent');
      expect(id).toBe('11701');
    });
  });
});
