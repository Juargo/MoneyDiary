import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ErrorState } from './Error';
import type { ApiError } from '@/api/client';

// DOM port of apps/mobile/src/components/states/Error.spec.tsx. Unlike
// mobile's ApiError, the web client (apps/web/src/api/client.ts) already
// carries a human-readable Spanish `message` per tag — the component renders
// it verbatim instead of duplicating a copy-per-tag switch (DRY). Always
// renders a retry affordance so the user isn't stuck on a dead screen.
describe('ErrorState', () => {
  it('renders the typed error message', () => {
    const error: ApiError = {
      tag: 'network',
      message: 'Problema de conexión.',
    };
    render(<ErrorState error={error} onRetry={() => {}} />);
    expect(screen.getByText('Problema de conexión.')).toBeInTheDocument();
  });

  it('renders the server error message including the status-derived copy', () => {
    const error: ApiError = {
      tag: 'server',
      status: 500,
      message: 'Ocurrió un error inesperado.',
    };
    render(<ErrorState error={error} onRetry={() => {}} />);
    expect(
      screen.getByText('Ocurrió un error inesperado.'),
    ).toBeInTheDocument();
  });

  // US-043: a feature that owns a richer error table than `client.ts`'s
  // per-tag default (the catalog's `mensajeDeErrorCatalogo`) passes its own
  // rendered copy instead of forking the component. `error` stays required —
  // the retry affordance and the a11y contract are unchanged — and every
  // other caller (ResumenPage, BucketDetalleMesPage, ListaIngestas, ResumenAnual)
  // keeps the `error.message` default by omitting the prop.
  it('renders the caller-supplied message instead of error.message when given', () => {
    const error: ApiError = {
      tag: 'parse',
      message: 'Respuesta inesperada del servidor.',
    };
    render(
      <ErrorState
        error={error}
        mensaje="No se pudo procesar la solicitud."
        onRetry={() => {}}
      />,
    );
    expect(
      screen.getByText('No se pudo procesar la solicitud.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Respuesta inesperada del servidor.'),
    ).not.toBeInTheDocument();
  });

  // A11y (ADR-018): the message must live inside a `role="alert"` region so
  // a Data→Error refetch failure announces to assistive technology instead
  // of failing silently.
  it('announces the error message via an assertive alert region', () => {
    const error: ApiError = {
      tag: 'network',
      message: 'Problema de conexión.',
    };
    render(<ErrorState error={error} onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Problema de conexión.',
    );
  });

  it('calls onRetry when the retry affordance is activated', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const error: ApiError = {
      tag: 'network',
      message: 'Problema de conexión.',
    };
    render(<ErrorState error={error} onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // Design-system hardening round 2 (P1): the hand-rolled retry pill
  // (`rounded-full bg-slate-800`) is retired in favor of the shared
  // <Button> — every write surface in the app renders confirm/retry actions
  // through this one primitive (round 1 already did this for the rest of
  // the app). Asserted via `data-slot`/`data-variant` (Button's own
  // contract), not class strings.
  it('renders the retry affordance through the shared Button primitive (default variant)', () => {
    const error: ApiError = {
      tag: 'network',
      message: 'Problema de conexión.',
    };
    render(<ErrorState error={error} onRetry={() => {}} />);

    const retry = screen.getByRole('button', { name: 'Reintentar' });
    expect(retry).toHaveAttribute('data-slot', 'button');
    expect(retry).toHaveAttribute('data-variant', 'default');
  });

  // Error copy is semantically an error — it must carry the destructive
  // token, not a neutral slate gray (P1 audit finding).
  it('renders the error message with the destructive text token', () => {
    const error: ApiError = {
      tag: 'network',
      message: 'Problema de conexión.',
    };
    render(<ErrorState error={error} onRetry={() => {}} />);

    expect(screen.getByRole('alert').className).toContain('text-destructive');
  });
});
