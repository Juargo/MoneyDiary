import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fetchResumen, postLogout } from '../src/api/client';
import type { ApiError, ApiResult } from '../src/api/client';
import { borrarToken } from '../src/api/session-store';
import { useSession } from '../src/api/session-context';
import { registrarRecargaResumen } from '../src/api/resumen-refresh';
import type { ResumenMesDto } from '../src/domain/resumen.types';
import { aResumenViewModel } from '../src/domain/resumen-view-model';
import { anioDePeriodo, periodoActualUTC } from '../src/domain/periodo-anual';
import { formatearPeriodoLabel } from '../src/domain/periodo-label';
import { ResumenScreen } from '../src/components/ResumenScreen';
import { ResumenAnual } from '../src/components/ResumenAnual';
import { Header } from '../src/components/Header';
import { Loading } from '../src/components/states/Loading';
import { Empty } from '../src/components/states/Empty';
import { ErrorState } from '../src/components/states/Error';
import { COLORS } from '../src/theme/colors';

/**
 * The single route (Expo Router `app/index.tsx`). US-050 (design §0/§1.9)
 * turns it into the SHELL: `SafeAreaView > ScrollView > Header + SLOT +
 * ResumenAnual`. The SLOT is the ONLY thing that swaps on the month fetch's
 * {loading|error|data(+empty)} phase — `ResumenAnual` is an always-rendered
 * sibling with its OWN independent fetch (MOB-12/D-04), so a month-card
 * failure or loading spinner never hides the annual grid, and vice versa
 * (D-05). No TanStack Query for either read-only endpoint (design.md B.5). No
 * money math lives here — that is the pure view-model's job.
 */
type Estado =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: ResumenMesDto };

export default function Index() {
  const { signOut } = useSession();
  const router = useRouter();
  // `undefined` = "let the backend resolve the current month" (design §1.9,
  // binding decision 4: no persistence — selection resets on app restart).
  const [periodo, setPeriodo] = useState<string | undefined>(undefined);
  const [estado, setEstado] = useState<Estado>({ fase: 'loading' });

  const cargar = useCallback(async () => {
    setEstado({ fase: 'loading' });
    const resultado: ApiResult<ResumenMesDto> = await fetchResumen(periodo);
    if (resultado.ok) {
      setEstado({ fase: 'data', dto: resultado.value });
    } else {
      setEstado({ fase: 'error', error: resultado.error });
    }
  }, [periodo]);

  useEffect(() => {
    // cargar() sets `loading` synchronously by design; it doubles as the
    // post-upload/retry/month-change re-fetch listener (registered below),
    // so resetting to loading on each run is intentional, not a
    // cascading-render smell. Re-fires whenever `periodo` changes (`cargar`'s
    // own dependency), which is the whole tap-a-month interaction (design
    // §1.9). Fetch-on-mount without TanStack Query is deliberate (design.md
    // B.5).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  // Registers this screen's own `cargar()` as the resumen re-fetch listener
  // (Sprint 8, US-033, CU-10): `app/subir.tsx` calls `solicitarRecargaResumen()`
  // after a successful upload — no TanStack Query on mobile, no prop-drilling
  // through expo-router's Stack (see `src/api/resumen-refresh.ts`). US-050
  // (D-13) promoted the pub/sub to a `Set` — `ResumenAnual` below is now a
  // second, independent subscriber; this registration is unchanged.
  useEffect(() => {
    return registrarRecargaResumen(cargar);
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

  // Tapping an annual-grid cell just moves the selection — the effect above
  // re-fires `cargar()` for the new `periodo` (D-18: always a fresh
  // `/api/resumen` round-trip, never the annual payload's own `meses[i]`, for
  // freshness after cartola uploads). `useCallback([], )` keeps this
  // reference stable across every render (D-15 gate, tasks.md Phase 5b
  // header): `ResumenAnual`'s `MesCelda` is `React.memo`'d and depends on
  // this identity staying put so a tap re-renders exactly two cells, not all
  // twelve.
  const onSelectPeriodo = useCallback((p: string) => {
    setPeriodo(p);
  }, []);

  // `periodoVista` is the single source for the header label, the annual
  // grid's selected-cell marker, and `anio` (design §1.9) — a *presentation*
  // derivation (which month am I looking at), never money math. `anio` never
  // actually changes today (all 12 selectable cells belong to the current
  // year, binding decision 4), so the annual fetch runs once per mount;
  // `anioDePeriodo` is threaded anyway for web parity and so a future year
  // switch is a prop change, not a rewrite.
  const periodoVista = periodo ?? periodoActualUTC(new Date());
  const anio = anioDePeriodo(periodoVista, new Date().getUTCFullYear());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      {/* `contentContainerStyle={{ flexGrow: 1 }}` is REQUIRED (design §0):
          `Loading`/`ErrorState`/`Empty` are all `flex-1`-styled and only
          center correctly inside a flexed ancestor — true when the SLOT was
          `SafeAreaView`'s sole child, false by default now that it sits one
          level deeper, inside this `ScrollView` (RN sizes `ScrollView`
          content to content height, not viewport height). No RNTL test can
          assert this layout fact; verification is Maestro/manual (T5b.4/T6.3). */}
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Header periodoLabel={formatearPeriodoLabel(periodoVista)} />
        {renderEstado(estado, cargar, periodoVista, (path) =>
          router.push(path),
        )}
        <ResumenAnual
          anio={anio}
          periodoSeleccionado={periodoVista}
          onSelectPeriodo={onSelectPeriodo}
        />
      </ScrollView>
      <Pressable
        testID="subir-cartola-button"
        accessibilityRole="button"
        onPress={() => router.push('/subir')}
        className="items-center py-3"
      >
        <Text className="text-sm font-semibold text-ingreso">
          Subir cartola
        </Text>
      </Pressable>
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

function renderEstado(
  estado: Estado,
  onRetry: () => void,
  periodo: string,
  onNavegar: (path: string) => void,
) {
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
      // US-056 PR1 (D-10): periodo and onNavegar thread to ResumenScreen →
      // LeyendaGasto so legend rows navigate to detail screens.
      return (
        <ResumenScreen
          viewModel={aResumenViewModel(estado.dto)}
          periodo={periodo}
          onNavegar={onNavegar}
        />
      );
  }
}
