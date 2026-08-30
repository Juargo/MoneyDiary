import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderConRouter } from '@/test/router-harness';
import { AyudaPage } from './AyudaPage';

/**
 * AyudaPage.test.tsx — content coverage for `/ayuda` (nav conversion from
 * the long-lived `'placeholder'` item, WDS-03). Router-agnostic component
 * (only its internal `<Link>`s need a router), same discipline as
 * `SemaforoDetallePage.test.tsx` — rendered via the shared
 * `renderConRouter` harness.
 */
// `renderConRouter` resolves its initial route match asynchronously (see
// that helper's own docblock) — wait for the `h1` to paint before any
// synchronous query runs, same pattern as `ResumenAnual.test.tsx`.
async function renderAyudaPage() {
  const resultado = renderConRouter(<AyudaPage />);
  await screen.findByRole('heading', { level: 1 });
  return resultado;
}

describe('AyudaPage', () => {
  it('renders a single h1 titled "Ayuda"', async () => {
    await renderAyudaPage();

    const headings = await screen.findAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Ayuda');
  });

  it('renders the four sections as h2 headings in reading order', async () => {
    await renderAyudaPage();

    const headings = await screen.findAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Cómo funciona MoneyDiary',
      'El semáforo',
      'Glosario',
      '¿Dónde hago…?',
    ]);
  });

  it('explains the 3-step flow without inventing steps', async () => {
    await renderAyudaPage();

    const pasos = await screen.findAllByRole('listitem');
    const textos = pasos.map((li) => li.textContent);

    expect(textos.some((t) => t?.includes('Subes tu cartola'))).toBe(true);
    expect(
      textos.some((t) => t?.includes('Necesidades, Gustos o Ahorro')),
    ).toBe(true);
    expect(textos.some((t) => t?.includes('¿estoy bien este mes?'))).toBe(true);
  });

  it('states the worst-of-3 semáforo rule consistently with /semaforo and links there', async () => {
    await renderAyudaPage();

    expect(
      screen.getByText(
        'Tu semáforo global es el peor de los tres grupos: si un grupo está en peligro, todo el mes queda en peligro.',
      ),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Ver tu semáforo del mes' });
    expect(link).toHaveAttribute('href', '/semaforo');
  });

  it('defines each glossary term using the binding vocabulary', async () => {
    await renderAyudaPage();

    expect(screen.getByText('Cartola')).toBeInTheDocument();
    expect(screen.getByText('Ingesta')).toBeInTheDocument();
    expect(screen.getByText('Movimiento')).toBeInTheDocument();
    expect(
      screen.getByText('Buckets (Necesidades, Gustos, Ahorro y Sin categoría)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Patrones de clasificación')).toBeInTheDocument();
    expect(screen.getByText('Modo demo')).toBeInTheDocument();
  });

  it('caps the prose measure at max-w-prose, not the wider max-w-2xl (impeccable craft-floor: 65-75ch)', async () => {
    const { container } = await renderAyudaPage();

    const columna = container.firstElementChild;
    expect(columna).toHaveClass('max-w-prose');
    expect(columna).not.toHaveClass('max-w-2xl');
  });

  it('maps the 4 main tasks to their nav destinations as links', async () => {
    await renderAyudaPage();

    expect(screen.getByRole('link', { name: 'Subir cartola' })).toHaveAttribute(
      'href',
      '/subir',
    );
    expect(
      screen.getByRole('link', { name: 'Registrar movimiento' }),
    ).toHaveAttribute('href', '/registrar');
    expect(
      screen.getByRole('link', { name: 'Gestionar cartolas' }),
    ).toHaveAttribute('href', '/ingestas');
    expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute(
      'href',
      '/configuracion',
    );
  });
});
