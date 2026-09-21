import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumenCartola } from './ResumenCartola';

// ResumenCartola (cartola-preview-confirmacion PR9, D-08) — zero-behavior
// extraction of PreviewMuestra's `data-resumen-cartola` block. These are
// approval tests: they assert EXACTLY the rendered output the block already
// had inside PreviewMuestra (banco header, resumen counts, "nada se ha
// guardado" affordance) so the extraction is provably behavior-preserving.

describe('ResumenCartola', () => {
  it('renders the banco name in the header', () => {
    render(
      <ResumenCartola
        banco="BancoEstado"
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
      />,
    );

    expect(screen.getByText('BancoEstado')).toBeInTheDocument();
  });

  it('renders resumen header with totalFilas, duplicadosDetectados and nuevas', () => {
    render(
      <ResumenCartola
        banco="BancoEstado"
        resumen={{ totalFilas: 120, duplicadosDetectados: 20, nuevas: 100 }}
      />,
    );

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders the "nada se ha guardado aún" affordance (CA-02)', () => {
    render(
      <ResumenCartola
        banco="BancoEstado"
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
      />,
    );

    expect(screen.getByText(/nada se ha guardado aún/i)).toBeInTheDocument();
  });

  it('renders the "clasificar ahora no es obligatorio" copy (issue #742)', () => {
    render(
      <ResumenCartola
        banco="BancoEstado"
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
      />,
    );

    expect(
      screen.getByText(
        'Clasificar ahora no es obligatorio: puedes cambiar la categoría de cualquier movimiento cuando quieras.',
      ),
    ).toBeInTheDocument();
  });

  it('marks the block with data-resumen-cartola', () => {
    const { container } = render(
      <ResumenCartola
        banco="BancoEstado"
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
      />,
    );

    expect(container.querySelector('[data-resumen-cartola]')).not.toBeNull();
  });
});
