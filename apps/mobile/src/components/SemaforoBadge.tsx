import { Text, View } from 'react-native';
import { COLORS } from '../theme/colors';

interface EstiloSemaforo {
  readonly label: string;
  readonly cara: string;
  readonly icon: string;
  readonly bg: string;
}

const ESTILOS: Record<string, EstiloSemaforo> = {
  verde: { label: 'Verde', cara: '🙂', icon: COLORS.semaforoVerdeIcon, bg: COLORS.semaforoVerdeBg },
  amarillo: {
    label: 'Amarillo',
    cara: '😐',
    icon: COLORS.semaforoAmarilloIcon,
    bg: COLORS.semaforoAmarilloBg,
  },
  rojo: { label: 'Rojo', cara: '☹️', icon: COLORS.semaforoRojoIcon, bg: COLORS.semaforoRojoBg },
};

const SIN_DATOS: EstiloSemaforo = {
  label: 'Sin datos',
  cara: '—',
  icon: COLORS.semaforoSinDatosIcon,
  bg: COLORS.semaforoSinDatosBg,
};

/**
 * Traffic-light indicator for a single `estadoSemaforo` value
 * ('verde'|'amarillo'|'rojo'|null). Renders a face inside a tinted circle
 * (mockup), with the Spanish state word exposed as `accessibilityLabel` —
 * never as silent styling. `null` maps to a DISTINCT "Sin datos" badge and
 * must never be coerced into one of the three known colors
 * (MOB-03/MOB-06 distinct-state discipline). Props in / JSX out.
 */
export function SemaforoBadge({
  estadoSemaforo,
  size = 40,
}: {
  estadoSemaforo: string | null;
  size?: number;
}) {
  const estilo = estadoSemaforo ? (ESTILOS[estadoSemaforo] ?? SIN_DATOS) : SIN_DATOS;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={estilo.label}
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: estilo.bg }}
    >
      <Text style={{ fontSize: size * 0.5, color: estilo.icon }}>{estilo.cara}</Text>
    </View>
  );
}
