const CsvResource = require('./csv_resource');

describe('CsvResource', () => {
  let csvResource;

  beforeEach(() => {
    csvResource = new CsvResource();
  });

  describe('parseDescription', () => {
    it('extracts description from Description: header', () => {
      const lines = ['Title: Test', 'Description: Verifica feature Y', 'Action,Data,Expected'];
      expect(csvResource.parseDescription(lines)).toBe('Verifica feature Y');
    });

    it('returns empty string when no Description header', () => {
      const lines = ['Title: Test', 'Action,Data,Expected'];
      expect(csvResource.parseDescription(lines)).toBe('');
    });

    it('handles multiline descriptions', () => {
      const lines = ['Title: Test', 'Description: Line 1\\nLine 2', 'Action,Data,Expected'];
      expect(csvResource.parseDescription(lines)).toBe('Line 1\\nLine 2');
    });
  });

  describe('parsePrecondition', () => {
    it('detects reference type for Jira keys', () => {
      const lines = ['Title: Test', 'Pre-condition: ECSPOL-PRE-42', 'Action,Data,Expected'];
      expect(csvResource.parsePrecondition(lines)).toEqual({
        type: 'reference',
        value: 'ECSPOL-PRE-42'
      });
    });

    it('detects inline type for plain text', () => {
      const lines = ['Title: Test', 'Pre-condition: User must be logged in', 'Action,Data,Expected'];
      expect(csvResource.parsePrecondition(lines)).toEqual({
        type: 'inline',
        value: 'User must be logged in'
      });
    });

    it('returns null when no Pre-condition header', () => {
      const lines = ['Title: Test', 'Action,Data,Expected'];
      expect(csvResource.parsePrecondition(lines)).toBeNull();
    });
  });

  describe('parseGroup', () => {
    it('extracts group from Group: header', () => {
      const lines = ['Title: Test', 'Group: LOGIN-FLOW', 'Action,Data,Expected'];
      expect(csvResource.parseGroup(lines)).toBe('LOGIN-FLOW');
    });

    it('returns null when no Group: header', () => {
      const lines = ['Title: Test', 'Action,Data,Expected'];
      expect(csvResource.parseGroup(lines)).toBeNull();
    });

    it('returns null for whitespace-only Group:', () => {
      const lines = ['Title: Test', 'Group:   ', 'Action,Data,Expected'];
      expect(csvResource.parseGroup(lines)).toBeNull();
    });
  });

  describe('parseLinkedIssues', () => {
    it('parses single linked issue', () => {
      const lines = ['Title: Test', 'Linked Issues: ECSPOL-100 (is tested by)', 'Action,Data,Expected'];
      expect(csvResource.parseLinkedIssues(lines)).toEqual([
        { key: 'ECSPOL-100', linkType: 'is tested by' }
      ]);
    });

    it('parses multiple linked issues', () => {
      const lines = ['Title: Test', 'Linked Issues: ECSPOL-100 (is tested by), ECSPOL-200 (relates to)'];
      expect(csvResource.parseLinkedIssues(lines)).toEqual([
        { key: 'ECSPOL-100', linkType: 'is tested by' },
        { key: 'ECSPOL-200', linkType: 'relates to' }
      ]);
    });

    it('returns empty array when no Linked Issues header', () => {
      const lines = ['Title: Test', 'Action,Data,Expected'];
      expect(csvResource.parseLinkedIssues(lines)).toEqual([]);
    });
  });
});
