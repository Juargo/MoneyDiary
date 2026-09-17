/**
 * IngresosMesLista — read-only income transaction list (US-056, D-08/MDET-06).
 *
 * Renders each income row as: Fecha · Descripción · Origen badge · Monto.
 * `Origen` is displayed verbatim (bank name from server, no normalization —
 * WDI-06 parity; server is the authority, ADR-024).
 *
 * Row testID: `ingreso-fila-{tx.id}` (D-19 uniqueness on repeated rows).
 *
 * Fecha cell (bucket-detalle-lista-rediseño mobile port, Cambio 4): shares
 * `CeldaFecha` with `GrupoMovimientosMobile` so the two mobile lists read
 * identically. Purely presentational — the component does zero fecha
 * formatting itself; it reads the already-computed `diaLabel`/
 * `diaSemanaLabel`/`fechaLargaLabel` fields the view model precomputes
 * (`aIngresosMesViewModel`, same discipline as `montoLabel`/`origen`). The
 * old `fechaLabel` (`aFechaCorta`, short `YYYY-MM-DD`) is no longer rendered
 * here but stays on the view model — no other consumer, kept for
 * back-compat. Monto carries `fontVariant: ['tabular-nums']` for a rigid
 * digit column (same as `GrupoMovimientosMobile`'s row monto).
 *
 * NO reclassify trigger, NO mutation, NO refresh signal (D-08 read-only).
 */

import { ScrollView, Text, View } from 'react-native';
import type { IngresosMesFilaViewModel } from '../../domain/ingresos-mes-view-model';
import { CeldaFecha } from './CeldaFecha';

interface IngresosMesListaProps {
  readonly filas: readonly IngresosMesFilaViewModel[];
}

/**
 * IngresosMesLista — read-only scrollable list of income rows.
 * Maps IngresosMesFilaViewModel → one row per transaction.
 */
export function IngresosMesLista({ filas }: IngresosMesListaProps) {
  return (
    <ScrollView testID="ingresos-mes-lista">
      {filas.map((fila) => (
        <View
          key={fila.id}
          testID={`ingreso-fila-${fila.id}`}
          style={{
            flexDirection: 'column',
            paddingVertical: 12,
            paddingHorizontal: 8,
            borderBottomWidth: 1,
            borderBottomColor: '#E8E8EC',
          }}
        >
          {/* Row 1: Fecha + Monto */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <CeldaFecha
              dia={fila.diaLabel}
              diaSemana={fila.diaSemanaLabel}
              fechaLargaLabel={fila.fechaLargaLabel}
            />
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#2D2F3A',
                fontVariant: ['tabular-nums'],
              }}
            >
              {fila.montoLabel}
            </Text>
          </View>

          {/* Row 2: Descripción */}
          <Text
            style={{ fontSize: 14, color: '#2D2F3A', marginBottom: 4 }}
            numberOfLines={2}
          >
            {fila.descripcion}
          </Text>

          {/* Origen badge — verbatim bank name (WDI-06 / server is authority) */}
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: '#EEF0F5',
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 11, color: '#5A5F72' }}>
              {fila.origen}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
