import { Button } from './ui/button'
import { formatearMontoCLP } from '@/domain/formatear-monto'
import type { PreviewTransaccionDto } from '@/api/types'

const OPCIONES_CANTIDAD = [10, 25, 50] as const

export type CantidadPreview = (typeof OPCIONES_CANTIDAD)[number]

export const CANTIDAD_PREVIEW_DEFECTO: CantidadPreview = 10

/**
 * PreviewMuestra (`us-003-vista-previa` Slice 2, design.md §9.3/§9.4) —
 * presentational sample table + 10/25/50 row-count selector (CA-01,
 * PREV-06), split out of `SubirCartola` for SRP.
 *
 * `cantidad` is a CONTROLLED prop (owned by the caller's state machine) —
 * this component only slices the already-fetched `muestra` array
 * (`muestra.slice(0, cantidad)`), it never issues a request. Selecting a
 * `cantidad` larger than `muestra.length` shows every available row with no
 * padding (`Array.prototype.slice` handles this natively, spec.md PREV-06
 * boundary scenario).
 *
 * A11y (ADR-018): the selector is a `<fieldset>`+`<legend>` group of real
 * `<button>`s (not a bare `<select>` nor color-only state) — the active
 * option carries `aria-pressed="true"`, matching the WCAG toggle-button
 * pattern.
 */
export function PreviewMuestra({
  muestra,
  banco,
  totalFilasDatos,
  cantidad,
  onCantidadChange,
}: {
  readonly muestra: ReadonlyArray<PreviewTransaccionDto>
  readonly banco: string
  readonly totalFilasDatos: number
  readonly cantidad: CantidadPreview
  readonly onCantidadChange: (cantidad: CantidadPreview) => void
}) {
  const filas = muestra.slice(0, cantidad)

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <dt className="font-medium">Banco</dt>
        <dd>{banco}</dd>
        <dt className="font-medium">Movimientos en total</dt>
        <dd>{totalFilasDatos}</dd>
      </dl>

      <fieldset className="flex items-center gap-2">
        <legend className="text-sm font-medium text-muted-foreground">Filas a mostrar</legend>
        {OPCIONES_CANTIDAD.map((opcion) => (
          <Button
            key={opcion}
            type="button"
            variant={cantidad === opcion ? 'default' : 'outline'}
            size="sm"
            aria-pressed={cantidad === opcion}
            onClick={() => onCantidadChange(opcion)}
          >
            {opcion}
          </Button>
        ))}
      </fieldset>

      {filas.length === 0 ? (
        // FIX 3 (review, WARNING): a file with 0 data rows is a legitimate
        // outcome (`totalFilasDatos: 0`) — render a labeled empty state
        // instead of a phantom empty `<ul>`.
        <p role="status" className="text-sm text-muted-foreground">
          No hay movimientos para mostrar en este archivo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((fila, indice) => (
            // El DTO no trae `id` — la key combina los campos disponibles + el
            // índice (mismo patrón que el `<ul>` de resultado de SubirCartola).
            <li
              key={`${fila.fecha}-${fila.descripcion}-${fila.cargo}-${fila.abono}-${indice}`}
              className="flex flex-col gap-1 rounded-lg border border-border bg-muted p-2 text-sm"
            >
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{fila.fecha.slice(0, 10)}</span>
                <span className="font-medium">{fila.descripcion}</span>
              </div>
              <div className="flex items-center justify-between text-foreground">
                <span>
                  Cargo: <span className="font-medium">{formatearMontoCLP(fila.cargo)}</span>
                </span>
                <span>
                  Abono: <span className="font-medium">{formatearMontoCLP(fila.abono)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
