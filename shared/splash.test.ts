import { buildSplashLines } from './splash';

describe('buildSplashLines', () => {
    it('formats logo lines with help hint', () => {
        const lines = buildSplashLines('QA TOOLS\n======');
        const output = lines.join('\n');
        expect(output).toContain('QA TOOLS');
        expect(output).toContain('/help');
        expect(output).toContain('Gestão');
    });

    it('includes statePath when provided', () => {
        const lines = buildSplashLines('QA TOOLS', '/path/to/state.json');
        const output = lines.join('\n');
        expect(output).toContain('/path/to/state.json');
    });

    it('omits statePath when not provided', () => {
        const lines = buildSplashLines('QA TOOLS');
        const output = lines.join('\n');
        expect(output).not.toContain('State:');
    });

    it('handles empty logo gracefully', () => {
        const lines = buildSplashLines('');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0]).toBe('');
    });

    it('skips blank logo lines', () => {
        const lines = buildSplashLines('\n\n');
        const output = lines.join('\n');
        expect(output).toContain('Gestão');
    });
});
