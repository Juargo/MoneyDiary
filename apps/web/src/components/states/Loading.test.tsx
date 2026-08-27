import { render, screen } from '@testing-library/react';
import { Loading } from './Loading';

// DOM port of apps/mobile/src/components/states/Loading.spec.tsx: shown
// while the resumen request is in flight — no bucket data, no error copy.
describe('Loading', () => {
  it('renders a loading indicator and label', () => {
    render(<Loading />);
    expect(screen.getByText('Cargando resumen…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // A11y (ADR-018): the message must live INSIDE the `role="status"` live
  // region so mounting the loading state announces it to assistive
  // technology — a status region with no accessible content is silent.
  it('announces the loading message inside the accessible status region', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando resumen…');
  });

  // The resumen screen is unchanged (default copy preserved), but other
  // screens reusing this shared component (e.g. bucket detail, US-017) need
  // context-appropriate copy — an optional `message` prop overrides it.
  it('renders a custom message when provided, instead of the resumen-specific default', () => {
    render(<Loading message="Cargando movimientos…" />);
    expect(screen.getByText('Cargando movimientos…')).toBeInTheDocument();
    expect(screen.queryByText('Cargando resumen…')).not.toBeInTheDocument();
  });

  // `compact` (peak-end landing, SubirCartola exito state, US-062-ish): the
  // full-page `min-h-[60vh]` centering is correct for a page-level loading
  // state but would visually blow up a small inline slot inside an already
  // laid-out success card (a huge flash-then-collapse jank). `compact`
  // swaps the wrapper for a lean inline row — same accessible contract
  // (role="status" wrapping the message), just no page-centering chrome.
  it('compact renders a lean inline status row instead of the full-page centering wrapper', () => {
    render(<Loading compact message="Cargando tu resumen…" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Cargando tu resumen…');
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    // No page-level centering wrapper class leaking into the compact variant.
    expect(document.querySelector('.min-h-\\[60vh\\]')).not.toBeInTheDocument();
  });

  it('compact defaults to false — existing full-page callers are unaffected', () => {
    render(<Loading />);
    expect(document.querySelector('.min-h-\\[60vh\\]')).toBeInTheDocument();
  });
});
