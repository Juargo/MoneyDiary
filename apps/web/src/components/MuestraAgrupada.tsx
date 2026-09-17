import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  agruparPreviewPorCategoria,
  type GrupoPreviewPorCategoria,
} from '@/domain/agrupar-preview-por-categoria';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import {
  esMontoCero,
  formatearMontoCLP,
  formatearMontoConSigno,
} from '@/domain/formatear-monto';
import type { CatalogoEstado, PreviewFilaDto } from '@/api/types';

/**
 * MuestraAgrupada (cartola-decision-agrupada, WEB-PRV-19) — READ-ONLY
 * grouped accordion of the preview `filas`, shown at the `decidiendo`
 * decision step right after `ResumenCartola`. Grouping itself lives in
 * `domain/agrupar-preview-por-categoria.ts` (pure, own test suite); this
 * component only resolves the UI-facing bucket label (`ETIQUETA_BUCKET`,
 * web-only per that module's docblock) and renders the accordion, following
 * the SAME idiom `PreviewMuestra`'s date-group accordion already uses
 * (heading-wraps-button, `aria-expanded`/`aria-controls`, `ChevronDown`
 * rotating, panel `hidden` while collapsed).
 *
 * Deliberately separate from `ResumenCartola` (which `PreviewMuestra`'s
 * review table also renders) — folding this list into that shared component
 * would duplicate rows once the review table mounts. Deliberately NOT the
 * editable review table either: no select, no checkbox, no "+" trigger —
 * this is a summary, not an editing surface (the only transition into
 * editing stays "Revisar y editar", WEB-PRV-19).
 *
 * Collapsed by default (unlike `PreviewMuestra`'s "everything open, user
 * collapses what they're done with" default): this is a supporting summary
 * behind three big action buttons, not the primary work surface — showing
 * every row of every group by default would bury "Subir tal cual"/"Revisar
 * y editar"/"Descartar" under a wall of text on a first load.
 *
 * ADR-024: presentation only. No money math beyond `formatearMontoConSigno`
 * (display formatting, not computation) — no sums, no re-classification.
 */

function tituloGrupo(grupo: GrupoPreviewPorCategoria): string {
  const etiquetaBucket = (bucket: string) => ETIQUETA_BUCKET[bucket] ?? bucket;
  switch (grupo.tipo) {
    case 'categoria':
      return `${etiquetaBucket(grupo.bucket)} · ${grupo.categoriaNombre}`;
    case 'categoria-no-disponible':
      return `${etiquetaBucket(grupo.bucket)} · Categoría no disponible`;
    case 'ingreso':
      // No "· Sin categoría" suffix (see the domain module's docblock):
      // these rows are settled, not pending a decision.
      return etiquetaBucket(grupo.bucket);
    case 'sin-clasificar':
      return 'Sin clasificar';
    case 'duplicadas':
      return 'Duplicadas (no se importan)';
  }
}

/** Same single-signed-amount idiom `FilaRevision`'s header uses (both-zero → neutral `$0`). */
function montoFila(fila: PreviewFilaDto): string {
  const cargoEsCero = esMontoCero(fila.cargo);
  const abonoEsCero = esMontoCero(fila.abono);
  if (cargoEsCero && abonoEsCero) return formatearMontoCLP('0');
  if (!cargoEsCero) return formatearMontoConSigno(fila.cargo, '-');
  return formatearMontoConSigno(fila.abono, '+');
}

export function MuestraAgrupada({
  filas,
  catalogo,
}: {
  readonly filas: ReadonlyArray<PreviewFilaDto>;
  readonly catalogo: CatalogoEstado;
}) {
  const idBase = useId();
  // Collapsed by default: the Set holds the keys of EXPANDED groups (the
  // inverse of `PreviewMuestra`'s "Set of collapsed keys" — see docblock).
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());

  const grupos = agruparPreviewPorCategoria(filas, catalogo);

  if (grupos.length === 0) return null;

  function handleToggle(clave: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) {
        next.delete(clave);
      } else {
        next.add(clave);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-foreground">
        Movimientos por categoría
      </h3>
      <div className="flex flex-col gap-2">
        {grupos.map((grupo) => {
          const abierto = abiertos.has(grupo.clave);
          const idLista = `${idBase}-${grupo.clave}`;
          const n = grupo.filas.length;

          return (
            <div
              key={grupo.clave}
              data-grupo={grupo.clave}
              data-abierto={abierto}
              className="flex flex-col rounded-lg border border-border"
            >
              <div
                className={`flex items-center gap-2 bg-muted/40 px-3 py-1 ${abierto ? 'border-b border-border' : ''}`}
              >
                <h4 className="min-w-0 flex-1 text-sm">
                  <button
                    type="button"
                    aria-expanded={abierto}
                    aria-controls={idLista}
                    onClick={() => handleToggle(grupo.clave)}
                    className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 truncate">
                      {tituloGrupo(grupo)}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {n} {n === 1 ? 'movimiento' : 'movimientos'}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                        abierto ? '' : '-rotate-90'
                      }`}
                    />
                  </button>
                </h4>
              </div>
              <ul
                id={idLista}
                hidden={!abierto}
                className={
                  abierto
                    ? 'flex flex-col gap-2 divide-y divide-border px-3'
                    : 'hidden'
                }
              >
                {grupo.filas.map((fila) => (
                  <li
                    key={fila.rowIndex}
                    className="flex items-start justify-between gap-2 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {fila.descripcion}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {fila.fecha.slice(0, 10)}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                      {montoFila(fila)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
