/** Markdown navigation sidebar types for HTML output.
 * @module Interfaces for prev/next page navigation in generated documentation HTML. */

/** A link in the navigation bar (prev/next). */
export interface NavLink {
    label: string;
    file: string;
}

/** Navigation configuration for prev/next links in HTML output. */
export interface NavConfig {
    prev?: NavLink;
    next?: NavLink;
}
