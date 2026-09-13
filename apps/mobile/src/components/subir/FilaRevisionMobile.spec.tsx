/**
 * FilaRevisionMobile spec — Phase 4 RED (design.md, MOB-PRV-05/06/11).
 *
 * Naming deviation from tasks.md (recorded there too): this repo's mobile
 * tests use `*.spec.tsx`, not `*.test.tsx` (see every existing file under
 * `src/components/`) — this file follows that established convention.
 *
 * No screen consumer exists yet (Phase 5+ wires `ListaRevision`/`subir.tsx`);
 * this component is tested in isolation.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import type { PreviewFilaDto } from '@moneydiary/api-client';
import { FilaRevisionMobile } from './FilaRevisionMobile';

function filaDePreview(
  overrides: Partial<PreviewFilaDto> = {},
): PreviewFilaDto {
  return {
    rowIndex: 3,
    fecha: '2026-07-15T13:45:00.000Z',
    descripcion: 'Compra supermercado',
    cargo: '5000',
    abono: '0',
    esDuplicado: false,
    sugerido: { bucket: 'Necesidades', categoriaId: 'cat-arriendo' },
    ...overrides,
  };
}

describe('FilaRevisionMobile', () => {
  it('renders fecha, descripcion, cargo and abono formatted (MOB-PRV-05)', async () => {
    const fila = filaDePreview({
      fecha: '2026-07-15T13:45:00.000Z',
      descripcion: 'Compra supermercado',
      cargo: '5000',
      abono: '0',
    });

    await render(
      <FilaRevisionMobile
        fila={fila}
        categoriaNombre="Arriendo"
        onAbrir={jest.fn()}
      />,
    );

    expect(screen.getByText('2026-07-15')).toBeOnTheScreen();
    expect(screen.getByText('Compra supermercado')).toBeOnTheScreen();
    expect(screen.getByText(/\$5\.000/)).toBeOnTheScreen();
    expect(screen.getByText('Arriendo')).toBeOnTheScreen();
  });

  describe('a duplicate row (MOB-PRV-06)', () => {
    it('renders a "Duplicado" badge and exposes no accessible button role', async () => {
      const onAbrir = jest.fn();
      const fila = filaDePreview({ esDuplicado: true });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre="Arriendo"
          onAbrir={onAbrir}
        />,
      );

      expect(screen.getByText('Duplicado')).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: /compra supermercado/i }),
      ).not.toBeOnTheScreen();
    });

    it('does not call onAbrir when tapped', async () => {
      const onAbrir = jest.fn();
      const fila = filaDePreview({ esDuplicado: true });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre="Arriendo"
          onAbrir={onAbrir}
        />,
      );

      fireEvent.press(screen.getByTestId('revision-fila-3'));

      expect(onAbrir).not.toHaveBeenCalled();
    });
  });

  describe('an Ingreso row (MOB-PRV-06)', () => {
    it('renders as settled with no edit affordance and no accessible button role', async () => {
      const onAbrir = jest.fn();
      const fila = filaDePreview({
        esDuplicado: false,
        sugerido: { bucket: 'Ingreso', categoriaId: null },
      });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre={null}
          onAbrir={onAbrir}
        />,
      );

      expect(screen.getByText('Ingreso')).toBeOnTheScreen();
      expect(
        screen.queryByRole('button', { name: /compra supermercado/i }),
      ).not.toBeOnTheScreen();
    });

    it('does not call onAbrir when tapped', async () => {
      const onAbrir = jest.fn();
      const fila = filaDePreview({
        esDuplicado: false,
        sugerido: { bucket: 'Ingreso', categoriaId: null },
      });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre={null}
          onAbrir={onAbrir}
        />,
      );

      fireEvent.press(screen.getByTestId('revision-fila-3'));

      expect(onAbrir).not.toHaveBeenCalled();
    });
  });

  describe('a non-duplicate, non-Ingreso row', () => {
    it('is Pressable and opens on tap, calling onAbrir(rowIndex)', async () => {
      const onAbrir = jest.fn();
      const fila = filaDePreview({ rowIndex: 7, esDuplicado: false });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre="Arriendo"
          onAbrir={onAbrir}
        />,
      );

      fireEvent.press(screen.getByTestId('revision-fila-7'));

      expect(onAbrir).toHaveBeenCalledWith(7);
    });

    it('exposes an accessible button role and a descriptive label (MOB-PRV-11)', async () => {
      const fila = filaDePreview({ descripcion: 'Compra supermercado' });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre="Arriendo"
          onAbrir={jest.fn()}
        />,
      );

      expect(
        screen.getByRole('button', { name: /compra supermercado/i }),
      ).toBeOnTheScreen();
    });

    it('shows "Sin categoría" when categoriaNombre is null', async () => {
      const fila = filaDePreview({ esDuplicado: false });

      await render(
        <FilaRevisionMobile
          fila={fila}
          categoriaNombre={null}
          onAbrir={jest.fn()}
        />,
      );

      expect(screen.getByText('Sin categoría')).toBeOnTheScreen();
    });
  });
});
