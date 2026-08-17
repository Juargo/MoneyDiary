import { Text, View } from 'react-native';
import { resolverEstiloSemaforo } from '../theme/semaforo-estilos';

/**
 * Static traffic-light tag (US-050 PR4b, design §1.7/D-12, MOB-09): a
 * tinted pill — face + `Semáforo: {label}` — with NO `Pressable`, no
 * chevron, no `onPress` (binding decision 1). `estadoGlobal` passes
 * through verbatim from the backend, never recomputed (ADR-024). ADR-018:
 * the state is carried by the visible Spanish word, never by colour alone,
 * so `null`/unknown values still render a distinct, visible "Sin datos"
 * tag instead of being silently coerced into a known colour.
 * `testID="semaforo-global"` on this component's own root is the Maestro
 * anchor (`.maestro/resumen-semaforo.yaml:27`).
 */
export function SemaforoTag({
  estadoGlobal,
}: {
  readonly estadoGlobal: string | null;
}) {
  const estilo = resolverEstiloSemaforo(estadoGlobal);

  return (
    <View
      testID="semaforo-global"
      className="flex-row items-center gap-1 self-start rounded-full px-2.5 py-1"
      style={{ backgroundColor: estilo.bg }}
    >
      <Text aria-hidden style={{ fontSize: 14, color: estilo.icon }}>
        {estilo.cara}
      </Text>
      <Text className="text-xs font-semibold" style={{ color: estilo.icon }}>
        Semáforo: {estilo.label}
      </Text>
    </View>
  );
}
