/**
 * Data Hub — Provider types (re-export).
 *
 * All types are defined in shared/types/data-hub.ts.
 * This file re-exports them for provider implementations.
 */
export type {
    RawData,
    RawCoverage,
    RawJiraIssue,
    RawSecurityAlert,
    FetchOptions,
    DataProvider,
} from '../../types/data-hub.js';
