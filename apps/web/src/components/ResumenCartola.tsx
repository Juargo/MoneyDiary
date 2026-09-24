import { FileText } from 'lucide-react';

/**
 * ResumenCartola (cartola-preview-confirmacion PR9, D-08) — the cartola
 * identity block: banco header, the resumen counts (`totalFilas`,
 * `duplicadosDetectados`, `nuevas`), and the "nothing saved yet" affordance
 * (CA-02, WEB-PRV-02).
 *
 * Extracted verbatim from `PreviewMuestra`'s `data-resumen-cartola` block —
 * zero behavior change (design.md D-08). `PreviewMuestra` keeps consuming it
 * unchanged; PR10 reuses it at the new `decidiendo` decision step so both
 * callers render the identical markup instead of a duplicated `<dl>`.
 *
 * Presentation-only (ADR-024): renders exactly what the backend returned,
 * no computation.
 */
export function ResumenCartola({
  banco,
  resumen,
}: {
  readonly banco: string;
  readonly resumen: {
    readonly totalFilas: number;
    readonly duplicadosDetectados: number;
    readonly nuevas: number;
  };
}) {
  return (
    <div
      data-resumen-cartola
      className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <FileText
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            {/* Resumen header — WEB-PRV-02, D-08: banco from top-level
                field. `truncate` guards long bank labels on phones. */}
            <h3 className="truncate text-base font-medium text-foreground">
              {banco}
            </h3>
            <p className="text-xs text-muted-foreground">Cartola detectada</p>
          </div>
        </div>
        {/* HTML5-valid dl: three <div> wrappers each with dt+dd pair
            (fix 3). Number-over-label: `dt` stays first in the DOM (the
            label is read before its value by AT), `flex-col-reverse`
            only flips the VISUAL order so the figure sits on top.
            `tabular-nums` keeps the three figures on one digit width. */}
        <dl className="grid shrink-0 grid-cols-3 gap-x-6 text-sm tabular-nums">
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-muted-foreground">Total filas</dt>
            <dd className="text-lg leading-tight font-medium text-foreground">
              {resumen.totalFilas}
            </dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-muted-foreground">Duplicados</dt>
            <dd className="text-lg leading-tight font-medium text-foreground">
              {resumen.duplicadosDetectados}
            </dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-muted-foreground">Nuevas</dt>
            <dd className="text-lg leading-tight font-medium text-foreground">
              {resumen.nuevas}
            </dd>
          </div>
        </dl>
      </div>

      {/* CA-02 / WEB-PRV-02: "nothing saved yet" affordance — plain <p>,
          no live-region role (fix 7). SubirCartola's aria-live announcer
          covers state-entry announcements. */}
      <p className="text-xs text-muted-foreground">
        Nada se ha guardado aún. Revisa las filas y confirma para importar.
      </p>
      {/* Issue #742: classification is misread as one-shot/mandatory —
          this line tells the user up front it's editable later. Same
          plain <p>, no live-region role, as the line above it. */}
      <p className="text-xs text-muted-foreground">
        Clasificar ahora no es obligatorio: puedes cambiar la categoría de
        cualquier movimiento cuando quieras.
      </p>
      <p className="text-xs text-muted-foreground">
        Las transacciones que no coincidan con ningún patrón se quedarán como
        <strong className="font-medium text-foreground">
          {' '}
          Deseos-Desconocido
        </strong>{' '}
        y podrás editarlas antes de subir o después.
      </p>
    </div>
  );
}
