import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchResumen } from '../src/api/client';
import type { ApiError, ApiResult } from '../src/api/client';
import type { ResumenMesDto } from '../src/domain/resumen.types';
import { aResumenViewModel } from '../src/domain/resumen-view-model';
import { ResumenScreen } from '../src/components/ResumenScreen';
import { Loading } from '../src/components/states/Loading';
import { Empty } from '../src/components/states/Empty';
import { ErrorState } from '../src/components/states/Error';

/**
 * The single route (Expo Router `app/index.tsx`). Thin by design (D2,
 * design.md B.5): it owns the {loading|error|empty|data} state switch via a
 * plain useEffect/useState fetch — no TanStack Query for one read-only
 * endpoint. It delegates all money/formatting to the pure view-model and
 * renders the matching presentational component. No money math lives here.
 */
type Estado =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: ResumenMesDto };

export default function Index() {
  const [estado, setEstado] = useState<Estado>({ fase: 'loading' });

  const cargar = useCallback(async () => {
    setEstado({ fase: 'loading' });
    const resultado: ApiResult<ResumenMesDto> = await fetchResumen();
    if (resultado.ok) {
      setEstado({ fase: 'data', dto: resultado.value });
    } else {
      setEstado({ fase: 'error', error: resultado.error });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <SafeAreaView style={{ flex: 1 }}>{renderEstado(estado, cargar)}</SafeAreaView>
  );
}

function renderEstado(estado: Estado, onRetry: () => void) {
  switch (estado.fase) {
    case 'loading':
      return <Loading />;
    case 'error':
      return <ErrorState error={estado.error} onRetry={onRetry} />;
    case 'data':
      // The empty state is a data outcome (200 with sinIngreso), not a
      // failure — decided here, after a successful fetch (design.md B.5).
      if (estado.dto.sinIngreso) {
        return <Empty />;
      }
      return <ResumenScreen viewModel={aResumenViewModel(estado.dto)} />;
  }
}
