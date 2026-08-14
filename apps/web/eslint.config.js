import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
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
  // eslint-plugin-jsx-a11y (US-042 binding decision 4, design.md §1/Q7a):
  // installed but deliberately NOT app-wide at `error` — that would make
  // this change absorb the app's entire pre-existing a11y debt. App-wide
  // WARN starts the ADR-018 burn-down without blocking; `pnpm web lint` is
  // `eslint .` with no `--max-warnings`, so `warn` cannot fail CI. The
  // severity is DERIVED from the plugin's own rule list (not hand-listed) so
  // it stays in sync across plugin upgrades — if a future version ships a
  // `warn` preset, replace this derivation with it.
  {
    files: ['**/*.tsx'],
    extends: [jsxA11y.flatConfigs.recommended],
    rules: Object.fromEntries(
      Object.entries(jsxA11y.flatConfigs.recommended.rules).map(
        ([regla, valor]) => {
          const [severidad, ...opciones] = Array.isArray(valor)
            ? valor
            : [valor];
          return [regla, severidad === 'off' ? 'off' : ['warn', ...opciones]];
        },
      ),
    ),
  },
  // Scoped ERROR — the files this change (and its PR #1b/#2 follow-ups)
  // author. Globs the DIRECTORY, not individual files, so a component added
  // here later is gated automatically. The route-file entry is a PATTERN
  // (US-043 design.md D-10), not a single filename: `configuracion*.tsx`
  // covers `configuracion.tsx`, `configuracion.index.tsx`,
  // `configuracion.categorias.tsx` and
  // `configuracion_.categorias.$categoriaId.tsx` — every route file the
  // Categorías shell introduces, gated BEFORE any of them is authored so the
  // a11y rules are never blind to code being written under them.
  {
    files: [
      'src/components/configuracion/**/*.tsx',
      'src/routes/_authenticated/configuracion*.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
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
