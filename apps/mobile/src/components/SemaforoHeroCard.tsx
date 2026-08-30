import { Text, View } from 'react-native';
import { SIN_DATOS, resolverEstiloSemaforo } from '../theme/semaforo-estilos';
import { COLORS } from '../theme/colors';
import type { VeredictoSemaforo } from '../domain/veredicto-semaforo';

/**
 * SemaforoHeroCard (mobile) — mock-driven redesign (2026-08-30), the mobile
 * mirror of web's `SemaforoHeroCard`: the monthly verdict leads the screen
 * (PRODUCT.md principle 1), replacing the small `SemaforoTag` pill that
 * lived in the chart card's header. Anatomy, top to bottom:
 *
 * - Ring indicator (decorative, hidden from a11y): halo in the estado's
 *   tinted `bg`, thick ring in its `deep` tone, filled core in its `icon`
 *   mid tone — all from `theme/semaforo-estilos.ts` / `theme/colors.ts`.
 * - Title `Semáforo: {label}` with the rebranded labels (Muy Saludable /
 *   Saludable / En peligro) — the single accessible carrier of the estado
 *   (ADR-018: never color alone).
 * - Tinted verdict box carrying `construirVeredictoSemaforo`'s copy (bold
 *   lead + why), `deep`-on-`bg` (AA verified in `theme/colors.ts`).
 * - Decorative worst→best scale; only the active segment's track fills.
 *
 * NOT pressable: mobile has no /semaforo detail route (MOB-15 precedent —
 * no affordance without a destination). `estadoGlobal` passes through
 * verbatim (ADR-024); `null` OR an unknown value renders the calm
 * "Sin datos" state (never coerced into a known color, MOB-03/MOB-06).
 * `testID="semaforo-global"` moved here from `SemaforoTag` (Maestro/spec
 * anchor, same move web made).
 */
export function SemaforoHeroCard({
  estadoGlobal,
  veredicto,
}: {
  readonly estadoGlobal: string | null;
  /** Precomputed by the caller (`construirVeredictoSemaforo`) — this card only renders. */
  readonly veredicto: VeredictoSemaforo | null;
}) {
  const estilo = resolverEstiloSemaforo(estadoGlobal);
  const conocido = estilo !== SIN_DATOS;

  if (!conocido) {
    return (
      <View
        testID="semaforo-global"
        className="items-center gap-2 rounded-2xl border border-hairline bg-white p-5"
      >
        <Anillo halo={estilo.bg} aro={estilo.deep} nucleo={estilo.icon} />
        <Text className="text-center text-2xl font-extrabold text-heading">
          Sin datos
        </Text>
        <Text className="text-center text-sm text-muted">
          Carga una cartola para conocer tu mes
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="semaforo-global"
      className="items-center gap-4 rounded-2xl border border-hairline bg-white p-5"
    >
      <Anillo halo={estilo.bg} aro={estilo.deep} nucleo={estilo.icon} />

      <Text className="text-center text-2xl font-extrabold text-heading">
        Semáforo: {estilo.label}
      </Text>

      {veredicto && (
        <View
          className="rounded-xl px-4 py-3"
          style={{ backgroundColor: estilo.bg }}
        >
          <Text
            className="text-center text-sm leading-relaxed"
            style={{ color: estilo.deep }}
          >
            <Text className="font-bold">{veredicto.lead}</Text>{' '}
            {veredicto.detalle}
          </Text>
        </View>
      )}

      <View aria-hidden className="w-full flex-row gap-3 pt-1">
        {ESCALA.map((estado) => {
          const tono = resolverEstiloSemaforo(estado);
          return (
            <View key={estado} className="flex-1 gap-1.5">
              <Text className="text-xs font-bold" style={{ color: tono.deep }}>
                {tono.label}
              </Text>
              <View
                className="h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    estado === estadoGlobal ? tono.deep : COLORS.hairline,
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Ring indicator (mock anatomy): soft halo → thick deep ring on a white gap
 * → filled mid-tone core. Purely decorative — hidden from accessibility so
 * the title text stays the only carrier of the estado.
 */
function Anillo({
  halo,
  aro,
  nucleo,
}: {
  readonly halo: string;
  readonly aro: string;
  readonly nucleo: string;
}) {
  return (
    <View
      aria-hidden
      className="size-16 items-center justify-center rounded-full"
      style={{ backgroundColor: halo }}
    >
      <View
        className="size-12 items-center justify-center rounded-full border-4 bg-white"
        style={{ borderColor: aro }}
      >
        <View
          className="size-6 rounded-full"
          style={{ backgroundColor: nucleo }}
        />
      </View>
    </View>
  );
}

/** Decorative worst→best scale order; labels/tones resolve from the single estilo table. */
const ESCALA = ['rojo', 'amarillo', 'verde'] as const;
