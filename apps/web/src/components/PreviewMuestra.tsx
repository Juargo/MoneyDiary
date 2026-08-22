import { FilaRevision } from './FilaRevision';
import type { PreviewFilaDto, CatalogoEstado } from '@/api/types';

/**
 * PreviewMuestra (US-059 PR2, D-12) — presentational review table shell.
 *
 * Receives the canonical preview response props (`filas`, `resumen`) along
 * with the edits overlay (`edits`, `onEditChange`) and the catalog state
 * (`catalogo`). Maps every fila to a `<FilaRevision>` with the merged display
 * value (D-05: `edits` wins over `sugerido`).
 *
 * This component holds NO state and issues NO network requests (ADR-024).
 * The old `cantidad`/`onCantidadChange`/`banco`/`totalFilasDatos` props are
 * removed — product decision 4 renders the full list without pagination.
 *
 * D-07: when `catalogo.tag === 'cargando'` or `'error'`, the table still
 * renders (rows, amounts, Duplicado badges are backend data independent of the
 * catalog). A non-blocking inline affordance appears for the error case so
 * the user understands why the cascade selects are unavailable, without hiding
 * the preview data.
 */
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

      {/* Full filas list — no pagination (product decision 4, WEB-PRV-02) */}
      {filas.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No hay movimientos para mostrar en este archivo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((fila) => (
            <FilaRevision
              key={fila.rowIndex}
              fila={fila}
              // D-05: merged display value — edits win over sugerido.categoriaId
              categoriaId={
                edits.has(fila.rowIndex)
                  ? (edits.get(fila.rowIndex) ?? null)
                  : (fila.sugerido?.categoriaId ?? null)
              }
              catalogo={catalogo}
              onEditChange={onEditChange}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
