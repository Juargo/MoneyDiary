import { cn } from '@/lib/utils';
import type { SegmentoZona } from '@/domain/semaforo-detalle-view-model';

const COLOR_SEGMENTO: Record<SegmentoZona['estado'], string> = {
  verde: 'bg-emerald-300',
  amarillo: 'bg-amber-300',
  rojo: 'bg-rose-300',
};

/**
 * ZonaBar — visualiza dónde cae `porcentajeBp` de un bucket dentro de sus
 * bandas Verde/Amarillo/Rojo (US-049, design §1.7, WSEM-03/WSEM-08). A11y
 * contract (ADR-018, WCAG 2.2 AA, mismo house rule que `SemaforoBadge`/
 * `SemaforoTag`): el track coloreado y el marcador son puramente decorativos
 * (`aria-hidden="true"`) — el contenido accesible es texto real (porcentaje,
 * palabra de estado, rango numérico de cada banda), nunca un `role="img"`
 * con una oración sintetizada. `segmentos`/`markerPct` llegan ya calculados
 * desde `semaforo-detalle-view-model.ts` — este componente no hace ninguna
 * aritmética de bandas (R2 — ningún literal de umbral aquí).
 */
export function ZonaBar({
  segmentos,
  markerPct,
  porcentajeLabel,
  estadoLabel,
}: {
  readonly segmentos: ReadonlyArray<SegmentoZona>;
  readonly markerPct: number | null;
  readonly porcentajeLabel: string;
  readonly estadoLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{porcentajeLabel}</span>
        <span>{estadoLabel}</span>
      </div>

      <div
        className="relative h-2 w-full"
        data-testid="zona-bar-track"
        aria-hidden="true"
      >
        <div className="flex h-full w-full overflow-hidden rounded-full">
          {segmentos.map((segmento) => (
            <div
              key={`${segmento.estado}-${segmento.desdePct}`}
              className={cn('h-full', COLOR_SEGMENTO[segmento.estado])}
              style={{ width: `${segmento.anchoPct}%` }}
            />
          ))}
        </div>
        {markerPct !== null && (
          <div
            data-testid="zona-bar-marker"
            className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
            style={{ left: `${markerPct}%` }}
          />
        )}
      </div>

      <ul className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
        {segmentos.map((segmento) => (
          <li key={`${segmento.estado}-${segmento.desdePct}-label`}>
            {segmento.etiqueta}
          </li>
        ))}
      </ul>
    </div>
  );
}
