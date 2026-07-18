import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchResumen, postLogout } from '../src/api/client';
import type { ApiError, ApiResult } from '../src/api/client';
import { borrarToken } from '../src/api/session-store';
import { useSession } from '../src/api/session-context';
import type { ResumenMesDto } from '../src/domain/resumen.types';
import { aResumenViewModel } from '../src/domain/resumen-view-model';
import { ResumenScreen } from '../src/components/ResumenScreen';
import { Loading } from '../src/components/states/Loading';
import { Empty } from '../src/components/states/Empty';
import { ErrorState } from '../src/components/states/Error';
import { COLORS } from '../src/theme/colors';

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
  const { signOut } = useSession();
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

  // Minimal logout affordance (MOB-04, design.md §6.2.4): revoke the server
  // session, then ALWAYS clear the local token — even when `postLogout`
  // network-fails — then flip the auth-context guard (`signOut`, MOB-03
  // fix). `Stack.Protected` (app/_layout.tsx) does the actual navigating
  // back to `/login`; this screen never calls `router.replace` directly.
  const cerrarSesion = useCallback(async () => {
    await postLogout();
    await borrarToken();
    signOut();
  }, [signOut]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      {renderEstado(estado, cargar)}
      <Pressable
        testID="logout-button"
        accessibilityRole="button"
        onPress={() => void cerrarSesion()}
        className="items-center py-3"
      >
        <Text className="text-sm font-semibold text-muted">Cerrar sesión</Text>
      </Pressable>
    </SafeAreaView>
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
