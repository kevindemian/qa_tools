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
    const theme = '${t}';
    function apply(t) {
        if (t === 'dark') { document.documentElement.classList.add('dark'); }
        else if (t === 'light') { document.documentElement.classList.remove('dark'); }
        else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { document.documentElement.classList.add('dark'); }
    }
    apply(theme);
})();
const _toggleTheme = function toggleTheme() {
    const html = document.documentElement;
    html.classList.toggle('dark');
    const isDark = html.classList.contains('dark');
    try { localStorage.setItem('${key}', isDark ? 'dark' : 'light'); } catch {/* localStorage unavailable — non-critical */}
};
</script>`;
}

const _ERROR_PAGE_CSS = `
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:40px 20px;background:var(--color-surface-page,#f9fafb);color:var(--color-text-primary,#111827)}
h1{font-size:1.5rem;margin:0;color:var(--color-error,#ef4444)}
.er-msg{margin-top:12px;color:var(--color-text-secondary,#4b5563)}
.er-foot{margin-top:32px;font-size:0.75rem;color:var(--color-text-muted,#6b7280);text-align:center}
html.dark h1{color:var(--color-error,#f87171)}
html.dark .er-msg{color:var(--color-text-secondary,#8b949e)}
html.dark .er-foot{color:var(--color-text-muted,#9ca3af)}
`;

export function buildErrorPage(title: string, label: string): string {
    return buildHtmlPage({
        title,
        styles: _ERROR_PAGE_CSS,
        theme: 'system',
        bodyContent: `<h1>${sanitizeHtml(label || title)}</h1>
            <div class="er-msg">An unexpected error occurred while generating this report.</div>
            <div class="er-foot">QA Tools</div>`,
    });
}
