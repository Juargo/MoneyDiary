import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BucketDetalleScreen } from '../../src/components/detalle/BucketDetalleScreen';

/**
 * M1 route — bucket/[bucket] (US-056 D-12/T-12).
 *
 * Thin wrapper: reads params via useLocalSearchParams, manages local periodo
 * state (seeded from the query param so arrows can step it), delegates all
 * rendering and fetch ownership to BucketDetalleScreen.
 *
 * State machine (loading|error|data) lives in BucketDetalleScreen — mirrors
 * the categoria/[id].tsx pattern where the screen component owns its data.
 *
 * No useFocusEffect for initial load (categoria/[id].tsx:55-58: the route
 * unmounts on nav-away, so mounting = every visit).
 *
 * Back: router.back() — native stack handles nav back to dashboard. An
 * on-screen back Pressable is rendered by BucketDetalleScreen (D-12) because
 * _layout.tsx hides the native header.
 */
export default function BucketDetallePage() {
  const router = useRouter();
  const {
    bucket,
    destacar,
    periodo: paramPeriodo,
  } = useLocalSearchParams<{
    bucket?: string;
    destacar?: string;
    periodo?: string;
  }>();

  // Own periodo as local state seeded from the query param.
  // undefined → backend resolves current month (fetchDetalleBucketMes precedent).
  const [periodo, setPeriodo] = useState<string | undefined>(paramPeriodo);

  return (
    <BucketDetalleScreen
      bucket={bucket ?? ''}
      destacar={destacar}
      periodo={periodo}
      onChangePeriodo={setPeriodo}
      onBack={() => router.back()}
    />
  );
}
