import { Text, View } from 'react-native';
import { IngresoCard } from './IngresoCard';
import { DistribucionPie } from './DistribucionPie';
import { LeyendaGasto } from './LeyendaGasto';
import { SemaforoTag } from './SemaforoTag';
import type { ResumenViewModel } from '../domain/resumen-view-model';

/**
 * Data-state composition (MOB-03/MOB-04) — US-050 PR4b re-scope (design
 * §1.7/D-06): this is now "the month block", NOT the whole screen anymore.
 * `ScrollView` and `Header` moved up into the route shell (`app/index.tsx`,
 * Phase 5b) — until that PR lands, the shell renders this component
 * directly with no wrapping `ScrollView`/`Header` (merged-but-unreleased
 * window under the `stacked-to-main` chain strategy, same accepted cost as
 * PR1–PR3's transient ring/legend mismatch). Name kept deliberately: three
 * docstrings, a Maestro comment and the integration spec reference it
 * (D-06). Pure presentation: consumes already-formatted strings and
 * pre-computed slices from the view-model (no fetch, no env, no money
 * math). The "Distribución del gasto" heading and `testID="semaforo-global"`
 * (now on `SemaforoTag`'s own root) are the Maestro anchors. Removed
 * (MOB-15): the "Ver detalles ›" affordance — no destination exists.
 * US-056 PR1 (D-10): `periodo` and `onNavegar` threaded from `app/index.tsx`
 * through here to `LeyendaGasto` so legend rows can navigate to detail screens.
 */
export function ResumenScreen({
  viewModel,
  periodo,
  onNavegar,
}: {
  readonly viewModel: ResumenViewModel;
  readonly periodo: string | undefined;
  readonly onNavegar: (path: string) => void;
}) {
  return (
    <View className="gap-5 px-4">
      <IngresoCard totalIngreso={viewModel.totalIngreso} />

      <View className="gap-5 rounded-2xl border border-hairline bg-white p-5">
        <View className="flex-row items-center justify-between">
          {/* Source text stays normal-case (test + Maestro anchor); the
              uppercase look is a style transform, per the mockup. */}
          <Text
            accessibilityRole="header"
            className="text-xs font-semibold uppercase tracking-widest text-muted"
          >
            Distribución del gasto
          </Text>
          <SemaforoTag estadoGlobal={viewModel.estadoGlobal} />
        </View>

        <DistribucionPie tajadas={viewModel.distribucionGasto} />

        <LeyendaGasto
          principales={viewModel.leyendaPrincipal}
          complemento={viewModel.leyendaComplemento}
          periodo={periodo}
          onNavegar={onNavegar}
        />
      </View>
    </View>
  );
}
