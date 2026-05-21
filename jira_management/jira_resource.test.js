const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');

jest.mock('axios', () => {
    const mockInstance = {
        interceptors: {
            request: { use: jest.fn() },
            response: { use: jest.fn() },
        },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
    };
    return { create: jest.fn(() => mockInstance) };
});

describe('JiraLinkManager', () => {
  let linkManager;
  let mockJiraResource;

  beforeEach(() => {
    mockJiraResource = {
      getJiraResource: jest.fn(),
      postJiraResource: jest.fn(),
      putJiraResource: jest.fn(),
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

  describe('createIssueLink', () => {
    it('posts correct issueLink payload', async () => {
      jest.spyOn(linkManager, 'resolveLinkTypeId').mockResolvedValue('10201');
      mockJiraResource.postJiraResource.mockResolvedValue({});

      await linkManager.createIssueLink('TEST-1', 'TEST-2', 'Tests');

      expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issueLink', {
        type: { id: '10201' },
        inwardIssue: { key: 'TEST-2' },
        outwardIssue: { key: 'TEST-1' }
      });
    });

    it('throws when post fails', async () => {
      jest.spyOn(linkManager, 'resolveLinkTypeId').mockResolvedValue('10201');
      mockJiraResource.postJiraResource.mockRejectedValue(new Error('API error'));

      await expect(linkManager.createIssueLink('TEST-1', 'TEST-2', 'Tests'))
        .rejects.toThrow('API error');
    });
  });

  describe('linkIssues', () => {
    it('links all provided issues', async () => {
      jest.spyOn(linkManager, 'resolveLinkTypeId').mockResolvedValue('10201');
      mockJiraResource.postJiraResource.mockResolvedValue({});

      await linkManager.linkIssues('TEST-1', [
        { key: 'TEST-2', linkType: 'Tests' },
        { key: 'TEST-3', linkType: 'Tests' },
      ]);

      expect(mockJiraResource.postJiraResource).toHaveBeenCalledTimes(2);
      expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issueLink', {
        type: { id: '10201' },
        inwardIssue: { key: 'TEST-1' },
        outwardIssue: { key: 'TEST-2' }
      });
    });

    it('does nothing for empty array', async () => {
      await linkManager.linkIssues('TEST-1', []);
      expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
    });
  });

  describe('_getPreconditionFieldId', () => {
    it('discovers field from API', async () => {
      mockJiraResource.getJiraResource.mockResolvedValue([
        { id: 'customfield_13715', name: 'testexec-tests', schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' } },
        { id: 'customfield_13708', name: 'test-precondition', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
      ]);

      const id = await linkManager._getPreconditionFieldId();
      expect(id).toBe('customfield_13708');
    });

    it('caches result after first call', async () => {
      mockJiraResource.getJiraResource.mockResolvedValue([
        { id: 'customfield_13708', name: 'test-precondition', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
      ]);

      await linkManager._getPreconditionFieldId();
      await linkManager._getPreconditionFieldId();

      expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
    });

    it('falls back to customfield_13708 when API fails', async () => {
      mockJiraResource.getJiraResource.mockRejectedValue(new Error('API error'));

      const id = await linkManager._getPreconditionFieldId();
      expect(id).toBe('customfield_13708');
    });
  });

  describe('associatePrecondition', () => {
    it('appends key to existing array', async () => {
      jest.spyOn(linkManager, '_getPreconditionFieldId').mockResolvedValue('customfield_13708');
      mockJiraResource.getJiraResource.mockResolvedValue({
        fields: { customfield_13708: ['PRE-1'] }
      });
      mockJiraResource.putJiraResource.mockResolvedValue({});

      await linkManager.associatePrecondition('TEST-1', 'PRE-2');

      expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', {
        fields: { customfield_13708: ['PRE-1', 'PRE-2'] }
      });
    });

    it('creates array when field is empty', async () => {
      jest.spyOn(linkManager, '_getPreconditionFieldId').mockResolvedValue('customfield_13708');
      mockJiraResource.getJiraResource.mockResolvedValue({
        fields: { customfield_13708: [] }
      });
      mockJiraResource.putJiraResource.mockResolvedValue({});

      await linkManager.associatePrecondition('TEST-1', 'PRE-1');

      expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', {
        fields: { customfield_13708: ['PRE-1'] }
      });
    });
  });
});

describe('moveCardsToDone', () => {
  let jiraResource;

  beforeEach(() => {
    jiraResource = new JiraResource('token', 'http://jira');
    jiraResource.getJiraResource = jest.fn();
    jiraResource.postJiraResource = jest.fn();
    jiraResource.transitionIssue = jest.fn();
  });

  it('moves single task from New through workflow', async () => {
    jiraResource.getJiraResource
      .mockResolvedValueOnce({ fields: { status: { name: 'New' } } })
      .mockResolvedValueOnce({ transitions: [{ id: 31, to: { name: 'approve' } }, { id: 41, to: { name: 'use test case' } }] });

    await jiraResource.moveCardsToDone(['TASK-1']);

    expect(jiraResource.transitionIssue).toHaveBeenCalledTimes(2);
    expect(jiraResource.transitionIssue).toHaveBeenNthCalledWith(1, 'TASK-1', 31);
    expect(jiraResource.transitionIssue).toHaveBeenNthCalledWith(2, 'TASK-1', 41);
  });

  it('skips task when status fetch returns null', async () => {
    jiraResource.getJiraResource.mockResolvedValue(null);

    await jiraResource.moveCardsToDone(['TASK-1']);

    expect(jiraResource.transitionIssue).not.toHaveBeenCalled();
  });

  it('skips task when status is not in workflowMap', async () => {
    jiraResource.getJiraResource
      .mockResolvedValueOnce({ fields: { status: { name: 'Unknown Status' } } });

    await jiraResource.moveCardsToDone(['TASK-1']);

    expect(jiraResource.transitionIssue).not.toHaveBeenCalled();
  });

  it('reuses transitionsMap after resolving for first task', async () => {
    jiraResource.getJiraResource
      .mockResolvedValueOnce({ fields: { status: { name: 'New' } } })
      .mockResolvedValueOnce({ transitions: [{ id: 31, to: { name: 'approve' } }] })
      .mockResolvedValueOnce({ fields: { status: { name: 'New' } } });

    await jiraResource.moveCardsToDone(['TASK-1', 'TASK-2']);

    expect(jiraResource.getJiraResource).toHaveBeenCalledTimes(3);
    expect(jiraResource.transitionIssue).toHaveBeenCalledTimes(2);
  });

  it('handles API error during transition gracefully', async () => {
    jiraResource.getJiraResource
      .mockResolvedValueOnce({ fields: { status: { name: 'New' } } })
      .mockResolvedValueOnce({ transitions: [{ id: 31, to: { name: 'approve' } }] });
    jiraResource.transitionIssue.mockRejectedValue(new Error('API error'));

    await expect(jiraResource.moveCardsToDone(['TASK-1'])).resolves.not.toThrow();
    expect(jiraResource.transitionIssue).toHaveBeenCalledTimes(1);
  });

  it('skips only the failed task when transitions not found (continue not return)', async () => {
    jiraResource.getJiraResource
      .mockResolvedValueOnce({ fields: { status: { name: 'New' } } })
      .mockResolvedValueOnce({ transitions: [] })
      .mockResolvedValueOnce({ fields: { status: { name: 'New' } } })
      .mockResolvedValueOnce({ transitions: [{ id: 31, to: { name: 'approve' } }] });

    await jiraResource.moveCardsToDone(['TASK-1', 'TASK-2']);

    expect(jiraResource.transitionIssue).toHaveBeenCalledTimes(1);
    expect(jiraResource.transitionIssue).toHaveBeenCalledWith('TASK-2', 31);
  });
});
