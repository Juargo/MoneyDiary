import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { IconoCategoriaBadge } from './IconoCategoriaBadge';
import {
  agruparFilasPorBucketYCategoria,
  compararFilas,
  type GrupoNivel1,
} from '@/domain/agrupar-filas-por-bucket-y-categoria';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import {
  esMontoCero,
  formatearMontoCLP,
  formatearMontoConSigno,
} from '@/domain/formatear-monto';
import type { CatalogoEstado, PreviewFilaDto } from '@/api/types';

/**
 * MuestraAgrupada (cartola-decision-agrupada, resumen-acordeon-bucket,
 * WEB-PRV-19) — READ-ONLY TWO-LEVEL accordion (bucket → categoría) of the
 * preview `filas`, shown at the `decidiendo` decision step right after
 * `ResumenCartola`. Deliberately NOT the editable review table: no select,
 * no checkbox, no "+" trigger — this is a summary, not an editing surface
 * (the only transition into editing stays "Revisar y editar", WEB-PRV-19).
 *
 * `resumen-acordeon-bucket` replaced this component's OWN flat grouping
 * module (`agrupar-preview-por-categoria.ts`, now removed) with the SAME
 * two-level bucket→categoría breakdown `PreviewMuestra`'s editable table
 * uses (`agruparFilasPorBucketYCategoria`, WEB-PRV-20) — DRY: one grouping
 * rule set, two read-only/editable presentations of it. This component
 * carves DUPLICATE rows out BEFORE calling that function and renders them as
 * its own trailing "Duplicadas (no se importan)" entry, rows direct (status
 * quo, WEB-PRV-19): duplicates are never committed, so they don't belong in
 * a breakdown of what WILL be imported — unlike the editable table, which
 * groups a duplicate row by its `sugerido` like any other row (see that
 * module's docblock). `compararFilas` (exported by that same module) sorts
 * this entry's rows the identical fecha/rowIndex way every other group's
 * rows are sorted, instead of re-implementing the tiebreak here.
 *
 * Heading hierarchy: this component's own `h3` ("Movimientos por
 * categoría") → level-1 `h4` (bucket, the trailing "Revisar" entry for rows
 * the domain fn cannot place under a real bucket, or "Duplicadas") → level-2
 * `h5` (categoría, only for the three asignable buckets — Ingreso and
 * Revisar/Duplicadas show their rows DIRECTLY, no level 2, same shape
 * `PreviewMuestra` uses for Ingreso/its own Revisar entry).
 *
 * Both levels COLLAPSED by default (own independent expand-state, never
 * shared with `PreviewMuestra`'s: `SubirCartola` mounts at most one of the
 * two components at a time — `mostrarDecision`/`revisando` are mutually
 * exclusive, see that component's docblock): this is a supporting summary
 * behind three big action buttons, not the primary work surface — showing
 * every row of every group by default would bury "Subir tal cual"/"Revisar
 * y editar"/"Descartar" under a wall of text on a first load.
 *
 * Deliberately self-contained rather than sharing a generic accordion-header
 * component with `PreviewMuestra`: that component's header/toggle logic is
 * entangled with concerns this one has none of (focus-continuity across a
 * `sugerido`-driven remount, `FilaRevision`'s inline creation form,
 * cascade-select state) — extracting a shared piece would mean generalizing
 * an already-complex component for a relatively small amount of duplicated
 * JSX (a button + chevron + panel), at real risk to `PreviewMuestra`'s own
 * suite. The grouping RULES are shared (`agruparFilasPorBucketYCategoria`
 * above); the accordion CHROME is not.
 *
 * ADR-024: presentation only. No money math beyond `formatearMontoConSigno`
 * (display formatting, not computation) — no sums, no re-classification.
 */

/**
 * Trailing level-1 entry, summary-ONLY (never exists in `PreviewMuestra`'s
 * `GrupoNivel1`): duplicate rows, carved out of `filas` before grouping so
 * they never enter a bucket/categoría breakdown of what will be imported.
 * A distinct `kind` (rather than a fake bucket string) keeps this shape
 * impossible to confuse with a real `GrupoBucket`, same reasoning
 * `GrupoRevisar` documents.
 */
interface GrupoDuplicadas {
  readonly kind: 'duplicadas';
  readonly filas: ReadonlyArray<PreviewFilaDto>;
}

/** One level-1 entry this summary renders: a real bucket, the trailing "Revisar" entry, or the trailing "Duplicadas" entry. */
type GrupoResumen = GrupoNivel1 | GrupoDuplicadas;

/** Stable key for one level-1 entry's expand-state `Set` and DOM ids. */
function claveNivel1(grupo: GrupoResumen): string {
  if (grupo.kind === 'bucket') return grupo.bucket;
  return grupo.kind; // 'revisar' | 'duplicadas' — never a real bucket name
}

function etiquetaNivel1(grupo: GrupoResumen): string {
  if (grupo.kind === 'revisar') return 'Revisar';
  if (grupo.kind === 'duplicadas') return 'Duplicadas (no se importan)';
  return ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket;
}

/**
 * Rows to render DIRECTLY under a level-1 entry, no categoría level — or
 * `null` when the entry drills into categorías instead. SINGLE discriminant
 * (same idiom `PreviewMuestra`'s `filasDirectasDeGrupo` uses): `conteoGrupo`
 * and the JSX render below both call this instead of picking "direct rows
 * vs categorías" their own way.
 */
function filasDirectasDeGrupo(
  grupo: GrupoResumen,
): ReadonlyArray<PreviewFilaDto> | null {
  if (grupo.kind === 'revisar' || grupo.kind === 'duplicadas') {
    return grupo.filas;
  }
  return grupo.categorias.length === 0 ? grupo.filasDirectas : null;
}

/** Total row count under one level-1 entry — direct rows, or the sum of its categorías. */
function conteoGrupo(grupo: GrupoResumen): number {
  const directas = filasDirectasDeGrupo(grupo);
  if (directas !== null) return directas.length;
  return grupo.kind === 'bucket'
    ? grupo.categorias.reduce((total, c) => total + c.filas.length, 0)
    : 0;
}

function etiquetaConteo(n: number): string {
  return `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
}

/** Same single-signed-amount idiom `FilaRevision`'s header uses (both-zero → neutral `$0`). */
function montoFila(fila: PreviewFilaDto): string {
  const cargoEsCero = esMontoCero(fila.cargo);
  const abonoEsCero = esMontoCero(fila.abono);
  if (cargoEsCero && abonoEsCero) return formatearMontoCLP('0');
  if (!cargoEsCero) return formatearMontoConSigno(fila.cargo, '-');
  return formatearMontoConSigno(fila.abono, '+');
}

function ListaFilas({
  filas,
}: {
  readonly filas: ReadonlyArray<PreviewFilaDto>;
}) {
  return (
    <ul className="flex flex-col gap-2 divide-y divide-border px-3">
      {filas.map((fila) => (
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
  );
}

export function MuestraAgrupada({
  filas,
  catalogo,
}: {
  readonly filas: ReadonlyArray<PreviewFilaDto>;
  readonly catalogo: CatalogoEstado;
}) {
  const idBase = useId();
  // Collapsed by default: both Sets hold the keys of EXPANDED entries.
  const [bucketsAbiertos, setBucketsAbiertos] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [categoriasAbiertas, setCategoriasAbiertas] = useState<
    ReadonlySet<string>
  >(new Set());

  const noDuplicadas: PreviewFilaDto[] = [];
  const duplicadas: PreviewFilaDto[] = [];
  for (const fila of filas) {
    (fila.esDuplicado ? duplicadas : noDuplicadas).push(fila);
  }

  const grupos: ReadonlyArray<GrupoResumen> = [
    ...agruparFilasPorBucketYCategoria(noDuplicadas, catalogo),
    ...(duplicadas.length > 0
      ? [
          {
            kind: 'duplicadas' as const,
            filas: [...duplicadas].sort(compararFilas),
          },
        ]
      : []),
  ];

  if (grupos.length === 0) return null;

  function handleToggleBucket(clave: string) {
    setBucketsAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) {
        next.delete(clave);
      } else {
        next.add(clave);
      }
      return next;
    });
  }

  function handleToggleCategoria(clave: string) {
    setCategoriasAbiertas((prev) => {
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
          const clave = claveNivel1(grupo);
          const abierto = bucketsAbiertos.has(clave);
          const idPanel = `${idBase}-bucket-${clave}`;
          const conteo = conteoGrupo(grupo);
          const filasDirectas = filasDirectasDeGrupo(grupo);

          return (
            <div
              key={clave}
              data-grupo-bucket={clave}
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
                    aria-controls={idPanel}
                    onClick={() => handleToggleBucket(clave)}
                    className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 truncate">
                      {etiquetaNivel1(grupo)}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {etiquetaConteo(conteo)}
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

              <div
                id={idPanel}
                hidden={!abierto}
                className={abierto ? 'flex flex-col gap-2 px-3 py-2' : 'hidden'}
              >
                {filasDirectas !== null ? (
                  <ListaFilas filas={filasDirectas} />
                ) : grupo.kind === 'bucket' ? (
                  grupo.categorias.map((categoria) => {
                    const categoriaAbierta = categoriasAbiertas.has(
                      categoria.clave,
                    );
                    const idPanelCategoria = `${idBase}-cat-${categoria.clave}`;

                    return (
                      <div
                        key={categoria.clave}
                        data-grupo-categoria={categoria.clave}
                        data-abierto={categoriaAbierta}
                        className="flex flex-col rounded-md border border-border"
                      >
                        <div
                          className={`flex items-center gap-2 bg-muted/20 px-2 py-1 ${categoriaAbierta ? 'border-b border-border' : ''}`}
                        >
                          <h5 className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                            <IconoCategoriaBadge
                              icono={categoria.icono}
                              bucket={grupo.bucket}
                            />
                            <button
                              type="button"
                              aria-expanded={categoriaAbierta}
                              aria-controls={idPanelCategoria}
                              onClick={() =>
                                handleToggleCategoria(categoria.clave)
                              }
                              className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-medium text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              <span className="min-w-0 truncate">
                                {categoria.categoriaNombre}{' '}
                                <span className="font-normal text-muted-foreground">
                                  · {etiquetaConteo(categoria.filas.length)}
                                </span>
                              </span>
                              <ChevronDown
                                aria-hidden="true"
                                className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                                  categoriaAbierta ? '' : '-rotate-90'
                                }`}
                              />
                            </button>
                          </h5>
                        </div>
                        <div
                          id={idPanelCategoria}
                          hidden={!categoriaAbierta}
                          className={categoriaAbierta ? '' : 'hidden'}
                        >
                          <ListaFilas filas={categoria.filas} />
                        </div>
                      </div>
                    );
                  })
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
