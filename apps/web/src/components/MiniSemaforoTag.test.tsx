import { createEvent, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderConRouter } from '@/test/router-harness';
import { MiniSemaforoTag } from './MiniSemaforoTag';

// US-048 (design D-02/D-03/D-06/D-07): a compact, icon-only sibling of
// `SemaforoTag` (US-047) for the annual grid's `MesCelda`. Same navigation
// contract (`/semaforo?periodo=`, `null`/unknown → "Sin datos", still a live
// `<a>`, Tab/Enter/Space) but with a MONTH-SCOPED accessible name (D-07) so
// twelve identically-positioned tags stay distinguishable — and so this
// name never collides with `SemaforoTag`'s own `/Semáforo: Verde/` query on
// the composed dashboard (`ResumenScreen.test.tsx`, T14).
// `findByRole` (not `getByRole`): TanStack Router resolves its initial match
// asynchronously, same async-router pattern as `SemaforoTag.test.tsx`.
// Explicitly absent (D-06): any assertion on `h-7`/`w-7` or any size class —
// target size is a rendered-geometry claim, proven only in Playwright (E-01).
describe('MiniSemaforoTag', () => {
  it('M-01: renders an <a> whose accessible name is month-scoped ("Semáforo de {mes}: {estado}")', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="verde" periodo="2026-01" />);
    expect(
      await screen.findByRole('link', {
        name: 'Semáforo de enero 2026: Verde',
      }),
    ).toBeInTheDocument();
  });

  it('M-02: href targets /semaforo and carries ?periodo= matching the prop passed in', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="verde" periodo="2026-01" />);
    const link = await screen.findByRole('link', {
      name: 'Semáforo de enero 2026: Verde',
    });
    expect(link).toHaveAttribute('href', '/semaforo?periodo=2026-01');
  });

  it('M-03: estadoGlobal: null renders "Sin datos" and is still an <a>, never disabled, never omitted', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal={null} periodo="2026-12" />);
    const link = await screen.findByRole('link', { name: /Sin datos/ });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });

  it('M-04: an unknown wire value is not coerced into a known color — falls back to the same "Sin datos" treatment', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="azul" periodo="2026-03" />);
    expect(
      await screen.findByRole('link', { name: /Sin datos/ }),
    ).toBeInTheDocument();
  });

  it('M-05: the glyph is aria-hidden and the accessible name comes from the sr-only text', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="rojo" periodo="2026-05" />);
    const link = await screen.findByRole('link', {
      name: 'Semáforo de mayo 2026: Rojo',
    });
    const glyph = link.querySelector('[aria-hidden="true"]');
    expect(glyph).toBeInTheDocument();
    expect(glyph).toHaveTextContent('☹️');
  });

  it('M-06: is focusable and reachable by Tab (WG5-12)', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="verde" periodo="2026-01" />);
    const link = await screen.findByRole('link', {
      name: 'Semáforo de enero 2026: Verde',
    });
    link.focus();
    expect(link).toHaveFocus();
  });

  it('M-07: activates on Space, preventing the default page-scroll (WG5-12/D-08)', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="verde" periodo="2026-01" />);
    const link = await screen.findByRole('link', {
      name: 'Semáforo de enero 2026: Verde',
    });
    const evento = createEvent.keyDown(link, { key: ' ' });
    const preventDefaultSpy = vi.spyOn(evento, 'preventDefault');

    fireEvent(link, evento);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  it('M-08: activating the tag navigates to /semaforo (mouse)', async () => {
    renderConRouter(<MiniSemaforoTag estadoGlobal="verde" periodo="2026-01" />);
    const link = await screen.findByRole('link', {
      name: 'Semáforo de enero 2026: Verde',
    });
    fireEvent.click(link);
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });
});
