import { jest } from '@jest/globals';
import type Config from '../config-accessor';
import type { StateSchema } from '../types';

export const migrateOldState = jest.fn<(config?: Config) => void>();

export const getStatePath = jest.fn<(config?: Config) => string>().mockReturnValue('/mock/state.json');

export const loadTypedState = jest.fn<(config?: Config) => StateSchema>(() => ({}));

export const load = jest.fn<(config?: Config) => Record<string, unknown>>().mockReturnValue({});

export const save = jest.fn<(state: Record<string, unknown>, config?: Config) => void>();

export const update = jest.fn(
    (fn: (state: Record<string, unknown>) => void, _config?: Config): Record<string, unknown> => {
        const copy: Record<string, unknown> = {};
        fn(copy);
        return copy;
    },
);
