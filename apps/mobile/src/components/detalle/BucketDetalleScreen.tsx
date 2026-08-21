/**
 * BucketDetalleScreen — M1 read-only bucket detail screen (US-056, D-12/D-20/MDET-01/MDET-02).
 *
 * Owns the fetch lifecycle and state machine (loading|error|data) for
 * GET /api/buckets/{bucket}/detalle. Mirrors the categoria/[id].tsx pattern:
 * the screen component is the logical owner of its data, keeping the route
 * thin (just useLocalSearchParams → props).
 *
 * State machine (D-12):
 * - loading  — fetchDetalleBucketMes in flight
 * - error    — typed ApiError result
 * - data     — successful DTO; empty = viewModel.grupos.length === 0 (NOT a 4th tag)
 *
 * `cargar` is a useCallback([bucket, periodo]) that re-fires when bucket or periodo changes.
 * `onReclasificado={cargar}` is passed into GrupoMovimientosMobile so every successful
 * reclassify PATCH refetches the open M1 detail (D-17/D-18).
 *
 * Screen-owned `anuncio` state + `status-reclasificar` live-region Text OUTSIDE
 * the groups map — survives a moved row's removal (D-20/MDET-05).
 * Period change clears anuncio via useEffect([periodo]) (web parity).
 *
 * `onMovida` handler: setAnuncio + AccessibilityInfo.announceForAccessibility
 * (settled-announcement, us-055 D-04 case law). The screen is the ONLY caller of
 * AccessibilityInfo in this change (D-20 single announcement source).
 *
 * NO useFocusEffect for initial load (categoria/[id].tsx:55-58 rationale: the
 * route unmounts on nav-away, so mounting = every visit).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchDetalleBucketMes } from '../../api/client';
import { aDetalleBucketMesViewModel } from '../../domain/detalle-bucket-mes-view-model';
import { ETIQUETA_BUCKET } from '../../theme/colors';
import { SelectorPeriodoMes } from '../SelectorPeriodoMes';
import { GrupoMovimientosMobile } from './GrupoMovimientosMobile';
import { copiaPorApiError } from '../../domain/api-error';
import type { DetalleBucketMesDto } from '../../domain/detalle.types';
import type { ApiError } from '../../domain/api-error';

type Estado =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: DetalleBucketMesDto };

interface BucketDetalleScreenProps {
  /** Raw wire bucket key (e.g. 'Deseos') — display label resolved via ETIQUETA_BUCKET. */
  readonly bucket: string;
  /** When 'sin-categoria', highlights the SinCategoria group (D-19/MDET-03). */
  readonly destacar?: string;
  /** Current period (YYYY-MM or undefined = backend resolves current month). */
  readonly periodo?: string;
  /** Called by SelectorPeriodoMes when the user navigates months. */
  readonly onChangePeriodo: (periodo: string) => void;
  /** Back navigation. */
  readonly onBack: () => void;
}

/**
 * BucketDetalleScreen — M1 screen with full fetch ownership.
 */
export function BucketDetalleScreen({
  bucket,
  destacar,
  periodo,
  onChangePeriodo,
  onBack,
}: BucketDetalleScreenProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'loading' });
  // Screen-owned announcement state (D-20)
  const [anuncio, setAnuncio] = useState('');

  const cargar = useCallback(async () => {
    setEstado({ fase: 'loading' });
    const resultado = await fetchDetalleBucketMes(bucket, periodo);
    if (resultado.ok) {
      setEstado({ fase: 'data', dto: resultado.value });
    } else {
      setEstado({ fase: 'error', error: resultado.error });
    }
  }, [bucket, periodo]);

  // Fire on mount and on period/bucket change (D-12). No useFocusEffect (D-12).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  // Clear anuncio whenever period changes (web parity BucketDetalleMesPage.tsx:79-82).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnuncio('');
  }, [periodo]);

  /**
   * Cross-bucket move handler (D-18/D-20 — wired T-15).
   * The control calls this ONLY after the PATCH resolves ok (settled announcement,
   * us-055 D-04 lesson). This screen is the ONLY caller of AccessibilityInfo
   * in this change (single announcement source, D-20).
   */
  function handleMovida(bucketLabel: string) {
    setAnuncio(`Movida a ${bucketLabel}.`);
    AccessibilityInfo.announceForAccessibility(`Movida a ${bucketLabel}.`);
  }

  // status-reclasificar live-region: OUTSIDE groups map — stable sibling (D-20/MDET-05).
  // Rendered in ALL states so it is never unmounted by a state transition.
  const statusRegion = (
    <Text
      testID="status-reclasificar"
      accessibilityRole="alert"
      // RN accessibilityLiveRegion is valid at runtime but TypeScript's RN types don't
      // expose it on TextProps; spread it to avoid tsc errors (D-20).

      {...({ accessibilityLiveRegion: 'polite' } as any)}
    >
      {anuncio}
    </Text>
  );

  if (estado.fase === 'loading') {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        {/* Back button always present so user can escape a slow load (D-12) */}
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
        {statusRegion}
        <View
          testID="bucket-detalle-loading"
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
        {statusRegion}
        <View
          testID="bucket-detalle-error"
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
  const viewModel = aDetalleBucketMesViewModel(estado.dto);
  const etiqueta = ETIQUETA_BUCKET[viewModel.bucket] ?? viewModel.bucket;
  const esVacio = viewModel.grupos.length === 0;

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

      {/* Status live-region: always present OUTSIDE groups (D-20/MDET-05) */}
      {statusRegion}

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* M1 header (MDET-02) */}
        <View testID="bucket-detalle-header" style={{ marginBottom: 16 }}>
          {/* Display label via ETIQUETA_BUCKET — NOT raw wire key (MDET-02) */}
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#2D2F3A' }}>
            {etiqueta}
          </Text>

          <SelectorPeriodoMes periodo={periodo} onChange={onChangePeriodo} />

          {/* porcentajeLabel: '—' when sinPorcentaje (SIN_PORCENTAJE_LABEL/MOB-06) */}
          <Text style={{ fontSize: 14, color: '#8A8F9C' }}>
            {viewModel.porcentajeLabel}
          </Text>

          {/* metaLabel / sinMeta: 'Sin meta' text from sinMeta flag (D-22/MDET-02 — screen-layer) */}
          <Text style={{ fontSize: 14, color: '#8A8F9C' }}>
            {viewModel.sinMeta ? 'Sin meta' : viewModel.metaLabel}
          </Text>

          <Text style={{ fontSize: 16, fontWeight: '600', color: '#2D2F3A' }}>
            {viewModel.totalLabel}
          </Text>
          <Text style={{ fontSize: 13, color: '#8A8F9C' }}>
            {viewModel.totalTransacciones} transacciones
          </Text>
        </View>

        {esVacio ? (
          <View
            testID="bucket-detalle-vacio"
            style={{ alignItems: 'center', paddingVertical: 32 }}
          >
            <Text
              style={{ fontSize: 14, color: '#8A8F9C', textAlign: 'center' }}
            >
              No hay transacciones este mes.
            </Text>
          </View>
        ) : (
          <View testID="bucket-detalle-grupos">
            {viewModel.grupos.map((grupo, idx) => (
              <GrupoMovimientosMobile
                key={grupo.categoriaId ?? 'sin-categoria'}
                grupo={estado.dto.grupos[idx]!}
                destacar={destacar}
                onReclasificado={cargar}
                onMovida={handleMovida}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
