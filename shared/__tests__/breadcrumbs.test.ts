import {
    pushBreadcrumb,
    popBreadcrumb,
    clearBreadcrumbs,
    getBreadcrumbPath,
    __resetBreadcrumbs,
} from '../breadcrumbs.js';

describe('Breadcrumbs', () => {
    beforeEach(() => {
        __resetBreadcrumbs();
    });

    describe('Breadcrumbs', () => {
        it('returns empty string when no breadcrumbs', () => {
            expect(getBreadcrumbPath()).toBe('');
        });

        it('pushBreadcrumb adds label', () => {
            pushBreadcrumb('RELEASES');

            expect(getBreadcrumbPath()).toBe('RELEASES');
        });

        it('join multiple breadcrumbs with separator', () => {
            pushBreadcrumb('RELEASES');
            pushBreadcrumb('Criar versão');

            expect(getBreadcrumbPath()).toBe('RELEASES > Criar versão');
        });

        it('popBreadcrumb removes last', () => {
            pushBreadcrumb('A');
            pushBreadcrumb('B');
            popBreadcrumb();

            expect(getBreadcrumbPath()).toBe('A');
        });

        it('clearBreadcrumbs resets', () => {
            pushBreadcrumb('A');
            clearBreadcrumbs();

            expect(getBreadcrumbPath()).toBe('');
        });

        it('popBreadcrumb on empty stack does not throw', () => {
            expect(() => popBreadcrumb()).not.toThrow();
        });
    });
});
