import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import {
  agruparPreviewPorCategoria,
  type CatalogoNombresEstado,
  type GrupoPreviewPorCategoria,
} from '../../domain/agrupar-preview-por-categoria';
import { formatearFilaPreview } from '../../domain/preview-cartola';
import { ETIQUETA_BUCKET } from '../../theme/colors';

/**
 * MuestraAgrupadaMobile (cartola-decision-agrupada, MOB-PRV-03) — READ-ONLY
 * grouped accordion of the preview `filas`, shown inside `ResumenDecision`
 * at the `decidiendo` decision step, between the resumen counts and the
 * three action buttons. Grouping lives in
 * `domain/agrupar-preview-por-categoria.ts` (pure, own spec); this component
 * resolves the UI-facing bucket label (`ETIQUETA_BUCKET`) and renders the
 * accordion.
 *
 * Collapsed by default — same "supporting summary, not the primary work
 * surface" reasoning as the web sibling (`MuestraAgrupada.tsx`). No
 * `Pressable` row, no select, nothing editable: this is a summary, not
 * `ListaRevision`/`FilaRevisionMobile`, which stay exclusive to "Revisar y
 * editar" (MOB-PRV-05/06). A collapsed group's rows are not mounted at all
 * (no FlatList here — `subir.tsx`'s `decidiendo` block is a plain `View`,
 * and the group count is small; each expanded group maps its own rows with
 * plain `View`s, avoiding a nested `VirtualizedList`-in-scrollable warning).
 *
 * ADR-024: presentation only — `formatearFilaPreview` (display formatting,
 * shared with `FilaRevisionMobile`) is the only computation here.
 */

function tituloGrupo(grupo: GrupoPreviewPorCategoria): string {
  const etiquetaBucket = (bucket: string) => ETIQUETA_BUCKET[bucket] ?? bucket;
  switch (grupo.tipo) {
    case 'categoria':
      return `${etiquetaBucket(grupo.bucket)} · ${grupo.categoriaNombre}`;
    case 'sin-categoria':
      return `${etiquetaBucket(grupo.bucket)} · Sin categoría`;
    case 'categoria-no-disponible':
      return `${etiquetaBucket(grupo.bucket)} · Categoría no disponible`;
    case 'ingreso':
      // No "· Sin categoría" suffix (see the domain module's docblock):
      // these rows are settled, not pending a decision.
      return etiquetaBucket(grupo.bucket);
    case 'sin-clasificar':
      return 'Sin clasificar';
    case 'duplicadas':
      return 'Duplicadas (no se importan)';
  }
}

export interface MuestraAgrupadaMobileProps {
  readonly filas: readonly PreviewFilaDto[];
  readonly catalogo: CatalogoNombresEstado;
}

export function MuestraAgrupadaMobile({
  filas,
  catalogo,
}: MuestraAgrupadaMobileProps) {
  const grupos = agruparPreviewPorCategoria(filas, catalogo);
  // Collapsed by default: the Set holds the keys of EXPANDED groups.
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());

  if (grupos.length === 0) return null;

  function toggle(clave: string) {
    setAbiertos((prev) => {
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
    <View testID="decision-muestra-agrupada" className="gap-2">
      <Text className="text-sm font-semibold text-heading">
        Movimientos por categoría
      </Text>
      {grupos.map((grupo) => {
        const abierto = abiertos.has(grupo.clave);
        const n = grupo.filas.length;
        const titulo = tituloGrupo(grupo);
        const etiquetaConteo = `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`;

        return (
          <View
            key={grupo.clave}
            testID={`decision-grupo-${grupo.clave}`}
            className="rounded-xl border border-hairline bg-white"
          >
            <Pressable
              testID={`decision-grupo-toggle-${grupo.clave}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: abierto }}
              accessibilityLabel={`${titulo}, ${etiquetaConteo}`}
              onPress={() => toggle(grupo.clave)}
              className="flex-row items-center justify-between gap-2 px-3 py-2"
            >
              <Text
                className="flex-1 text-sm font-medium text-heading"
                numberOfLines={1}
              >
                {titulo}
              </Text>
              <Text className="text-xs text-muted">{etiquetaConteo}</Text>
            </Pressable>
            {abierto && (
              <View
                testID={`decision-grupo-lista-${grupo.clave}`}
                className="gap-2 border-t border-hairline px-3 py-2"
                style={{ borderTopWidth: 1 }}
              >
                {grupo.filas.map((fila) => {
                  const formateada = formatearFilaPreview(fila);
                  return (
                    <View
                      key={fila.rowIndex}
                      testID={`decision-grupo-fila-${fila.rowIndex}`}
                      className="gap-0.5"
                    >
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-muted">
                          {formateada.fecha}
                        </Text>
                        <Text
                          className="text-xs font-medium text-heading"
                          numberOfLines={1}
                        >
                          {formateada.descripcion}
                        </Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-xs text-muted">
                          Cargo: {formateada.cargo}
                        </Text>
                        <Text className="text-xs text-muted">
                          Abono: {formateada.abono}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
