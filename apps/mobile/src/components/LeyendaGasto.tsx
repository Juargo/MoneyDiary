import { Text, View } from 'react-native';
import type { ItemLeyenda } from '../domain/resumen-view-model';
import { COLOR_BUCKET, ETIQUETA_BUCKET } from '../theme/colors';

/**
 * 5-row spend/income legend (US-050 PR4b, design §1.7): props
 * `{ principales, complemento }: ReadonlyArray<ItemLeyenda>`. Every row is
 * an inert `View` — non-interactive, no chevrons, no navigation (binding
 * decision 2). Row shape dispatches on `item.kind` (D-03's discriminated
 * union), never a boolean flag: `'gasto'` rows show name · % · amount; the
 * `'sinCategoria'` row shows name · N tx · amount (no %); `'ingreso'` shows
 * name · amount only. The `'sinCategoria'` row additionally exposes an
 * explicit `accessibilityLabel` that expands the visible "N tx" into "N
 * transacciones sin categorizar" (web's exact `.replace` transform,
 * ADR-018) — the other rows rely on their visible text as the accessible
 * name.
 */
export function LeyendaGasto({
  principales,
  complemento,
}: {
  readonly principales: readonly ItemLeyenda[];
  readonly complemento: readonly ItemLeyenda[];
}) {
  return (
    <View className="gap-2">
      {principales.map((item) => (
        <FilaLeyenda key={filaKey(item)} item={item} />
      ))}
      {complemento.map((item) => (
        <FilaLeyenda key={filaKey(item)} item={item} />
      ))}
    </View>
  );
}

function filaKey(item: ItemLeyenda): string {
  return item.kind === 'ingreso' ? 'ingreso' : item.bucket;
}

function Punto({ bucket }: { readonly bucket: string }) {
  return (
    <View
      aria-hidden
      className="h-3 w-3 rounded-full"
      style={{ backgroundColor: COLOR_BUCKET[bucket] ?? '#CCCCCC' }}
    />
  );
}

function FilaLeyenda({ item }: { readonly item: ItemLeyenda }) {
  if (item.kind === 'ingreso') {
    return (
      <View
        testID="leyenda-fila"
        className="flex-row items-center justify-between"
      >
        <Text className="text-[15px] text-heading">Ingresos</Text>
        <Text className="text-[15px] font-semibold text-heading">
          {item.montoLabel}
        </Text>
      </View>
    );
  }

  const etiqueta = ETIQUETA_BUCKET[item.bucket] ?? item.bucket;

  if (item.kind === 'sinCategoria') {
    // Visible "N tx" stays on screen; the accessible name spells it out —
    // "N transacciones sin categorizar" (web's exact `.replace` transform).
    const accesible = `${etiqueta} · ${item.cantidadLabel.replace(
      /\s*tx$/,
      ' transacciones sin categorizar',
    )} · ${item.montoLabel}`;
    return (
      <View
        testID="leyenda-fila"
        accessible
        accessibilityLabel={accesible}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-2">
          <Punto bucket={item.bucket} />
          <Text className="text-[15px] text-heading">
            {etiqueta} · {item.cantidadLabel}
          </Text>
        </View>
        <Text className="text-[15px] font-semibold text-heading">
          {item.montoLabel}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="leyenda-fila"
      className="flex-row items-center justify-between"
    >
      <View className="flex-row items-center gap-2">
        <Punto bucket={item.bucket} />
        <Text className="text-[15px] text-heading">{etiqueta}</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-[13px] text-muted">{item.porcentaje}%</Text>
        <Text className="text-[15px] font-semibold text-heading">
          {item.montoLabel}
        </Text>
      </View>
    </View>
  );
}
