/**
 * Icon System — SVG inline icons via Lucide.
 *
 * Each icon is a function returning an SVG string suitable for HTML embedding.
 * Uses lucide npm package with tree-shaking — only imported icons are bundled.
 *
 * @module icons
 */
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    RefreshCw,
    BarChart2,
    TrendingUp,
    Clock,
    Lock,
    Lightbulb,
    Settings,
    Shield,
    BookOpen,
    FileText,
    Search,
    Cpu,
    Info,
    HelpCircle,
    Edit,
    Calendar,
    Package,
    SkipForward,
    Circle,
    Moon,
    ChevronRight,
    ArrowUpDown,
    Link,
} from 'lucide';

/** Lucide icon path data: array of [tagName, attributes] tuples. */
type IconPaths = Array<[string, Record<string, string | number>]>;

const ICON_MAP: Record<string, IconPaths> = {
    'check-circle': CheckCircle as unknown as IconPaths,
    'x-circle': XCircle as unknown as IconPaths,
    'alert-triangle': AlertTriangle as unknown as IconPaths,
    'refresh-cw': RefreshCw as unknown as IconPaths,
    'bar-chart': BarChart2 as unknown as IconPaths,
    'trending-up': TrendingUp as unknown as IconPaths,
    clock: Clock as unknown as IconPaths,
    lock: Lock as unknown as IconPaths,
    lightbulb: Lightbulb as unknown as IconPaths,
    settings: Settings as unknown as IconPaths,
    shield: Shield as unknown as IconPaths,
    'book-open': BookOpen as unknown as IconPaths,
    'file-text': FileText as unknown as IconPaths,
    search: Search as unknown as IconPaths,
    cpu: Cpu as unknown as IconPaths,
    info: Info as unknown as IconPaths,
    'help-circle': HelpCircle as unknown as IconPaths,
    edit: Edit as unknown as IconPaths,
    calendar: Calendar as unknown as IconPaths,
    package: Package as unknown as IconPaths,
    'skip-forward': SkipForward as unknown as IconPaths,
    circle: Circle as unknown as IconPaths,
    moon: Moon as unknown as IconPaths,
    'chevron-right': ChevronRight as unknown as IconPaths,
    'arrow-up-down': ArrowUpDown as unknown as IconPaths,
    link: Link as unknown as IconPaths,
};

export type IconName = keyof typeof ICON_MAP;

const ATTR_MAP: Record<string, string> = {
    class: 'class',
    xmlns: 'xmlns',
    viewBox: 'viewBox',
    fill: 'fill',
    stroke: 'stroke',
    'stroke-width': 'stroke-width',
    'stroke-linecap': 'stroke-linecap',
    'stroke-linejoin': 'stroke-linejoin',
    width: 'width',
    height: 'height',
};

/**
 * Convert a Lucide icon to an inline SVG string.
 *
 * @param name - Icon name from the ICON_MAP.
 * @param size - Icon size in pixels (default: 16).
 * @param ariaLabel - Optional aria-label for accessibility.
 * @returns SVG string, or empty string if icon name is invalid.
 */
export function icon(name: IconName, size: number = 16, ariaLabel?: string): string {
    const paths = ICON_MAP[name];
    if (!paths) return '';

    const attrs = [
        `xmlns="http://www.w3.org/2000/svg"`,
        `width="${size}"`,
        `height="${size}"`,
        `viewBox="0 0 24 24"`,
        `fill="none"`,
        `stroke="currentColor"`,
        `stroke-width="2"`,
        `stroke-linecap="round"`,
        `stroke-linejoin="round"`,
        `data-component="icon"`,
        `data-icon="${name}"`,
        ariaLabel ? `aria-label="${escapeAttr(ariaLabel)}"` : '',
        `role="img"`,
    ]
        .filter(Boolean)
        .join(' ');

    const children = paths
        .map(([tag, attrs]) => {
            const attrStr = Object.entries(attrs)
                .map(([k, v]) => {
                    const attrName = ATTR_MAP[k] ?? k;
                    return `${attrName}="${escapeAttr(String(v))}"`;
                })
                .join(' ');
            return `<${tag} ${attrStr}/>`;
        })
        .join('');

    return `<svg ${attrs}>${children}</svg>`;
}

/**
 * Get the list of all available icon names.
 */
export function availableIcons(): IconName[] {
    return Object.keys(ICON_MAP);
}

function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
