/**
 * shared/icons.ts — Testes robustos.
 *
 * Testa a geração de SVG inline para todos os 22 ícones.
 * Fluxo real — zero mocks internos.
 */
import { describe, it, expect } from 'vitest';
import { icon, availableIcons } from '../icons.js';

describe('Icon', () => {
    describe('All 22 icons generate valid SVG', () => {
        it.each(availableIcons())('icon("%s") returns valid SVG', (name) => {
            expect.hasAssertions();

            const svg = icon(name);

            expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
            expect(svg).toContain('viewBox="0 0 24 24"');
            expect(svg).toContain('data-component="icon"');
            expect(svg).toContain(`data-icon="${name}"`);
            expect(svg).toContain('role="img"');
            expect(svg).toContain('<svg');
            expect(svg).toContain('</svg>');
        });
    });

    describe('Size parameter', () => {
        it('default size is 16', () => {
            expect.hasAssertions();

            const svg = icon('check-circle');

            expect(svg).toContain('width="16"');
            expect(svg).toContain('height="16"');
        });

        it('custom size', () => {
            expect.hasAssertions();

            const svg = icon('check-circle', 32);

            expect(svg).toContain('width="32"');
            expect(svg).toContain('height="32"');
        });
    });

    describe('Accessibility', () => {
        it('aria-label added when provided', () => {
            expect.hasAssertions();

            const svg = icon('check-circle', 16, 'Passed');

            expect(svg).toContain('aria-label="Passed"');
        });

        it('no aria-label when not provided', () => {
            expect.hasAssertions();

            const svg = icon('check-circle');

            expect(svg).not.toContain('aria-label');
        });
    });

    describe('Negative cases', () => {
        it('invalid icon name returns empty string', () => {
            expect.hasAssertions();

            const svg = icon('nonexistent-icon');

            expect(svg).toBe('');
        });

        it('empty string name returns empty string', () => {
            expect.hasAssertions();

            const svg = icon('');

            expect(svg).toBe('');
        });
    });

    describe('AvailableIcons', () => {
        it('returns array of 22 icon names', () => {
            expect.hasAssertions();

            const names = availableIcons();

            expect(names).toHaveLength(22);
        });

        it('all returned names produce valid SVG', () => {
            expect.hasAssertions();

            for (const name of availableIcons()) {
                expect(icon(name).length).toBeGreaterThan(0);
            }
        });
    });
});
