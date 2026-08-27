import { useState } from 'react';
import { Badge } from './ui/badge';
import { CampoSelect } from './configuracion/categorias/CampoSelect';
import {
  SENTINEL_OPTION,
  BUCKET_SENTINEL_OPTION,
} from './catalogo-select-sentinels';
import { formatearMontoCLP } from '@/domain/formatear-monto';
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
 * both selects `disabled` — no `onEditChange` is ever wired for them (D-10).
 * They never render a selection checkbox either (never selectable for bulk).
 *
 * A11y: accessible per-row labels via `CampoSelect`'s `label` prop +
 * optional `srOnly` (D-10). Label format: "Fila {rowIndex+1}: bucket" /
 * "Fila {rowIndex+1}: categoría" (1-based, stable, D-10). The selection
 * checkbox uses "Seleccionar fila {rowIndex+1}" (same numbering).
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

  // Bucket options come from the catalog groups that exist (empty buckets
  // already filtered by agruparPorBucket — D-06, verified fact §0 design.md).
  // Leading sentinel allows the user to choose "no bucket" and makes the
  // empty-string value a valid option (prevents jsdom/browser auto-selecting
  // the first real option when bucketUI is '').
  const bucketOptions =
    catalogo.tag === 'listo'
      ? [
          BUCKET_SENTINEL_OPTION,
          ...catalogo.grupos.map((g) => ({ value: g.bucket, label: g.bucket })),
        ]
      : [BUCKET_SENTINEL_OPTION];

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

  if (fila.esDuplicado) {
    return (
      <li className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-sm opacity-50">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{fila.fecha.slice(0, 10)}</span>
          <Badge variant="secondary">Duplicado</Badge>
          <span className="font-medium">{fila.descripcion}</span>
        </div>
        <div className="flex items-center justify-between text-foreground">
          <span>
            Cargo:{' '}
            <span className="font-medium">{formatearMontoCLP(fila.cargo)}</span>
          </span>
          <span>
            Abono:{' '}
            <span className="font-medium">{formatearMontoCLP(fila.abono)}</span>
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <CampoSelect
            label={labelBucket}
            srOnly
            value=""
            onChange={() => undefined}
            options={bucketOptions}
            disabled
          />
          <CampoSelect
            label={labelCategoria}
            srOnly
            value=""
            onChange={() => undefined}
            options={[SENTINEL_OPTION]}
            disabled
          />
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label={labelSeleccionar}
            checked={selected}
            onChange={() => onToggleSelect(fila.rowIndex)}
            className="size-4 shrink-0 rounded border-border accent-primary"
          />
          <span>{fila.fecha.slice(0, 10)}</span>
        </div>
        <span className="font-medium">{fila.descripcion}</span>
      </div>
      <div className="flex items-center justify-between text-foreground">
        <span>
          Cargo:{' '}
          <span className="font-medium">{formatearMontoCLP(fila.cargo)}</span>
        </span>
        <span>
          Abono:{' '}
          <span className="font-medium">{formatearMontoCLP(fila.abono)}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CampoSelect
          label={labelBucket}
          srOnly
          value={bucketUI}
          onChange={handleBucketChange}
          options={bucketOptions}
          disabled={catalogoDisabled}
        />
        <CampoSelect
          label={labelCategoria}
          srOnly
          value={categoriaId ?? ''}
          onChange={handleCategoriaChange}
          options={categoriaOptions}
          disabled={catalogoDisabled || !bucketUI}
        />
      </div>
    </li>
  );
}
