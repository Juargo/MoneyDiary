import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useGuardarPerfil } from '@/api/use-guardar-perfil';
import type { MeDto } from '@/api/types';
import { CampoTexto } from '../CampoTexto';
import { MENSAJE_DEMO_SOLO_LECTURA, mensajeDeResultado } from './mensajes';
import type { Mensaje } from './mensajes';
import { Button } from '@/components/ui/button';

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
 *
 * `me.esDemo` deshabilita el form PROACTIVAMENTE (design.md §Q9c): los
 * cuatro `CampoTexto`, el botón, y un `role="note"` con
 * `MENSAJE_DEMO_SOLO_LECTURA` — la misma constante que la fila reactiva
 * `403:DEMO_SOLO_LECTURA` de `mensajes.ts` usa si igual llegara a
 * dispararse un submit (`dry`, una sola copia de la advertencia).
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
          // CUALQUIER `ok` limpia los dos campos de password; un resultado
          // que no sea `ok` NO limpia ninguno (rows 8/10/11 de Q2c: el retry
          // tras una falla parcial necesita la password todavía tipeada).
          //
          // El caso `ok` sin `passwordCambiada` es una decisión de producto
          // del mantenedor (2026-08-13) que Q2c no resolvía: `Password
          // actual` autoriza el cambio de email (Q1c), y una vez que el
          // guardado salió bien su función está cumplida — dejarla en el
          // estado y en el DOM es retención sin propósito. `passwordNueva`
          // ya está vacía en esa rama (con las dos cargadas el resultado
          // sería `ok`+`passwordCambiada` o `password-fallo`), así que
          // limpiar ambas es equivalente y más simple que ramificar.
          //
          // `nombre`/`email` NUNCA se resetean por código: ya son iguales al
          // `me` refrescado (Q2a).
          if (r.tipo === 'ok') {
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
          disabled={me.esDemo}
        />
        <CampoTexto
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          disabled={me.esDemo}
        />
      </div>
      {/*
        `mb-4` en el `legend`, no en el `fieldset`: un `<legend>` NO es un flex
        item. El browser lo saca del flujo y lo posiciona sobre el borde del
        fieldset, así que el `gap-4` de acá arriba separa los `CampoTexto`
        entre sí pero NUNCA alcanza al legend — el rótulo quedaba pegado a
        `Password actual` y los dos se leían como un bloque de dos líneas en
        vez de un título con su sección. El `mb-4` reproduce a mano el mismo
        ritmo que el `gap` da al resto.

        Encontrado mirando la página desplegada, no por un test: jsdom no hace
        layout, así que ninguna aserción de este repo puede ver un problema de
        espaciado. Si tocás este bloque, verificalo en un browser.
      */}
      <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
        <legend className="mb-4 p-0 text-sm font-semibold text-foreground">
          Cambiar password
        </legend>
        <CampoTexto
          label="Password actual"
          value={passwordActual}
          onChange={setPasswordActual}
          type="password"
          required={emailSucio}
          autoComplete="current-password"
          disabled={me.esDemo}
        />
        <CampoTexto
          label="Password nueva"
          value={passwordNueva}
          onChange={setPasswordNueva}
          type="password"
          autoComplete="new-password"
          disabled={me.esDemo}
        />
      </fieldset>
      {me.esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_SOLO_LECTURA}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending || me.esDemo}>
          {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
      <div aria-live="polite" className="text-sm text-exito-foreground">
        {mensaje?.tono === 'ok' &&
          mensaje.lineas.map((linea, indice) => <p key={indice}>{linea}</p>)}
      </div>
      <div role="alert" className="text-sm text-destructive">
        {mensaje?.tono === 'error' &&
          mensaje.lineas.map((linea, indice) => <p key={indice}>{linea}</p>)}
      </div>
    </form>
  );
}
