import { z } from 'zod';

const CLASSIFY_CATEGORIES = ['ASSERTION', 'TIMEOUT', 'ENVIRONMENT', 'FLAKY', 'APPLICATION', 'UNKNOWN'] as const;
const CATEGORY_SET = new Set(CLASSIFY_CATEGORIES);

export const ClassifyResponseSchema = z.string().refine((val) => {
    const colonIdx = val.indexOf(':');
    if (colonIdx < 0) return false;
    const category = val.slice(0, colonIdx).trim();
    return CATEGORY_SET.has(category as (typeof CLASSIFY_CATEGORIES)[number]);
}, 'Response must be in format: CATEGORY: explanation');
