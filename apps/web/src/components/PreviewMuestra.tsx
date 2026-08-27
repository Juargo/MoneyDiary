import { useState } from 'react';
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
            <p className="text-sm font-medium text-foreground">
              {clasificadas} de {totalNoDuplicadas} {etiquetaClasificadas}
              <span className="text-muted-foreground">
                {' '}
                · {duplicadosCount} {etiquetaDuplicadas}
              </span>
            </p>
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
        <div className="sticky bottom-16 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-sm lg:bottom-0">
          <span className="text-sm font-medium text-foreground">
            {seleccionados.size} {etiquetaSeleccionadas}
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
          <Button
            type="button"
            variant="ghost"
            onClick={handleLimpiarSeleccion}
          >
            Limpiar selección
          </Button>
        </div>
      )}
    </div>
  );
}
