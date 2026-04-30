/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['entrypoints/**/*.test.ts'],
        // Mock WXT-specific modules that don't exist outside the build
        alias: {
            '#imports': path.resolve(__dirname, 'entrypoints/__mocks__/wxtImports.ts'),
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
});
