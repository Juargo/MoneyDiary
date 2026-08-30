import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { postLogin } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { CampoTexto } from '@/components/configuracion/CampoTexto';

/**
 * LoginForm — owns the email+password form state, the `postLogin` call, and
 * the on-success navigation (design.md §6.1). `routes/login.tsx` stays a
 * thin container (extracts the optional `redirect` search param via
 * `Route.useSearch()` and passes it down), mirroring the
 * `routes/index.tsx` + `ResumenPage` split elsewhere in this app.
 *
 * On failure shows a single generic message — never distinguishes "wrong
 * password" from "unknown email" (mirrors the backend's no-enumeration
 * discipline, AUTH-02).
 *
 * Width/padding/surface (max-w-sm, card padding) are NOT this component's
 * concern — `routes/login.tsx` wraps it in the Serene Finance card shell, so
 * this form only fills whatever container it is given (impeccable critique
 * round 7, P1).
 */
export function LoginForm({ redirectTo }: { readonly redirectTo?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [estado, setEstado] = useState<'idle' | 'submitting' | 'error'>('idle');

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (estado === 'submitting') return;

    setEstado('submitting');
    const result = await postLogin({ email, password });
    if (!result.ok) {
      setEstado('error');
      return;
    }

    // Identity switch: any cache entry (e.g. `['resumen', periodo]`) may
    // belong to the previous session's user — demo or otherwise. Clear
    // before navigating so the dashboard never serves stale/foreign data.
    queryClient.clear();
    void navigate({ to: redirectTo ?? '/' });
  }

  return (
    <form onSubmit={enviar} className="flex w-full flex-col gap-4">
      <CampoTexto
        label="Email"
        value={email}
        onChange={setEmail}
        type="email"
        required
      />
      <CampoTexto
        label="Contraseña"
        value={password}
        onChange={setPassword}
        type="password"
        required
      />
      {estado === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          Credenciales inválidas.
        </p>
      )}
      <Button type="submit" disabled={estado === 'submitting'}>
        {estado === 'submitting' ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  );
}
