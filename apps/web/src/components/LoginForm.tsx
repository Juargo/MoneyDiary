import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { postLogin } from '@/api/auth'

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
 */
export function LoginForm({ redirectTo }: { readonly redirectTo?: string }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [estado, setEstado] = useState<'idle' | 'submitting' | 'error'>('idle')

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (estado === 'submitting') return

    setEstado('submitting')
    const result = await postLogin({ email, password })
    if (!result.ok) {
      setEstado('error')
      return
    }

    void navigate({ to: redirectTo ?? '/' })
  }

  return (
    <form onSubmit={enviar} className="mx-auto flex w-full max-w-sm flex-col gap-4 p-8">
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {estado === 'error' && (
        <p role="alert" className="text-sm text-red-600">
          Credenciales inválidas.
        </p>
      )}
      <button
        type="submit"
        disabled={estado === 'submitting'}
        className="rounded-full bg-slate-800 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Ingresar
      </button>
    </form>
  )
}
