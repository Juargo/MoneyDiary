import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, FileText, X } from 'lucide-react';
import { FilaRevision } from './FilaRevision';
import { Button } from './ui/button';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { resolverCategoriaMerged } from '@/domain/resolver-categoria-merged';
import type { CategoriaDto, PreviewFilaDto, CatalogoEstado } from '@/api/types';

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
 * - `categoriaToolbar` — the toolbar's single categoría selection (round-9
 *   P2, see below); independent from any single row's `bucketUI` in
 *   FilaRevision, which keeps its own separate bucket→categoría cascade.
 * - `gruposColapsados` — the Set of collapsed date-group keys behind the
 *   per-date accordion (2026-08-30 polish); empty = all open; reset on
 *   every filter change (see `cambiarFiltro`).
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
 * clears `seleccionados`/`categoriaToolbar`. No network request happens here
 * either way (ADR-024) — only the extra click was removed.
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
 * moment. The master "select all visible" checkbox stays put either way
 * (selection state doesn't change what it does), and the readout comes back
 * the instant the selection is cleared. Conditional render, no live region —
 * nothing here needs an announcement, it's a visibility change on
 * already-static text.
 *
 * Design critique round-8, P2-A (bulk-apply toolbar distill): while a
 * selection is active the region surfaced ~6 simultaneous controls
 * (select-all checkbox, "Solo sin clasificar" toggle, count pill with
 * embedded dismiss, bucket select, categoría select, Aplicar) — over the
 * ≤4 working-memory budget (superseded by round-9's structural fix below,
 * which removes the bucket select outright rather than hiding a control).
 * Fix mirrors the P4 progress-collapse EXACTLY:
 * `{seleccionados.size === 0 && (...)}` around the "Solo sin clasificar"
 * `<Button>`, same conditional idiom, same restore-on-clear behavior (the
 * button reappears with whatever `aria-pressed` value `soloSinClasificar`
 * already held — that state is never touched by this fix).
 *
 * Reconciliation with filter state (explicit product decision): if
 * `soloSinClasificar` is already ON when the first row gets selected, the
 * fix does NOT clear the filter — it only hides the toggle button.
 * `filasVisibles` keeps filtering on the unchanged `soloSinClasificar`
 * value, so the exact same filtered rows stay on screen; only the control
 * for changing that filter becomes reachable again once the selection is
 * cleared. This was chosen over auto-clearing the filter because clearing
 * it would reflow the list (previously-hidden classified rows reappearing)
 * at the exact moment the user commits to a selection — the more
 * surprising of the two options. Freezing the toggle instead changes
 * nothing about what's on screen; the user simply can't touch that one
 * control until they finish or cancel the bulk action, same as any other
 * toolbar control that's momentarily out of reach during a task.
 *
 * Design critique round-8, P2-B (contextual help): a small, quiet
 * `<Link>` next to the Bucket/Categoría column legend points screen-reader
 * and first-time users straight at the glossary (`/ayuda#ayuda-glosario`)
 * that defines "bucket" — previously that definition was only reachable by
 * abandoning the upload flow to find `/ayuda` on its own nav item. It sits
 * OUTSIDE the `aria-hidden` `data-columnas-header` row (that row is
 * decorative, sm+-only) so it stays in the accessibility tree and visible
 * at every breakpoint, and it renders unconditionally within the sticky
 * header (not gated by `seleccionados.size` or `soloSinClasificar`) since
 * it is reference information, not a working-memory-budget control.
 *
 * Design critique round-10, P3 (inline definition at point of use): the
 * round-8 P2-B glossary `<Link>` pointed first-timers at `/ayuda#ayuda-
 * glosario` for the definition of "bucket", but reaching it meant abandoning
 * the upload flow mid-review. A plain, always-visible `text-xs
 * text-muted-foreground` line right above that link now states the
 * definition inline ("el grupo 50/30/20 al que va el gasto…") — no
 * tooltip/popover library, no `title`/`aria-describedby` hint mechanism
 * (craft-floor idiom: quiet visible text over hover-gated affordances). The
 * `Link` stays for anyone who wants the fuller glossary entry; the two are
 * complementary, not redundant — one is the one-line answer, the other is
 * the depth.
 *
 * Design critique round-9, P2 (structural distill, bulk-apply toolbar): three
 * prior rounds (P2 fix 2, P4, round-8 P2-A) trimmed the toolbar by hiding or
 * folding controls, but the bucket→categoría two-select cascade itself
 * survived every diet — it was still 2 of the toolbar's zones. The domain
 * fact that unlocks the real fix: every categoría belongs to exactly ONE
 * bucket (`CategoriaDto.bucket`), so choosing a categoría already determines
 * its bucket — the bucket select was never adding a degree of freedom, only
 * ceremony. Fix replaces the cascade with ONE native `<select>` whose options
 * are grouped with `<optgroup label={ETIQUETA_BUCKET[bucket]}>` per bucket
 * (`catalogo.grupos`' own order — the same order `agruparPorBucket` already
 * fixed), each `<option value={categoria.id}>`. The toolbar is now 4 total
 * controls: master checkbox (in the header above, untouched) + count pill
 * with dismiss + the one categoría select + Aplicar.
 *
 * `bucketToolbar` state is gone, not merely hidden — there was never a
 * `bucket` field in the `onEditChange` payload even under the old cascade
 * (`handleAplicarBulk` always wrote `categoriaToolbar` alone), so this is a
 * pure UI simplification with zero apply-payload change. `FilaRevision`'s
 * OWN per-row cascade is untouched — that one seeds `bucketUI` from
 * `sugerido`/edited state per row (a different problem this distill doesn't
 * try to solve) and is out of scope here.
 *
 * The combined select leads with a neutral placeholder option
 * (`{ value: '', label: 'Selecciona una categoría' }`, distinct from
 * `SENTINEL_OPTION`'s "Sin categoría" — that phrase means "explicitly
 * uncategorized," which is not what an unselected toolbar control means) and
 * stays disabled while `catalogo.tag !== 'listo'`, mirroring the old
 * cascade's degraded-catalog behavior. "Aplicar" stays disabled until a
 * categoría is chosen — same gating semantics as the old "both selects
 * filled" rule, now expressed as "the one select is filled."
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
 * Used by the per-date-group "Seleccionar todas" control and the page-level
 * master checkbox.
 */
function CheckboxIndeterminado({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
  hitTarget = false,
}: {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly onChange: () => void;
  readonly ariaLabel: string;
  /**
   * hitTarget (round-9 critique P1 fix 2, WCAG 2.2 AA SC 2.5.8; fresh-review
   * fix, jsx-a11y/label-has-associated-control) — when `true`, wraps the
   * checkbox in its OWN `<label className="inline-flex size-6 ...">` so the
   * interactive area grows to 24×24 CSS px while the checkbox stays size-4
   * visually. This wrapping MUST live inside this component, not at the call
   * site: `jsx-a11y/label-has-associated-control` can only see a `<label>`
   * as valid when it directly contains a recognized control (`input`,
   * `select`, …) in the SAME JSX subtree — it cannot see through a custom
   * component boundary. A `<label>` wrapped around `<CheckboxIndeterminado
   * />` from the outside is exactly what tripped that rule; wrapping the
   * literal `<input>` here instead resolves it for real (not via
   * eslint-disable).
   *
   * Default `false`: the master "select all visible" checkbox is already
   * embedded inside an OUTER `<label>` that also carries its own visible
   * text — that label gets its `min-h-6` hit-target fix directly at its
   * call site. A SECOND `<label>` around just this input would be invalid
   * HTML (nested `<label>` elements can double-fire the toggle), so the
   * master call site leaves this prop at its default and renders the bare
   * `<input>`.
   */
  readonly hitTarget?: boolean;
}) {
  const input = (
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

  if (!hitTarget) {
    return input;
  }

  return (
    <label className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center">
      {input}
    </label>
  );
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
   * state as `seleccionados`/`gruposColapsados`, and a single value gives
   * "at most one form open across the table" for free.
   */
  readonly esDemo?: boolean;
  readonly onCategoriaCreada?: (
    rowIndex: number,
    categoria: CategoriaDto,
  ) => void;
}) {
  const [soloSinClasificar, setSoloSinClasificar] = useState(false);
  const [filaCreando, setFilaCreando] = useState<number | null>(null);
  const [seleccionados, setSeleccionados] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [categoriaToolbar, setCategoriaToolbar] = useState('');
  // Accordion state per date group (polish pass, 2026-08-30): the Set holds
  // the keys of COLLAPSED groups, so the default (empty Set) is "everything
  // open" — a review flow must never hide work by default; collapsing is
  // the user's way of parking a date they're done with. Keyed by the same
  // `${fecha}-${indiceGrupo}` string the group `key` uses, so a
  // non-consecutive repeat of a date (see `agruparPorFecha`) collapses
  // independently. That index is only stable for a FIXED `filasVisibles`:
  // toggling "Solo sin clasificar" can drop or reorder groups, so the Set
  // is reset on every filter change (`cambiarFiltro`) instead of letting a
  // stale key silently re-expand or mis-collapse a different date — a
  // filter toggle shows a fresh, fully expanded list. Collapsed groups stay
  // in the DOM (`hidden`, not unmounted) so each FilaRevision keeps its
  // mid-cascade `bucketUI`.
  const [gruposColapsados, setGruposColapsados] = useState<ReadonlySet<string>>(
    new Set(),
  );

  function cambiarFiltro(soloSinClasificarNuevo: boolean) {
    setSoloSinClasificar(soloSinClasificarNuevo);
    setGruposColapsados(new Set());
  }
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
  // progress count, the filter, and the `categoriaId` prop each
  // FilaRevision receives.
  const filasConMerged: FilaConMerged[] = filas.map((fila) => ({
    fila,
    categoriaMerged: resolverCategoriaMerged(fila, edits),
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

  function handleAplicarBulk() {
    if (!categoriaToolbar) return;
    for (const rowIndex of seleccionados) {
      onEditChange(rowIndex, categoriaToolbar);
    }
    setSeleccionados(new Set());
    setCategoriaToolbar('');
  }

  function handleLimpiarSeleccion() {
    setSeleccionados(new Set());
  }

  const etiquetaSeleccionadas =
    seleccionados.size === 1 ? 'seleccionada' : 'seleccionadas';

  // Round-9 P2: the toolbar's combined categoría select, grouped by bucket —
  // `catalogo.grupos` order IS the group order (agruparPorBucket already
  // fixed it, D-06). Each group becomes one `<optgroup>`; the bucket itself
  // is never selected directly, only derived (every categoría belongs to
  // exactly one bucket — see docblock).
  const gruposCategoriaToolbar =
    catalogo.tag === 'listo' ? catalogo.grupos : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Cartola identity block (polish pass, 2026-08-30): the file's
          metadata used to render as three loose text lines (banco heading,
          meta line, "nada se ha guardado") that sat flush against the
          review list in the same white card — nothing told the eye where
          "the file" ended and "the rows to work on" began. It now lives on
          its own tinted surface (`bg-muted/40` + Mist border: the same
          quiet notice idiom `states/Empty` and `DemoUploadNudge` already
          use in this pass — surface, not color, because it carries no
          estado). Inside, hierarchy is typographic only: banco as the
          block's title, the three counts as number-over-label stats
          (no per-stat boxes), and the "nothing saved" line demoted to the
          block's footnote. Nothing here is a control; it is reference
          information the user reads once. */}
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
              <h3 className="truncate text-base font-semibold text-foreground">
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
              <dd className="text-lg leading-tight font-semibold text-foreground">
                {resumen.totalFilas}
              </dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">Duplicados</dt>
              <dd className="text-lg leading-tight font-semibold text-foreground">
                {resumen.duplicadosDetectados}
              </dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-muted-foreground">Nuevas</dt>
              <dd className="text-lg leading-tight font-semibold text-foreground">
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
      </div>

      {/* D-07: non-blocking catalog loading affordance (fix 5) */}
      {catalogo.tag === 'cargando' && (
        <p className="text-sm text-muted-foreground">Cargando catálogo…</p>
      )}

      {/* D-07: non-blocking catalog error affordance */}
      {catalogo.tag === 'error' && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          No se pudo cargar el catálogo de categorías. La clasificación no está
          disponible, pero puedes revisar los montos y continuar.
        </p>
      )}

      {/* Full filas list — no pagination (product decision 4, WEB-PRV-02).
          Polish pass (2026-08-30): the whole review list is ONE full-bleed
          <section> — `-mx-4` cancels the `p-4` of SubirCartola's preview
          <section> (its only caller; keep the two in sync) so the block
          runs edge to edge like a table: sticky header band on top
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
          className="-mx-4 flex flex-col border-b border-border"
        >
          {/* Sticky classification progress — plain visible text, no live
            region (SubirCartola's announcer owns state-entry
            announcements). Opens with the section title ("Movimientos",
            sibling `h3` of the banco heading, above the per-date `h4`s) so
            the stuck header still names what it controls. `bg-muted` is
            deliberately the OPAQUE token, not the `/40` wash the cartola
            block and the group headers use: this element sticks OVER the
            rows, and a translucent wash let descriptions and selects bleed
            through it (caught in the 2026-08-30 screenshot round). */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 border-y border-border bg-muted px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                id={idTituloMovimientos}
                className="text-base font-semibold text-foreground"
              >
                Movimientos
              </h3>
              {/* P2-A distill: hidden while a selection is active — see the
                docblock's "Reconciliation with filter state" note above.
                `soloSinClasificar` itself is untouched, so the filtered
                view never changes and the button reappears in the same
                pressed state once the selection clears. */}
              {seleccionados.size === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={soloSinClasificar}
                  onClick={() => cambiarFiltro(!soloSinClasificar)}
                >
                  Solo sin clasificar
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                {seleccionablesVisibles.length > 0 && (
                  // Round-9 critique P1 fix 2 (WCAG 2.2 AA SC 2.5.8): this
                  // `<label>` already wraps the checkbox AND its visible text
                  // ("Seleccionar todas las visibles (N)"), so clicking the
                  // text already toggles it — the only gap is HEIGHT (14px/20px
                  // text can sit under the 24px floor). `min-h-6` raises the
                  // label's own box to 24 CSS px without touching the
                  // checkbox's size-4 visual glyph. A second, nested `<label>`
                  // around just the input was rejected: nested `<label>`
                  // elements are invalid HTML and can double-fire the toggle.
                  <label className="flex min-h-6 items-center gap-2 text-sm font-medium text-foreground">
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
              </div>
              {/* P4 distill: hidden while a selection is active — the
                bulk-apply toolbar's count pill already carries the live
                number, so this text would be a second, redundant count.
                Polish pass: right-aligned (`ml-auto`) so the row reads
                "control on the left, readout on the right"; the "N de M
                clasificadas" run stays as DIRECT text nodes of this <p> —
                `getByText(/1 de 2 clasificadas/)` only sees an element's
                own text nodes, so wrapping the numbers in a span would
                break that test. */}
              {seleccionados.size === 0 && (
                <p className="ml-auto text-sm font-medium text-foreground tabular-nums">
                  {clasificadas} de {totalNoDuplicadas} {etiquetaClasificadas}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {duplicadosCount} {etiquetaDuplicadas}
                  </span>
                </p>
              )}
            </div>
            {/* P4 distill: same collapse as the progress text above — this
              bar restates the same ratio, so it hides alongside it. */}
            {seleccionados.size === 0 && (
              <div
                aria-hidden="true"
                className="h-1.5 w-full overflow-hidden rounded-none bg-muted"
              >
                <div
                  data-progreso-fill
                  className="h-full rounded-none bg-primary transition-[width] motion-reduce:transition-none"
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
            {/* Round-10 critique P3 fix 4 + minimalist pass: the inline
              "bucket" definition and the P2-B glossary link now share ONE
              always-visible line (" · " separator) instead of two stacked
              lines saying related things twice — the definition answers it
              in place, the link is the depth for anyone who wants more.
              Plain muted text-xs line (craft-floor idiom: no tooltip/popover
              library, no title/aria-describedby hint mechanism); the icon is
              dropped — the link's own underline already signals it's
              interactive, so the glyph was decoration, not information. */}
            <p className="px-2 text-xs text-muted-foreground">
              <strong className="font-medium">Bucket</strong>: el grupo 50/30/20
              al que va el gasto (Necesidades, Gustos o Ahorro). ·{' '}
              <Link
                to="/ayuda"
                hash="ayuda-glosario"
                className="underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Ayuda: qué es un bucket
              </Link>
            </p>
          </div>

          {soloSinClasificar && filasVisibles.length === 0 ? (
            <div className="m-4 flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              <p>Todas las filas están clasificadas.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cambiarFiltro(false)}
              >
                Mostrar todas las filas
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 py-3">
              {grupos.map((grupo, indiceGrupo) => {
                const claveGrupo = `${grupo.fecha}-${indiceGrupo}`;
                const idListaGrupo = `${idBase}-grupo-${indiceGrupo}`;
                const abierto = !gruposColapsados.has(claveGrupo);
                const conteoGrupo = grupo.filas.length;
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
                    key={claveGrupo}
                    data-fecha-grupo={grupo.fecha}
                    data-abierto={abierto}
                    className="flex flex-col rounded-lg border border-border"
                  >
                    {/* Group header = checkbox + accordion toggle. The checkbox
                    stays OUTSIDE the toggle button (nested interactive
                    controls are invalid and would double-fire); the
                    toggle takes the rest of the row so the whole date
                    line is the hit target, chevron at the far end. The
                    `h4` wraps the button (heading-with-button is the
                    standard accordion header pattern) and its accessible
                    name is "{fecha} · N movimientos" — the count is part
                    of the heading on purpose: it's what tells the user how
                    much work a collapsed date still holds. */}
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
                      {seleccionablesGrupo.length > 0 && (
                        // Round-9 critique P1 fix 2 (WCAG 2.2 AA SC 2.5.8): this
                        // checkbox is bare — the sibling heading (the date) is
                        // NOT part of any label. `hitTarget` makes
                        // `CheckboxIndeterminado` wrap ITS OWN `<input>` in the
                        // size-6 label internally (see that component's doc
                        // comment for why the wrapping can't live out here).
                        <CheckboxIndeterminado
                          checked={todasSeleccionadas}
                          indeterminate={
                            algunaSeleccionada && !todasSeleccionadas
                          }
                          onChange={() =>
                            handleToggleGrupo(seleccionablesGrupo)
                          }
                          ariaLabel={`Seleccionar todas: ${grupo.fecha}`}
                          hitTarget
                        />
                      )}
                      <h4 className="min-w-0 flex-1 text-sm">
                        <button
                          type="button"
                          aria-expanded={abierto}
                          aria-controls={idListaGrupo}
                          onClick={() => handleToggleGrupoAbierto(claveGrupo)}
                          className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-1 text-left font-semibold text-foreground tabular-nums hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0 truncate">
                            {grupo.fecha}{' '}
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
                      {grupo.filas.map(({ fila, categoriaMerged }) => (
                        <FilaRevision
                          key={fila.rowIndex}
                          fila={fila}
                          categoriaId={categoriaMerged}
                          catalogo={catalogo}
                          onEditChange={onEditChange}
                          selected={seleccionados.has(fila.rowIndex)}
                          onToggleSelect={handleToggleFila}
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
          )}
        </section>
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
            {/* P2 design critique fix 2 (toolbar distill), round-9 P2
                (structural distill): "Limpiar selección" used to be its own
                button — a 6th simultaneous control at the highest-value
                moment. Minimalist pass: the pill+circle combo (a filled
                secondary badge wrapping a nested icon button) is replaced by
                a plain text count next to a real, WCAG-2.2-AA-sized icon
                `Button` — one less nested interactive shape, same 4-zone
                toolbar (count + dismiss + the one categoría select +
                Aplicar). The dismiss's accessible name ("Limpiar selección")
                is unchanged, so it's still reachable exactly as before via
                getByRole('button', { name: /limpiar selección/i }). */}
            <span data-conteo-pill className="text-sm font-medium">
              {seleccionados.size} {etiquetaSeleccionadas}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleLimpiarSeleccion}
              aria-label="Limpiar selección"
            >
              <X aria-hidden="true" />
            </Button>
            {/* Round-9 P2: ONE combined categoría select, grouped by bucket
                via native <optgroup> — replaces the old bucket→categoría
                two-select cascade (see docblock). Hand-rolled rather than
                `CampoSelect` because `CampoSelect`'s `options` prop is a flat
                list with no grouping support; the same
                label-wraps-sr-only-text-plus-select shape and the same
                `<select>` classes are kept for visual/accessible-name parity
                with every other select in this file. `<optgroup>` labels
                come from `ETIQUETA_BUCKET` — the "Gustos" UI label, never
                the raw "Deseos" domain key (DESIGN.md "Do label the Deseos
                bucket as Gustos"). */}
            <label className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span className="sr-only">Categoría para aplicar</span>
              <select
                value={categoriaToolbar}
                onChange={(event) => setCategoriaToolbar(event.target.value)}
                disabled={catalogo.tag !== 'listo'}
                className="rounded-md border border-input px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:opacity-50"
              >
                <option value="">Selecciona una categoría</option>
                {gruposCategoriaToolbar.map((grupo) => (
                  <optgroup
                    key={grupo.bucket}
                    label={ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket}
                  >
                    {grupo.categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nombre}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
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
