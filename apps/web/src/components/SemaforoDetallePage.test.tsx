import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UseQueryResult } from '@tanstack/react-query';
import { renderConRouter } from '@/test/router-harness';
import { SemaforoDetallePage } from './SemaforoDetallePage';
import type { ApiError } from '@/api/client';
import type { SemaforoBucketDetalleDto, SemaforoDetalleDto } from '@/api/types';

/**
 * SemaforoDetallePage.test.tsx — US-049 T7.3 (design §1.7, WSEM-01..08,
 * CA-01..08). 14 cases per the ledger. `query` is a plain mocked
 * `UseQueryResult` (router-agnostic, same discipline as `ResumenPage.test.tsx`)
 * — only the `<Link>`s (Sin categoría, Volver) need `renderConRouter`.
 */

function bucketDto(
  overrides: Partial<SemaforoBucketDetalleDto> = {},
): SemaforoBucketDetalleDto {
  return {
    bucket: 'Necesidades',
    total: '400000',
    porcentajeBp: 4000,
    estadoSemaforo: 'verde',
    metaBp: 5000,
    bandas: {
      verdeMin: null,
      verdeMax: 5000,
      amarilloMin: null,
      amarilloMax: 6000,
    },
    consejo: null,
    ...overrides,
  };
}

function ahorroBucketDto(
  overrides: Partial<SemaforoBucketDetalleDto> = {},
): SemaforoBucketDetalleDto {
  return {
    bucket: 'Ahorro',
    total: '150000',
    porcentajeBp: 1500,
    estadoSemaforo: 'amarillo',
    metaBp: 2000,
    bandas: {
      verdeMin: 2000,
      verdeMax: 4000,
      amarilloMin: 1000,
      amarilloMax: 5000,
    },
    consejo: null,
    ...overrides,
  };
}

function detalleDto(
  overrides: Partial<SemaforoDetalleDto> = {},
): SemaforoDetalleDto {
  return {
    periodo: '2026-07',
    totalIngreso: '1000000',
    sinIngreso: false,
    estadoGlobal: 'verde',
    diagnostico:
      'Tu veredicto del mes es Muy Saludable: los tres grupos están dentro de su rango.',
    bucketsCriticos: [],
    buckets: [
      bucketDto({ bucket: 'Necesidades' }),
      bucketDto({
        bucket: 'Deseos',
        porcentajeBp: 3000,
        metaBp: 3000,
        bandas: {
          verdeMin: null,
          verdeMax: 3000,
          amarilloMin: null,
          amarilloMax: 4000,
        },
      }),
      ahorroBucketDto({ estadoSemaforo: 'verde', porcentajeBp: 2500 }),
    ],
    sinCategoria: { cantidad: 0, total: '0' },
    ...overrides,
  };
}

function successQuery(
  data: SemaforoDetalleDto,
): UseQueryResult<SemaforoDetalleDto, ApiError> {
  return {
    isPending: false,
    isError: false,
    data,
  } as unknown as UseQueryResult<SemaforoDetalleDto, ApiError>;
}

function pendingQuery(): UseQueryResult<SemaforoDetalleDto, ApiError> {
  return {
    isPending: true,
    isError: false,
    data: undefined,
  } as unknown as UseQueryResult<SemaforoDetalleDto, ApiError>;
}

function errorQuery(
  refetch: () => void,
): UseQueryResult<SemaforoDetalleDto, ApiError> {
  return {
    isPending: false,
    isError: true,
    error: { tag: 'server', message: 'Algo salió mal.' } as ApiError,
    refetch,
  } as unknown as UseQueryResult<SemaforoDetalleDto, ApiError>;
}

function renderPage(
  query: UseQueryResult<SemaforoDetalleDto, ApiError>,
  periodo = '2026-07',
) {
  return renderConRouter(
    <SemaforoDetallePage query={query} periodo={periodo} />,
  );
}

describe('SemaforoDetallePage', () => {
  it('loading → Loading', async () => {
    renderPage(pendingQuery());
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('error → ErrorState with retry', async () => {
    const refetch = vi.fn();
    renderPage(errorQuery(refetch));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reintentar' }),
    ).toBeInTheDocument();
  });

  it('header shows the month, the badge, and the diagnosis literal verbatim (CA-01/CA-02)', async () => {
    renderPage(successQuery(detalleDto()));
    expect(
      await screen.findByRole('heading', { name: 'Semáforo' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/julio 2026/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Tu veredicto del mes es Muy Saludable: los tres grupos están dentro de su rango.',
      ),
    ).toBeInTheDocument();
  });

  // issue #752 — "volver" hard-coded to "/" is the same bug class as
  // BucketDetalleMesPage/IngresosMesPage: `/semaforo` is ALSO reachable from
  // `/ayuda` (AyudaPage links here), not only from the dashboard.
  it('on a direct URL/deep link (no in-app history), renders the fixed "Volver al resumen" fallback link', async () => {
    renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });

    const back = screen.getByRole('link', { name: 'Volver al resumen' });
    expect(back).toHaveAttribute('href', '/?periodo=2026-07');
  });

  it('con historial de navegación in-app, "Volver" es un botón real que llama a router.history.back() (issue #752)', async () => {
    const { router } = renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });

    act(() => {
      router.history.push('/');
    });

    const boton = await screen.findByRole('button', { name: 'Volver' });
    expect(
      screen.queryByRole('link', { name: 'Volver al resumen' }),
    ).not.toBeInTheDocument();

    const backSpy = vi.spyOn(router.history, 'back');
    fireEvent.click(boton);
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('the worst-of-3 explainer is present (CA-03)', async () => {
    renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(screen.getByText(/peor de los tres grupos/i)).toBeInTheDocument();
  });

  it('P2-B: a contextual help link next to the worst-of-3 explainer points at /ayuda#ayuda-semaforo', async () => {
    renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });

    const link = screen.getByRole('link', {
      name: /ayuda: cómo se calcula el semáforo/i,
    });
    expect(link).toHaveAttribute('href', '/ayuda#ayuda-semaforo');
  });

  it('renders three bucket cards with percentage vs meta and estado (CA-04)', async () => {
    renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(screen.getByText('Necesidades')).toBeInTheDocument();
    expect(screen.getByText('Gustos')).toBeInTheDocument();
    expect(screen.getAllByText('Ahorro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Meta: 50%').length).toBeGreaterThan(0);
  });

  it('an Amarillo/Rojo bucket shows the advice row with the formatted amount (CA-05)', async () => {
    const dto = detalleDto({
      estadoGlobal: 'rojo',
      diagnostico: 'Tu veredicto del mes es En peligro por Necesidades.',
      bucketsCriticos: ['Necesidades'],
      buckets: [
        bucketDto({
          bucket: 'Necesidades',
          estadoSemaforo: 'rojo',
          porcentajeBp: 6500,
          consejo: {
            direccion: 'reducir',
            monto: '199951',
            mensaje:
              'Para volver a Muy Saludable, reduce {monto} en Necesidades este mes.',
          },
        }),
        bucketDto({ bucket: 'Deseos', metaBp: 3000 }),
        ahorroBucketDto({ estadoSemaforo: 'verde', porcentajeBp: 2500 }),
      ],
    });
    renderPage(successQuery(dto));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(
      screen.getByText(
        'Para volver a Muy Saludable, reduce $199.951 en Necesidades este mes.',
      ),
    ).toBeInTheDocument();
  });

  it('a Verde bucket shows no advice row', async () => {
    renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(
      screen.queryByText(/Para volver a Muy Saludable/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/ahorrando por sobre la banda/),
    ).not.toBeInTheDocument();
  });

  it('an Ahorro below the band shows the imperative "aumenta" framing', async () => {
    const dto = detalleDto({
      buckets: [
        bucketDto({ bucket: 'Necesidades' }),
        bucketDto({ bucket: 'Deseos', metaBp: 3000 }),
        ahorroBucketDto({
          estadoSemaforo: 'amarillo',
          porcentajeBp: 1500,
          consejo: {
            direccion: 'aumentar',
            monto: '50000',
            mensaje:
              'Para volver a Muy Saludable, aumenta {monto} en Ahorro este mes.',
          },
        }),
      ],
    });
    renderPage(successQuery(dto));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(
      screen.getByText(
        'Para volver a Muy Saludable, aumenta $50.000 en Ahorro este mes.',
      ),
    ).toBeInTheDocument();
  });

  it('an Ahorro above the band shows the informational framing', async () => {
    const dto = detalleDto({
      buckets: [
        bucketDto({ bucket: 'Necesidades' }),
        bucketDto({ bucket: 'Deseos', metaBp: 3000 }),
        ahorroBucketDto({
          estadoSemaforo: 'amarillo',
          porcentajeBp: 4500,
          consejo: {
            direccion: 'reducir',
            monto: '25000',
            mensaje:
              'Estás ahorrando por sobre la banda: puedes liberar hasta {monto} y quedar en Muy Saludable.',
          },
        }),
      ],
    });
    renderPage(successQuery(dto));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(
      screen.getByText(
        'Estás ahorrando por sobre la banda: puedes liberar hasta $25.000 y quedar en Muy Saludable.',
      ),
    ).toBeInTheDocument();
  });

  // Issue #778 tramo5b PR1 (replaces the retired CA-06 test, which asserted
  // this banner/link WAS shown): the API still sends a nonzero
  // `sinCategoria` count/total (unchanged in this PR), but the web must
  // never render the banner or the drill-down link to `/buckets/SinCategoria`
  // for it.
  it('never renders a Sin categoría banner or link, even when the DTO carries a nonzero sinCategoria count (issue #778 tramo5b PR1)', async () => {
    const dto = detalleDto({ sinCategoria: { cantidad: 3, total: '15000' } });
    renderPage(successQuery(dto), '2026-07');
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(
      screen.queryByText(/sin grupo ni categoría/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sin grupo ni categoría/i }),
    ).not.toBeInTheDocument();
  });

  it('sinIngreso renders the no-income explanation, no empty bucket percentages (CA-07)', async () => {
    const dto = detalleDto({
      sinIngreso: true,
      totalIngreso: '0',
      estadoGlobal: null,
      diagnostico:
        'Este mes no registramos ingresos, así que no podemos calcular tus porcentajes.',
      buckets: [],
    });
    renderPage(successQuery(dto));
    expect(
      await screen.findByText(
        'Este mes no registramos ingresos, así que no podemos calcular tus porcentajes.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Necesidades')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    // P1 design-critique fix: sinIngreso's empty state now carries the same
    // "Subir cartola" CTA as `SemaforoHeroCard`'s own sinDatos state — no
    // more prose-only dead end.
    expect(screen.getByRole('link', { name: 'Subir cartola' })).toHaveAttribute(
      'href',
      '/subir',
    );
  });

  it('the header badge is the static SemaforoBadge (role=img, not a link), D-06', async () => {
    renderPage(successQuery(detalleDto()));
    const badge = await screen.findByRole('img', { name: 'Muy Saludable' });
    expect(badge.tagName).not.toBe('A');
    expect(
      screen.queryByRole('link', { name: /Muy Saludable/ }),
    ).not.toBeInTheDocument();
  });

  it('no hardcoded threshold literal — band edges rendered come from the fixture (R2)', async () => {
    const dto = detalleDto({
      buckets: [
        bucketDto({
          bucket: 'Necesidades',
          porcentajeBp: 5600,
          estadoSemaforo: 'amarillo',
          bandas: {
            verdeMin: null,
            verdeMax: 5500,
            amarilloMin: null,
            amarilloMax: 6500,
          },
        }),
        bucketDto({ bucket: 'Deseos', metaBp: 3000 }),
        ahorroBucketDto({ estadoSemaforo: 'verde', porcentajeBp: 2500 }),
      ],
    });
    renderPage(successQuery(dto));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(screen.getByText('0–55%')).toBeInTheDocument();
    expect(screen.getByText('55–65%')).toBeInTheDocument();
    expect(screen.getByText('65–100%')).toBeInTheDocument();
  });

  it('a zero-count Sin categoría (WSEM-05) also shows no warning block, no link', async () => {
    renderPage(successQuery(detalleDto()));
    await screen.findByRole('heading', { name: 'Semáforo' });
    expect(
      screen.queryByText(/sin grupo ni categoría/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /sin grupo ni categoría/i }),
    ).not.toBeInTheDocument();
  });

  it('renders exactly one h1', async () => {
    renderPage(successQuery(detalleDto()));
    expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
