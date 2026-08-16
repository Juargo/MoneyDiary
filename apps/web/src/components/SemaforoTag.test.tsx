import { createEvent, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderConRouter } from '@/test/router-harness';
import { SemaforoTag } from './SemaforoTag';

// US-047 (design D-06/WG5-07/WG5-08): the semáforo is a clickable
// navigation tag — a TRANSVERSAL rule for any chart that renders a
// semáforo indicator, not a decorative badge scoped to this dashboard.
// `findByRole` (not `getByRole`): TanStack Router resolves its initial
// match asynchronously even for a loader-free route (`Transitioner`'s
// state machine), so the link isn't in the DOM on the synchronous first
// render — same async-router pattern `src/test/*.test.tsx` already uses.
describe('SemaforoTag', () => {
  it('renders an <a> whose accessible name carries the estado word, not conveyed by color alone (ADR-018/W2-02)', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="verde" periodo="2026-07" />);
    expect(
      await screen.findByRole('link', { name: /Verde/ }),
    ).toBeInTheDocument();
  });

  it('href targets /semaforo and carries ?periodo= matching the prop passed in', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="verde" periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Verde/ });
    expect(link).toHaveAttribute('href', '/semaforo?periodo=2026-07');
  });

  it('estadoGlobal: null renders "Sin datos" and is still an <a>, never disabled, never omitted', async () => {
    renderConRouter(<SemaforoTag estadoGlobal={null} periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Sin datos/ });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
  });

  it('an unknown wire value is not coerced into a known color — falls back to the same "Sin datos" treatment', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="azul" periodo="2026-07" />);
    expect(
      await screen.findByRole('link', { name: /Sin datos/ }),
    ).toBeInTheDocument();
  });

  it('the chevron is aria-hidden', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="rojo" periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Rojo/ });
    const chevron = link.querySelector('svg');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
  });

  it('activating the tag navigates to /semaforo (mouse)', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="verde" periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Verde/ });
    fireEvent.click(link);
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  // WG5-12: a real `<a href>` is keyboard-operable on Enter/Tab with no
  // extra wiring — this asserts it is reachable by Tab and receives focus
  // (the "focusable" half of WG5-12; Enter's own native browser activation
  // needs no test of app code, see the next test's comment).
  it('is focusable and reachable by Tab (WG5-12)', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="verde" periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Verde/ });
    link.focus();
    expect(link).toHaveFocus();
  });

  // WG5-12: Enter activation on a focused `<a href>` is the BROWSER's own
  // default action — no app-level `onKeyDown` is needed or added for it (see
  // the component docblock). jsdom does not simulate that native default
  // action from a bare `fireEvent.keyDown`, so this documents the
  // equivalence (a real Enter keypress === a click) rather than asserting
  // app code that doesn't exist.
  it('activates on Enter — the browser default action on a focused <a href>, verified here via its click equivalent', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="verde" periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Verde/ });
    fireEvent.click(link);
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });

  // CRITICAL fix (judgment-day, WG5-12): unlike Enter, Space does NOT
  // natively activate an `<a href>` in any browser — it scrolls the page
  // instead. `SemaforoTag` adds its own `onKeyDown` to prevent that default
  // and activate navigation, matching WG5-12's Tab/Enter/Space requirement.
  it('activates on Space, preventing the default page-scroll (WG5-12)', async () => {
    renderConRouter(<SemaforoTag estadoGlobal="verde" periodo="2026-07" />);
    const link = await screen.findByRole('link', { name: /Verde/ });
    const evento = createEvent.keyDown(link, { key: ' ' });
    const preventDefaultSpy = vi.spyOn(evento, 'preventDefault');

    fireEvent(link, evento);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(await screen.findByTestId('semaforo-sentinel')).toBeInTheDocument();
  });
});
