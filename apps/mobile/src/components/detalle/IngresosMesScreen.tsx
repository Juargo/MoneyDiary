/**
 * IngresosMesScreen — M2 read-only income detail screen (US-056, D-12/D-18/MDET-06).
 *
 * Owns the fetch lifecycle and state machine (loading|error|data) for
 * GET /api/ingresos/mes. Mirrors the BucketDetalleScreen (M1) pattern:
 * the screen component is the logical owner of its data, keeping the route
 * (ingresos.tsx) thin (just useLocalSearchParams → props).
 *
 * State machine (D-12):
 * - loading  — fetchIngresosMes in flight
 * - error    — typed ApiError result
 * - data     — successful DTO; empty = viewModel.filas.length === 0 (NOT a 4th tag)
 *
 * Focus stale-guard (D-18 — the ONE useFocusEffect in this change, M2 only):
 * `useFocusEffect(useCallback(() => { cargar(); }, [cargar]))` ensures M2 shows
 * fresh income data whenever the screen comes into focus (e.g. after returning
 * from M1 where a reclassify may have touched income totals).
 *
 * useFocusEffect REPLACES a separate useEffect for the initial load.
 * expo-router fires focus on mount, so useFocusEffect alone covers both the
 * initial load (mount → focus → cargar) and subsequent re-entries (focus →
 * cargar). Having BOTH useEffect + useFocusEffect would cause a double-fetch
 * on mount (each fires independently on the first render). Using only
 * useFocusEffect gives single-fetch on mount and stale-guard on re-focus.
 *
 * NO reclassify control, NO mutation, NO refresh signal (D-08 read-only parity
 * with web IngresosMesPage/IngresosMesTable — WDI-06).
 */

import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { fetchIngresosMes } from '../../api/client';
import { aIngresosMesViewModel } from '../../domain/ingresos-mes-view-model';
import { SelectorPeriodoMes } from '../SelectorPeriodoMes';
import { copiaPorApiError } from '../../domain/api-error';
import type { IngresosMesDto } from '../../domain/detalle.types';
import type { ApiError } from '../../domain/api-error';
import { IngresosMesLista } from './IngresosMesLista';

type Estado =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: IngresosMesDto };

interface IngresosMesScreenProps {
  /** Current period (YYYY-MM or undefined = backend resolves current month). */
  readonly periodo?: string;
  /** Called by SelectorPeriodoMes when the user navigates months. */
  readonly onChangePeriodo: (periodo: string) => void;
  /** Back navigation. */
  readonly onBack: () => void;
}

/**
 * IngresosMesScreen — M2 screen with full fetch ownership and focus stale-guard.
 */
export function IngresosMesScreen({
  periodo,
  onChangePeriodo,
  onBack,
}: IngresosMesScreenProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'loading' });

  const cargar = useCallback(async () => {
    setEstado({ fase: 'loading' });
    const resultado = await fetchIngresosMes(periodo);
    if (resultado.ok) {
      setEstado({ fase: 'data', dto: resultado.value });
    } else {
      setEstado({ fase: 'error', error: resultado.error });
    }
  }, [periodo]);

  // D-18 stale-guard: the ONE useFocusEffect in this change (M2 only).
  // Fires on mount (initial load) AND on every subsequent focus event.
  // No separate useEffect([cargar]) — that would double-fetch on mount.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  if (estado.fase === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al resumen"
          onPress={onBack}
          style={{ paddingHorizontal: 16, paddingTop: 8 }}
        >
          <Text style={{ fontSize: 14, color: '#3B4266' }}>
            ‹ Volver al resumen
          </Text>
        </Pressable>
        <View
          testID="ingresos-mes-loading"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (estado.fase === 'error') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <View
          testID="ingresos-mes-error"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <Text style={{ color: '#D1495B', textAlign: 'center' }}>
            {copiaPorApiError(estado.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reintentar"
            onPress={() => void cargar()}
            style={{
              marginTop: 12,
              padding: 12,
              backgroundColor: '#3B4266',
              borderRadius: 8,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14 }}>Reintentar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver al resumen"
            onPress={onBack}
            style={{ marginTop: 8 }}
          >
            <Text style={{ fontSize: 14, color: '#3B4266' }}>
              ‹ Volver al resumen
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // data state
  const viewModel = aIngresosMesViewModel(estado.dto, periodo);
  const esVacio = viewModel.filas.length === 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F3F3F5' }}>
      {/* Back button (D-12) */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver al resumen"
        onPress={onBack}
        style={{ paddingHorizontal: 16, paddingTop: 8 }}
      >
        <Text style={{ fontSize: 14, color: '#3B4266' }}>
          ‹ Volver al resumen
        </Text>
      </Pressable>

      {/* M2 header (MDET-06) */}
      <View
        testID="ingresos-mes-header"
        style={{ padding: 16, paddingBottom: 8 }}
      >
        {/* Title (MDET-06 first scenario) */}
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#2D2F3A' }}>
          Ingresos
        </Text>

        <SelectorPeriodoMes periodo={periodo} onChange={onChangePeriodo} />

        <Text style={{ fontSize: 13, color: '#8A8F9C' }}>
          {viewModel.conteoLabel}
        </Text>

        {/* totalLabel from dto.total (MDET-06 / MDET-07 — not totalIngreso) */}
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#2D2F3A' }}>
          {viewModel.totalLabel}
        </Text>

        {/* Static note: no meta or semáforo applies to income (MDET-06 / D-08) */}
        <Text style={{ fontSize: 12, color: '#8A8F9C', marginTop: 4 }}>
          Sin meta ni semáforo
        </Text>
      </View>

      {esVacio ? (
        <View
          testID="ingresos-mes-vacio"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 14, color: '#8A8F9C', textAlign: 'center' }}>
            No hay ingresos este mes.
          </Text>
        </View>
      ) : (
        <IngresosMesLista filas={viewModel.filas} />
      )}
    </SafeAreaView>
  );
}
