/** Tests for report-scripts — embedded JS functions for HTML reports. */
import { buildToggleScript } from './report-scripts.js';

describe('buildToggleScript', () => {
    it('returns a non-empty script string', () => {
        const script = buildToggleScript();
        expect(script).toBeTruthy();
        expect(script.length).toBeGreaterThan(50);
    });

    it('wraps content in script tags', () => {
        const script = buildToggleScript();
        expect(script).toContain('<script>');
        expect(script).toContain('</script>');
    });

    it('includes togglePassed function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function togglePassed');
    });

    it('includes filterTable function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function filterTable');
    });

    it('includes exportCsv function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function exportCsv');
    });

    it('includes switchTab function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function switchTab');
    });

    it('includes toggleTimeline function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function toggleTimeline');
    });

    it('includes scrollToTest function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function scrollToTest');
    });

    it('includes toggleDetail function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function toggleDetail');
    });

    it('includes filterByHierarchy function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function filterByHierarchy');
    });

    it('includes clearHierarchy function', () => {
        const script = buildToggleScript();
        expect(script).toContain('function clearHierarchy');
    });

    it('includes error truncation click handler', () => {
        const script = buildToggleScript();
        expect(script).toContain('error-truncated');
        expect(script).toContain('addEventListener');
    });
});
