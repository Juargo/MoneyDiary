// Flat config (Expo SDK 53+, ADR-010/ADR-020). Base is eslint-config-expo,
// the framework-idiomatic ruleset (React Native + React), plus Prettier at
// parity with apps/api and apps/web. CommonJS because this workspace is not
// "type": "module".
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactNativeA11y = require('eslint-plugin-react-native-a11y');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  // Accessibility lint (ADR-018 layer 1) — the mobile analog of jsx-a11y in
  // web. eslint-plugin-react-native-a11y v3 only ships legacy (.eslintrc)
  // configs, so register the plugin and spread its `all` ruleset into a flat
  // block by hand. Enforces accessible name/role/state props on RN controls
  // (WCAG 2.2 AA).
  {
    plugins: { 'react-native-a11y': reactNativeA11y },
    rules: {
      ...reactNativeA11y.configs.all.rules,
      // accessibilityHint is OPTIONAL by design (React Native docs, Apple HIG):
      // it should describe a NON-obvious outcome, not echo every label. Forcing
      // it on every labeled control adds screen-reader verbosity that hurts UX.
      // The other 13 `all` rules (valid role/state/props, no-nested-touchables,
      // …) stay strict — the existing code already satisfies them.
      'react-native-a11y/has-accessibility-hint': 'off',
    },
  },
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
