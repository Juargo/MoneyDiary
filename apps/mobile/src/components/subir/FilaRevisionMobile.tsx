import { Pressable, Text, View } from 'react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import {
  esFilaEditable,
  formatearFilaPreview,
} from '../../domain/preview-cartola';
import { COLORS } from '../../theme/colors';

/**
 * FilaRevisionMobile — one row of the review list (Phase 4, design.md;
 * MOB-PRV-05/06/11). No consumer yet — `ListaRevision` wires this in Phase 5.
 *
 * Duplicate and Ingreso rows (`esFilaEditable(fila) === false`, MOB-PRV-06)
 * render as a plain `View`, not `Pressable`: they must not expose an
 * accessible button role (ADR-018) and tapping them must not open the
 * classification sheet — this mirrors `CommitIngestaUseCase` Rule 2, which
 * silently discards any overlay entry targeting an Ingreso row.
 *
 * Only editable rows are `Pressable` and call `onAbrir(fila.rowIndex)`.
 * `categoriaNombre` is resolved by the caller (`categoriaEfectiva` + catalog
 * lookup) — this component has no catalog access (ADR-024, presentation
 * only).
 */
export interface FilaRevisionMobileProps {
  readonly fila: PreviewFilaDto;
  /** The row's currently effective categoría display name, or `null` when unclassified. */
  readonly categoriaNombre: string | null;
  /** Called with `fila.rowIndex` when an editable row is tapped. */
  readonly onAbrir: (rowIndex: number) => void;
}

export function FilaRevisionMobile({
  fila,
  categoriaNombre,
  onAbrir,
}: FilaRevisionMobileProps) {
  const formateada = formatearFilaPreview(fila);
  const editable = esFilaEditable(fila);
  const esIngreso = !fila.esDuplicado && !editable;

  const contenido = (
    <>
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted">{formateada.fecha}</Text>
        <Text className="text-xs font-medium text-heading">
          {formateada.descripcion}
        </Text>
      </View>
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted">Cargo: {formateada.cargo}</Text>
        <Text className="text-xs text-muted">Abono: {formateada.abono}</Text>
      </View>
      <View className="flex-row justify-between">
        {fila.esDuplicado && (
          <Text className="text-xs font-semibold text-red-600">Duplicado</Text>
        )}
        {esIngreso && (
          <Text className="text-xs font-semibold text-muted">Ingreso</Text>
        )}
        {editable && (
          <Text className="text-xs font-medium text-heading">
            {categoriaNombre ?? 'Sin categoría'}
          </Text>
        )}
      </View>
    </>
  );

  if (!editable) {
    return (
      <View
        testID={`revision-fila-${fila.rowIndex}`}
        className="gap-1 rounded-lg bg-canvas p-2"
      >
        {contenido}
      </View>
    );
  }

  return (
    <Pressable
      testID={`revision-fila-${fila.rowIndex}`}
      accessibilityRole="button"
      accessibilityLabel={`${formateada.descripcion}, ${formateada.fecha}, categoría ${categoriaNombre ?? 'sin categoría'}`}
      onPress={() => onAbrir(fila.rowIndex)}
      className="gap-1 rounded-lg bg-canvas p-2"
      style={{ borderWidth: 1, borderColor: COLORS.hairline }}
    >
      {contenido}
    </Pressable>
  );
}
