import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';

/**
 * ResumenDecision — the resumen summary plus the explicit two-action
 * decision step (Phase 5, design.md; MOB-PRV-03/09/11). No consumer yet —
 * `subir.tsx`'s `decidiendo` state wires this in Phase 6.
 *
 * Purely presentational: no API calls, no state. The caller supplies the
 * already-computed resumen counts and the three action callbacks. No row
 * list is rendered here (MOB-PRV-03) — `ListaRevision` only mounts after
 * "Revisar y editar".
 */
export interface ResumenDecisionResumen {
  readonly totalFilas: number;
  readonly duplicadosDetectados: number;
  readonly nuevas: number;
}

export interface ResumenDecisionProps {
  readonly resumen: ResumenDecisionResumen;
  readonly onSubirTalCual: () => void;
  readonly onRevisar: () => void;
  readonly onDescartar: () => void;
}

export function ResumenDecision({
  resumen,
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
      </View>

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
