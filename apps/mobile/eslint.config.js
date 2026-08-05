// Flat config (Expo SDK 53+, ADR-010/ADR-020). Base is eslint-config-expo,
// the framework-idiomatic ruleset (React Native + React), plus Prettier at
// parity with apps/api and apps/web. CommonJS because this workspace is not
// "type": "module".
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  // Prettier as an ESLint rule (parity, ADR-020). Runs after expoConfig so
  // eslint-config-prettier disables conflicting stylistic rules. `.prettierrc`
  // (singleQuote, trailingComma: all) mirrors the other workspaces;
  // endOfLine: 'auto' avoids cross-platform failures. Enforced by the CI gate.
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    ignores: ['dist/*', '.expo/*', 'expo-env.d.ts'],
  },
]);
