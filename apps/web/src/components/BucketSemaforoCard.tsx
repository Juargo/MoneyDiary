import { ArrowDown, ArrowUp } from 'lucide-react';
import { ZonaBar } from './ZonaBar';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import { cn } from '@/lib/utils';
import type { BucketSemaforoViewModel } from '@/domain/semaforo-detalle-view-model';

/**
 * BucketSemaforoCard — una fila por bucket de gasto en `/semaforo`
 * (US-049, design §1.7, WSEM-03/WSEM-04). Composición pura de
 * `BucketSemaforoViewModel`: etiqueta (`ETIQUETA_BUCKET`, ya "Gustos" para
 * Deseos), porcentaje vs meta, badge de estado, `ZonaBar`, y la fila de
 * consejo cuando `consejo !== null` — nunca recomputa el texto, solo lo
 * renderiza (D-05/SEM-10 ya lo trae sustituido desde el view-model).
 *
 * Semantic wash (DESIGN.md "Status Families" update, 2026-08-29): the card
 * surface is tinted with the SAME `semaforo-verde`/`-amarillo`/`-rojo`
 * chip-surface tokens `ZonaBar`'s own bands and `SemaforoHeroCard` already
 * use — `FONDO_TARJETA_POR_ESTADO` mirrors that map exactly, an opaque fill
 * appended via `cn()` here only (`DASHBOARD_CARD_CLASS` itself untouched).
 * A `null`/unknown `estadoSemaforo` (sin datos) is not in the map, so the
 * card keeps the neutral `bg-card` shell from `DASHBOARD_CARD_CLASS`. Text
 * stays on `text-foreground`/`text-muted-foreground` — already proven ≥7.7:1
 * against all three washes for `SemaforoHeroCard`, same tokens here.
 */
export function BucketSemaforoCard({
  viewModel,
}: {
  readonly viewModel: BucketSemaforoViewModel;
}) {
  const estilo = resolverEstiloSemaforo(viewModel.estadoSemaforo);
  const etiqueta = ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket;
  const fondo = viewModel.estadoSemaforo
    ? FONDO_TARJETA_POR_ESTADO[viewModel.estadoSemaforo]
    : undefined;

  return (
    <div className={cn(DASHBOARD_CARD_CLASS, fondo)}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{etiqueta}</h2>
        <span className="text-xs text-muted-foreground">
          {viewModel.metaLabel}
        </span>
      </div>

      <ZonaBar
        segmentos={viewModel.segmentos}
        markerPct={viewModel.markerPct}
        porcentajeLabel={viewModel.porcentajeLabel}
        estadoLabel={estilo.label}
      />

      {viewModel.consejo !== null && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          {viewModel.consejo.direccion === 'reducir' ? (
            <ArrowDown
              aria-hidden="true"
              size={14}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <ArrowUp aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
          )}
          <span>{viewModel.consejo.texto}</span>
        </p>
      )}
    </div>
  );
}

// Same map/tokens as `SemaforoHeroCard.tsx`'s `FONDO_TARJETA_POR_ESTADO` —
// not imported from there (that one is module-local) to keep each card's
// wash decision independently readable; a shared literal map, not shared
// bucket-color logic, so DRY's three-strike rule doesn't apply yet.
const FONDO_TARJETA_POR_ESTADO: Record<string, string> = {
  verde: 'bg-semaforo-verde',
  amarillo: 'bg-semaforo-amarillo',
  rojo: 'bg-semaforo-rojo',
};
