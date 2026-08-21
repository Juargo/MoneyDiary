/**
 * SelectorPeriodoMes — reusable period navigation component (US-056, D-13).
 * Ports web's PeriodoSelector.tsx (PeriodoSelector.tsx:33-105) to React Native.
 *
 * Props: `{ periodo: string | undefined; onChange: (periodo: string) => void }`.
 * Layout: `‹` Pressable + mesLabel Text + `›` Pressable.
 *
 * Arrow semantics (mirror web PeriodoSelector.tsx:40-92):
 * - `‹` (prev): onChange(mesAnterior(efectivo)) — ALWAYS enabled (any past month reachable).
 * - `›` (next): onChange(mesSiguiente(efectivo)), disabled when esMesActual(efectivo, now).
 *   Carries accessibilityState={{ disabled: true }} and is inert when disabled.
 * - `efectivo = periodo ?? periodoActualUTC(new Date())`.
 *
 * Deliberate scope trim vs web: NO "Hoy" button (D-13). The next-arrow being
 * disabled at the current month already bounds the range, and the dashboard is
 * one back-tap away. Documented as intentional (yagni).
 *
 * `onChange` is REQUIRED — no optional silent no-op default (D-10/us-044 case law).
 */

import { Pressable, Text, View } from 'react-native';
import {
  esMesActual,
  mesAnterior,
  mesCompletoLabel,
  mesSiguiente,
  periodoActualUTC,
} from '../domain/periodo-anual';

interface SelectorPeriodoMesProps {
  readonly periodo: string | undefined;
  readonly onChange: (periodo: string) => void;
}

/**
 * SelectorPeriodoMes — renders `‹ {mesLabel} ›` with period navigation.
 * Consumed by both M1 (BucketDetalleScreen) and M2 (IngresosMesScreen) headers.
 */
export function SelectorPeriodoMes({
  periodo,
  onChange,
}: SelectorPeriodoMesProps) {
  const ahora = new Date();
  const efectivo = periodo ?? periodoActualUTC(ahora);
  const disabled = esMesActual(efectivo, ahora);
  const label = mesCompletoLabel(efectivo);

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center' }}
      testID="selector-periodo-mes"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes anterior"
        onPress={() => onChange(mesAnterior(efectivo))}
        testID="selector-mes-anterior"
      >
        <Text>‹</Text>
      </Pressable>

      <Text
        accessibilityRole="header"
        testID="selector-mes-label"
        style={{ marginHorizontal: 8 }}
      >
        {label}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mes siguiente"
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={disabled ? undefined : () => onChange(mesSiguiente(efectivo))}
        testID="selector-mes-siguiente"
      >
        <Text>›</Text>
      </Pressable>
    </View>
  );
}
