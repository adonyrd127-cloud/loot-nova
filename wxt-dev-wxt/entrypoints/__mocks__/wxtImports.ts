/**
 * Mock for WXT's `#imports` virtual module.
 * Used by Vitest to avoid "Cannot find module #imports" errors.
 */

export const storage = {
    getItem: async (_key: string) => null,
    setItem: async (_key: string, _value: any) => {},
    removeItem: async (_key: string) => {},
};

// WXT auto-imports — provide no-ops for testing
export function defineBackground(_opts: any) { return _opts; }
export function defineContentScript(_opts: any) { return _opts; }
