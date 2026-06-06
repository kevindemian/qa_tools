/**
 * HTML page factory — builds complete HTML pages with CSS variables, theme, and structure.
 *
 * Injects CSS custom properties from design tokens and supports dark/light/system theme.
 *
 * @module html-factory
 */

import { sanitizeHtml } from './escape.js';

export interface HtmlPageParams {
    title: string;
    lang?: string;
    styles: string;
    theme?: string | null;
    themeStorageKey?: string;
    headExtra?: string;
    bodyStart?: string;
    bodyContent: string;
    bodyEnd?: string;
    footer?: string;
}

export function buildHtmlPage(p: HtmlPageParams): string {
    const lang = p.lang || 'en';
    const themeScript = p.theme != null ? buildThemeScript(p.theme, p.themeStorageKey) : '';

    let head = '<meta charset="UTF-8">';
    head += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
    head += `<title>${sanitizeHtml(p.title)}</title>`;
    head += `<style>${p.styles}</style>`;
    head += p.headExtra || '';
    head += themeScript;

    let body = p.bodyStart || '';
    body += p.bodyContent;
    if (p.footer) {
        body += `<div class="footer">${p.footer}</div>`;
    }
    body += p.bodyEnd || '';

    return `<!DOCTYPE html><html lang="${lang}"><head>${head}</head><body>${body}</body></html>`;
}

export function buildThemeScript(theme?: string, storageKey?: string): string {
    const t = theme || 'system';
    const key = storageKey || 'qa-theme';
    return `<script id="qa-report-theme">
(function() {
    var theme = '${t}';
    function apply(t) {
        if (t === 'dark') { document.documentElement.classList.add('dark'); }
        else if (t === 'light') { document.documentElement.classList.remove('dark'); }
        else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { document.documentElement.classList.add('dark'); }
    }
    apply(theme);
})();
var _toggleTheme = function toggleTheme() {
    var html = document.documentElement;
    html.classList.toggle('dark');
    var isDark = html.classList.contains('dark');
    try { localStorage.setItem('${key}', isDark ? 'dark' : 'light'); } catch(e) { if (typeof console !== 'undefined') console.warn('Theme persistence failed:', e); }
};
</script>`;
}

export function buildErrorPage(title: string, label: string): string {
    return `<!DOCTYPE html><html><body><h1>${label || title}</h1></body></html>`;
}
