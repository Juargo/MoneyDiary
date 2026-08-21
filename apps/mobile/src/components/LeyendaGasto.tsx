import { Pressable, Text, View } from 'react-native';
import type { ItemLeyenda } from '../domain/resumen-view-model';
import { COLOR_BUCKET, ETIQUETA_BUCKET } from '../theme/colors';

/**
 * 5-row spend/income legend (US-050 PR4b, design §1.7): props
 * `{ principales, complemento }: ReadonlyArray<ItemLeyenda>`. US-056 PR1
 * (D-10/D-11): every row is now a `Pressable` with `accessibilityRole="button"`,
 * unique `testID="leyenda-fila-{key}"`, and an `onNavegar` callback that the
 * caller (via `ResumenScreen` → `app/index.tsx`) wires to `router.push`. The
 * `periodo` prop threads the currently-selected dashboard month so each push
 * carries the correct period in the URL. Row shape still dispatches on
 * `item.kind` (D-03's discriminated union): `'gasto'` rows show name · % · amount;
 * `'sinCategoria'` row shows name · N tx · amount (no %) and adds
 * `?destacar=sin-categoria` to its push path; `'ingreso'` shows name · amount.
 * The `'sinCategoria'` row's `accessibilityLabel` still expands "N tx" into
 * "N transacciones sin categorizar" (ADR-018 a11y). Previously these rows were
 * inert `View`s (US-050 binding decision 2) — that decision is reversed here.
 */
export function LeyendaGasto({
  principales,
  complemento,
  periodo,
  onNavegar,
}: {
  readonly principales: readonly ItemLeyenda[];
  readonly complemento: readonly ItemLeyenda[];
  readonly periodo: string | undefined;
  readonly onNavegar: (path: string) => void;
}) {
  return (
    <View className="gap-2">
      {principales.map((item) => (
        <FilaLeyenda
          key={filaKey(item)}
          item={item}
          periodo={periodo}
          onNavegar={onNavegar}
        />
      ))}
      {complemento.map((item) => (
        <FilaLeyenda
          key={filaKey(item)}
          item={item}
          periodo={periodo}
          onNavegar={onNavegar}
        />
      ))}
    </View>
  );
}

function filaKey(item: ItemLeyenda): string {
  return item.kind === 'ingreso' ? 'ingreso' : item.bucket;
}

function testIDForItem(item: ItemLeyenda): string {
  return item.kind === 'ingreso'
    ? 'leyenda-fila-ingreso'
    : `leyenda-fila-${item.bucket}`;
}

function pathForItem(item: ItemLeyenda, periodo: string | undefined): string {
  const periodoParam = periodo ? `?periodo=${encodeURIComponent(periodo)}` : '';

  if (item.kind === 'ingreso') {
    return `/ingresos${periodoParam}`;
  }

  if (item.kind === 'sinCategoria') {
    // SinCategoria path always carries destacar before periodo (exact order per spec).
    // When periodo is undefined, omit the periodo param entirely.
    return periodo
      ? `/bucket/SinCategoria?destacar=sin-categoria&periodo=${encodeURIComponent(periodo)}`
      : `/bucket/SinCategoria?destacar=sin-categoria`;
  }

  // 'gasto' bucket row
  return `/bucket/${encodeURIComponent(item.bucket)}${periodoParam}`;
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

function FilaLeyenda({
  item,
  periodo,
  onNavegar,
}: {
  readonly item: ItemLeyenda;
  readonly periodo: string | undefined;
  readonly onNavegar: (path: string) => void;
}) {
  const testID = testIDForItem(item);
  const path = pathForItem(item, periodo);

  if (item.kind === 'ingreso') {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel="Ver detalle de ingresos"
        onPress={() => onNavegar(path)}
        className="flex-row items-center justify-between"
      >
        <Text className="text-[15px] text-heading">Ingresos</Text>
        <Text className="text-[15px] font-semibold text-heading">
          {item.montoLabel}
        </Text>
      </Pressable>
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
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accesible}
        onPress={() => onNavegar(path)}
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
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Ver detalle de ${etiqueta}`}
      onPress={() => onNavegar(path)}
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
    </Pressable>
  );
}
