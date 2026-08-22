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
  // Scoped ERROR — US-047 (design D-10, WG5-12). Unlike the `configuracion`
  // block above, this is a FILE LIST, not a directory glob: the components
  // this change touches (`DistribucionPie`, `LeyendaGasto`, `SemaforoBadge`,
  // `SemaforoTag`, `ResumenScreen`) are loose siblings directly under
  // `src/components/`, not their own subdirectory — globbing
  // `src/components/**` here would make this US absorb the app's entire
  // pre-existing a11y debt (the exact blast radius the app-wide `warn`
  // exists to avoid, see the block above). The route entry stays a PATTERN
  // (`semaforo*.tsx`, same precedent as `configuracion*.tsx`), covering the
  // stub route (`semaforo.tsx`) and any sibling `/semaforo/*` route file a
  // future US-049 slice adds — gated before it's authored.
  //
  // Debt registered with its trigger: once a `src/components/dashboard/`
  // directory is extracted for these dashboard-only components (no US
  // schedules this yet), this file list collapses into one directory glob
  // like the `configuracion` block's. Do not do the extraction now (YAGNI).
  {
    files: [
      'src/components/DistribucionPie.tsx',
      'src/components/LeyendaGasto.tsx',
      'src/components/SemaforoBadge.tsx',
      'src/components/SemaforoTag.tsx',
      'src/components/ResumenScreen.tsx',
      'src/routes/_authenticated/semaforo*.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // Scoped ERROR — US-049 (design §1.7's own eslint.config.js note). Same
  // FILE-LIST form as the US-047/US-048 blocks above: `SemaforoDetallePage`,
  // `BucketSemaforoCard`, `ZonaBar` are loose siblings directly under
  // `src/components/`, not their own subdirectory. `semaforo*.tsx` already
  // covers this US's own route file (glob added by the US-047 block above).
  {
    files: [
      'src/components/SemaforoDetallePage.tsx',
      'src/components/BucketSemaforoCard.tsx',
      'src/components/ZonaBar.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // Scoped ERROR — US-048 (design D-10). Same FILE-LIST form as the US-047
  // block above (loose siblings under `src/components/`, not a subdirectory —
  // globbing `src/components/**` would absorb the app's pre-existing a11y
  // debt). `ResumenScreen.tsx` is already gated by the US-047 block above;
  // not repeated here.
  {
    files: [
      'src/components/ResumenAnual.tsx',
      'src/components/MiniSemaforoTag.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // Scoped ERROR — US-053 (same FILE-LIST form as the US-047/048/049 blocks
  // above: loose siblings under `src/components/`, not a subdirectory). The
  // new real MES-BUCKET page (`BucketDetalleMesPage` + its per-group section
  // `GrupoMovimientos`) and the re-pointed route are authored under this
  // change — gated here before any a11y rule can go blind to them. The route
  // entry stays a PATTERN (`buckets*.tsx`, same precedent as
  // `configuracion*.tsx`/`semaforo*.tsx`), covering the re-pointed
  // `buckets.$bucket.tsx` and any future sibling.
  {
    files: [
      'src/components/BucketDetalleMesPage.tsx',
      'src/components/GrupoMovimientos.tsx',
      'src/routes/_authenticated/buckets*.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // Scoped ERROR — US-054 (D-08, WDI-07/WG5-12). Same FILE-LIST form as the
  // US-047/048/049/053 blocks above: `IngresosMesPage` and `IngresosMesTable`
  // are loose siblings directly under `src/components/`, not their own
  // subdirectory — globbing `src/components/**` here would absorb the app's
  // pre-existing a11y debt (the exact blast radius the app-wide `warn` exists
  // to avoid). The route entry stays a PATTERN (`ingresos*.tsx`, same
  // precedent as `configuracion*.tsx`/`semaforo*.tsx`/`buckets*.tsx`), covering
  // `ingresos.tsx` and any future sibling route file for `/ingresos/*`.
  // `LeyendaGasto`/`ResumenScreen` already gated by the US-047 block —
  // not re-listed (US-053 precedent: transport-only `ResumenPage` wasn't
  // re-listed either).
  {
    files: [
      'src/components/IngresosMesPage.tsx',
      'src/components/IngresosMesTable.tsx',
      'src/routes/_authenticated/ingresos*.tsx',
    ],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // Scoped ERROR — US-055 (D-06/D-08, WCAT-04/WCAT-05). `ReclasificarCategoriaControl`
  // is the per-row reclassify widget (same loose-sibling form as the US-053/054
  // blocks: file-list not a subdirectory, to avoid absorbing app-wide a11y
  // debt). The WCAG obligations added in this change: `aria-describedby` on
  // the `alertdialog`, and removal of the stale per-row `aria-live` span
  // replaced by the page-owned `role="status"` region (D-07).
  {
    files: ['src/components/ReclasificarCategoriaControl.tsx'],
    extends: [jsxA11y.flatConfigs.recommended],
  },
  // Scoped ERROR — US-059 (D-10, WEB-PRV-09). Same FILE-LIST form as the
  // US-047/048/049/053/054/055 blocks above: `FilaRevision`, `PreviewMuestra`,
  // and `SubirCartola` are loose siblings directly under `src/components/`,
  // not their own subdirectory — globbing `src/components/**` here would
  // absorb the app's pre-existing a11y debt (the exact blast radius the
  // app-wide `warn` exists to avoid). The per-row `srOnly` labels (D-10) are
  // the primary a11y obligation: `jsx-a11y` at error level catches any
  // regression before merge.
  {
    files: [
      'src/components/FilaRevision.tsx',
      'src/components/PreviewMuestra.tsx',
      'src/components/SubirCartola.tsx',
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
