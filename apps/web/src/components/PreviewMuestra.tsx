import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { FilaRevision } from './FilaRevision';
import { ResumenCartola } from './ResumenCartola';
import { IconoCategoriaBadge } from './IconoCategoriaBadge';
import { resolverCategoriaMerged } from '@/domain/resolver-categoria-merged';
import {
  agruparFilasPorBucketYCategoria,
  type GrupoNivel1,
} from '@/domain/agrupar-filas-por-bucket-y-categoria';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import type { CategoriaDto, PreviewFilaDto, CatalogoEstado } from '@/api/types';

/**
 * PreviewMuestra (US-059 PR2, D-12; TWO-LEVEL accordion, preview-acordeon-
 * bucket T1) — review table shell for the cartola upload preview.
 *
 * Receives the canonical preview response props (`filas`, `resumen`) along
 * with the edits overlay (`edits`, `onEditChange`) and the catalog state
 * (`catalogo`). Maps every fila to a `<FilaRevision>` with the merged display
 * value (D-05: `edits` wins over `sugerido`).
 *
 * This component issues NO network requests and computes NO business values —
 * ADR-024 still holds: grouping by bucket → categoría
 * (`agruparFilasPorBucketYCategoria`, preview-acordeon-bucket T1, extends
 * preview-agrupacion-categoria T2) is presentation, never a recomputation of
 * amounts, dedup, or classification rules. Product decision 4 renders the
 * full list without pagination or virtualization; a nested accordion (below)
 * makes that full list navigable instead.
 *
 * Grouping key = the SERVER SUGGESTION (`fila.sugerido`), never the merged
 * edit — a row the user reclassifies via its own select STAYS in its
 * original group until the preview is reloaded/re-run. This is why the
 * grouping call below takes `filas` directly, not `filasConMerged`: the
 * merged value only feeds each row's own `categoriaId` prop, never the
 * group it lands in.
 *
 * ACCORDION SHAPE (2026-09-25 product decision, preview-acordeon-bucket):
 * - Level 1 — one entry per PRESENT bucket (Necesidades, Gustos, Ahorro,
 *   Ingreso), in that order, then a TRAILING "Revisar" entry (T2) for rows
 *   the domain fn cannot place under a real bucket (`GrupoRevisar` —
 *   `sugerido: null` or an unrecognized bucket) — present ONLY when at
 *   least one such row exists; never visible in the normal flow, since the
 *   API always sends a known bucket. Header = UI label (or literally
 *   "Revisar") + row count.
 * - Level 2 — inside Necesidades/Gustos/Ahorro only: one entry per categoría
 *   of that bucket (`IconoCategoriaBadge` + name + row count). Ingreso and
 *   Revisar have no categoría — their panels show their rows DIRECTLY (no
 *   level 2), since `agruparFilasPorBucketYCategoria` always returns
 *   `categorias: []` for Ingreso and `GrupoRevisar` has no `categorias`
 *   field at all (`kind: 'revisar'` discriminates it from `GrupoBucket`).
 * - BOTH levels start COLLAPSED (assumption, feature doc: "al presionar se
 *   despliegue" — a bucket/categoría accordion is a drill-down, not a
 *   review list that must stay fully open like the old flat one).
 *
 * Local state (all ephemeral UI, none of it NETWORK/business state):
 * - `filaCreando` — WHICH row's inline "+ Nueva categoría" form is open
 *   (`FilaRevision`'s own docblock covers that flow); a single value gives
 *   "at most one form open across the table" for free.
 * - `bucketsExpandidos` / `categoriasExpandidas` — the Sets of EXPANDED keys
 *   (bucket name / categoría `clave`) for level 1 / level 2. Empty = ALL
 *   COLLAPSED (inverted from the old T2 "Set of collapsed" scheme on
 *   purpose: a two-level default-collapsed accordion needs "nothing here
 *   yet" to mean closed, including for a bucket/categoría that only appears
 *   after a re-run — it must start collapsed too, which falls out for free
 *   from "not yet in the expanded set" without any extra seeding logic).
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
 * Rows to render DIRECTLY under a level-1 entry, no categoría level — `filas`
 * for Revisar, `filasDirectas` for a bucket with no categorías (today only
 * Ingreso, since `agruparFilasPorBucketYCategoria` always returns
 * `categorias: []` for it) — or `null` when the entry drills into categorías
 * instead. SINGLE discriminant (S1): `conteoGrupo` and the JSX render below
 * both call this instead of picking "direct rows vs categorías" their own
 * way, so they can never disagree on which grupo shape a bucket is.
 */
function filasDirectasDeGrupo(
  grupo: GrupoNivel1,
): ReadonlyArray<PreviewFilaDto> | null {
  if (grupo.kind === 'revisar') return grupo.filas;
  return grupo.categorias.length === 0 ? grupo.filasDirectas : null;
}

/** Total row count under one level-1 entry — direct rows, or the sum of its categorías. */
function conteoGrupo(grupo: GrupoNivel1): number {
  const directas = filasDirectasDeGrupo(grupo);
  if (directas !== null) return directas.length;
  // `filasDirectasDeGrupo` only returns `null` for a `bucket` entry that has
  // categorías (a `revisar` entry always returns its flat `filas`).
  return grupo.kind === 'bucket'
    ? grupo.categorias.reduce((total, c) => total + c.filas.length, 0)
    : 0;
}

/** Stable key for one level-1 entry's expand-state `Set` and DOM ids — the bucket name, or the fixed `'revisar'` sentinel for the Revisar entry (never a real bucket name). */
function claveNivel1(grupo: GrupoNivel1): string {
  return grupo.kind === 'revisar' ? 'revisar' : grupo.bucket;
}

function etiquetaConteo(n: number): string {
  return `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;
}

/**
 * Locates which level-1 / categoría `clave` currently holds `rowIndex`
 * inside `grupos` — used ONLY by the focus-continuity effect below to know
 * which (possibly just-created, still-collapsed) panels must open before a
 * remounted trigger can regain focus. `categoriaClave: null` means the row
 * lives directly on a level-1 entry's flat row list (Ingreso's
 * `filasDirectas`, or Revisar's `filas`), with no level 2 to expand.
 */
function ubicarFila(
  grupos: ReadonlyArray<GrupoNivel1>,
  rowIndex: number,
): { readonly clave: string; readonly categoriaClave: string | null } | null {
  for (const grupo of grupos) {
    if (grupo.kind === 'revisar') {
      if (grupo.filas.some((f) => f.rowIndex === rowIndex)) {
        return { clave: claveNivel1(grupo), categoriaClave: null };
      }
      continue;
    }
    if (grupo.filasDirectas.some((f) => f.rowIndex === rowIndex)) {
      return { clave: grupo.bucket, categoriaClave: null };
    }
    for (const categoria of grupo.categorias) {
      if (categoria.filas.some((f) => f.rowIndex === rowIndex)) {
        return { clave: grupo.bucket, categoriaClave: categoria.clave };
      }
    }
  }
  return null;
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
   * state as the accordion Sets below, and a single value gives "at most
   * one form open across the table" for free.
   */
  readonly esDemo?: boolean;
  readonly onCategoriaCreada?: (
    rowIndex: number,
    categoria: CategoriaDto,
  ) => void;
}) {
  const [filaCreando, setFilaCreando] = useState<number | null>(null);

  // Two-level accordion state (preview-acordeon-bucket T1): Sets of
  // EXPANDED keys — empty means "everything collapsed", the new default
  // (see docblock). `categoriasExpandidas` is keyed by the categoría's own
  // `clave` (already bucket-qualified, e.g. `categoria::Deseos::cat-1`), so
  // one flat Set is enough across every bucket with no collision risk.
  const [bucketsExpandidos, setBucketsExpandidos] = useState<
    ReadonlySet<string>
  >(new Set());
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<
    ReadonlySet<string>
  >(new Set());

  // Prefixes for the `aria-controls` ids of the per-group panels and the
  // `aria-labelledby` of the Movimientos section (groups render in a map,
  // so a static id would collide across groups).
  const idBase = useId();
  const idTituloMovimientos = `${idBase}-movimientos`;

  function handleToggleBucket(bucket: string) {
    setBucketsExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  }

  function handleToggleCategoria(clave: string) {
    setCategoriasExpandidas((prev) => {
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
  const grupos = agruparFilasPorBucketYCategoria(filas, catalogo);

  // Focus continuity across a group re-render (T2 + WEB-PRV-15/17, extended
  // to two levels by T1): since grouping keys off `sugerido`, a preview
  // re-run that changes a row's suggested classification (e.g. right after
  // creating a categoría from that row, WEB-PRV-15) moves the row's whole
  // subtree to a DIFFERENT bucket's and/or categoría's `<ul>` — a different
  // React parent, which unmounts/remounts it regardless of its own `key`
  // (React only preserves a keyed node across siblings of the SAME parent,
  // never across parents). `FilaRevision`'s own `cerrarCreacionYRestaurarFoco`
  // returns focus to that row's "+" trigger synchronously, right before the
  // re-run it triggers — if the trigger's OLD node is torn down while still
  // focused, the browser drops focus to `<body>` with nothing to restore it.
  //
  // Both destination panels may now be COLLAPSED by default (T1's new
  // default), so restoring focus is no longer a single DOM lookup: the
  // effect first EXPANDS the destination bucket (and, unless the row landed
  // on Ingreso's `filasDirectas`, its destination categoría) if either is
  // still collapsed, then — once that expansion has committed and the
  // trigger is no longer hidden — focuses it. Expanding via `setState`
  // triggers a re-render, and this effect re-runs on the next commit (its
  // own dependency list includes `bucketsExpandidos`/`categoriasExpandidas`)
  // to find the trigger no longer hidden.
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

  // Survives the render-phase tracker above across the EXTRA render cycle
  // that expanding a collapsed destination panel needs (T1): the very next
  // render after the remount commits with focus still sitting on `<body>`
  // (nothing has called `.focus()` yet) — the tracker above legitimately
  // reads that as "nothing relevant is focused" and resets
  // `filaEnfocadaAntes` to `null` for that render, even though restoration
  // is still in progress. A ref is untouched by that render-phase logic, so
  // it keeps the target rowIndex alive across the "expand" render and the
  // following "focus" render, one plain object identity for the whole
  // multi-render restoration instead of relying on state that gets
  // legitimately clobbered mid-sequence.
  const pendingFocoRowIndexRef = useRef<number | null>(null);

  // S1: single render helper for one `FilaRevision` row — previously written
  // out twice (once for the direct-rows panels, once for categoría panels)
  // with nine identical props each time; a prop drifting between the two
  // copies would only show up as a subtle per-panel behavior difference.
  // Closes over every prop/state this component already threads through to
  // `FilaRevision`, so a call site only ever needs the `fila` itself.
  function renderFilaRevision(fila: PreviewFilaDto) {
    return (
      <FilaRevision
        key={fila.rowIndex}
        fila={fila}
        categoriaId={categoriaMergedPorFila.get(fila.rowIndex) ?? null}
        catalogo={catalogo}
        onEditChange={onEditChange}
        esDemo={esDemo}
        onCategoriaCreada={onCategoriaCreada}
        filaCreando={filaCreando}
        onAbrirCreacion={setFilaCreando}
      />
    );
  }

  useEffect(() => {
    if (filaEnfocadaAntes !== null) {
      pendingFocoRowIndexRef.current = filaEnfocadaAntes;
    }
    const rowIndexPendiente = pendingFocoRowIndexRef.current;
    if (rowIndexPendiente === null) return;
    if (document.activeElement !== document.body) {
      // Focus is held somewhere real (still on the trigger, or the user
      // moved it on purpose) — nothing to restore, and a stale pending
      // rowIndex must not leak into a LATER, unrelated remount.
      pendingFocoRowIndexRef.current = null;
      return;
    }

    const ubicacion = ubicarFila(grupos, rowIndexPendiente);
    if (ubicacion === null) {
      pendingFocoRowIndexRef.current = null;
      return; // row no longer present in this render
    }

    const bucketColapsado = !bucketsExpandidos.has(ubicacion.clave);
    const categoriaColapsada =
      ubicacion.categoriaClave !== null &&
      !categoriasExpandidas.has(ubicacion.categoriaClave);

    if (bucketColapsado || categoriaColapsada) {
      if (bucketColapsado) {
        setBucketsExpandidos((prev) => new Set(prev).add(ubicacion.clave));
      }
      if (categoriaColapsada && ubicacion.categoriaClave !== null) {
        const clave = ubicacion.categoriaClave;
        setCategoriasExpandidas((prev) => new Set(prev).add(clave));
      }
      return; // wait for the re-render with the expanded panel(s) committed
    }

    const trigger = document.querySelector<HTMLElement>(
      `[data-fila-trigger="${rowIndexPendiente}"]`,
    );
    trigger?.focus();
    pendingFocoRowIndexRef.current = null;
  }, [grupos, filaEnfocadaAntes, bucketsExpandidos, categoriasExpandidas]);

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
            banco heading, above the per-bucket `h4`s) so the stuck header
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
            {grupos.map((grupo) => {
              const clave = claveNivel1(grupo);
              const bucketAbierto = bucketsExpandidos.has(clave);
              const idPanelBucket = `${idBase}-bucket-${clave}`;
              const conteo = conteoGrupo(grupo);
              // Ingreso and Revisar both render their rows DIRECTLY, no
              // level 2 — `null` means "this entry has categorías" instead.
              // S1: same `filasDirectasDeGrupo` discriminant `conteoGrupo`
              // uses above, so the row count and this branch can never
              // disagree on which shape a given grupo is.
              const filasPlano = filasDirectasDeGrupo(grupo);
              const etiqueta =
                grupo.kind === 'revisar'
                  ? 'Revisar'
                  : (ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket);

              return (
                <div
                  key={clave}
                  data-grupo-bucket={clave}
                  data-abierto={bucketAbierto}
                  className="flex flex-col rounded-lg border border-border"
                >
                  {/* Level 1 (bucket, or the trailing Revisar entry) header
                  = accordion toggle. The `h4` wraps the button (heading-
                  with-button is the standard accordion header pattern) and
                  its accessible name is "{label} · N movimientos" — the
                  count is part of the heading on purpose: it's what tells
                  the user how much work a collapsed entry still holds. */}
                  <div
                    className={`flex items-center gap-2 bg-muted/40 px-3 py-1 ${bucketAbierto ? 'border-b border-border' : ''}`}
                  >
                    <h4 className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <button
                        type="button"
                        aria-expanded={bucketAbierto}
                        aria-controls={idPanelBucket}
                        onClick={() => handleToggleBucket(clave)}
                        className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-medium text-foreground tabular-nums hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="min-w-0 truncate">
                          {etiqueta}{' '}
                          <span className="font-normal text-muted-foreground">
                            · {etiquetaConteo(conteo)}
                          </span>
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                            bucketAbierto ? '' : '-rotate-90'
                          }`}
                        />
                      </button>
                    </h4>
                  </div>

                  {/* Collapsed = `hidden`, NOT unmounted: FilaRevision's
                    mid-cascade `bucketUI` (bucket picked, categoría not yet)
                    and every nested categoría's own expand state would be
                    lost on remount. Tailwind v4's preflight makes `[hidden]`
                    win over the `flex` utility (`!important`), and the class
                    swap below is belt-and-braces for it. */}
                  <div
                    id={idPanelBucket}
                    hidden={!bucketAbierto}
                    className={
                      bucketAbierto ? 'flex flex-col gap-2 px-3 py-2' : 'hidden'
                    }
                  >
                    {filasPlano !== null ? (
                      // Ingreso / Revisar: no level 2 — rows render DIRECTLY.
                      <ul className="flex flex-col gap-2 divide-y divide-border">
                        {filasPlano.map(renderFilaRevision)}
                      </ul>
                    ) : grupo.kind === 'bucket' ? (
                      grupo.categorias.map((categoria) => {
                        const categoriaAbierta = categoriasExpandidas.has(
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
                            {/* Level 2 (categoría) header — icon + name +
                            count, `h5` under the bucket's `h4`. */}
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
                                  className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-medium text-foreground tabular-nums hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
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
                            <ul
                              id={idPanelCategoria}
                              hidden={!categoriaAbierta}
                              className={
                                categoriaAbierta
                                  ? 'flex flex-col gap-2 divide-y divide-border px-3'
                                  : 'hidden'
                              }
                            >
                              {categoria.filas.map(renderFilaRevision)}
                            </ul>
                          </div>
                        );
                      })
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
