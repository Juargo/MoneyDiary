import { useState } from 'react';
import { Badge } from './ui/badge';
import { CampoSelect } from './configuracion/categorias/CampoSelect';
import { formatearMontoCLP } from '@/domain/formatear-monto';
import type { PreviewFilaDto } from '@/api/types';
import type { CatalogoEstado } from '@/api/types';

/**
 * FilaRevision (US-059 PR2, D-06/D-10/D-12) — presentational per-row
 * component for the import preview review table.
 *
 * Receives one `fila` from the canonical preview response, the current
 * `categoriaId` (merged display value: edits win over sugerido, D-05), the
 * `catalogo` (computed in `SubirCartola`, never here — D-12/ADR-024), and
 * `onEditChange` for the classification overlay (categoriaId only, D-03).
 *
 * Local state: `bucketUI` — a UI-only filter for the cascade; never reaches
 * the wire. Seeds from `fila.sugerido?.bucket` only when that bucket is among
 * the loaded catalog groups (D-06); otherwise empty string.
 *
 * Duplicate rows (`fila.esDuplicado`): greyed container + "Duplicado" badge +
 * both selects `disabled` — no `onEditChange` is ever wired for them (D-10).
 *
 * A11y: accessible per-row labels via `CampoSelect`'s `label` prop +
 * optional `srOnly` (D-10). Label format: "Fila {rowIndex+1}: bucket" /
 * "Fila {rowIndex+1}: categoría" (1-based, stable, D-10).
 *
 * ADR-024: zero business logic here — amounts formatted via `formatearMontoCLP`
 * (display-only), no re-computation, no dedup logic, no Ingreso rule.
 */

const SENTINEL_OPTION = { value: '', label: 'Sin categoría' } as const;
const BUCKET_SENTINEL_OPTION = {
  value: '',
  label: 'Seleccionar bucket',
} as const;

export function FilaRevision({
  fila,
  categoriaId,
  catalogo,
  onEditChange,
}: {
  readonly fila: PreviewFilaDto;
  readonly categoriaId: string | null;
  readonly catalogo: CatalogoEstado;
  readonly onEditChange: (rowIndex: number, categoriaId: string | null) => void;
}) {
  // Seed bucketUI from sugerido.bucket only when that bucket is present among
  // the loaded catalog groups; otherwise start empty (D-06). Runs on mount
  // only — `useState` initializer runs once per component instance.
  const initialBucket =
    catalogo.tag === 'listo' && fila.sugerido?.bucket
      ? catalogo.grupos.some((g) => g.bucket === fila.sugerido!.bucket)
        ? fila.sugerido.bucket
        : ''
      : '';

  const [bucketUI, setBucketUI] = useState<string>(initialBucket);

  const n = fila.rowIndex + 1; // 1-based human-friendly label index
  const labelBucket = `Fila ${n}: bucket`;
  const labelCategoria = `Fila ${n}: categoría`;

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
    // Changing the bucket resets the categoría to the sentinel (D-06).
    onEditChange(fila.rowIndex, null);
  }

  function handleCategoriaChange(value: string) {
    onEditChange(fila.rowIndex, value === '' ? null : value);
  }

  const catalogoDisabled = catalogo.tag !== 'listo';

  if (fila.esDuplicado) {
    return (
      <li
        data-duplicado="true"
        className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-sm opacity-50"
      >
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
        <span>{fila.fecha.slice(0, 10)}</span>
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
