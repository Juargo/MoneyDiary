import { Pressable, Text, View } from 'react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { COLORS } from '../../theme/colors';
import { MuestraAgrupadaMobile } from './MuestraAgrupadaMobile';
import type { CatalogoNombresEstado } from '../../domain/agrupar-preview-por-categoria';

/**
 * ResumenDecision — the resumen summary plus the explicit two-action
 * decision step (Phase 5, design.md; MOB-PRV-03/09/11). `subir.tsx`'s
 * `decidiendo` state wires this in.
 *
 * Purely presentational: no API calls, no state. The caller supplies the
 * already-computed resumen counts and the three action callbacks.
 *
 * cartola-decision-agrupada added a READ-ONLY grouped accordion summary of
 * `filas` (`MuestraAgrupadaMobile`, MOB-PRV-03) between the resumen box and
 * the action buttons — collapsed by default, no editing control. `filas`/
 * `catalogo` default to empty/`no-listo` so pre-existing callers (this
 * component's own spec) keep compiling unchanged; with no filas the summary
 * renders nothing. `ListaRevision`/`FilaRevisionMobile` (the EDITABLE row
 * list) still only mount after "Revisar y editar" — this summary never
 * exposes a classification control.
 */
export interface ResumenDecisionResumen {
  readonly totalFilas: number;
  readonly duplicadosDetectados: number;
  readonly nuevas: number;
}

export interface ResumenDecisionProps {
  readonly resumen: ResumenDecisionResumen;
  readonly filas?: readonly PreviewFilaDto[];
  readonly catalogo?: CatalogoNombresEstado;
  readonly onSubirTalCual: () => void;
  readonly onRevisar: () => void;
  readonly onDescartar: () => void;
}

const CATALOGO_NO_LISTO: CatalogoNombresEstado = { tag: 'no-listo' };

export function ResumenDecision({
  resumen,
  filas = [],
  catalogo = CATALOGO_NO_LISTO,
  onSubirTalCual,
  onRevisar,
  onDescartar,
}: ResumenDecisionProps) {
  return (
    <View className="gap-4">
      <View className="gap-3 rounded-xl border border-hairline bg-white p-4">
        <Text className="text-base font-semibold text-heading">
          Vista previa
        </Text>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Total filas</Text>
          <Text className="text-sm font-medium text-heading">
            {resumen.totalFilas}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Duplicados</Text>
          <Text className="text-sm font-medium text-heading">
            {resumen.duplicadosDetectados}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Nuevas</Text>
          <Text className="text-sm font-medium text-heading">
            {resumen.nuevas}
          </Text>
        </View>
        {/* Issue #742: "nada se ha guardado" affordance, ported from the web
            sibling (ResumenCartola) — this decision block never carried it.
            Paired with the "clasificar no es obligatorio" line right below
            it, both plain supporting text, no accessibility role. */}
        <Text className="text-sm text-muted">
          Nada se ha guardado aún. Revisa las filas y confirma para importar.
        </Text>
        <Text className="text-sm text-muted">
          Clasificar ahora no es obligatorio: puedes cambiar la categoría de
          cualquier movimiento cuando quieras.
        </Text>
      </View>

      <MuestraAgrupadaMobile filas={filas} catalogo={catalogo} />

      <Pressable
        testID="decision-subir-tal-cual"
        accessibilityRole="button"
        accessibilityLabel="Subir tal cual"
        onPress={onSubirTalCual}
        className="items-center rounded-full py-3"
        style={{ backgroundColor: COLORS.ingreso }}
      >
        <Text className="font-semibold text-white">Subir tal cual</Text>
      </Pressable>

      <Pressable
        testID="decision-revisar"
        accessibilityRole="button"
        accessibilityLabel="Revisar y editar"
        onPress={onRevisar}
        className="items-center rounded-full py-3"
        style={{ borderWidth: 1, borderColor: COLORS.hairline }}
      >
        <Text className="font-semibold text-heading">Revisar y editar</Text>
      </Pressable>

      <Pressable
        testID="decision-descartar"
        accessibilityRole="button"
        accessibilityLabel="Descartar"
        onPress={onDescartar}
        className="items-center py-3"
      >
        <Text className="text-sm font-semibold text-muted">Descartar</Text>
      </Pressable>
    </View>
  );
}
