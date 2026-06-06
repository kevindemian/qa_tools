import {
    pushBreadcrumb,
    popBreadcrumb,
    clearBreadcrumbs,
    getBreadcrumbPath,
    __resetBreadcrumbs,
} from './breadcrumbs.js';

beforeEach(() => {
    __resetBreadcrumbs();
});

describe('breadcrumbs', () => {
    it('returns empty string when no breadcrumbs', async () => {
        expect(getBreadcrumbPath()).toBe('');
    });

    it('pushBreadcrumb adds label', async () => {
        pushBreadcrumb('RELEASES');
        expect(getBreadcrumbPath()).toBe('RELEASES');
    });

    it('join multiple breadcrumbs with separator', async () => {
        pushBreadcrumb('RELEASES');
        pushBreadcrumb('Criar versão');
        expect(getBreadcrumbPath()).toBe('RELEASES > Criar versão');
    });

    it('popBreadcrumb removes last', async () => {
        pushBreadcrumb('A');
        pushBreadcrumb('B');
        popBreadcrumb();
        expect(getBreadcrumbPath()).toBe('A');
    });

    it('clearBreadcrumbs resets', async () => {
        pushBreadcrumb('A');
        clearBreadcrumbs();
        expect(getBreadcrumbPath()).toBe('');
    });

    it('popBreadcrumb on empty stack does not throw', async () => {
        expect(() => popBreadcrumb()).not.toThrow();
    });
});
