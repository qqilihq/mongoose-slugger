import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginVitest from '@vitest/eslint-plugin';
// includes eslint-config-prettier, so that does not need to be listed separately
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default defineConfig(
  {
    // compiled output; not source
    ignores: ['dist/**', 'coverage/**']
  },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  eslintPluginN.configs['flat/recommended'],
  eslintPluginPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // warn when using APIs marked @deprecated in their JSDoc -- this package
      // supports three Mongoose majors, so deprecations are worth surfacing
      '@typescript-eslint/no-deprecated': 'warn',

      // '@typescript-eslint/interface-name-prefix': [ 2, { prefixWithI: 'always' } ],
      // probably re-enable these later
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // not part of eslint-plugin-n's recommended set, but cheap to keep honest
      'n/prefer-node-protocol': 'error',

      // TypeScript resolves these imports (extensionless, and `.ts` once this
      // package moves to ESM); the rule resolves them the way Node would and
      // reports every one. `lint:types` already proves each import resolves.
      'n/no-missing-import': 'off'
    }
  },
  {
    files: ['**/*.test.ts'],
    plugins: { vitest: eslintPluginVitest },
    rules: eslintPluginVitest.configs.recommended.rules
  },
  {
    // this file is not part of any tsconfig, so type-aware rules cannot apply
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      // `engines.node` is the floor for consumers of the published package.
      // Config files are neither published nor run by them -- they run on the
      // version pinned in `devEngines.runtime` -- so they may use newer APIs.
      'n/no-unsupported-features/node-builtins': 'off'
    }
  }
);
