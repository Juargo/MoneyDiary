import { useState } from 'react';
import { X } from 'lucide-react';
import { FilaRevision } from './FilaRevision';
import {
  SENTINEL_OPTION,
  BUCKET_SENTINEL_OPTION,
} from './catalogo-select-sentinels';
import { CampoSelect } from './configuracion/categorias/CampoSelect';
import { Button } from './ui/button';
import type { PreviewFilaDto, CatalogoEstado } from '@/api/types';

/**
 * PreviewMuestra (US-059 PR2, D-12; UX-scale feature: progress + grouping +
 * bulk apply) — review table shell for the cartola upload preview.
 *
 * Receives the canonical preview response props (`filas`, `resumen`) along
 * with the edits overlay (`edits`, `onEditChange`) and the catalog state
 * (`catalogo`). Maps every fila to a `<FilaRevision>` with the merged display
 * value (D-05: `edits` wins over `sugerido`).
 *
 * This component issues NO network requests and computes NO business values —
 * ADR-024 still holds: counting classified rows and grouping by the existing
 * `fecha` field is presentation, never a recomputation of amounts, dedup, or
 * classification rules. The old `cantidad`/`onCantidadChange`/`banco`/
 * `totalFilasDatos` props are removed — product decision 4 renders the full
 * list without pagination or virtualization; this feature adds a sticky
 * progress readout, date grouping, and multi-row selection to make that full
 * list navigable instead of reaching for pagination.
 *
 * Local state (all ephemeral UI, none of it NETWORK/business state):
 * - `soloSinClasificar` — "Solo sin clasificar" filter toggle.
 * - `seleccionados` — the Set<rowIndex> backing the bulk-apply toolbar.
 * - `bucketToolbar`/`categoriaToolbar` — the toolbar's own bucket→categoría
 *   cascade, independent from any single row's `bucketUI` in FilaRevision.
 * Selection is intentionally NOT persisted anywhere upstream: it never
 * touches `edits`, only `onEditChange` calls at "Aplicar" time do — bulk
 * apply is sugar over the same sparse-overlay contract (D-03), never a new
 * commit payload shape.
 *
 * D-07: when `catalogo.tag === 'cargando'` or `'error'`, the table still
 * renders (rows, amounts, Duplicado badges are backend data independent of the
 * catalog). A non-blocking inline affordance appears for the error case so
 * the user understands why the cascade selects are unavailable, without hiding
 * the preview data.
 *
 * Design-system distill round (P4, subtraction over redesign): a prior
 * round (P3) added an inline `role="alertdialog"` confirmation in front of
 * "Aplicar a N seleccionadas", for parity with the per-row cross-bucket
 * reclassify's confirmation. A fresh review reversed that: the dialog's own
 * copy already said "Nada se guarda hasta que presiones «Agregar
 * transacciones»", which means the real commit gate (`SubirCartola`'s
 * button, rendered below this component) already protects against mistakes
 * — the dialog was one avoidable extra click per bulk pass, not a safety
 * net. "Aplicar a N seleccionadas" now applies directly again: the same
 * per-row `onEditChange` loop this always ran, immediately on click, then
 * clears `seleccionados`/`bucketToolbar`/`categoriaToolbar`. No network
 * request happens here either way (ADR-024) — only the extra click was
 * removed.
 *
 * Design critique P2 (fix 1 + fix 2, review-table polish):
 * - Fix 1 (column identity): the sticky progress container also renders a
 *   purely-visual `data-columnas-header` row ("Bucket"/"Categoría",
 *   aria-hidden) shown only at `sm`+, where `FilaRevision` hides its own
 *   per-row visible label (`sm:sr-only`) since the selects sit in a row
 *   there. Below `sm`, `FilaRevision`'s per-row visible labels carry the
 *   identity instead and this header stays hidden — the two mechanisms are
 *   complementary, never both visible at once. Living inside the SAME
 *   sticky div as the progress readout (rather than its own sticky
 *   element) means it can never fight that header for stacking/z-index.
 *   This column header is untouched by the P4 selection-collapse below —
 *   it names columns for the selects, not selection progress.
 * - Fix 2 (toolbar distill): the old 5-zone toolbar (count text + bucket +
 *   categoría + Aplicar + a standalone "Limpiar selección" button) folded
 *   "Limpiar selección" into a dismiss icon inside the count pill
 *   (`data-conteo-pill`) — down to 4 zones. Its accessible name is
 *   unchanged ("Limpiar selección"), so it stays reachable by the exact
 *   same `getByRole('button', { name: /limpiar selección/i })` queries the
 *   pre-existing test suite already used.
 *
 * Design distill round P4: while `seleccionados.size > 0`, the sticky
 * header hides the "N de M clasificadas · K duplicadas" text and the
 * progress bar — the bulk-apply toolbar's count pill already carries the
 * live selection number, so the two counts competed for the same reading
 * moment. The master "select all visible" checkbox and the "Solo sin
 * clasificar" toggle stay put either way (selection state doesn't change
 * what they do), and the readout comes back the instant the selection is
 * cleared. Conditional render, no live region — nothing here needs an
 * announcement, it's a visibility change on already-static text.
 */

interface FilaConMerged {
  readonly fila: PreviewFilaDto;
  readonly categoriaMerged: string | null;
}

interface GrupoPorFecha {
  readonly fecha: string;
  readonly filas: readonly FilaConMerged[];
}

// Groups CONSECUTIVE rows sharing the same `fecha` slice — filas arrive
// date-ordered from the backend; if they weren't, a non-consecutive repeat of
// the same date value intentionally starts a NEW group rather than merging
// with an earlier one. No sorting, no dedup — pure presentation over file
// order (ADR-024).
function agruparPorFecha(filas: readonly FilaConMerged[]): GrupoPorFecha[] {
  const grupos: GrupoPorFecha[] = [];
  for (const item of filas) {
    const fecha = item.fila.fecha.slice(0, 10);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.fecha === fecha) {
      (ultimo.filas as FilaConMerged[]).push(item);
    } else {
      grupos.push({ fecha, filas: [item] });
    }
  }
  return grupos;
}

/**
 * A checkbox that supports the native `indeterminate` visual state, which
 * has no HTML attribute — it can only be set imperatively on the DOM node.
 * Used by the per-date-group "Seleccionar todas" control.
 */
function CheckboxIndeterminado({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly onChange: () => void;
  readonly ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={onChange}
      className="size-4 shrink-0 rounded border-border accent-primary"
    />
  );
}

export function PreviewMuestra({
  banco,
  filas,
  resumen,
  edits,
  onEditChange,
  catalogo,
}: {
  readonly banco: string;
  readonly filas: ReadonlyArray<PreviewFilaDto>;
  readonly resumen: {
    readonly totalFilas: number;
    readonly duplicadosDetectados: number;
    readonly nuevas: number;
  };
  readonly edits: ReadonlyMap<number, string | null>;
  readonly onEditChange: (rowIndex: number, categoriaId: string | null) => void;
  readonly catalogo: CatalogoEstado;
}) {
  const [soloSinClasificar, setSoloSinClasificar] = useState(false);
  const [seleccionados, setSeleccionados] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [bucketToolbar, setBucketToolbar] = useState('');
  const [categoriaToolbar, setCategoriaToolbar] = useState('');

  // D-05: merged display value computed once — edits win over
  // sugerido.categoriaId. Backs the progress count, the filter, and the
  // `categoriaId` prop each FilaRevision receives.
  const filasConMerged: FilaConMerged[] = filas.map((fila) => ({
    fila,
    categoriaMerged: edits.has(fila.rowIndex)
      ? (edits.get(fila.rowIndex) ?? null)
      : (fila.sugerido?.categoriaId ?? null),
  }));

  const noDuplicadas = filasConMerged.filter((f) => !f.fila.esDuplicado);
  const clasificadas = noDuplicadas.filter(
    (f) => f.categoriaMerged !== null,
  ).length;
  const totalNoDuplicadas = noDuplicadas.length;
  const duplicadosCount = filasConMerged.length - totalNoDuplicadas;
  const progresoPct =
    totalNoDuplicadas > 0
      ? Math.round((clasificadas / totalNoDuplicadas) * 100)
      : 100;
  // Spanish number agreement (polish pass): "clasificadas" agrees with the
  // TOTAL fila count (the noun being modified), "duplicadas"/"seleccionadas"
  // agree with their own counts — all three read wrong ("1 clasificadas") at
  // N=1 without this.
  const etiquetaClasificadas =
    totalNoDuplicadas === 1 ? 'clasificada' : 'clasificadas';
  const etiquetaDuplicadas = duplicadosCount === 1 ? 'duplicada' : 'duplicadas';

  const filasVisibles = soloSinClasificar
    ? filasConMerged.filter(
        (f) => !f.fila.esDuplicado && f.categoriaMerged === null,
      )
    : filasConMerged;

  const grupos = agruparPorFecha(filasVisibles);

  // Page-level "select all visible" master checkbox: mirrors the per-group
  // CheckboxIndeterminado exactly, just scoped to every currently-visible
  // selectable rowIndex (all groups combined, duplicates excluded) instead of
  // one date group. Recomputes on every render, so toggling "Solo sin
  // clasificar" automatically recomputes N and the checked/indeterminate
  // state — no extra effect needed.
  const seleccionablesVisibles = filasVisibles
    .filter((f) => !f.fila.esDuplicado)
    .map((f) => f.fila.rowIndex);
  const todasVisiblesSeleccionadas =
    seleccionablesVisibles.length > 0 &&
    seleccionablesVisibles.every((idx) => seleccionados.has(idx));
  const algunaVisibleSeleccionada = seleccionablesVisibles.some((idx) =>
    seleccionados.has(idx),
  );
  // Singular edge (product decision): "todas las visibles" reads wrong at
  // N=1 ("select ALL the visible (1)"), so the determiner + noun switch to
  // singular together rather than just pluralizing a trailing word like the
  // other etiqueta* helpers in this file.
  const etiquetaSeleccionarVisibles =
    seleccionablesVisibles.length === 1
      ? `Seleccionar la visible (${seleccionablesVisibles.length})`
      : `Seleccionar todas las visibles (${seleccionablesVisibles.length})`;

  function handleToggleFila(rowIndex: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  }

  function handleToggleGrupo(rowIndexes: readonly number[]) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      const todasSeleccionadas = rowIndexes.every((idx) => next.has(idx));
      for (const idx of rowIndexes) {
        if (todasSeleccionadas) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
      }
      return next;
    });
  }

  function handleBucketToolbarChange(value: string) {
    setBucketToolbar(value);
    // Same reset-on-bucket-change semantics as FilaRevision's own cascade —
    // a previously chosen categoría no longer belongs to the new bucket.
    setCategoriaToolbar('');
  }

  function handleAplicarBulk() {
    if (!categoriaToolbar) return;
    for (const rowIndex of seleccionados) {
      onEditChange(rowIndex, categoriaToolbar);
    }
    setSeleccionados(new Set());
    setBucketToolbar('');
    setCategoriaToolbar('');
  }

  function handleLimpiarSeleccion() {
    setSeleccionados(new Set());
  }

  const etiquetaSeleccionadas =
    seleccionados.size === 1 ? 'seleccionada' : 'seleccionadas';

  const bucketOptionsToolbar =
    catalogo.tag === 'listo'
      ? [
          BUCKET_SENTINEL_OPTION,
          ...catalogo.grupos.map((g) => ({ value: g.bucket, label: g.bucket })),
        ]
      : [BUCKET_SENTINEL_OPTION];

  const categoriaOptionsToolbar =
    catalogo.tag === 'listo' && bucketToolbar
      ? [
          SENTINEL_OPTION,
          ...(catalogo.grupos
            .find((g) => g.bucket === bucketToolbar)
            ?.categorias.map((c) => ({ value: c.id, label: c.nombre })) ?? []),
        ]
      : [SENTINEL_OPTION];

  return (
    <div className="flex flex-col gap-3">
      {/* Resumen header — WEB-PRV-02, D-08: banco from top-level field */}
      <h3 className="text-sm font-semibold text-foreground">{banco}</h3>
      {/* HTML5-valid dl: three <div> wrappers each with dt+dd pair (fix 3) */}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <div>
          <dt className="font-medium">Total filas</dt>
          <dd>{resumen.totalFilas}</dd>
        </div>
        <div>
          <dt className="font-medium">Duplicados</dt>
          <dd>{resumen.duplicadosDetectados}</dd>
        </div>
        <div>
          <dt className="font-medium">Nuevas</dt>
          <dd>{resumen.nuevas}</dd>
        </div>
      </dl>

      {/* CA-02 / WEB-PRV-02: "nothing saved yet" affordance — plain <p>, no
          live-region role (fix 7). SubirCartola's aria-live announcer covers
          state-entry announcements. */}
      <p className="text-sm text-muted-foreground">
        Nada se ha guardado aún — revisa las filas y confirma para importar.
      </p>

      {/* D-07: non-blocking catalog loading affordance (fix 5) */}
      {catalogo.tag === 'cargando' && (
        <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
      )}

      {/* D-07: non-blocking catalog error affordance */}
      {catalogo.tag === 'error' && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No se pudo cargar el catálogo de categorías. La clasificación no está
          disponible, pero podés revisar los montos y continuar.
        </p>
      )}

      {filas.length > 0 && (
        // Sticky classification progress — plain visible text, no live
        // region (SubirCartola's announcer owns state-entry announcements).
        <div className="sticky top-0 z-10 flex flex-col gap-2 bg-card py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              {seleccionablesVisibles.length > 0 && (
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <CheckboxIndeterminado
                    checked={todasVisiblesSeleccionadas}
                    indeterminate={
                      algunaVisibleSeleccionada && !todasVisiblesSeleccionadas
                    }
                    onChange={() => handleToggleGrupo(seleccionablesVisibles)}
                    ariaLabel={etiquetaSeleccionarVisibles}
                  />
                  {etiquetaSeleccionarVisibles}
                </label>
              )}
              {/* P4 distill: hidden while a selection is active — the
                  bulk-apply toolbar's count pill already carries the live
                  number, so this text would be a second, redundant count. */}
              {seleccionados.size === 0 && (
                <p className="text-sm font-medium text-foreground">
                  {clasificadas} de {totalNoDuplicadas} {etiquetaClasificadas}
                  <span className="text-muted-foreground">
                    {' '}
                    · {duplicadosCount} {etiquetaDuplicadas}
                  </span>
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={soloSinClasificar}
              onClick={() => setSoloSinClasificar((v) => !v)}
            >
              Solo sin clasificar
            </Button>
          </div>
          {/* P4 distill: same collapse as the progress text above — this
              bar restates the same ratio, so it hides alongside it. */}
          {seleccionados.size === 0 && (
            <div
              aria-hidden="true"
              className="h-2 w-full overflow-hidden rounded-lg bg-muted"
            >
              <div
                data-progreso-fill
                className="h-full rounded-lg bg-primary transition-all"
                style={{ width: `${progresoPct}%` }}
              />
            </div>
          )}
          {/* P2 design critique fix 1: ONE shared column header, sm+ only —
              at sm+ each FilaRevision hides its own per-row "Bucket"/
              "Categoría" word (sm:sr-only) since selects sit side by side
              in a row there and this header names the columns instead.
              Purely visual (aria-hidden): the real accessible names live on
              each select via aria-label, never on this row. Lives INSIDE
              the same sticky container as the progress readout (not a
              second sticky element) so it can never fight that header's
              stacking/z-index — it just scrolls and sticks together with it.
              `px-2` + `flex-1` columns mirror FilaRevision's `li` padding
              (`p-2`) and its `sm:flex-1` select wrappers so the header text
              lines up over the selects below. */}
          <div
            aria-hidden="true"
            data-columnas-header
            className="hidden gap-2 px-2 sm:flex"
          >
            <span className="flex-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Bucket
            </span>
            <span className="flex-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Categoría
            </span>
          </div>
        </div>
      )}

      {/* Full filas list — no pagination (product decision 4, WEB-PRV-02) */}
      {filas.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No hay movimientos para mostrar en este archivo.
        </p>
      ) : soloSinClasificar && filasVisibles.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <p>Todas las filas están clasificadas.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSoloSinClasificar(false)}
          >
            Mostrar todas las filas
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((grupo, indiceGrupo) => {
            const seleccionablesGrupo = grupo.filas
              .filter((f) => !f.fila.esDuplicado)
              .map((f) => f.fila.rowIndex);
            const todasSeleccionadas =
              seleccionablesGrupo.length > 0 &&
              seleccionablesGrupo.every((idx) => seleccionados.has(idx));
            const algunaSeleccionada = seleccionablesGrupo.some((idx) =>
              seleccionados.has(idx),
            );

            return (
              <div
                key={`${grupo.fecha}-${indiceGrupo}`}
                data-fecha-grupo={grupo.fecha}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  {seleccionablesGrupo.length > 0 && (
                    <CheckboxIndeterminado
                      checked={todasSeleccionadas}
                      indeterminate={algunaSeleccionada && !todasSeleccionadas}
                      onChange={() => handleToggleGrupo(seleccionablesGrupo)}
                      ariaLabel={`Seleccionar todas: ${grupo.fecha}`}
                    />
                  )}
                  <span className="text-xs font-medium text-muted-foreground">
                    {grupo.fecha}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {grupo.filas.map(({ fila, categoriaMerged }) => (
                    <FilaRevision
                      key={fila.rowIndex}
                      fila={fila}
                      categoriaId={categoriaMerged}
                      catalogo={catalogo}
                      onEditChange={onEditChange}
                      selected={seleccionados.has(fila.rowIndex)}
                      onToggleSelect={handleToggleFila}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {seleccionados.size > 0 && (
        // `bottom-16 lg:bottom-0`: on mobile this sticks ABOVE the fixed
        // `BottomTabs` bar (app-shell/layout.ts `BOTTOM_TABS_HEIGHT_CLASS` =
        // `h-16`, same `<main>`-clearing breakpoint as
        // `CONTENT_BOTTOM_CLEARANCE_CLASS` = `pb-16 lg:pb-0`) — without the
        // offset this toolbar's `bottom: 0` and BottomTabs' `bottom: 0` both
        // resolve to the same viewport edge (neither container scrolls
        // independently), so BottomTabs' `z-40` would paint over this
        // toolbar's `z-10` and hide the Aplicar button on every phone.
        <div className="sticky bottom-16 z-10 flex flex-col gap-2 lg:bottom-0">
          <div
            data-toolbar-bulk
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm"
          >
            {/* P2 design critique fix 2 (toolbar distill): "Limpiar selección"
                used to be its own button — a 6th simultaneous control at the
                highest-value moment (count + bucket + categoría + Aplicar +
                Limpiar, alongside the header's master checkbox). It now
                lives INSIDE the count pill as a dismiss icon, so the toolbar
                reads as 4 zones: count-pill(with dismiss) + bucket +
                categoría + Aplicar. The accessible name ("Limpiar
                selección") is unchanged, so it's still reachable exactly as
                before via getByRole('button', { name: /limpiar selección/i }). */}
            <span
              data-conteo-pill
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pr-1.5 pl-3 text-sm font-medium text-secondary-foreground"
            >
              {seleccionados.size} {etiquetaSeleccionadas}
              {/* Polish fix: `size-6` = 24×24 CSS px, the WCAG 2.2 AA SC
                  2.5.8 minimum hit area (same value as `CLASE_BOTON_ICONO`,
                  `components/configuracion/estilos.ts` — not imported here
                  since this component sits outside `configuracion/`'s
                  ownership boundary, D-09; the value is duplicated, not the
                  class, and stays at one call site so DRY's three-strike
                  rule doesn't apply yet). The `X` glyph itself stays small
                  (`size-3`) inside the larger tappable button. */}
              <button
                type="button"
                onClick={handleLimpiarSeleccion}
                aria-label="Limpiar selección"
                className="flex size-6 items-center justify-center rounded-full text-secondary-foreground/70 outline-none hover:bg-secondary-foreground/10 hover:text-secondary-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
            <CampoSelect
              label="Bucket para aplicar"
              srOnly
              value={bucketToolbar}
              onChange={handleBucketToolbarChange}
              options={bucketOptionsToolbar}
              disabled={catalogo.tag !== 'listo'}
            />
            <CampoSelect
              label="Categoría para aplicar"
              srOnly
              value={categoriaToolbar}
              onChange={setCategoriaToolbar}
              options={categoriaOptionsToolbar}
              disabled={catalogo.tag !== 'listo' || !bucketToolbar}
            />
            <Button
              type="button"
              onClick={handleAplicarBulk}
              disabled={!categoriaToolbar}
            >
              Aplicar a {seleccionados.size} {etiquetaSeleccionadas}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
