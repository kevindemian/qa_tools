/** Tests for report-scripts — embedded JS functions for HTML reports. */
import { buildToggleScript } from './report-scripts.js';

describe('buildToggleScript', () => {
    it('returns a non-empty script string', async () => {
        const script = buildToggleScript();
        expect(script).toBeTruthy();
        expect(script.length).toBeGreaterThan(50);
    });

    it('wraps content in script tags', async () => {
        const script = buildToggleScript();
        expect(script).toContain('<script>');
        expect(script).toContain('</script>');
    });

    it('includes togglePassed function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function togglePassed');
    });

    it('includes filterTable function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function filterTable');
    });

    it('includes exportCsv function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function exportCsv');
    });

    it('includes switchTab function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function switchTab');
    });

    it('includes toggleTimeline function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function toggleTimeline');
    });

    it('includes scrollToTest function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function scrollToTest');
    });

    it('includes toggleDetail function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function toggleDetail');
    });

    it('includes filterByHierarchy function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function filterByHierarchy');
    });

    it('includes clearHierarchy function', async () => {
        const script = buildToggleScript();
        expect(script).toContain('function clearHierarchy');
    });

    it('includes error truncation click handler', async () => {
        const script = buildToggleScript();
        expect(script).toContain('error-truncated');
        expect(script).toContain('addEventListener');
    });
});
