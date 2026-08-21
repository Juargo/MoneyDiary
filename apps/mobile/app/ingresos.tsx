import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IngresosMesScreen } from '../src/components/detalle/IngresosMesScreen';

/**
 * M2 route — ingresos (US-056 D-12/T-17).
 *
 * Thin wrapper: reads params via useLocalSearchParams, manages local periodo
 * state (seeded from the query param so arrows can step it), delegates all
 * rendering and fetch ownership to IngresosMesScreen.
 *
 * State machine (loading|error|data) lives in IngresosMesScreen — mirrors
 * the BucketDetalleScreen pattern (M1): the screen component owns its data.
 *
 * useFocusEffect (D-18 M2 stale-guard) also lives in IngresosMesScreen so the
 * component is independently testable without a router context. expo-router's
 * useFocusEffect works in any component under the navigator — it fires on
 * mount AND on re-focus, giving M2 fresh income data every time the screen
 * enters view (e.g. after returning from M1 where a reclassify may have
 * touched income totals).
 *
 * Back: router.back() — native stack handles nav back to dashboard. An
 * on-screen back Pressable is rendered by IngresosMesScreen (D-12) because
 * _layout.tsx hides the native header.
 */
export default function IngresosMesPage() {
  const router = useRouter();
  const { periodo: paramPeriodo } = useLocalSearchParams<{
    periodo?: string;
  }>();

  // Own periodo as local state seeded from the query param.
  // undefined → backend resolves current month (fetchIngresosMes precedent).
  const [periodo, setPeriodo] = useState<string | undefined>(paramPeriodo);

  return (
    <IngresosMesScreen
      periodo={periodo}
      onChangePeriodo={setPeriodo}
      onBack={() => router.back()}
    />
  );
}
