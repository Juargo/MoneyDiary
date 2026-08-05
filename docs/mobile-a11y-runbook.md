# Runbook — Accesibilidad mobile (ADR-018 capas 3 y 4)

Verificación **manual** de accesibilidad de `apps/mobile` — la parte que la
automatización NO cubre. La automatización a11y detecta ~57 % de las incidencias
reales (nota del ADR-018, estudio Deque sobre axe-core); el resto necesita un
lector de pantalla real y ojo humano. Este runbook es device-gated (ADR-017): no
corre en CI.

## Qué ya cubre CI (no repetir acá)

Ya verificado automáticamente en cada PR (ADR-018 capas 1-2):

- **Capa 1 — lint:** `eslint-plugin-react-native-a11y` en el gate de ESLint
  (props de accesibilidad válidas: role/label/state en controles).
- **Capa 2 — componentes:** aserciones RNTL de que los controles son
  alcanzables por rol accesible + nombre (`getByRole('button', { name })`), y
  que el semáforo comunica estado por texto, no solo color (US-016).

Este runbook cubre lo que esas capas NO pueden: **orden de foco, gestos del
lector de pantalla, anuncios reales, contraste y tamaño de target en el
dispositivo**.

## Prerrequisitos

1. **Dev build nativo** instalado en dispositivo/simulador — mismo build del
   gate de subida (ver `docs/mobile-upload-gate-runbook.md`, Paso 1). Expo Go no
   sirve para el flujo de subida; para el resto alcanza cualquier dev build.
2. **Usuario de prueba real** con ingresos/transacciones en el período (para que
   el resumen tenga datos y el semáforo muestre estados reales).
3. **`.env`** de `apps/mobile` con `EXPO_PUBLIC_API_BASE_URL` (y `EXPO_PUBLIC_API_KEY`
   si el backend la exige).
4. Para la Parte A: **Maestro** instalado
   (`curl -Ls "https://get.maestro.mobile.dev" | bash`).

---

## Parte A — Flujo Maestro de etiquetas accesibles (semi-automatizable)

Smoke rápido de que los controles críticos son alcanzables por su **nombre
accesible** (lo que el lector de pantalla anuncia), no solo por testID. Desde
`apps/mobile/`:

```bash
maestro test \
  -e MAESTRO_EMAIL="tu@correo" \
  -e MAESTRO_PASSWORD="tu-password" \
  .maestro/a11y-labels.yaml
```

**PASA** si el flujo completa: login por etiqueta ("Correo electrónico" /
"Contraseña" / "Ingresar"), resumen con "Distribución del gasto" y "Cerrar
sesión" alcanzables, y la pantalla de subida con "Seleccionar archivo .xlsx o
.pdf para subir".

> Esto solo prueba que las etiquetas **existen** en el árbol de accesibilidad.
> El orden de foco, los gestos y los anuncios reales se validan a mano en las
> Partes B/C — Maestro no ejecuta el lector de pantalla.

---

## Parte B — VoiceOver (iOS)

**Activar:** Ajustes → Accesibilidad → VoiceOver → ON (o triple-clic al botón
lateral si está configurado como atajo). Gestos base: deslizar derecha/izquierda
= siguiente/anterior elemento; doble toque = activar; deslizar con 3 dedos =
scroll.

Recorré los flujos críticos **solo con VoiceOver** (sin mirar dónde tocás):

1. **Login (MOB-01):** enfocá cada campo. VoiceOver debe anunciar "Correo
   electrónico" y "Contraseña" (no "campo de texto" a secas). El botón anuncia
   "Ingresar, botón".
2. **Resumen (US-015/016):** el orden de lectura debe ser lógico
   (período → ingreso → distribución → buckets → semáforo), no saltar. Cada
   **semáforo** debe anunciar su estado por palabra ("Verde"/"Amarillo"/"Rojo"/
   "Sin datos") — NUNCA depender solo del color. Los **montos** deben anunciarse
   inequívocos (el signo/naturaleza ingreso-gasto no puede perderse).
3. **Subir cartola (US-033):** "Subir cartola, botón" → "Seleccionar archivo
   .xlsx o .pdf para subir" → tras elegir, la vista previa y el resultado se
   anuncian; "Confirmar carga" y "Cancelar vista previa" son distinguibles.
4. **Logout (MOB-04):** "Cerrar sesión, botón" enfocable y activable.

---

## Parte C — TalkBack (Android)

**Activar:** Ajustes → Accesibilidad → TalkBack → ON (o mantené ambos botones de
volumen si está el atajo). Gestos equivalentes a VoiceOver (deslizar
derecha/izquierda, doble toque, scroll con 2 dedos).

Repetí los **4 flujos de la Parte B**. Puntos donde iOS/Android suelen diferir y
hay que mirar con cuidado:

- El `accessibilityRole="image"` del semáforo/perfil se anuncia distinto en
  TalkBack — confirmá que igual comunica el estado por su etiqueta.
- El foco tras navegar entre pantallas (expo-router) debe caer en un elemento
  útil, no perderse al inicio del árbol.

---

## Parte D — Checklist WCAG 2.2 AA (smoke manual)

Marcá cada ítem en el dispositivo (no en el simulador para contraste/target):

- [ ] **Estado no solo por color (1.4.1):** el semáforo comunica verde/amarillo/
      rojo por texto/ícono además del color (criterio central US-016).
- [ ] **Contraste de texto (1.4.3):** texto normal ≥ 4.5:1, grande ≥ 3:1 sobre
      su fondo (montos, labels, copy de estados).
- [ ] **Target táctil ≥ 44×44 pt (2.5.8):** botones, tabs y el toque del semáforo
      son cómodos de tocar; nada apretado.
- [ ] **Nombre accesible en TODO control (4.1.2):** ningún botón/imagen
      interactiva queda mudo (cubierto por lint, reconfirmar en dispositivo).
- [ ] **Orden de lectura lógico (1.3.2):** el foco recorre la pantalla en el
      orden en que el contenido tiene sentido.
- [ ] **Foco visible / anunciado (2.4.7):** al navegar, siempre se sabe dónde
      está el foco.
- [ ] **Montos inequívocos:** ingreso vs gasto se distingue por más que el color
      (signo/etiqueta), también al oírlos.

---

## Criterio de aprobación (PASA / NO PASA)

**PASA** si: la Parte A completa, los 4 flujos son operables **solo con el lector
de pantalla** (Partes B y C), y el checklist de la Parte D no tiene ítems
críticos abiertos (color-solo, control mudo, contraste insuficiente en dinero).

**NO PASA** si: algún control queda mudo o inalcanzable con el lector, el
semáforo comunica estado solo por color, el orden de lectura confunde, o el
contraste de un monto no llega a AA.

## Definition of Done (ADR-018)

Para una US de UI mobile, "accesible" en la DoD = **lint a11y limpio + tests
RNTL verdes (CI, capas 1-2) + este runbook pasado en al menos una plataforma
(VoiceOver o TalkBack) sobre los flujos que la US toca**. La automatización sola
NO marca a11y como hecho.

Registrá la evidencia (plataforma, fecha, hallazgos) en el PR de la US.
