/** Tests for report-scripts — embedded JS functions for HTML reports. */
import { buildToggleScript } from '../report/report-scripts.js';

describe('BuildToggleScript', () => {
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

    it.each([
        { label: 'togglePassed', expected: 'function togglePassed' },
        { label: 'filterTable', expected: 'function filterTable' },
        { label: 'exportCsv', expected: 'function exportCsv' },
        { label: 'switchTab', expected: 'function switchTab' },
        { label: 'toggleTimeline', expected: 'function toggleTimeline' },
        { label: 'scrollToTest', expected: 'function scrollToTest' },
        { label: 'toggleDetail', expected: 'function toggleDetail' },
        { label: 'filterByHierarchy', expected: 'function filterByHierarchy' },
        { label: 'clearHierarchy', expected: 'function clearHierarchy' },
    ])('includes $label function', ({ expected }) => {
        expect.hasAssertions();

        const script = buildToggleScript();

        expect(script).toContain(expected);
    });

    it('includes error truncation click handler', () => {
        const script = buildToggleScript();

        expect(script).toContain('error-truncated');
        expect(script).toContain('addEventListener');
    });
});
