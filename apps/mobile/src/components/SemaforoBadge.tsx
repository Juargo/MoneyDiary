import { Text, View } from 'react-native';

const ETIQUETAS: Record<string, string> = {
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
};

const SIN_DATOS_LABEL = 'Sin datos';

/**
 * Renders the visual semáforo indicator for a single `estadoSemaforo`
 * value ('verde'|'amarillo'|'rojo'|null). `null` renders a distinct
 * "Sin datos" label — it must never be silently coerced into one of the
 * three known colors (MOB-03/MOB-06 distinct-state discipline).
 * Props in / JSX out — no fetch, no env, no money math.
 */
export function SemaforoBadge({
  estadoSemaforo,
}: {
  estadoSemaforo: string | null;
}) {
  const label = estadoSemaforo ? (ETIQUETAS[estadoSemaforo] ?? estadoSemaforo) : SIN_DATOS_LABEL;

  return (
    <View>
      <Text>{label}</Text>
    </View>
  );
}
