import { useState } from 'react';
import { Badge } from './ui/badge';
import { CampoSelect } from './configuracion/categorias/CampoSelect';
import { SelectorBucket } from './SelectorBucket';
import { SENTINEL_OPTION } from './catalogo-select-sentinels';
import { esMontoCero, formatearMontoCLP } from '@/domain/formatear-monto';
import type { PreviewFilaDto } from '@/api/types';
import type { CatalogoEstado } from '@/api/types';

/**
 * FilaRevision (US-059 PR2, D-06/D-10/D-12; bulk-apply gotcha fix) —
 * presentational per-row component for the import preview review table.
 *
 * Receives one `fila` from the canonical preview response, the current
 * `categoriaId` (merged display value: edits win over sugerido, D-05), the
 * `catalogo` (computed in `SubirCartola`, never here — D-12/ADR-024), and
 * `onEditChange` for the classification overlay (categoriaId only, D-03).
 * Optional `selected`/`onToggleSelect` back the bulk-apply row checkbox
 * (presentational — no default wiring required by pre-existing callers).
 *
 * Local state: `bucketUI` — a UI-only filter for the cascade; never reaches
 * the wire. Seeds from `fila.sugerido?.bucket` only when that bucket is among
 * the loaded catalog groups (D-06); otherwise empty string.
 *
 * Gotcha fix (bulk apply): `bucketUI` used to seed ONLY on mount, so a bulk
 * apply that changes the `categoriaId` PROP on an already-mounted row left
 * `bucketUI` stale — the categoría select's options stayed filtered by the
 * old bucket and the new value rendered as ''. Fixed with React's documented
 * "adjust state during render" idiom (no effect, no ref): `prevCategoriaId`
 * is state that mirrors the last-seen `categoriaId` prop; when they diverge
 * — an EXTERNAL prop change, e.g. bulk apply — `bucketUI` is re-derived from
 * the catalog group owning the new `categoriaId` and both are updated in the
 * same render pass before returning JSX (React re-renders immediately with
 * the corrected values, no flash of stale options). This never fights the
 * manual cascade flow (bucket picked, categoría not yet chosen): that flow
 * never changes `categoriaId` on its own, so the divergence check never
 * fires while the user is mid-cascade on an untouched row.
 *
 * Duplicate rows (`fila.esDuplicado`): greyed container + "Duplicado" badge +
 * `SelectorBucket` `disabled` (no categoría select rendered, D-10) — no
 * `onEditChange` is ever wired for them. They never render a selection
 * checkbox either (never selectable for bulk).
 *
 * 2026-08-30: the bucket `<select>` was replaced with `SelectorBucket`, a
 * segmented control of native radio inputs (chips, one per bucket + a
 * leading "Sin categoría"). The categoría `CampoSelect` is no longer
 * rendered at all while `bucketUI === ''` — it only appears once a real
 * bucket is chosen — instead of existing-but-`disabled`. The right-hand
 * `sm:flex-1` wrapper stays in the tree either way so the two columns keep
 * lining up with `PreviewMuestra`'s shared `data-columnas-header` row.
 *
 * A11y: accessible per-row labels via `SelectorBucket`'s `label` prop
 * (`aria-label` on its `<fieldset>`) and `CampoSelect`'s `label` prop for
 * categoría. Label format: "Fila {rowIndex+1}: bucket" /
 * "Fila {rowIndex+1}: categoría" (1-based, stable, D-10). The selection
 * checkbox uses "Seleccionar fila {rowIndex+1}" (same numbering).
 *
 * Design critique P2 fix 1 (column identity): the controls used to be
 * fully `srOnly` — a sighted user scanning 50+ rows saw two bare dropdowns
 * with no visible column identity once a value was chosen. Now both
 * `SelectorBucket` and `CampoSelect` take a `columnLabel` ("Bucket"/
 * "Categoría"): visible above the control on mobile (stacked layout),
 * `sm:sr-only` at `sm`+ where `PreviewMuestra` renders ONE shared sticky
 * column-header row instead. The full "Fila N: …" sentence never leaves the
 * accessible name at any breakpoint. Each control sits in a `sm:flex-1`
 * wrapper so both columns take equal width at `sm`+, matching the shared
 * header's own `flex-1` split.
 *
 * ADR-024: zero business logic here — amounts formatted via `formatearMontoCLP`
 * (display-only), no re-computation, no dedup logic, no Ingreso rule.
 */

export function FilaRevision({
  fila,
  categoriaId,
  catalogo,
  onEditChange,
  selected = false,
  onToggleSelect = () => undefined,
}: {
  readonly fila: PreviewFilaDto;
  readonly categoriaId: string | null;
  readonly catalogo: CatalogoEstado;
  readonly onEditChange: (rowIndex: number, categoriaId: string | null) => void;
  readonly selected?: boolean;
  readonly onToggleSelect?: (rowIndex: number) => void;
}) {
  // Seed bucketUI giving PRIORITY to the edited categoriaId (fix 2, D-06):
  // 1. If categoriaId prop is non-null, find the catalog group that contains
  //    it — use that group's bucket (handles pre-populated edits from PR3).
  // 2. Fall back to sugerido.bucket when that bucket is among the groups.
  // 3. Otherwise empty string.
  // Runs on mount only — `useState` initializer runs once per component instance.
  const initialBucket = (() => {
    if (catalogo.tag !== 'listo') return '';
    // Priority 1: bucket of the currently-edited categoriaId
    if (categoriaId !== null) {
      const grupoEditado = catalogo.grupos.find((g) =>
        g.categorias.some((c) => c.id === categoriaId),
      );
      if (grupoEditado) return grupoEditado.bucket;
    }
    // Priority 2: sugerido.bucket when present among the groups
    if (
      fila.sugerido?.bucket &&
      catalogo.grupos.some((g) => g.bucket === fila.sugerido!.bucket)
    ) {
      return fila.sugerido.bucket;
    }
    return '';
  })();

  const [bucketUI, setBucketUI] = useState<string>(initialBucket);

  // Gotcha fix: `prevCategoriaId` mirrors the last-seen `categoriaId` prop.
  // When the prop no longer matches it, `categoriaId` changed from OUTSIDE
  // this render (e.g. a bulk apply) — re-derive `bucketUI` from the catalog
  // group that owns the new `categoriaId` before this render's JSX is
  // produced. React's documented pattern for adjusting state from a prop
  // change; no ref, no effect, so both updates land in the same commit.
  const [prevCategoriaId, setPrevCategoriaId] = useState(categoriaId);
  if (categoriaId !== prevCategoriaId) {
    setPrevCategoriaId(categoriaId);
    if (categoriaId !== null && catalogo.tag === 'listo') {
      const grupoDeCategoriaId = catalogo.grupos.find((g) =>
        g.categorias.some((c) => c.id === categoriaId),
      );
      if (grupoDeCategoriaId && grupoDeCategoriaId.bucket !== bucketUI) {
        setBucketUI(grupoDeCategoriaId.bucket);
      }
    }
  }

  const n = fila.rowIndex + 1; // 1-based human-friendly label index
  const labelBucket = `Fila ${n}: bucket`;
  const labelCategoria = `Fila ${n}: categoría`;
  const labelSeleccionar = `Seleccionar fila ${n}`;

  // Buckets available for the segmented control come from the catalog groups
  // that exist (empty buckets already filtered by agruparPorBucket — D-06,
  // verified fact §0 design.md). `SelectorBucket` builds its own leading
  // "Sin categoría" option and applies `ETIQUETA_BUCKET` internally.
  const buckets =
    catalogo.tag === 'listo' ? catalogo.grupos.map((g) => g.bucket) : [];

  // Categoría options: filter to the selected bucket's group; lead with sentinel.
  const categoriaOptions =
    catalogo.tag === 'listo' && bucketUI
      ? [
          SENTINEL_OPTION,
          ...(catalogo.grupos
            .find((g) => g.bucket === bucketUI)
            ?.categorias.map((c) => ({ value: c.id, label: c.nombre })) ?? []),
        ]
      : [SENTINEL_OPTION];

  function handleBucketChange(value: string) {
    setBucketUI(value);
    // Fix 1: bucket select is UI-only — ONLY write to the overlay when the
    // user had previously assigned a categoría (categoriaId prop is non-null),
    // meaning they are un-assigning a real prior choice. This avoids writing
    // null edits for rows the user never touched (sparse-overlay contract, D-03).
    if (categoriaId !== null) {
      onEditChange(fila.rowIndex, null);
    }
  }

  function handleCategoriaChange(value: string) {
    onEditChange(fila.rowIndex, value === '' ? null : value);
  }

  const catalogoDisabled = catalogo.tag !== 'listo';

  // Row header (polish pass, 2026-08-30): the old header was a single flex
  // row with `justify-between` — checkbox+date on the left, a truncated
  // description on the right, then a second row of "Cargo: / Abono:" pairs.
  // On phones the description's box collided with the date (see the
  // 390px screenshot that drove this) and the two amount pairs read as a
  // table with no columns. Now the row is a classic list item: leading
  // control, a `min-w-0 flex-1` text column (description as the primary
  // line, date beneath it as meta — the date group heading already carries
  // the date, so it's demoted, not removed: FilaRevision also renders
  // outside that grouping in tests), and a `shrink-0` right-aligned amount
  // column. Amounts are a `<dl>` so each figure is its own `<dd>` element
  // (`getByText('$0')` exact match) with its label as `<dt>`. ADR-024: still
  // display-only — nothing here decides which of cargo/abono "matters".
  const encabezado = (
    <div className="flex items-start gap-2">
      {!fila.esDuplicado && (
        // Round-9 critique P1 fix 2 (WCAG 2.2 AA SC 2.5.8): the checkbox
        // glyph stays size-4 (16px) visually, but a wrapping `<label>`
        // grows the CLICKABLE area to size-6 (24×24 CSS px) — the same
        // floor `CLASE_BOTON_ICONO` already enforces for icon buttons.
        // A native `<label>` around a bare `<input>` toggles it on click
        // anywhere inside, so this alone grows the hit target with no
        // extra handler. Duplicate rows render no checkbox: never
        // selectable for bulk (D-10).
        <label className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            aria-label={labelSeleccionar}
            checked={selected}
            onChange={() => onToggleSelect(fila.rowIndex)}
            className="size-4 shrink-0 rounded border-border accent-primary"
          />
        </label>
      )}
      <div className="min-w-0 flex-1 text-muted-foreground">
        {/* `data-descripcion`: the stable hook `PreviewMuestra.test.tsx`'s
            grouping suite reads row descriptions through (replaced a
            markup-coupled `.text-muted-foreground > span.font-medium`
            selector in this pass). */}
        <span
          data-descripcion
          className="block truncate font-medium text-foreground"
          title={fila.descripcion}
        >
          {fila.descripcion}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
          <span>{fila.fecha.slice(0, 10)}</span>
          {fila.esDuplicado && <Badge variant="outline">Duplicado</Badge>}
        </span>
      </div>
      <dl className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        <div className="flex justify-end gap-1">
          <dt>Cargo</dt>
          {/* Semantic amount colors (2026-08-30): cargo in `cargo-foreground`,
              abono in `ingreso-foreground` — but a `$0` in either column
              stays neutral. Color marks money that moved; painting the
              empty column green/red would make every row look like both. */}
          <dd
            className={`font-medium ${
              esMontoCero(fila.cargo)
                ? 'text-foreground'
                : 'text-cargo-foreground'
            }`}
          >
            {formatearMontoCLP(fila.cargo)}
          </dd>
        </div>
        <div className="flex justify-end gap-1">
          <dt>Abono</dt>
          <dd
            className={`font-medium ${
              esMontoCero(fila.abono)
                ? 'text-foreground'
                : 'text-ingreso-foreground'
            }`}
          >
            {formatearMontoCLP(fila.abono)}
          </dd>
        </div>
      </dl>
    </div>
  );

  if (fila.esDuplicado) {
    return (
      <li className="flex flex-col gap-2 py-3 text-sm opacity-50">
        {encabezado}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:flex-1">
            <SelectorBucket
              label={labelBucket}
              columnLabel="Bucket"
              value=""
              onChange={() => undefined}
              buckets={buckets}
              disabled
            />
          </div>
          <div className="sm:flex-1" />
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 text-sm">
      {encabezado}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:flex-1">
          <SelectorBucket
            label={labelBucket}
            columnLabel="Bucket"
            value={bucketUI}
            onChange={handleBucketChange}
            buckets={buckets}
            disabled={catalogoDisabled}
          />
        </div>
        <div className="sm:flex-1">
          {/* Keyed by `bucketUI`: switching bucket remounts the wrapper so
              `categoria-in` (index.css) replays — a state-transition cue
              that the options now belong to the new bucket. Not a loading
              state: nothing is fetched here (catalog is in memory). */}
          {bucketUI && (
            <div
              key={bucketUI}
              className="motion-safe:animate-[categoria-in_200ms_ease-out]"
            >
              <CampoSelect
                label={labelCategoria}
                columnLabel="Categoría"
                value={categoriaId ?? ''}
                onChange={handleCategoriaChange}
                options={categoriaOptions}
                disabled={catalogoDisabled}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
