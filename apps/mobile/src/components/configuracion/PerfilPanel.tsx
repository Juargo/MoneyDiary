import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MeDto } from '../../domain/resumen.types';
import {
  guardarPerfil,
  type DraftPerfil,
  type PerfilPatch,
  type PasswordPatch,
} from '../../domain/guardar-perfil';
import { mensajeDeResultado, type Mensaje } from '../../domain/mensajes-perfil';
import type { ApiResult } from '../../domain/api-error';
import {
  patchPerfil as defaultPatchPerfil,
  patchPassword as defaultPatchPassword,
} from '../../api/perfil';
import { CampoTexto } from './CampoTexto';

type IoFunctions = {
  readonly patchPerfil: (patch: PerfilPatch) => Promise<ApiResult<void>>;
  readonly patchPassword: (patch: PasswordPatch) => Promise<ApiResult<void>>;
};

/**
 * PerfilPanel — Perfil tab body (US-044 PR4b, design.md §1.8/§1.9).
 *
 * Pure presentation: receives the already-resolved `me` prop from
 * `app/configuracion.tsx` (route owns fetch). The panel never calls
 * `fetchMe`/`esMeDto` directly (design §0 dependency rule).
 *
 * Google block is read-only: a pill showing Vinculada / No vinculada.
 * No Vincular/Desvincular controls (binding decision 1, design §1.9).
 *
 * Two message regions (design §0 composition tree):
 *  - ok: accessibilityLiveRegion="polite"
 *  - error: accessibilityRole="alert"
 *
 * Server `message` strings are never rendered. Only copy from
 * mensajes-perfil.ts (design §1.7).
 *
 * `io` is injected for testability (mirrors guardar-perfil.ts's DIP pattern).
 * Production callers omit it and the defaults from api/perfil are used.
 */
export function PerfilPanel({
  me,
  io = { patchPerfil: defaultPatchPerfil, patchPassword: defaultPatchPassword },
}: {
  readonly me: MeDto;
  readonly io?: IoFunctions;
}) {
  const [nombre, setNombre] = useState(me.nombre);
  const [email, setEmail] = useState(me.email ?? '');
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const draft: DraftPerfil = { nombre, email, passwordActual, passwordNueva };
    setEnviando(true);
    const resultado = await guardarPerfil(draft, me, io);
    setEnviando(false);
    setMensaje(mensajeDeResultado(resultado));

    if (resultado.tipo === 'ok') {
      setPasswordActual('');
      setPasswordNueva('');
    }
  }

  // Google status pill text per design §1.9 / GoogleVinculoSection.tsx:112-116
  const pillTexto = me.googleVinculado
    ? me.email !== null
      ? `Vinculada: ${me.email}`
      : 'Vinculada'
    : 'No vinculada';

  return (
    <View className="gap-4">
      <CampoTexto
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        autoCapitalize="words"
        editable={!enviando}
      />
      <CampoTexto
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!enviando}
      />
      <CampoTexto
        label="Password actual"
        value={passwordActual}
        onChangeText={setPasswordActual}
        secureTextEntry
        editable={!enviando}
      />
      <CampoTexto
        label="Password nueva"
        value={passwordNueva}
        onChangeText={setPasswordNueva}
        secureTextEntry
        editable={!enviando}
      />

      {/* Google status — read-only pill (binding decision 1, design §1.9) */}
      <View className="gap-1">
        <Text className="text-sm font-semibold text-heading">
          Cuenta de Google
        </Text>
        <Text className="text-sm text-muted">{pillTexto}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Guardar cambios"
        onPress={() => {
          void enviar();
        }}
        disabled={enviando}
        className="self-start rounded-full bg-ingreso px-6 py-2.5"
      >
        <Text className="text-sm font-semibold text-white">
          Guardar cambios
        </Text>
      </Pressable>

      {/* ok message region — accessibilityLiveRegion="polite" (design §0) */}
      <View testID="perfil-ok-region" accessibilityLiveRegion="polite">
        {mensaje?.tono === 'ok' &&
          mensaje.lineas.map((linea, i) => (
            <Text key={i} className="text-sm text-emerald-700">
              {linea}
            </Text>
          ))}
      </View>

      {/* error message region — role="alert" (design §0).
          `accessible={true}` is required for View to be found by getByRole('alert')
          in React Native (View is not accessible by default). */}
      <View
        testID="perfil-error-region"
        accessibilityRole="alert"
        accessible={true}
      >
        {mensaje?.tono === 'error' &&
          mensaje.lineas.map((linea, i) => (
            <Text key={i} className="text-sm text-red-600">
              {linea}
            </Text>
          ))}
      </View>
    </View>
  );
}
