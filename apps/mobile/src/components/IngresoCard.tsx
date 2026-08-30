import { Text, View } from 'react-native';
import { TrendingDown, TrendingUp } from 'lucide-react-native';
import { formatearPeriodoLabel } from '../domain/periodo-label';
import type { VariacionIngreso } from '../domain/variacion-ingreso';
import type { BarraIngreso } from '../domain/sparkline-ingreso';
import { COLORS } from '../theme/colors';

/**
 * "INGRESOS TOTALES" card, redesigned 2026-08-30 to the income-card mock
 * (mirrors the web rewrite): eyebrow + trend pill, the amount at display
 * scale, the period as subtext, and a bar sparkline of the last months.
 * The mockup-era left accent bar is retired (the mock has none — the income
 * identity lives in the pill text and the highlighted bar, both on the
 * existing `ingreso` slate).
 *
 * Column layout, sparkline BELOW the text block (declared phone collapse:
 * a right-side chart would fight the display amount for width on narrow
 * screens; full-width bars keep both readable).
 *
 * The mock's "Actualizado hace unos instantes" line is replaced by the
 * period label — cartola data has no live freshness to claim (copy
 * self-audit rule).
 *
 * `totalIngreso` arrives already formatted as CLP from the view-model
 * (BigInt-string-safe) — never reformatted here. `variacion`/`barras`
 * arrive PRE-computed from the pure domain helpers (fed by the annual data
 * the shell observes via `ResumenAnual`'s `onMeses`): null/empty degrades
 * to the base card (amount + eyebrow + period), no pill, no sparkline, no
 * spinner.
 *
 * A11y: the pill is plain text; the sparkline is decoration hidden from
 * assistive tech (the pill already carries the trend in words, ADR-018).
 * Eyebrow/subtext use `muted-deep` (#5F6572, 5.85:1 on white) — the
 * app-wide `muted` (#8A8F9C, ~3.4:1) fails AA as small text; minted per the
 * semáforo deep-tone precedent, existing `text-muted` call sites are
 * out-of-scope debt.
 */
export function IngresoCard({
  totalIngreso,
  periodo,
  variacion,
  barras,
}: {
  readonly totalIngreso: string;
  readonly periodo: string;
  readonly variacion: VariacionIngreso | null;
  readonly barras: readonly BarraIngreso[];
}) {
  return (
    <View className="gap-1.5 rounded-2xl border border-hairline bg-white p-5">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-xs font-semibold tracking-widest text-muted-deep">
          INGRESOS TOTALES
        </Text>
        {variacion && (
          <View className="flex-row items-center gap-1 rounded-full bg-canvas px-2.5 py-0.5">
            {variacion.direccion === 'sube' && (
              <TrendingUp
                size={14}
                color={COLORS.ingreso}
                testID="ingreso-trend-icon"
              />
            )}
            {variacion.direccion === 'baja' && (
              <TrendingDown
                size={14}
                color={COLORS.ingreso}
                testID="ingreso-trend-icon"
              />
            )}
            <Text className="text-xs font-semibold text-ingreso">
              {variacion.etiqueta}
            </Text>
          </View>
        )}
      </View>

      <Text className="text-4xl font-extrabold text-heading">
        {totalIngreso}
      </Text>
      <Text className="text-sm text-muted-deep">
        {formatearPeriodoLabel(periodo)}
      </Text>

      {barras.length > 0 && (
        <View
          testID="ingreso-sparkline"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="mt-2 h-16 flex-row items-end gap-1.5"
        >
          {barras.map((barra) => (
            <View
              key={barra.periodo}
              testID={`barra-${barra.periodo}`}
              className="flex-1 rounded-sm"
              style={{
                height: `${barra.fraccion * 100}%`,
                backgroundColor: barra.esActual
                  ? COLORS.ingreso
                  : COLORS.hairline,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
