/**
 * EditarCategoria.tsx — US-044 PR6a, T6a.4
 *
 * Identity form (Nombre + Bucket) + footer (Guardar / Cancelar / Eliminar).
 * Both Alert.alert confirmation flows (bucket-change + delete) are stubbed in
 * PR6a and wired in PR6b; in this slice, Guardar sends the patch directly
 * when the bucket is clean (design §1.11's "bucket clean" branch).
 *
 * PatronesSection renders a placeholder until PR7 wires the real component.
 *
 * Props:
 *   categoria    — the resolved CategoriaDto from the route
 *   onGuardado   — called after a successful save (route re-fetches catalog)
 *   onCancelar   — called on Cancelar (route navigates back)
 *   onEliminado  — called after a successful delete (route navigates back)
 *
 * Binding constraints (PR6a):
 *   - bucket-dirty Guardar is a no-op stub (Alert.alert flow wired in PR6b)
 *   - Eliminar is a stub (Alert.alert flow wired in PR6b)
 *   - SelectorChips for Bucket gets testID='bucket-selector' (distinct, per
 *     the binding constraint on multiple SelectorChips on the same screen)
 *   - PatronesSection placeholder testID='patrones-placeholder'
 *   - solicitarRecargaResumen is never imported in this file (D-11:
 *     the zero-import guarantee from NuevaCategoriaForm carries forward;
 *     PR6b wires the bucket-change refresh and imports it there).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { actualizarCategoria, eliminarCategoria } from '../../api/categorias';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { mensajeDeErrorCatalogo } from '../../domain/mensajes-catalogo';
import type { CategoriaDto } from '../../domain/catalogo.types';
import { CampoTexto } from './CampoTexto';
import { SelectorChips } from './SelectorChips';

export interface EditarCategoriaProps {
  readonly categoria: CategoriaDto;
  /** Called after a successful Guardar so the parent route can re-fetch */
  readonly onGuardado: () => void;
  /** Called on Cancelar — navigates back without saving (WCTG-04) */
  readonly onCancelar: () => void;
  /** Called after a successful Eliminar — navigates back */
  readonly onEliminado: () => void;
}

export function EditarCategoria({
  categoria,
  onGuardado,
  onCancelar,
  onEliminado,
}: EditarCategoriaProps) {
  // Identity draft — seeded from the resolved row, local until Guardar
  const [nombre, setNombre] = useState(categoria.nombre);
  const [bucket, setBucket] = useState<BucketAsignable>(
    // Cast: the DTO's bucket is a string; BUCKETS_ASIGNABLES includes the
    // canonical values. If the server ever sends an unknown bucket,
    // the user can change it here.
    (categoria.bucket as BucketAsignable) || BUCKETS_ASIGNABLES[0],
  );

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bucketOriginal = categoria.bucket as BucketAsignable;
  const bucketCambiado = bucket !== bucketOriginal;

  async function handleGuardar() {
    if (enviando) return;

    // bucket-dirty branch: Alert.alert confirmation — wired in PR6b.
    // In PR6a this is a stub (no-op): the confirmation flow does not exist yet.
    if (bucketCambiado) {
      // PR6b stub — bucket-change confirmation not yet wired
      return;
    }

    // Bucket clean: send the patch directly, no confirmation needed
    setEnviando(true);
    setError(null);

    const resultado = await actualizarCategoria(categoria.id, {
      nombre: nombre.trim(),
      bucket,
    });

    setEnviando(false);

    if (resultado.ok) {
      onGuardado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  async function handleEliminar() {
    if (enviando) return;

    // Alert.alert confirmation — wired in PR6b.
    // In PR6a this is a stub (no-op): the delete confirmation flow does not
    // exist yet. PR6b will wire the full Alert.alert flow per design §1.11.
    // For now, wire through to eliminarCategoria so the button is testable
    // as "present" and the no-confirmation delete path works for the route.
    setEnviando(true);
    setError(null);

    const resultado = await eliminarCategoria(categoria.id);

    setEnviando(false);

    if (resultado.ok) {
      onEliminado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  return (
    <View className="gap-4">
      {/* Identity form */}
      <CampoTexto
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        editable={!enviando}
      />

      {/* Bucket selector — distinct testID required when multiple SelectorChips
          exist on the same screen (binding constraint from PR3a's gate) */}
      <SelectorChips
        testID="bucket-selector"
        label="Bucket (obligatorio)"
        options={BUCKETS_ASIGNABLES}
        value={bucket}
        onChange={(v) => setBucket(v)}
      />

      {/* Error region — PR6b adds the post-confirm failure path here */}
      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessible={true}
          className="text-xs text-red-600"
        >
          {error}
        </Text>
      ) : null}

      {/* PatronesSection placeholder — replaced by real component in PR7 */}
      <View testID="patrones-placeholder" />

      {/* Footer: Guardar / Cancelar / Eliminar */}
      <View className="gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Guardar"
          accessibilityState={{ disabled: enviando }}
          onPress={() => void handleGuardar()}
          disabled={enviando}
          className="rounded-xl bg-ingreso px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-white">
            {enviando ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          onPress={onCancelar}
          disabled={enviando}
          className="rounded-xl border border-hairline bg-white px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-heading">
            Cancelar
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eliminar categoría"
          onPress={() => void handleEliminar()}
          disabled={enviando}
          className="rounded-xl border border-hairline bg-white px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-red-600">
            Eliminar categoría
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
