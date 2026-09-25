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

  it('renders the unmatched-transaction note with the "Gustos" UI label (never the raw "Deseos" bucket key)', () => {
    render(
      <ResumenCartola
        banco="BancoEstado"
        resumen={{ totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 }}
      />,
    );

    // The sentence is split across a <strong> for the bucket · categoría
    // name, so the full text only lives on the <p>'s own textContent —
    // match that, not a substring, to catch a copy regression on either
    // side of the <strong> (toHaveTextContent-matchea-subcadena gotcha).
    const nota = screen.getByText((_, element) => {
      if (element?.tagName !== 'P') return false;
      return (
        element.textContent ===
        'Los movimientos que no coincidan con ningún patrón se quedarán como Gustos · Desconocido y podrás editarlos antes de subir o después.'
      );
    });
    expect(nota).toBeInTheDocument();
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
