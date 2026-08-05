import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // `_`-prefix = intencionalmente sin usar (convención del repo, ej.
      // `const { archivo: _omitido, ...rest }`); `ignoreRestSiblings` habilita
      // el patrón rest-omit de destructuring sin marcar el sibling descartado.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // TanStack Router (file-based routing) OBLIGA a `export const Route` junto
    // al componente de ruta — react-refresh marca ese export no-componente en
    // CADA route file. El HMR de rutas lo maneja el propio router, así que la
    // regla no aplica acá: se apaga para `src/routes/**` (mismo tratamiento que
    // el override de shadcn abajo).
    files: ['src/routes/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // shadcn/ui-generated primitives (`npx shadcn add`) — vendored, not
    // hand-authored. They commonly co-export a `cva` variants function
    // alongside the component (e.g. `badgeVariants` in badge.tsx), which
    // react-refresh's only-export-components rule flags; regenerating the
    // file on a future `shadcn add` would reintroduce the same shape.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Prettier as an ESLint rule (parity with apps/api, ADR-020). Runs LAST so
  // eslint-config-prettier turns off conflicting stylistic rules and the
  // `prettier/prettier` rule wins. `endOfLine: 'auto'` mirrors apps/api so
  // line endings don't fail the gate across platforms. Enforced by the CI
  // ESLint gate; the generated routeTree.gen.ts is untouched (it ships an
  // /* eslint-disable */ header, so this rule doesn't apply there).
  eslintPluginPrettierRecommended,
  {
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
]);
