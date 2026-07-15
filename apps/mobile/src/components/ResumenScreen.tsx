import { Pressable, ScrollView, Text, View } from 'react-native';
import { Header } from './Header';
import { IngresoCard } from './IngresoCard';
import { DistribucionPie } from './DistribucionPie';
import { LeyendaGasto } from './LeyendaGasto';
import { SemaforoBadge } from './SemaforoBadge';
import type { ResumenViewModel } from '../domain/resumen-view-model';

/**
 * Data-state composition (MOB-03/MOB-04): the resolved `ResumenViewModel`
 * rendered as the mockup's screen — header, INGRESOS hero, and the
 * "Distribución del gasto" card (pie + IDEAL inset + global semáforo + legend
 * + a "Ver detalles" affordance stubbed for US-017). Pure presentation: it
 * consumes already-formatted strings and pre-computed slices from the
 * view-model (no fetch, no env, no money math). The "Distribución del gasto"
 * heading and the `testID="semaforo-global"` are the Maestro anchors.
 */
export function ResumenScreen({ viewModel }: { readonly viewModel: ResumenViewModel }) {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="pb-8">
      <Header periodoLabel={viewModel.periodoLabel} />

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
            <View testID="semaforo-global">
              <SemaforoBadge estadoSemaforo={viewModel.estadoGlobal} />
            </View>
          </View>

          <DistribucionPie tajadas={viewModel.distribucionGasto} targets={viewModel.targets} />

          <LeyendaGasto tajadas={viewModel.distribucionGasto} />

          <Pressable
            accessibilityRole="button"
            className="items-center rounded-full bg-canvas py-3"
          >
            <Text className="font-semibold text-heading">Ver detalles ›</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
