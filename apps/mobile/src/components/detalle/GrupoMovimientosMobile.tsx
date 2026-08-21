/**
 * GrupoMovimientosMobile — accordion group component (US-056, D-04/D-19/MDET-03).
 *
 * Renders one categoria group from the M1 bucket detail screen:
 * - First 3 rows always visible; "Ver N más" / "Ver menos" toggle for larger groups.
 * - `accessibilityState={{ expanded }}` on the toggle Pressable (MDET-03).
 * - testID families: `grupo-movimientos-${id}`, `grupo-toggle-${id}`, `movimiento-${tx.id}`.
 * - SinCategoria dual destacado mechanics (D-19/MDET-03):
 *     root always carries `testID="grupo-movimientos-sin-categoria"` (stable);
 *     INNER wrapper `testID="grupo-sin-categoria-destacado"` renders ONLY when
 *     `destacar === "sin-categoria"` — conditional, not stable.
 *
 * Reclassify trigger: no-op placeholder Pressable in PR3.
 * PR4 (T-15) replaces this file to wire in the real ReclasificarMobileControl.
 * No optional-callback-silent-noop pattern is used here (us-044 PR7 case law).
 *
 * Pure: no fetch, no router.
 */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { aFechaCorta } from '../../domain/fecha-corta';
import { formatearMontoCLP } from '../../domain/formatear-monto';
import type { GrupoDetalleBucketMesDto } from '../../domain/detalle.types';

/** Number of rows visible before the accordion collapses the rest (web parity D-04). */
const FILAS_VISIBLES = 3;

interface TxVM {
  readonly id: string;
  readonly fecha: string;
  readonly descripcion: string;
  readonly montoLabel: string;
}

function asTxVM(tx: GrupoDetalleBucketMesDto['transacciones'][number]): TxVM {
  return {
    id: tx.id,
    fecha: tx.fecha,
    descripcion: tx.descripcion,
    montoLabel: formatearMontoCLP(tx.monto),
  };
}

interface GrupoMovimientosMobileProps {
  readonly grupo: GrupoDetalleBucketMesDto;
  /** When `"sin-categoria"`, renders the inner destacado wrapper inside SinCategoria root (D-19/MDET-03). */
  readonly destacar?: string;
  /**
   * Placeholder for PR4 T-15 (ReclasificarMobileControl wiring).
   * PR4 will pass these as required props and wire real handlers.
   * Omitted in PR3 — the reclassify trigger is a no-op Pressable here.
   */
  readonly onReclasificado?: () => void;
  readonly onMovida?: (bucketLabel: string) => void;
}

/**
 * GrupoMovimientosMobile renders one categoría group with an expandable
 * accordion when the group has more than 3 rows.
 */
export function GrupoMovimientosMobile({
  grupo,
  destacar,
}: GrupoMovimientosMobileProps) {
  const [expandido, setExpandido] = useState(false);

  const categoriaId = grupo.categoriaId;
  const nombre = grupo.nombre;
  const subtotalLabel = formatearMontoCLP(grupo.subtotal);
  const transacciones = grupo.transacciones.map(asTxVM);

  const idPart = categoriaId ?? 'sin-categoria';
  const esSinCategoria = categoriaId === null;
  const debeDestacar = esSinCategoria && destacar === 'sin-categoria';

  const tieneToggle = transacciones.length > FILAS_VISIBLES;
  const filasMostradas =
    tieneToggle && !expandido
      ? transacciones.slice(0, FILAS_VISIBLES)
      : transacciones;

  const textoToggle = expandido
    ? 'Ver menos'
    : `Ver ${transacciones.length - FILAS_VISIBLES} más`;

  // Inner content (header + rows + optional toggle)
  const contenido = (
    <>
      <Text style={{ fontWeight: 'bold', fontSize: 14 }}>{nombre}</Text>
      <Text style={{ fontSize: 12, color: '#8A8F9C' }}>{subtotalLabel}</Text>

      {filasMostradas.map((tx) => (
        <View
          key={tx.id}
          testID={`movimiento-${tx.id}`}
          style={{ paddingVertical: 4 }}
        >
          <Text style={{ fontSize: 13 }}>{aFechaCorta(tx.fecha)}</Text>
          <Text style={{ fontSize: 13 }}>{tx.descripcion}</Text>
          <Text style={{ fontSize: 13, fontWeight: '500' }}>
            {tx.montoLabel}
          </Text>
          {/* Reclassify trigger placeholder — wired in PR4 T-15 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cambiar categoría de ${tx.descripcion}`}
            testID={`reclasificar-trigger-${tx.id}`}
            onPress={() => {
              // No-op in PR3 — PR4 T-15 replaces this with ReclasificarMobileControl
            }}
          >
            <Text style={{ fontSize: 11, color: '#3B4266' }}>Reclasificar</Text>
          </Pressable>
        </View>
      ))}

      {tieneToggle && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: expandido }}
          testID={`grupo-toggle-${idPart}`}
          onPress={() => setExpandido((prev) => !prev)}
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 13, color: '#3B4266', fontWeight: '500' }}>
            {textoToggle}
          </Text>
        </Pressable>
      )}
    </>
  );

  // SinCategoria dual destacado mechanics (D-19/MDET-03):
  // root is always `grupo-movimientos-sin-categoria` (stable);
  // inner wrapper `grupo-sin-categoria-destacado` only when destacar is active.
  if (esSinCategoria) {
    return (
      <View
        testID="grupo-movimientos-sin-categoria"
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          backgroundColor: '#F3F3F5',
        }}
      >
        {debeDestacar ? (
          <View
            testID="grupo-sin-categoria-destacado"
            style={{
              borderWidth: 2,
              borderColor: '#464B69',
              borderRadius: 6,
              padding: 8,
            }}
          >
            {contenido}
          </View>
        ) : (
          contenido
        )}
      </View>
    );
  }

  return (
    <View
      testID={`grupo-movimientos-${idPart}`}
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#F3F3F5',
      }}
    >
      {contenido}
    </View>
  );
}
