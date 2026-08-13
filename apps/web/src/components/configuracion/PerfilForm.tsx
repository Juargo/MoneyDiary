import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useGuardarPerfil } from '@/api/use-guardar-perfil';
import type { MeDto } from '@/api/types';
import { CampoTexto } from './CampoTexto';
import { mensajeDeResultado } from './mensajes';
import type { Mensaje } from './mensajes';

/**
 * PerfilForm — el formulario de CA-02 (US-042 design.md §1/Q1a/Q1b): cuatro
 * campos vía `CampoTexto`, un `Guardar cambios`, y sus DOS regiones de
 * mensaje propias (Q7d). Posee el borrador (`nombre`/`email`/
 * `passwordActual`/`passwordNueva`) como `useState` local — NUNCA sale de
 * este componente (Q1b: "un borrador no es estado de servidor").
 *
 * `Password actual` gana `required` nativo SOLO cuando `Email` está sucio
 * (Q1c) — la afordancia; el guard real vive dentro de
 * `useGuardarPerfil`/`guardar` (Q2b), porque `fireEvent.submit` en jsdom
 * salta la validación de constraint nativa.
 *
 * Un `tag: 'unauthorized'` en cualquiera de las dos llamadas navega a
 * `/login` SIN mostrar mensaje (WCFG-09) — se intercepta ANTES de llamar a
 * `mensajeDeResultado`, así ninguna región llega a mostrar la cadena vacía
 * que `mensajeDeApiError` devuelve para ese tag.
 */
export function PerfilForm({ me }: { readonly me: MeDto }) {
  const navigate = useNavigate();
  const mutation = useGuardarPerfil();
  const [nombre, setNombre] = useState(me.nombre);
  const [email, setEmail] = useState(me.email ?? '');
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  const emailSucio = email.trim() !== (me.email ?? '');

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(
      { nombre, email, passwordActual, passwordNueva },
      {
        onSuccess: (r) => {
          if (
            (r.tipo === 'perfil-fallo' || r.tipo === 'password-fallo') &&
            r.error.tag === 'unauthorized'
          ) {
            void navigate({ to: '/login' });
            return;
          }
          setMensaje(mensajeDeResultado(r));
          // Solo un `ok` con `passwordCambiada` limpia los campos de
          // password (row 7/9 de Q2c) — `nombre`/`email` NUNCA se resetean
          // por código: ya son iguales al `me` refrescado (Q2a).
          if (r.tipo === 'ok' && r.passwordCambiada) {
            setPasswordActual('');
            setPasswordNueva('');
          }
        },
      },
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <CampoTexto
          label="Nombre"
          value={nombre}
          onChange={setNombre}
          autoComplete="name"
        />
        <CampoTexto
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
        />
      </div>
      <div className="flex flex-col gap-4">
        <CampoTexto
          label="Password actual"
          value={passwordActual}
          onChange={setPasswordActual}
          type="password"
          required={emailSucio}
          autoComplete="current-password"
        />
        <CampoTexto
          label="Password nueva"
          value={passwordNueva}
          onChange={setPasswordNueva}
          type="password"
          autoComplete="new-password"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-full bg-slate-800 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar cambios
        </button>
      </div>
      <p aria-live="polite" className="text-sm text-emerald-700">
        {mensaje?.tono === 'ok' &&
          mensaje.lineas.map((linea) => <span key={linea}>{linea}</span>)}
      </p>
      <p role="alert" className="text-sm text-red-600">
        {mensaje?.tono === 'error' &&
          mensaje.lineas.map((linea) => <span key={linea}>{linea}</span>)}
      </p>
    </form>
  );
}
