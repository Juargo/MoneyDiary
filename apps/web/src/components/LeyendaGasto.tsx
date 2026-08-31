import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLOR_BUCKET, ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import type { ItemLeyenda } from '@/domain/resumen-view-model';

/**
 * Pie legend + bucket selector — US-047 (design D-03/D-08): two ordered
 * `ItemLeyenda[]` groups (`principales`: the three 50/30/20 rows;
 * `complemento`: Ingresos then Sin categoría), separated by a structural
 * divider element (always in the DOM, viewport-conditional visibility only
 * — `hidden lg:block`, D-09; the Playwright geometry proof is T13's job,
 * not this component's). Row shape is derived from the item's `kind`
 * (D-03's discriminated union), never from a boolean flag:
 * `'gasto'`/`'sinCategoria'` → clickable `<button>` + chevron (both drill
 * down via `onSelectBucket`, `WCAT-01`); `'ingreso'` → clickable `<button>`
 * (US-054 D-05: the US-047 interim is retired — the endpoint now exists).
 *
 * US-053 PR3 (D-06): the `bucketSeleccionado`/`aria-pressed` selection
 * state is GONE — a row click NAVIGATES to the month-scoped bucket page
 * (the parent screen decides where; this component only reports the
 * bucket), and navigation isn't a toggle, so `aria-pressed` would be
 * wrong here. `onSelectBucket` keeps its single-arg signature.
 *
 * Accessible-name change (deliberate, D-08/R-8): the per-row `aria-label`
 * is REMOVED — the row's own visible text (name, %/count, amount) now
 * forms the accessible name, satisfying WCAG 2.5.3 Label in Name and
 * removing a duplicated string that could drift from what's on screen. The
 * color dot and `px-2 py-1` target-size treatment carry over unchanged from
 * the pre-US-047 component (LOCKED, WCAG 2.5.8); the focus outline itself
 * converged from `outline-slate-800` to the shared `outline-ring` token in
 * round-9 (WCAG 1.4.11 contrast verified to only improve — see the call
 * site's comment for the ratios).
 */
export function LeyendaGasto({
  principales,
  complemento,
  onSelectBucket,
  onSelectIngresos,
}: {
  readonly principales: ReadonlyArray<ItemLeyenda>;
  readonly complemento: ReadonlyArray<ItemLeyenda>;
  readonly onSelectBucket: (bucket: string) => void;
  readonly onSelectIngresos: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        {principales.map((item) =>
          filaParaItem(item, onSelectBucket, onSelectIngresos),
        )}
      </ul>

      {/* D-09: a CSS-only visibility toggle, never conditional JSX — the
          element is ALWAYS in the DOM (T13/Playwright proves absence at
          tablet/mobile viewports via computed geometry, not this test
          file). `lg` (≥1024px) is this spec's desktop threshold. */}
      <hr
        data-testid="leyenda-divisor"
        className="hidden border-t border-border lg:my-1 lg:block"
      />

      <ul className="flex flex-col gap-1">
        {complemento.map((item) =>
          filaParaItem(item, onSelectBucket, onSelectIngresos),
        )}
      </ul>
    </div>
  );
}

/**
 * `principales` is contractually always `kind: 'gasto'` and `complemento`
 * is `[ingreso, sinCategoria]` (D-03), but both are typed as the full
 * `ItemLeyenda` union on `ResumenViewModel` — this dispatcher handles all
 * 3 kinds so both `.map()` call sites stay a one-liner without an unsafe
 * cast.
 */
function filaParaItem(
  item: ItemLeyenda,
  onSelectBucket: (bucket: string) => void,
  onSelectIngresos: () => void,
) {
  if (item.kind === 'ingreso') {
    return (
      <FilaIngreso
        key="ingreso"
        item={item}
        onSelectIngresos={onSelectIngresos}
      />
    );
  }
  return (
    <FilaClickeable
      key={item.bucket}
      item={item}
      onSelectBucket={onSelectBucket}
    />
  );
}

/**
 * One clickable row — `'gasto'` (name · % · amount) or `'sinCategoria'`
 * (name · N tx · amount), both rendering the same button/chevron/dot
 * shell. Modeled as one function (not two) because the interactive shell
 * is identical; only the middle content column differs by `kind`.
 */
function FilaClickeable({
  item,
  onSelectBucket,
}: {
  readonly item: Extract<ItemLeyenda, { kind: 'gasto' | 'sinCategoria' }>;
  readonly onSelectBucket: (bucket: string) => void;
}) {
  const etiqueta = ETIQUETA_BUCKET[item.bucket] ?? item.bucket;

  return (
    <li data-testid="leyenda-item">
      <button
        type="button"
        onClick={() => onSelectBucket(item.bucket)}
        className={cn(
          // Round-9 critique P3: converged to the shared --ring token
          // (#1a1c1c) from the old slate-800 (#1e293b) "do NOT re-tint"
          // literal — contrast against every bucket pastel dot fill (and
          // white) can only improve. See the canonical ratio table in
          // `lib/bucket-colors.ts` (above `construirOpcionesBucket`'s
          // "Focus-ring contrast" comment) for the verified numbers. LOCKED
          // (WCAG 2.2 AA 2.5.8): px-2/py-1 comfortable tap target.
          'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        )}
      >
        <span className="flex items-center gap-2">
          <span
            data-testid="leyenda-dot"
            className="h-3 w-3 shrink-0 rounded-none"
            style={{ backgroundColor: COLOR_BUCKET[item.bucket] ?? '#CCCCCC' }}
          />
          {/* Explicit `{' '}` text-node separators (not just `gap-*`
              utilities): the accessible-name algorithm concatenates
              adjacent inline elements' text content with NO implied
              whitespace, so "Necesidades"+"42%" would otherwise compute as
              the single word "Necesidades42%" — a real accname bug, not a
              visual one (`gap-2` only affects layout). */}
          <span className="text-sm text-foreground">{etiqueta}</span>{' '}
          {item.kind === 'gasto' ? (
            <span className="text-sm font-semibold text-foreground">
              {item.porcentaje}%
            </span>
          ) : (
            <span className="text-sm font-semibold text-foreground">
              {/* CRITICAL fix (judgment-day, WCAG 4.1.2/ADR-018): "tx" is a
                  visual abbreviation an AT user shouldn't have to guess at.
                  The visible "N tx" stays on screen but is pulled OUT of the
                  accessible name (`aria-hidden`); a `sr-only` sibling
                  REPLACES it with the spelled-out count instead of
                  duplicating the digit. */}
              <span aria-hidden="true">{item.cantidadLabel}</span>
              <span className="sr-only">
                {item.cantidadLabel.replace(
                  /\s*tx$/,
                  ' transacciones sin categorizar',
                )}
              </span>
            </span>
          )}
        </span>{' '}
        <span className="flex items-center gap-1">
          <span className="text-sm font-semibold text-foreground">
            {item.montoLabel}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
        </span>
      </button>
    </li>
  );
}

/**
 * Ingresos row — US-054 D-05 (WG5-03/06): the US-047 interim (`<li>` inert)
 * is retired. The endpoint now exists (US-052). Same `FilaClickeable` shell
 * minus the color dot — LOCKED class: `px-2 py-1` (WCAG 2.5.8 target). The
 * focus outline converged from `outline-slate-800` to the shared
 * `outline-ring` token in round-9 (WCAG 1.4.11, contrast verified to only
 * improve). `{' '}` text-node separators keep the accessible-name algorithm
 * from concatenating adjacent inline elements without whitespace.
 */
function FilaIngreso({
  item,
  onSelectIngresos,
}: {
  readonly item: Extract<ItemLeyenda, { kind: 'ingreso' }>;
  readonly onSelectIngresos: () => void;
}) {
  return (
    <li data-testid="leyenda-item">
      <button
        type="button"
        onClick={onSelectIngresos}
        className={cn(
          // Round-9 critique P3: converged to the shared --ring token
          // (#1a1c1c) from the old slate-800 (#1e293b) "do NOT re-tint"
          // literal — contrast against every bucket pastel dot fill (and
          // white) can only improve. See the canonical ratio table in
          // `lib/bucket-colors.ts` (above `construirOpcionesBucket`'s
          // "Focus-ring contrast" comment) for the verified numbers. LOCKED
          // (WCAG 2.2 AA 2.5.8): px-2/py-1 comfortable tap target.
          'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        )}
      >
        <span className="flex items-center gap-2">
          {/* No color dot — Ingresos has no bucket color (CA-04; not a spend bucket). */}
          <span className="text-sm text-foreground">Ingresos</span>
        </span>{' '}
        <span className="flex items-center gap-1">
          <span className="text-sm font-semibold text-foreground">
            {item.montoLabel}
          </span>
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
        </span>
      </button>
    </li>
  );
}
