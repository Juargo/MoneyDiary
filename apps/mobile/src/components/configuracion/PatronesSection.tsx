/**
 * PatronesSection.tsx — US-044 PR7, T7.2 (GREEN)
 *
 * Renders the classification patterns for a categoria:
 *   - Existing PatronFila rows (committed to the backend)
 *   - New placeholder PatronFila rows (appended by "Agregar patrón", not yet saved)
 *   - «Sin patrones: solo asignación manual.» — ALWAYS rendered (MCTG-04);
 *     regardless of whether patterns exist, unmatched transactions fall back to
 *     manual assignment. This note is always visible.
 *   - "Agregar patrón" button — appends a new placeholder row with zero requests
 *
 * Rows commit independently of the categoría's own Guardar button (MCTG-04).
 * Cancelar on EditarCategoria discards only the identity draft, not committed patterns.
 *
 * Design §1.12: existing rows precede new placeholder rows (ORDER pinning,
 * judgment-anticipated class 2). A new row has no `id` and issues zero requests
 * until its own "Guardar patrón" confirm button is pressed.
 *
 * Props:
 *   categoriaId      — the parent categoria's id (needed for crearPatron's payload)
 *   patrones         — the category's existing PatronDto rows (from the loaded DTO)
 *   onPatronesChange — called after any successful mutation so the parent can
 *                      trigger a catalog re-fetch (D-10)
 */
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PatronDto } from '../../domain/catalogo.types';
import { PatronFila } from './PatronFila';

export interface PatronesSectionProps {
  readonly categoriaId: string;
  readonly patrones: readonly PatronDto[];
  /** Called after a successful patron mutation so the parent route can refresh. */
  readonly onPatronesChange: () => void;
}

/** A new placeholder row has no id — it has not been created yet. */
interface NuevoPatron {
  readonly tempId: string; // local key only, never sent to the API
}

export function PatronesSection({
  categoriaId,
  patrones,
  onPatronesChange,
}: PatronesSectionProps) {
  // Placeholder rows appended by "Agregar patrón". Each has a local tempId for
  // React key and rowId. On successful crearPatron the parent re-fetches and the row
  // moves from placeholder to real via the updated patrones prop.
  const [nuevos, setNuevos] = useState<NuevoPatron[]>([]);

  // Monotonic counter for placeholder tempIds — avoids Date.now() collisions
  // when Agregar is pressed multiple times within a millisecond.
  const nextTempId = useRef(0);

  function agregarPlaceholder() {
    nextTempId.current += 1;
    const tempId = `nuevo-${nextTempId.current.toString()}`;
    setNuevos((prev) => [...prev, { tempId }]);
  }

  function descartarNuevo(tempId: string) {
    setNuevos((prev) => prev.filter((n) => n.tempId !== tempId));
  }

  return (
    <View className="gap-3">
      {/* Section heading — D-13 mobile variant */}
      <Text className="text-sm font-semibold text-heading">Patrones</Text>

      {/* Always-visible note (MCTG-04, non-tautological requirement).
          Unmatched transactions use manual assignment regardless of patterns. */}
      <Text className="text-xs text-muted">
        Sin patrones: solo asignación manual.
      </Text>

      {/* Existing rows — BEFORE new placeholder rows (ORDER pinning, class 2) */}
      {patrones.map((patron) => (
        <PatronFila
          key={patron.id}
          rowId={patron.id}
          patron={patron}
          categoriaId={categoriaId}
          onGuardado={onPatronesChange}
          onEliminado={onPatronesChange}
        />
      ))}

      {/* New placeholder rows appended by "Agregar" — appear AFTER existing rows */}
      {nuevos.map((nuevo) => (
        <PatronFila
          key={nuevo.tempId}
          rowId={nuevo.tempId}
          patron={null}
          categoriaId={categoriaId}
          onGuardado={() => {
            descartarNuevo(nuevo.tempId);
            onPatronesChange();
          }}
          onEliminado={() => descartarNuevo(nuevo.tempId)}
        />
      ))}

      {/* Visible text: «Agregar» (design §1.10 mobile variant — D-13).
          Accessible name: «Agregar patrón» (accessibilityLabel — unambiguous for screen readers).
          Zero requests — only appends a placeholder row. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar patrón"
        onPress={agregarPlaceholder}
        className="rounded-xl border border-hairline bg-white px-4 py-3"
      >
        <Text className="text-center text-sm font-medium text-heading">
          Agregar
        </Text>
      </Pressable>
    </View>
  );
}
