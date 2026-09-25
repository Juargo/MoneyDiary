import { useEffect, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { FilaRevision } from './FilaRevision';
import { ResumenCartola } from './ResumenCartola';
import { IconoCategoriaBadge } from './IconoCategoriaBadge';
import { resolverCategoriaMerged } from '@/domain/resolver-categoria-merged';
import {
  agruparFilasPorCategoriaSugerida,
  type GrupoFilaPorCategoria,
} from '@/domain/agrupar-filas-por-categoria-sugerida';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import type { CategoriaDto, PreviewFilaDto, CatalogoEstado } from '@/api/types';

/**
 * PreviewMuestra (US-059 PR2, D-12) — review table shell for the cartola
 * upload preview.
 *
 * Receives the canonical preview response props (`filas`, `resumen`) along
 * with the edits overlay (`edits`, `onEditChange`) and the catalog state
 * (`catalogo`). Maps every fila to a `<FilaRevision>` with the merged display
 * value (D-05: `edits` wins over `sugerido`).
 *
 * This component issues NO network requests and computes NO business values —
 * ADR-024 still holds: grouping by bucket · categoría
 * (`agruparFilasPorCategoriaSugerida`, preview-agrupacion-categoria T2) is
 * presentation, never a recomputation of amounts, dedup, or classification
 * rules. Product decision 4 renders the full list without pagination or
 * virtualization; a per-group accordion (below) makes that full list
 * navigable instead.
 *
 * Grouping key = the SERVER SUGGESTION (`fila.sugerido`), never the merged
 * edit — a row the user reclassifies via its own select STAYS in its
 * original group until the preview is reloaded/re-run. This is why the
 * grouping call below takes `filas` directly, not `filasConMerged`: the
 * merged value only feeds each row's own `categoriaId` prop, never the
 * group it lands in.
 *
 * Local state (all ephemeral UI, none of it NETWORK/business state):
 * - `filaCreando` — WHICH row's inline "+ Nueva categoría" form is open
 *   (`FilaRevision`'s own docblock covers that flow); a single value gives
 *   "at most one form open across the table" for free.
 * - `gruposColapsados` — the Set of collapsed group keys (bucket ·
 *   categoría, `GrupoFilaPorCategoria.clave`) behind the per-group accordion
 *   (2026-08-30 polish, re-keyed by category in T2); empty = all open.
 *
 * D-07: when `catalogo.tag === 'cargando'` or `'error'`, the table still
 * renders (rows, amounts, Duplicado badges are backend data independent of the
 * catalog). A non-blocking inline affordance appears for the error case so
 * the user understands why the cascade selects are unavailable, without hiding
 * the preview data.
 *
 * Design critique round-8, P2-B (contextual help): a small, quiet `<Link>`
 * next to the inline "Grupo" definition (below) points screen-reader and
 * first-time users straight at the glossary (`/ayuda#ayuda-glosario`) that
 * defines "bucket" — previously that definition was only reachable by
 * abandoning the upload flow to find `/ayuda` on its own nav item.
 *
 * Design critique round-10, P3 (inline definition at point of use): the
 * round-8 P2-B glossary `<Link>` pointed first-timers at `/ayuda#ayuda-
 * glosario` for the definition of "bucket", but reaching it meant abandoning
 * the upload flow mid-review. A plain, always-visible `text-xs
 * text-muted-foreground` line right above that link states the definition
 * inline ("el grupo 50/30/20 al que va el gasto…") — no tooltip/popover
 * library, no `title`/`aria-describedby` hint mechanism (craft-floor idiom:
 * quiet visible text over hover-gated affordances). The `Link` stays for
 * anyone who wants the fuller glossary entry; the two are complementary, not
 * redundant — one is the one-line answer, the other is the depth.
 */

/**
 * Group header text: "{Bucket label} · {Categoría nombre}" via
 * `ETIQUETA_BUCKET` (so Deseos reads "Gustos"), except for the two group
 * shapes with no real categoría (`categoriaId === null`: `ingreso` and
 * `sin-categoria`, `agrupar-filas-por-categoria-sugerida.ts`) — those show
 * just their own label ("Ingreso" / "Sin categoría"), never a "· Ingreso"
 * or "· Sin categoría" suffix on top of itself.
 */
function etiquetaGrupo(grupo: GrupoFilaPorCategoria): string {
  if (grupo.categoriaId === null) return grupo.categoriaNombre;
  const etiquetaBucket = grupo.bucket
    ? (ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket)
    : '';
  return `${etiquetaBucket} · ${grupo.categoriaNombre}`;
}

export function PreviewMuestra({
  banco,
  filas,
  resumen,
  edits,
  onEditChange,
  catalogo,
  esDemo = false,
  onCategoriaCreada = () => undefined,
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
  /**
   * crear-categoria-desde-preview PR3 (D-08/D-10) — `esDemo`/
   * `onCategoriaCreada` are pure pass-through to every `FilaRevision`
   * (default no-op/false so pre-existing callers/tests keep compiling
   * unchanged). `filaCreando` — WHICH row's inline creation form is open —
   * is owned HERE, not in `SubirCartola`: same class of ephemeral table UI
   * state as `gruposColapsados`, and a single value gives "at most one form
   * open across the table" for free.
   */
  readonly esDemo?: boolean;
  readonly onCategoriaCreada?: (
    rowIndex: number,
    categoria: CategoriaDto,
  ) => void;
}) {
  const [filaCreando, setFilaCreando] = useState<number | null>(null);
  // Accordion state per date group (polish pass, 2026-08-30): the Set holds
  // the keys of COLLAPSED groups, so the default (empty Set) is "everything
  // open" — a review flow must never hide work by default; collapsing is
  // the user's way of parking a date they're done with. Keyed by the same
  // `${fecha}-${indiceGrupo}` string the group `key` uses, so a
  // non-consecutive repeat of a date (see `agruparPorFecha`) collapses
  // independently. Collapsed groups stay in the DOM (`hidden`, not
  // unmounted) so each FilaRevision keeps its mid-cascade `bucketUI`.
  const [gruposColapsados, setGruposColapsados] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // Prefixes for the `aria-controls` ids of the per-group lists and the
  // `aria-labelledby` of the Movimientos section (groups render in a map,
  // so a static id would collide across groups).
  const idBase = useId();
  const idTituloMovimientos = `${idBase}-movimientos`;

  function handleToggleGrupoAbierto(clave: string) {
    setGruposColapsados((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) {
        next.delete(clave);
      } else {
        next.add(clave);
      }
      return next;
    });
  }

  // D-05: merged display value computed once — edits win over
  // sugerido.categoriaId (round-10 CRITICAL follow-up: extracted to
  // `resolverCategoriaMerged` so `SubirCartola`'s discard confirm reads the
  // SAME rule instead of a second copy that could drift). Backs the
  // `categoriaId` prop each FilaRevision receives — indexed by `rowIndex`
  // since grouping (below) walks the raw `filas`, not this map.
  const categoriaMergedPorFila = new Map<number, string | null>(
    filas.map((fila) => [fila.rowIndex, resolverCategoriaMerged(fila, edits)]),
  );

  // Grouped by the SERVER SUGGESTION, never the merged edit above — see the
  // docblock's "Grouping key" paragraph.
  const grupos = agruparFilasPorCategoriaSugerida(filas, catalogo);

  // Focus continuity across a group re-render (T2 + WEB-PRV-15/17): since
  // grouping now keys off `sugerido`, a preview re-run that changes a row's
  // suggested classification (e.g. right after creating a categoría from
  // that row, WEB-PRV-15) moves the row's whole subtree to a DIFFERENT
  // group's `<ul>` — a different React parent, which unmounts/remounts it
  // regardless of its own `key` (React only preserves a keyed node across
  // siblings of the SAME parent, never across parents). `FilaRevision`'s own
  // `cerrarCreacionYRestaurarFoco` returns focus to that row's "+" trigger
  // synchronously, right before the re-run it triggers — if the trigger's
  // OLD node is torn down while still focused, the browser drops focus to
  // `<body>` with nothing to restore it.
  //
  // `filaEnfocadaAntes` is read from `document.activeElement` DURING render,
  // BEFORE this render's DOM mutations commit — the one point a function
  // component can still see the PREVIOUS commit's DOM. React's documented
  // "adjust state during render" idiom (same technique `FilaRevision` uses
  // for `bucketUI`/`prevCategoriaId`) is used here rather than a ref write
  // (`react-hooks/refs` forbids mutating a ref's `.current` during render):
  // calling `setState` conditionally during render restarts this render
  // pass with the new value BEFORE anything commits, so by the time this
  // component actually paints, `filaEnfocadaAntes` already holds the
  // rowIndex whose trigger was focused at the START of this render — i.e.
  // still the OLD DOM. The effect below then only ACTS when, after commit,
  // focus actually fell to `<body>` — i.e. exactly the remount case above,
  // never a deliberate user blur.
  const [filaEnfocadaAntes, setFilaEnfocadaAntes] = useState<number | null>(
    null,
  );
  if (typeof document !== 'undefined') {
    const activo = document.activeElement;
    const rowIndexActivo =
      activo instanceof HTMLElement && activo.hasAttribute('data-fila-trigger')
        ? Number(activo.getAttribute('data-fila-trigger'))
        : null;
    if (rowIndexActivo !== filaEnfocadaAntes) {
      setFilaEnfocadaAntes(rowIndexActivo);
    }
  }

  useEffect(() => {
    if (filaEnfocadaAntes === null) return;
    if (document.activeElement !== document.body) return;
    const trigger = document.querySelector<HTMLElement>(
      `[data-fila-trigger="${filaEnfocadaAntes}"]`,
    );
    trigger?.focus();
  }, [grupos, filaEnfocadaAntes]);

  return (
    <div className="flex flex-col gap-4">
      {/* Cartola identity block — extracted to `ResumenCartola`
          (cartola-preview-confirmacion PR9, D-08); PR10 reuses it at the
          `decidiendo` decision step. See that component's docblock for the
          design history (polish pass 2026-08-30: tinted surface, typographic
          hierarchy, number-over-label stats). */}
      <ResumenCartola banco={banco} resumen={resumen} />

      {/* D-07: non-blocking catalog loading affordance (fix 5) */}
      {catalogo.tag === 'cargando' && (
        <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
      )}

      {/* D-07: non-blocking catalog error affordance */}
      {catalogo.tag === 'error' && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-error-foreground">
          No se pudo cargar el catálogo de categorías. La clasificación no está
          disponible, pero puedes revisar los montos y continuar.
        </p>
      )}

      {/* Full filas list — no pagination (product decision 4, WEB-PRV-02).
          Polish pass (2026-08-30): the whole review list is ONE <section>
          that runs edge to edge like a table (SubirCartola's preview
          <section> is unboxed and unpadded, so no negative margin is
          needed): sticky header band on top
          (`border-y`, `bg-muted/40` wash), inset rows in the middle, and a
          closing `border-b` at the bottom so the action buttons rendered
          after it by SubirCartola sit under a visible edge. The cartola
          block above uses the same wash but as a ROUNDED INSET object;
          shape tells them apart, the shared token keeps one vocabulary. */}
      {filas.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          No hay movimientos para mostrar en este archivo.
        </p>
      ) : (
        <section
          aria-labelledby={idTituloMovimientos}
          data-seccion-movimientos
          className="flex flex-col border-b border-border"
        >
          {/* Sticky section header — plain visible text, no live region
            (SubirCartola's announcer owns state-entry announcements).
            Opens with the section title ("Movimientos", sibling `h3` of the
            banco heading, above the per-date `h4`s) so the stuck header
            still names what it controls. `bg-muted` is deliberately the
            OPAQUE token, not the `/40` wash the cartola block and the group
            headers use: this element sticks OVER the rows, and a
            translucent wash let descriptions and selects bleed through it
            (caught in the 2026-08-30 screenshot round). */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 border border-border bg-muted px-4 py-3">
            <h3
              id={idTituloMovimientos}
              className="text-base font-medium text-foreground"
            >
              Movimientos
            </h3>
            {/* Round-10 critique P3 fix 4 + minimalist pass: the inline
              "bucket" definition and the P2-B glossary link share ONE
              always-visible line (" · " separator) instead of two stacked
              lines saying related things twice — the definition answers it
              in place, the link is the depth for anyone who wants more.
              Plain muted text-xs line (craft-floor idiom: no tooltip/popover
              library, no title/aria-describedby hint mechanism); the icon is
              dropped — the link's own underline already signals it's
              interactive, so the glyph was decoration, not information. */}
            <p className="px-2 text-xs text-muted-foreground">
              <strong className="font-medium">Grupo</strong>: el 50/30/20 al que
              va el gasto (Necesidades, Gustos o Ahorro). ·{' '}
              <Link
                to="/ayuda"
                hash="ayuda-glosario"
                className="underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Ayuda: qué es un grupo
              </Link>
            </p>
          </div>

          <div className="flex flex-col gap-3 px-1 py-3 border-x">
            {grupos.map((grupo, indiceGrupo) => {
              // T2: keyed by the group's own STABLE identity (bucket ·
              // categoriaId, `GrupoFilaPorCategoria.clave`) instead of a
              // date-derived index — a group's key no longer shifts when an
              // edit changes which rows land elsewhere on the next preview
              // run, and accordion open/closed state survives a re-render
              // that adds/removes rows from OTHER groups.
              const claveGrupo = grupo.clave;
              const idListaGrupo = `${idBase}-grupo-${indiceGrupo}`;
              const abierto = !gruposColapsados.has(claveGrupo);
              const conteoGrupo = grupo.filas.length;

              return (
                <div
                  key={claveGrupo}
                  data-grupo-categoria={claveGrupo}
                  data-abierto={abierto}
                  className="flex flex-col rounded-lg border border-border"
                >
                  {/* Group header = accordion toggle. The `h4` wraps the
                  button (heading-with-button is the standard accordion
                  header pattern) and its accessible name is "{Bucket ·
                  Categoría} · N movimientos" — the count is part of the
                  heading on purpose: it's what tells the user how much work
                  a collapsed group still holds. */}
                  {/* Panel framing (2026-08-30): header + rows share ONE
                      bordered frame so containment is unmistakable — the
                      header is the frame's tinted top band, the rows sit
                      inside it. Collapsed, the header drops its `border-b`
                      (nothing below it to separate from); open, it draws
                      the divider. (2026-08-31: the corner rounding that
                      used to toggle here went away with the squared
                      `--radius: 0` system.) No `overflow-hidden` on the frame: it
                      would clip the toggle's focus ring. */}
                  <div
                    className={`flex items-center gap-2 bg-muted/40 px-3 py-1 ${abierto ? 'border-b border-border' : ''}`}
                  >
                    <h4 className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <IconoCategoriaBadge
                        icono={grupo.icono}
                        bucket={grupo.bucket ?? ''}
                      />
                      <button
                        type="button"
                        aria-expanded={abierto}
                        aria-controls={idListaGrupo}
                        onClick={() => handleToggleGrupoAbierto(claveGrupo)}
                        className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-medium text-foreground tabular-nums hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="min-w-0 truncate">
                          {etiquetaGrupo(grupo)}{' '}
                          <span className="font-normal text-muted-foreground">
                            · {conteoGrupo}{' '}
                            {conteoGrupo === 1 ? 'movimiento' : 'movimientos'}
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
                  {/* Collapsed = `hidden`, NOT unmounted: FilaRevision's
                    mid-cascade `bucketUI` (bucket picked, categoría not yet)
                    would be lost on remount. Tailwind v4's preflight makes
                    `[hidden]` win over the `flex` utility (`!important`),
                    and the class swap below is belt-and-braces for it. */}
                  <ul
                    id={idListaGrupo}
                    hidden={!abierto}
                    className={
                      abierto
                        ? 'flex flex-col gap-2 divide-y divide-border px-3'
                        : 'hidden'
                    }
                  >
                    {grupo.filas.map((fila) => (
                      <FilaRevision
                        key={fila.rowIndex}
                        fila={fila}
                        categoriaId={
                          categoriaMergedPorFila.get(fila.rowIndex) ?? null
                        }
                        catalogo={catalogo}
                        onEditChange={onEditChange}
                        esDemo={esDemo}
                        onCategoriaCreada={onCategoriaCreada}
                        filaCreando={filaCreando}
                        onAbrirCreacion={setFilaCreando}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
