import { ArrowDown, ArrowUp } from 'lucide-react';
import { ZonaBar } from './ZonaBar';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { resolverEstiloSemaforo } from '@/lib/semaforo-estilos';
import { DASHBOARD_CARD_CLASS } from '@/lib/dashboard-card';
import type { BucketSemaforoViewModel } from '@/domain/semaforo-detalle-view-model';

/**
 * BucketSemaforoCard — una fila por bucket de gasto en `/semaforo`
 * (US-049, design §1.7, WSEM-03/WSEM-04). Composición pura de
 * `BucketSemaforoViewModel`: etiqueta (`ETIQUETA_BUCKET`, ya "Gustos" para
 * Deseos), porcentaje vs meta, badge de estado, `ZonaBar`, y la fila de
 * consejo cuando `consejo !== null` — nunca recomputa el texto, solo lo
 * renderiza (D-05/SEM-10 ya lo trae sustituido desde el view-model).
 */
export function BucketSemaforoCard({
  viewModel,
}: {
  readonly viewModel: BucketSemaforoViewModel;
}) {
  const estilo = resolverEstiloSemaforo(viewModel.estadoSemaforo);
  const etiqueta = ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket;

  return (
    <div className={DASHBOARD_CARD_CLASS}>
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
