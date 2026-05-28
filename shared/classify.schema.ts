import { z } from 'zod';

const CLASSIFY_CATEGORIES = ['ASSERTION', 'TIMEOUT', 'ENVIRONMENT', 'FLAKY', 'APPLICATION', 'UNKNOWN'] as const;
const CATEGORY_PATTERN = `^(${CLASSIFY_CATEGORIES.join('|')}):\\s`;

export const ClassifyResponseSchema = z
    .string()
    .regex(new RegExp(CATEGORY_PATTERN), 'Response must be in format: CATEGORY: explanation');

export type ClassifyCategory = (typeof CLASSIFY_CATEGORIES)[number];
