# Gate Maestro — Subir cartola mobile (US-033)

Runbook para correr el gate E2E **en dispositivo real** que valida el boundary
multipart de la subida de cartola desde mobile. jest-expo NO puede validarlo
(riesgo HIGH marcado en el design); por eso es un gate manual, device-gated, no
CI (ADR-017). Este gate es el **único bloqueante** para mergear los PRs #76
(transporte) y #77 (pantalla) de la cadena `upload-cartola-ui`.

**Actualizado (cartola-preview-confirmacion, Phase 8):** el flujo ganó un paso
de decisión ("Subir tal cual" / "Revisar y editar" / "Descartar") y, dentro de
la revisión, una hoja de clasificación por fila (bucket → categoría) que
acumula un overlay de ediciones antes de confirmar la subida (MOB-PRV-03/06/
07/08). `subir.yaml` cubre "Subir tal cual"; `subir-cancelar.yaml` cubre
"Descartar"/"Cancelar"; `subir-editar.yaml` (nuevo) cubre "Revisar y
editar" → abrir la hoja → clasificar una fila → "Subir" con el overlay.

## Por qué requiere un build NATIVO nuevo (no Expo Go, no OTA)

La pantalla usa `expo-document-picker` (`~57.0.1`), un **módulo nativo** que se
agregó después del último build. No está en `plugins` de `app.json` pero
autolinkea en el prebuild. Consecuencia:

- **Expo Go NO sirve** — no trae el módulo nativo.
- **OTA/update NO sirve** — es código nativo, necesita recompilar.
- Hay que generar un **dev build** (o build de EAS) que incluya el módulo.

## Prerrequisitos

1. **API alcanzable** con auth activo: `https://moneydiary-api.onrender.com`
   (o tu backend local). El login mobile pega contra `EXPO_PUBLIC_API_BASE_URL`.
2. **Usuario de prueba real** que YA tenga transacciones/ingresos en el período
   (el resumen del resultado depende del contenido subido, pero el login y la
   pantalla de destino asumen una cuenta usable). Anotá email + contraseña.
3. **Archivo fixture** `.xlsx` o `.pdf` válido **precargado en el dispositivo**,
   accesible desde el picker del SO (Files/Descargas en el simulador iOS o
   Downloads en Android). Podés usar cualquiera de:
   `apps/api/test/fixtures/*.xlsx` o `apps/api/test/fixtures/pdf/*.pdf`.
   Anotá el **nombre exacto** del archivo tal como aparece en el picker.
   Para `subir-editar.yaml`, además, el fixture debe tener al menos una fila
   NO duplicada y NO clasificada como Ingreso (para que exista una fila
   tocable), y el usuario de prueba debe tener al menos una categoría propia
   en algún bucket asignable (Necesidades/Deseos/Ahorro) — sin eso, la hoja
   de clasificación no tiene nada que ofrecer.
4. **Maestro instalado** (`curl -Ls "https://get.maestro.mobile.dev" | bash`)
   y un simulador/dispositivo corriendo.
5. `.env` de `apps/mobile` con `EXPO_PUBLIC_API_BASE_URL` (y `EXPO_PUBLIC_API_KEY`
   si tu backend aún la exige) — ver `apps/mobile/.env.example`.

## Paso 1 — Build nativo de desarrollo

Desde `apps/mobile/`:

```bash
# iOS (requiere Xcode + simulador)
npx expo run:ios

# Android (requiere Android SDK + emulador/dispositivo)
npx expo run:android
```

Esto corre `prebuild` (autolinkea `expo-document-picker`), compila e instala la
app nativa. Es el camino más rápido si tenés Xcode/Android SDK local.

### Alternativa gestionada — EAS Build

Hay un `apps/mobile/eas.json` con perfiles listos. El perfil `preview`
(`distribution: internal`, release, sin dependencias extra) produce un **APK
Android de distribución interna** — el camino de gate recomendado (ADR-022), que
instala directo en emulador o dispositivo. El perfil `development` sirve igual
pero requiere `expo-dev-client`.

> El `eas.json` sigue la config canónica de ADR-030 (`appVersionSource: remote`,
> release-please dueño de la versión). No define `ios.simulator`, así que un build
> de iOS pediría firma de Apple; para el gate usá Android.

Setup por única vez (interactivo, lo corrés vos):

```bash
cd apps/mobile
npm i -g eas-cli          # si no lo tenés
eas login                 # tu cuenta Expo
eas init                  # crea/linkea el proyecto → escribe extra.eas.projectId en app.json
```

Build para el gate:

```bash
# Android (APK interno, instala en emulador/dispositivo) — recomendado
eas build --profile preview --platform android
```

Al terminar, instalá el artefacto en el emulador/dispositivo y seguí con el
Paso 2. El perfil `development` (`--profile development`) requiere además
`npx expo install expo-dev-client`.

## Paso 2 — Smoke manual (antes del flujo automatizado)

1. Abrí la app → login con el usuario de prueba → llegás al resumen.
2. Tocá **"Subir cartola"** → se abre la pantalla de subida.
3. Tocá **"Seleccionar archivo"** → **confirmá que el picker nativo abre** y
   lista solo `.xlsx`/`.pdf`.
   - Si el picker NO abre en iOS: agregá `"expo-document-picker"` a `plugins` en
     `app.json` y volvé a compilar (Paso 1). Es la única config que puede faltar.
4. Elegí el fixture → esperá → deberías ver **"Cartola subida"** con
   banco/cuenta/N.º de transacciones. Este smoke ya valida el boundary multipart
   en dispositivo; el Paso 3 lo automatiza para dejarlo repetible.

## Paso 3 — Correr el flujo Maestro

Ajustá primero el nombre del fixture en `.maestro/subir.yaml` (línea marcada
`PASO DEPENDIENTE DE DISPOSITIVO`) al nombre real que viste en el picker. Luego,
desde `apps/mobile/`:

```bash
maestro test \
  -e MAESTRO_EMAIL="tu@correo" \
  -e MAESTRO_PASSWORD="tu-password" \
  .maestro/subir.yaml
```

`subir.yaml` encadena `login.yaml` (creado para este gate) → navega al detalle
→ abre el picker → selecciona el fixture → espera el resultado ("Subir tal
cual"). Corré `subir-cancelar.yaml` igual para el camino "Descartar"/
"Cancelar", y `subir-editar.yaml` para "Revisar y editar" → hoja de
clasificación → "Subir" con el overlay de ediciones — este último requiere
ajustar el bucket/categoría de ejemplo en el YAML (marcado "PASO DEPENDIENTE
DE DISPOSITIVO") a valores que existan en el catálogo del usuario de prueba.

> Nota: el toque sobre el nombre del archivo en el picker del SO no es
> determinístico entre plataformas/versiones. Si Maestro no logra tocarlo,
> completá ese único paso a mano y dejá que el flujo verifique el resultado — el
> objetivo del gate es validar la subida real, no scriptear el picker del SO.

## Criterio de aprobación (PASA / NO PASA)

**PASA** si, con un fixture válido:

- El login llega a la pantalla autenticada (`subir-cartola-button` visible).
- La subida muestra **"Cartola subida"** y el bloque `subir-resultado` con
  banco/cuenta/totalTransacciones coherentes con el archivo.
- Un archivo inválido (banco no reconocido / estructura inválida) muestra el
  estado de **error** en español y la pantalla queda **reintentar** (no colgada
  en "Subiendo…").

**NO PASA** si la app crashea, la subida cuelga en "Subiendo…", el multipart
llega corrupto al backend (400 de estructura sobre un archivo que sí es válido),
o el picker no abre tras agregar el plugin y recompilar.

**Adicional para `subir-editar.yaml` (MOB-PRV-06/07/08/11):**

- Tocar una fila duplicada o clasificada como Ingreso NO abre la hoja.
- Tocar una fila editable abre la hoja; elegir bucket → categoría y confirmar
  actualiza esa fila en la lista con la categoría elegida.
- "Subir" desde la revisión persiste la cartola con el overlay de ediciones
  (no vacío cuando hubo al menos una edición).
- VoiceOver (iOS) / TalkBack (Android): el control de bucket y el de
  categoría dentro de la hoja anuncian un nombre accesible identificando el
  campo; las filas no interactivas (duplicado/Ingreso) NO anuncian rol de
  botón.

## Post-gate (una vez que PASA)

1. Marcar el gate cumplido en el PR #77 (link a este runbook + evidencia:
   captura o log de Maestro).
2. Mergear la cadena mobile **bottom-up**: #76 (transporte) → #77 (pantalla).
3. Para las tiendas (US-021): rebuild nativo de release + submit (EAS Build/
   Submit) — el módulo nativo nuevo obliga a un binario nuevo, no basta un OTA.
4. Actualizar el estado de US-033 a 🟢 en el vault (`Sprint-8.md` + INDEX).
