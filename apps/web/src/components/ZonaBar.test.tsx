import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ZonaBar } from './ZonaBar';
import type { SegmentoZona } from '@/domain/semaforo-detalle-view-model';

/**
 * ZonaBar.test.tsx — US-049 T7.1 (design §1.7, WSEM-03/WSEM-08). 5 cases per
 * the ledger: the coloured track is `aria-hidden` (never colour alone,
 * ADR-018); band edges/estado are present as accessible text; each segment
 * carries a text label; the marker renders at its computed position; a
 * `null` `markerPct` (sinIngreso-adjacent) renders "Sin datos", no marker.
 */

const SEGMENTOS_UNILATERAL: readonly SegmentoZona[] = [
  { estado: 'verde', desdePct: 0, anchoPct: 50, etiqueta: '0–50%' },
  { estado: 'amarillo', desdePct: 50, anchoPct: 10, etiqueta: '50–60%' },
  { estado: 'rojo', desdePct: 60, anchoPct: 40, etiqueta: '60–100%' },
];

describe('ZonaBar', () => {
  it('renders the coloured track as aria-hidden', () => {
    render(
      <ZonaBar
        segmentos={SEGMENTOS_UNILATERAL}
        markerPct={55}
        porcentajeLabel="55%"
        estadoLabel="Amarillo"
      />,
    );

    const track = screen.getByTestId('zona-bar-track');
    expect(track).toHaveAttribute('aria-hidden', 'true');
  });

  it('exposes the percentage, band edges, and estado as accessible text', () => {
    render(
      <ZonaBar
        segmentos={SEGMENTOS_UNILATERAL}
        markerPct={55}
        porcentajeLabel="55%"
        estadoLabel="Amarillo"
      />,
    );

    expect(screen.getByText('55%')).toBeInTheDocument();
    expect(screen.getByText('Amarillo')).toBeInTheDocument();
    expect(screen.getByText('0–50%')).toBeInTheDocument();
    expect(screen.getByText('50–60%')).toBeInTheDocument();
    expect(screen.getByText('60–100%')).toBeInTheDocument();
  });

  it('gives every segment a visible text label — never colour alone', () => {
    render(
      <ZonaBar
        segmentos={SEGMENTOS_UNILATERAL}
        markerPct={55}
        porcentajeLabel="55%"
        estadoLabel="Amarillo"
      />,
    );

    for (const segmento of SEGMENTOS_UNILATERAL) {
      expect(screen.getByText(segmento.etiqueta)).toBeInTheDocument();
    }
  });

  it('renders the marker at the computed position', () => {
    render(
      <ZonaBar
        segmentos={SEGMENTOS_UNILATERAL}
        markerPct={55}
        porcentajeLabel="55%"
        estadoLabel="Amarillo"
      />,
    );

    const marker = screen.getByTestId('zona-bar-marker');
    expect(marker).toHaveStyle({ left: '55%' });
  });

  it('renders "Sin datos" with no marker when markerPct is null', () => {
    render(
      <ZonaBar
        segmentos={SEGMENTOS_UNILATERAL}
        markerPct={null}
        porcentajeLabel="Sin datos"
        estadoLabel="Sin datos"
      />,
    );

    expect(screen.getAllByText('Sin datos').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('zona-bar-marker')).not.toBeInTheDocument();
  });
});
