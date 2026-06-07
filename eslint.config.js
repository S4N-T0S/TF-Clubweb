import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  // 1. Global ignores
  { ignores: ['dist'] },

  // 2. Add recommended base configuration from ESLint
  js.configs.recommended,

  // 3. Add recommended configurations from plugins
  // Note: Most modern plugins export flat-config-ready objects.
  react.configs.flat.recommended, 
  react.configs.flat['jsx-runtime'],
  { settings: { react: { version: 'detect' } } },

  // 4. Custom configuration object with overrides
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      // We still need to declare the plugins we are using in this config object
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Override or add your specific rules here.
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all', // Good practice: also ignore caught errors like catch (_err)
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Add other rules from plugins or your own preferences
      // Classic React Hooks rules (matches eslint-plugin-react-hooks v5 behavior).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/jsx-no-target-blank': 'off',
      'react/prop-types': 'off',
    },
  },

  // 5. Node-environment build/data scripts (not part of the browser bundle)
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];