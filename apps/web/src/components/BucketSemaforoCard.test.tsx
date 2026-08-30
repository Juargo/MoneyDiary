import { render, screen } from '@testing-library/react';
import { BucketSemaforoCard } from './BucketSemaforoCard';
import type { BucketSemaforoViewModel } from '@/domain/semaforo-detalle-view-model';

// Semantic wash extension (DESIGN.md "Status Families" update, 2026-08-29):
// BucketSemaforoCard tints its own surface with the pale semaforo-verde/
// -amarillo/-rojo token matching the bucket's own estado, mirroring
// SemaforoHeroCard's FONDO_TARJETA_POR_ESTADO composition — same tokens, no
// new palette literals, wash appended locally via cn().

function unViewModel(
  overrides: Partial<BucketSemaforoViewModel> = {},
): BucketSemaforoViewModel {
  return {
    bucket: 'Necesidades',
    porcentajeLabel: '40%',
    estadoSemaforo: 'verde',
    metaLabel: 'Meta: 50%',
    markerPct: 40,
    segmentos: [
      { estado: 'verde', desdePct: 0, anchoPct: 100, etiqueta: '0–100%' },
    ],
    consejo: null,
    ...overrides,
  };
}

describe('BucketSemaforoCard', () => {
  it('washes the card surface with bg-semaforo-verde when estadoSemaforo is verde', () => {
    const { container } = render(
      <BucketSemaforoCard
        viewModel={unViewModel({ estadoSemaforo: 'verde' })}
      />,
    );

    expect(container.firstElementChild).toHaveClass('bg-semaforo-verde');
  });

  it('washes the card surface with bg-semaforo-amarillo when estadoSemaforo is amarillo', () => {
    const { container } = render(
      <BucketSemaforoCard
        viewModel={unViewModel({ estadoSemaforo: 'amarillo' })}
      />,
    );

    expect(container.firstElementChild).toHaveClass('bg-semaforo-amarillo');
  });

  it('washes the card surface with bg-semaforo-rojo when estadoSemaforo is rojo', () => {
    const { container } = render(
      <BucketSemaforoCard
        viewModel={unViewModel({ estadoSemaforo: 'rojo' })}
      />,
    );

    expect(container.firstElementChild).toHaveClass('bg-semaforo-rojo');
  });

  it('falls back to the neutral card surface when estadoSemaforo is null (sin datos)', () => {
    const { container } = render(
      <BucketSemaforoCard viewModel={unViewModel({ estadoSemaforo: null })} />,
    );

    const card = container.firstElementChild;
    expect(card).not.toHaveClass('bg-semaforo-verde');
    expect(card).not.toHaveClass('bg-semaforo-amarillo');
    expect(card).not.toHaveClass('bg-semaforo-rojo');
    expect(card).toHaveClass('bg-card');
  });

  it('keeps text on strong AA foreground tokens regardless of the wash', () => {
    render(<BucketSemaforoCard viewModel={unViewModel()} />);

    expect(screen.getByText('Necesidades')).toHaveClass('text-foreground');
    expect(screen.getByText('Meta: 50%')).toHaveClass('text-muted-foreground');
  });
});
