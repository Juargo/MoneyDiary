/**
 * Shared test fixtures for US-060 manual movement components.
 * Mirrors `preview-fixtures.ts` (DRY precedent): shared factory functions
 * imported by multiple test files to avoid duplicated local definitions.
 */
import type { RegistrarMovimientoManualDto } from '@/api/types';

/**
 * Factory for a valid POST /api/movimientos 201 response (RegistrarMovimientoManualDto).
 * All monetary fields are BigInt-safe strings; `origen` is always `'Manual'`.
 *
 * @param overrides Shallow-merged into the default object.
 */
export function unMovimientoManualDto(
  overrides: Partial<RegistrarMovimientoManualDto> = {},
): RegistrarMovimientoManualDto {
  return {
    id: 'mov_abc',
    fecha: '2026-08-22T12:00:00.000Z',
    descripcion: 'Almuerzo',
    cargo: '0',
    abono: '5000',
    bucket: 'Necesidades',
    categoriaId: 'cat_xyz',
    origen: 'Manual',
    ...overrides,
  };
}
