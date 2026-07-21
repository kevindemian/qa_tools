# Research Brief: Gold Standard HTML Report Design

**Date:** 2026-07-20
**Question:** What is the current gold standard for modern, professional HTML report design with responsive layout across multiple screen sizes? What CSS/design patterns should be used for static HTML reports (no JS framework dependency)?

**Scope:**
- IN: Visual design patterns, CSS architecture, responsive techniques, typography, color systems, accessibility for static HTML reports
- IN: Case studies of well-designed reports (Stryker, Allure, SonarQube, custom dashboards)
- OUT: React/Vue component libraries (not applicable — static HTML)
- OUT: JavaScript-heavy SPA frameworks (not applicable — offline/proxy environments)

**Assumptions:**
- Reports are generated server-side as static HTML files
- Must work offline (no CDN, no external dependencies at runtime)
- Target: corporate environments with proxy/VPN restrictions
- Language: Portuguese (Brazilian) for user-facing text

**Depth:** standard

## Angles

1. **Modern HTML report design patterns** — What do the best reports look like in 2025-2026? Layout structures, card-based designs, data visualization patterns
2. **Responsive CSS for static HTML** — How to achieve responsive design without JavaScript frameworks? Media queries, container queries, fluid typography
3. **CSS design systems for reports** — Color tokens, typography scales, spacing systems, dark mode support
4. **Accessibility in static HTML** — WCAG AA compliance, semantic HTML, keyboard navigation, screen reader support
5. **Performance optimization** — Inline CSS vs external, critical CSS, print styles, lazy loading images
