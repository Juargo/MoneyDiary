import { Text, View } from 'react-native';
import { IngresoCard } from './IngresoCard';
import { DistribucionPie } from './DistribucionPie';
import { LeyendaGasto } from './LeyendaGasto';
import { SemaforoHeroCard } from './SemaforoHeroCard';
import { BUCKETS_5030 } from '../domain/distribucion-gasto';
import { construirVeredictoSemaforo } from '../domain/veredicto-semaforo';
import { ETIQUETA_BUCKET } from '../theme/colors';
import type { ResumenViewModel } from '../domain/resumen-view-model';
import type { VariacionIngreso } from '../domain/variacion-ingreso';
import type { BarraIngreso } from '../domain/sparkline-ingreso';

/**
 * Data-state composition (MOB-03/MOB-04) — US-050 PR4b re-scope (design
 * §1.7/D-06): this is now "the month block", NOT the whole screen anymore.
 * `ScrollView` and `Header` moved up into the route shell (`app/index.tsx`,
 * Phase 5b). Name kept deliberately: three docstrings, a Maestro comment and
 * the integration spec reference it (D-06). Pure presentation: consumes
 * already-formatted strings and pre-computed slices from the view-model (no
 * fetch, no env, no money math). US-056 PR1 (D-10): `periodo` and `onNavegar`
 * threaded from `app/index.tsx` through here to `LeyendaGasto` so legend rows
 * can navigate to detail screens.
 *
 * Semáforo hero redesign (2026-08-30, mirrors web's P0 fix): the verdict now
 * LEADS the month block as `SemaforoHeroCard` — first card, above income
 * (PRODUCT.md principle 1, "the monthly verdict comes first") — and the
 * chart card DROPS its `SemaforoTag` (redundant with the hero above it).
 * `testID="semaforo-global"` moved to the hero's root; the Maestro anchor
 * (`.maestro/resumen-semaforo.yaml`) keeps resolving through that single
 * instance. The verdict copy is phrased here from the per-bucket estados the
 * view model carries verbatim (never recomputed, ADR-024) — the UI label
 * resolution (Deseos → 'Gustos') happens HERE so the pure domain function
 * stays theme-free; a bucket absent from the DTO degrades to estado null
 * (the function falls back to its self-contained per-estado line).
 */
export function ResumenScreen({
  viewModel,
  periodo,
  variacionIngreso,
  barrasIngreso,
  onNavegar,
}: {
  readonly viewModel: ResumenViewModel;
  readonly periodo: string | undefined;
  /** Pre-computed by the shell from the annual months (no money math here). */
  readonly variacionIngreso: VariacionIngreso | null;
  readonly barrasIngreso: readonly BarraIngreso[];
  readonly onNavegar: (path: string) => void;
}) {
  const veredicto = construirVeredictoSemaforo(
    viewModel.estadoGlobal,
    BUCKETS_5030.map((bucket) => ({
      nombre: ETIQUETA_BUCKET[bucket] ?? bucket,
      estado:
        viewModel.buckets.find((b) => b.bucket === bucket)?.estadoSemaforo ??
        null,
    })),
  );

  return (
    <View className="gap-5 px-4">
      <SemaforoHeroCard
        estadoGlobal={viewModel.estadoGlobal}
        veredicto={veredicto}
      />

      <IngresoCard
        totalIngreso={viewModel.totalIngreso}
        periodo={viewModel.periodo}
        variacion={variacionIngreso}
        barras={barrasIngreso}
      />

      <View className="gap-5 rounded-2xl border border-hairline bg-white p-5">
        {/* Source text stays normal-case (test + Maestro anchor); the
            uppercase look is a style transform, per the mockup. */}
        <Text
          accessibilityRole="header"
          className="text-xs font-semibold uppercase tracking-widest text-muted"
        >
          Distribución del gasto
        </Text>

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
