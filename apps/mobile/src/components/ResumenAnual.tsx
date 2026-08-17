import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { copiaPorApiError, fetchResumenAnual } from '../api/client';
import type { ApiError, ApiResult } from '../api/client';
import { registrarRecargaResumen } from '../api/resumen-refresh';
import type { ResumenAnualDto } from '../domain/resumen.types';
import {
  aResumenAnualViewModel,
  type MesAnualViewModel,
  type ResumenAnualViewModel,
} from '../domain/resumen-view-model';
import { MiniDistribucionPie } from './MiniDistribucionPie';
import { COLORS } from '../theme/colors';

/**
 * `ResumenAnual` — the annual grid section (US-050, design §1.7/D-04/D-13,
 * MOB-10/MOB-11/MOB-12). Self-contained: owns its OWN `useEffect`/`useState`
 * around `fetchResumenAnual()`, called with NO argument (the backend
 * resolves the current year) — `anio` is used ONLY to label the "Año {anio}"
 * heading, never the fetch. Owns its own Loading/Error+retry/Empty/data
 * states, independent of the main chart card's fetch (MOB-12): a failure or
 * loading state here never blanks (or is blanked by) the chart card. Not yet
 * mounted anywhere — `app/index.tsx` wiring is Phase 5b (design §1.9).
 */
type Estado =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: ResumenAnualDto };

export function ResumenAnual({
  anio,
  periodoSeleccionado,
  onSelectPeriodo,
}: {
  readonly anio: number;
  readonly periodoSeleccionado?: string;
  readonly onSelectPeriodo: (periodo: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'loading' });

  const cargar = useCallback(async () => {
    setEstado({ fase: 'loading' });
    // MOB-10: no argument — the backend resolves the current year from the
    // caller's session, exactly like `fetchResumen()`'s own `periodo` omission.
    const resultado: ApiResult<ResumenAnualDto> = await fetchResumenAnual();
    if (resultado.ok) {
      setEstado({ fase: 'data', dto: resultado.value });
    } else {
      setEstado({ fase: 'error', error: resultado.error });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  // D-13: second subscriber to the `resumen-refresh` pub/sub — without this,
  // a US-033 upload would refresh the main chart while the grid kept
  // showing the just-fed month as an empty, non-tappable cell.
  useEffect(() => {
    return registrarRecargaResumen(cargar);
  }, [cargar]);

  // Derived once per fetch, not per render (design §1.7 perf discussion,
  // D-15) — the 12-month BigInt ring math is the expensive part, and
  // `useMemo` keyed on `dto` keeps it off the tap-to-select re-render path.
  const dto = estado.fase === 'data' ? estado.dto : undefined;
  const viewModel: ResumenAnualViewModel | undefined = useMemo(
    () => (dto ? aResumenAnualViewModel(dto) : undefined),
    [dto],
  );

  return (
    <View className="gap-4">
      <Text
        accessibilityRole="header"
        className="px-4 text-base font-semibold text-heading"
      >
        {`Año ${anio}`}
      </Text>
      {estado.fase === 'loading' && (
        <View
          testID="anual-loading"
          className="items-center justify-center gap-3 px-4 py-8"
        >
          <ActivityIndicator
            testID="anual-loading-spinner"
            color={COLORS.ingreso}
          />
          <Text className="text-base text-muted">Cargando resumen anual…</Text>
        </View>
      )}
      {estado.fase === 'error' && (
        <ErrorAnual error={estado.error} onRetry={cargar} />
      )}
      {estado.fase === 'data' && viewModel && (
        <GrillaAnual
          viewModel={viewModel}
          periodoSeleccionado={periodoSeleccionado}
          onSelectPeriodo={onSelectPeriodo}
        />
      )}
    </View>
  );
}

/**
 * A local, non-`flex-1` error view (not the shared `states/Error.tsx`):
 * that component is styled for a full-screen slot and depends on a flexed
 * ancestor to center correctly (design §0) — `ResumenAnual` is one section
 * among several inside the shell, not the whole screen. Copy is still
 * shared via `copiaPorApiError` (DRY, same as the shared component).
 */
function ErrorAnual({
  error,
  onRetry,
}: {
  readonly error: ApiError;
  readonly onRetry: () => void;
}) {
  return (
    <View className="items-center justify-center gap-3 px-4 py-8">
      <Text className="text-center text-base text-heading">
        {copiaPorApiError(error)}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="rounded-full bg-ingreso px-6 py-3"
      >
        <Text className="font-semibold text-white">Reintentar</Text>
      </Pressable>
    </View>
  );
}

function GrillaAnual({
  viewModel,
  periodoSeleccionado,
  onSelectPeriodo,
}: {
  readonly viewModel: ResumenAnualViewModel;
  readonly periodoSeleccionado: string | undefined;
  readonly onSelectPeriodo: (periodo: string) => void;
}) {
  if (viewModel.sinDatosEnElAnio) {
    return (
      <View className="items-center justify-center px-4 py-8">
        <Text className="text-center text-base text-muted">
          Todavía no hay datos este año
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap px-2">
      {viewModel.meses.map((mes) => (
        <MesCelda
          key={mes.periodo}
          mes={mes}
          selected={mes.periodo === periodoSeleccionado}
          onSelectPeriodo={onSelectPeriodo}
        />
      ))}
    </View>
  );
}

/**
 * `MesCelda` — one cell of the 4×3 annual grid (design §1.7, D-15/D-16/D-17).
 * `React.memo`'d so a tap only re-renders the previously- and newly-selected
 * cells, not all 12 (D-15): props are a primitive `selected` boolean plus
 * `mes` (a referentially stable object — `aResumenAnualViewModel` builds a
 * fresh array only when its `dto` input changes) and `onSelectPeriodo`
 * (owned by the caller, not re-created here).
 *
 * Months without data (`!mes.tieneDatos`) are `disabled` `Pressable`s, not
 * omitted (D-16) — the cell must still announce "this month exists and is
 * unavailable" so the 4×3 calendar reading holds. Selection is announced via
 * `accessibilityState.selected` and shown as a 2px ring + bold label, never
 * color alone (D-17, ADR-018).
 */
const MesCelda = memo(function MesCelda({
  mes,
  selected,
  onSelectPeriodo,
}: {
  readonly mes: MesAnualViewModel;
  readonly selected: boolean;
  readonly onSelectPeriodo: (periodo: string) => void;
}) {
  const onPress = useCallback(() => {
    // Belt-and-suspenders alongside `disabled` (D-16): a disabled Pressable
    // should already swallow the press, but the selection contract (MOB-11)
    // must hold even if that platform behavior ever changes.
    if (!mes.tieneDatos) {
      return;
    }
    onSelectPeriodo(mes.periodo);
  }, [mes.periodo, mes.tieneDatos, onSelectPeriodo]);

  return (
    <Pressable
      testID={`mes-celda-${mes.periodo}`}
      accessibilityRole="button"
      accessibilityLabel={`Ver ${mes.nombreAccesible}`}
      accessibilityState={{ selected, disabled: !mes.tieneDatos }}
      disabled={!mes.tieneDatos}
      onPress={onPress}
      style={{ minHeight: 76 }}
      className={`w-1/4 items-center justify-center gap-1 rounded-xl border-2 p-2 ${
        selected ? 'border-ingreso' : 'border-transparent'
      }`}
    >
      <MiniDistribucionPie tajadas={mes.tajadas} />
      <Text
        className={`text-xs text-heading ${
          selected ? 'font-bold' : 'font-normal'
        }`}
      >
        {mes.etiqueta}
      </Text>
    </Pressable>
  );
});
