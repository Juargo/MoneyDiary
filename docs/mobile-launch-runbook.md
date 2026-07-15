# MoneyDiary Mobile — Runbook de lanzamiento (Sprint 3 reenfocado)

> Objetivo del sprint: MVP mobile **solo-lectura** (resumen 50/30/20 + semáforo)
> corriendo contra la API en Render, **en TestFlight + closed testing de Play**,
> con la protección mínima de acceso resuelta. La disponibilidad **pública** en
> tiendas depende de Apple/Google y **no** cierra necesariamente esta semana.

---

## Track A — Deploy del backend a Render (lo hace el equipo)

**Prerequisito ya resuelto:** `ApiKeyGuard` fail-closed protege todos los
endpoints salvo el health check. Sin `API_KEY` en el entorno, la API rechaza
todo (no puede quedar expuesta por accidente).

### Pasos

1. **Generar la API key de producción** (distinta a la de local):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Crear el servicio en Render:** New → Blueprint → conectar `Juargo/MoneyDiary`.
   Render lee `render.yaml` de la raíz y crea `moneydiary-api`.
3. **Cargar los 3 secretos** en el dashboard (están como `sync:false`):
   - `DATABASE_URL` → pooler transaction-mode de Supabase (IPv4).
   - `DIRECT_URL` → pooler session-mode.
   - `API_KEY` → la generada en el paso 1.
4. **Deploy.** El build corre: `pnpm install --frozen-lockfile` →
   `prisma generate` → `nest build`. Start: `start:prod` (`node dist/main`).
5. **Verificar:**
   ```bash
   # Health check (público, sin key) → 200 "Hello World!"
   curl https://<tu-servicio>.onrender.com/

   # Endpoint protegido SIN key → 401
   curl -i https://<tu-servicio>.onrender.com/api/resumen

   # Con key → 200 + JSON del resumen
   curl -H "x-api-key: <API_KEY>" https://<tu-servicio>.onrender.com/api/resumen
   ```

### Notas de seguridad
- La API key viaja en el header `x-api-key` sobre **HTTPS** (Render lo fuerza).
- En la app mobile la key va en **EAS Secrets / config de build**, nunca
  hardcodeada en el repo (los bundles mobile son decompilables).
- ⚠️ **Deuda abierta 11.6:** cifrado en reposo sigue en `NoOpCrypto`. Exponer
  una app financiera con cifrado diferido es una decisión a registrar como
  riesgo aceptado del MVP (o adelantar 11.6 si se prefiere).

---

## Track B — Cuentas y pipeline de tiendas (lo mueves tú, en paralelo)

Esto es el "empezar a mover la rueda". Son trámites con tiempos externos, así
que conviene arrancarlos **ya**, aunque la app aún no esté lista.

### B1 · Apple (iOS)
- [ ] Inscribirse al **Apple Developer Program** ($99/año). La aprobación de la
      cuenta puede tardar de horas a días — es el primer cuello de botella.
- [ ] Decidir tipo: **individual** (más rápido) vs **organización** (requiere
      número D-U-N-S, más lento).
- [ ] Crear el **Bundle ID**: `cl.moneydiary.app` (canónico — coincide con
      `app.json` y los flujos Maestro, T2.3/T2.4, sprint3-mvp-mobile).
- [ ] Preparar **App Privacy labels** (obligatorio, más estricto por ser
      finanzas): qué datos recolecta, si se enlazan al usuario, etc.
- [ ] Distribución interna vía **TestFlight** primero (no requiere revisión
      pública completa para testers internos).

### B2 · Google (Android)
- [ ] Crear cuenta en **Google Play Console** ($25 pago único).
- [ ] ⚠️ **Bloqueante de tiempo:** una cuenta **personal** creada después de
      nov-2023 exige un **closed test con 12 testers activos durante 14 días
      consecutivos** antes de poder pedir acceso a producción. → **Arrancar el
      closed test lo antes posible** para que el reloj corra en paralelo al
      desarrollo. (Cuentas de *organización* están exentas — evaluar si te
      conviene registrarte como organización.)
- [ ] Reclutar los ~12 testers desde ya (correos Google que se opten in).
- [ ] Completar el **Data Safety form** (equivalente Android a los privacy
      labels; obligatorio y con escrutinio extra por finanzas).

### B3 · Común a ambas (requisitos de app financiera)
- [ ] **Política de privacidad** publicada en una URL (ambas tiendas la exigen;
      finanzas la revisa con lupa). Puede ser una página estática simple.
- [ ] Ícono, splash, nombre, descripción corta/larga.
- [ ] Screenshots de la pantalla del semáforo (se generan cuando la app corra).

---

## Track C — App mobile (siguiente paso técnico)

1. Scaffold Expo real sobre `apps/mobile/` (Expo Router + NativeWind, ADR-010),
   reconciliando versiones con el Expo SDK elegido.
2. Quitar `- '!apps/mobile'` de `pnpm-workspace.yaml` → meterla al workspace.
3. Cliente HTTP mínimo hacia `GET /api/resumen` (base URL + `x-api-key` desde
   env de build). *Nota:* el api-client formal de ADR-011/012 (openapi.json +
   `@moneydiary/api-client`) queda como deuda para no reventar el alcance.
4. Pantalla del "momento semáforo": ingresos + distribución 50/30/20 + semáforo.
5. Formatear CLP desde los montos-string del DTO (sin `parseFloat` sobre
   BigInt).
6. EAS Build → TestFlight (iOS) + track de closed testing (Android).

---

## Definición de "hecho esta semana" (realista)
- ✅ API en Render, protegida, verificada con `curl`.
- ✅ App Expo corriendo en dispositivo real contra la API de Render.
- ✅ Build subido a TestFlight y a closed testing de Play (reloj de 14 días
     iniciado).
- ⏳ **Fuera de nuestro control:** aprobación pública en tiendas (revisión Apple
     + 14 días de closed test en Play).

---

## Verificación de despliegue (2026-07-14) — `https://moneydiary-api.onrender.com`

Matrix de `curl` ejecutada contra el servicio en vivo:

| # | Request | Resultado | Esperado |
|---|---------|-----------|----------|
| 1 | `GET /` (sin key) | **200** `"Hello World!"` | 200 (health público) |
| 2 | `GET /api/resumen` (sin key) | **401** | 401 (`ApiKeyGuard` fail-closed) |
| 3 | `GET /api/resumen` (`x-api-key`) | **200** + `ResumenMesDto` | 200 + JSON |

Corroborado end-to-end por la corrida mobile T3.13 (Maestro, 6/6 asserts sobre datos reales).

---

## Riesgo aceptado — cifrado en reposo diferido (A.5 / Tarea 11.6)

- **Decisión:** exponer la API en Render con `NoOpCryptoService` (sin cifrado de
  columna real) para el MVP mono-usuario.
- **Justificación:** `GET /api/resumen` NO devuelve PII — solo enums de bucket,
  totales `BigInt`, porcentajes en basis points y estados de semáforo. Esta
  release agrega exposición vía API, **no** nueva exposición de datos sensibles
  en la BD.
- **Sign-off:** Jorge — 2026-07-14.
- **Trigger duro (bloqueante):** *"Task 11.6 (real column encryption) MUST be
  resolved before any endpoint returning transaction descriptions / titular name
  / RUT is exposed beyond localhost."*
