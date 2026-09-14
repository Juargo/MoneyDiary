import { FlatList } from 'react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { FilaRevisionMobile } from './FilaRevisionMobile';

/**
 * ListaRevision — the virtualized review list (Phase 5, design.md;
 * MOB-PRV-05). No consumer yet — `subir.tsx`'s `revisando` state wires this
 * in Phase 6.
 *
 * Renders **every** row via `FlatList` (no pagination, no 10/25/50
 * selector): `filas` is passed straight to `data`, so `FlatList` owns
 * virtualization instead of the screen slicing the array (MOB-PRV-05).
 * `categoriaNombrePorFila` is precomputed by the caller (`categoriaEfectiva`
 * + catalog lookup, keyed by `rowIndex`) — this component has no catalog
 * access (ADR-024, presentation only), mirroring `FilaRevisionMobile`'s own
 * `categoriaNombre` prop.
 */
export interface ListaRevisionProps {
  readonly filas: readonly PreviewFilaDto[];
  /** Effective categoría display name per row, keyed by `rowIndex`. */
  readonly categoriaNombrePorFila: ReadonlyMap<number, string | null>;
  /** Called with a row's `rowIndex` when an editable row is tapped. */
  readonly onAbrirFila: (rowIndex: number) => void;
}

export function ListaRevision({
  filas,
  categoriaNombrePorFila,
  onAbrirFila,
}: ListaRevisionProps) {
  return (
    <FlatList
      testID="revision-lista"
      data={filas}
      keyExtractor={(fila) => String(fila.rowIndex)}
      contentContainerStyle={{ gap: 8 }}
      renderItem={({ item }) => (
        <FilaRevisionMobile
          fila={item}
          categoriaNombre={categoriaNombrePorFila.get(item.rowIndex) ?? null}
          onAbrir={onAbrirFila}
        />
      )}
    />
  );
}
