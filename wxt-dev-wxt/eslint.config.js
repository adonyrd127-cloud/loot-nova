import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Base JS rules
  eslint.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // Disable rules that conflict with Prettier
  prettier,

  // React Hooks
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Project-specific overrides
  {
    rules: {
      // Allow unused vars starting with _ (intentional discard pattern)
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],

      // Allow explicit `any` — used heavily in DOM scraping and API responses
      '@typescript-eslint/no-explicit-any': 'off',

      // Allow empty catch blocks (common in graceful fallbacks)
      'no-empty': ['error', { allowEmpty: true }],
      '@typescript-eslint/no-empty-function': 'off',

      // Allow non-null assertions (common in DOM queries)
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Require explicit return types only on exported functions
      '@typescript-eslint/explicit-function-return-type': 'off',

      // Allow console (we use it for logging throughout content scripts)
      'no-console': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.wxt/**',
      '*.config.ts',
      'scratch/**',
    ],
  },
);
