# Rediseño visual del dashboard web + shell responsive ("Serene Finance")

Restyle en sitio del dashboard "Análisis Mensual" de `apps/web` a la identidad **Serene Finance** y adición de un **shell de navegación responsive** (sidebar en desktop, bottom tabs en mobile). No es una reconstrucción: la pantalla ya es funcional y está testeada; esto cambia su piel y le agrega el chasis de navegación que hoy no existe.

## Why

- **El producto funciona pero se ve utilitario.** El dashboard ya calcula y muestra 50/30/20, semáforo, detalle por categoría y resumen anual (todo respaldado por endpoints existentes), pero su estética es "bank-like" fría. Adoptar Serene Finance (soft modernism, pasteles desaturados, Inter, sombras suaves, 8px radius) baja la ansiedad de densidad de datos y da claridad emocional — el objetivo declarado del design system.
- **No es usable en mobile como shell.** El cuerpo del dashboard ya apila (`lg:grid-cols-2`), pero `__root.tsx` es un `<Outlet/>` pelado: no hay navegación en absoluto. Un usuario en teléfono no tiene chasis de navegación.
- **Ahora:** el backend de todas las pantallas del MVP ya está en `main`; el diferencial que falta para una demo presentable es puramente de front (piel + navegación).

## What changes (scope IN)

- **Capa de tokens Serene Finance** en el `@theme` de Tailwind 4 (`index.css`): superficie off-white, primario azul, secundario lavanda, terciario, escala de radios (8px default), tipografía Inter self-hosted.
- **Migración de colores de bucket en `lib/bucket-colors.ts` (solo web):** azul `#8FA7D1`=Necesidades, lavanda `#B1A7D1`=Gustos, amarillo `#E6D194`=Ahorro, coral `#E88A8A`=exceso/over-budget.
- **Shell de navegación responsive NET-NEW** en `__root.tsx`: sidebar en desktop (≥ lg), bottom tab bar en mobile. Marca "MoneyDiary — Sin registro. Solo analiza." + ítems de nav.
- **Placeholders visuales no funcionales:** botón "Subir nuevo archivo", "Configuración" y "Ayuda" se renderizan pero quedan deshabilitados/inertes.
- **Restyle en sitio** de los componentes del dashboard existentes (`ResumenScreen`, `DistribucionPie`, `LeyendaGasto`, `BucketDetailList`, `ResumenAnual`, `MiniDistribucionPie`): cards blancas, sombras suaves, radios 8px, Inter, headers de categoría con badge de total agregado.
- **Iconos por transacción** mapeados por **nombre canónico de categoría** (lucide-react, tabla de lookup client-side) con fallback genérico.
- **Pasada de responsividad mobile** en todas las secciones del dashboard bajo el nuevo shell.

## Non-Goals (scope OUT)

- **Reconstruir desde `code.html`.** El markup del mockup no preserva los fixes de accesibilidad ya landeados (`role=button` en paths SVG, `aria-pressed`, threading de headings, regiones `role=status`, fixes WCAG documentados). Se hace restyle en sitio, no rebuild.
- **Cualquier cambio en `apps/mobile`.** Las paletas de bucket web/mobile **divergen** a propósito por ahora (deuda aceptada, ver Risks).
- **UI/flujo real de subida de archivos.** "Subir nuevo archivo" queda como placeholder inerte.
- **Nuevos endpoints backend.** Todos los datos ya existen (`GET /api/resumen`, `/api/resumen/anual`, `/api/buckets/:bucket`); el badge de total agregado se deriva client-side.
- **Restyle de `/login` y de la ruta standalone `/buckets/:bucket`.** El scope es dashboard + shell compartido, nada más.
- **Tocar el proxy de `x-api-key`** (`vite.config.ts`, `apps/web/api/[...path].ts`, `api/client.ts` — Tarea 0-W de Grupo W). El rediseño es puro CSS/layout y no debe alterar el fetch-path.
- **Dark mode.** El design system no lo especifica más allá del bloque `.dark` inerte de shadcn.

## Approach (token-first, secuenciado)

Un restyle en sitio hecho en slices disciplinados (no un big-bang). Detalle fino → fases design/tasks.

| # | Slice | Qué |
|---|-------|-----|
| 1 | Tokens + fuente | Capa Serene Finance en `@theme` + Inter self-hosted; migración de `bucket-colors.ts` (solo web) |
| 2 | Shell de nav | Layout responsive en `__root.tsx`: sidebar desktop / bottom tabs mobile; ítems reales + placeholders inertes |
| 3 | Restyle dashboard | Componentes existentes a los nuevos tokens (cards, sombras, radios, Inter, header con badge de total) preservando **verbatim** los atributos de a11y y el render BigInt-safe |
| 4 | Iconos por categoría | Tabla de lookup `categoria.nombre → icono` (lucide) + fallback genérico |
| 5 | Responsividad mobile | Pasada final sobre todas las secciones bajo el shell |

**Estrategia de entrega:** `ask-on-risk`. La amplitud (5 slices sobre ~8 archivos + tests) probablemente **supera ~400 líneas cambiadas** → se recomienda anticipar PRs encadenados. Decisión de split se confirma en la fase tasks.

## Impact / affected areas (todo en `apps/web`)

| Área | Archivos |
|------|----------|
| Tokens/estilo | `src/index.css` (`@theme`), `index.html` (o `@fontsource/inter`), `src/lib/bucket-colors.ts` |
| Shell nav | `src/routes/__root.tsx` (NET-NEW), posible `_authenticated.tsx` |
| Componentes | `ResumenScreen.tsx`, `DistribucionPie.tsx`, `LeyendaGasto.tsx`, `BucketDetailList.tsx`, `ResumenAnual.tsx`, `MiniDistribucionPie.tsx` |
| Iconos | nueva `src/lib/category-icons.ts` (o similar) |
| Tests | `.test.tsx` que asertan clases Tailwind ligadas a contraste WCAG — actualización **deliberada y re-verificada**, no swap ciego |
| NO tocar | `vite.config.ts`, `api/client.ts`, `apps/web/api/[...path].ts` |

## Risks & mitigations

| Riesgo | Mitigación |
|--------|-----------|
| **Tests acoplados a clases Tailwind de contraste** (fixes WCAG documentados inline). Un find/replace de colores puede romper garantías de contraste en silencio. | Cada cambio de token re-verifica ratio de contraste, no solo el hex. Actualización de tests deliberada por slice. |
| **Divergencia de paleta web/mobile.** `bucket-colors.ts` hoy espeja `apps/mobile/src/theme/colors.ts` 1:1. | Deuda **aceptada y registrada** (mobile out of scope por decisión de producto). Gatillo: si mobile migra, re-sincronizar desde la fuente web. |
| **El shell es NET-NEW** (patrón sidebar↔bottom-tabs no existe en el repo; mobile Expo no es reutilizable). | Slice aislado (2) con su propio set de tests; se construye contra rutas que ya existen, placeholders para las que no. |
| **Romper el proxy de `x-api-key`.** | Restyle puro CSS/layout; ningún task del change puede tocar el fetch-path. Cualquier task que toque `client.ts`/`vite.config.ts`/función Vercel es señal de scope-creep. |
| **Regresión de a11y** (`role=button` en SVG, `aria-pressed`, threading de headings — ADR-018). | El restyle toca clases visuales, **no** semántica de markup. Atributos de a11y se preservan verbatim. |
| **Carga de fuente Inter.** | Self-host (`@fontsource/inter` o `font-display: swap`), **no** CDN de Google Fonts render-blocking (coherente con "sin registro" y bundling offline-friendly). |

## Open questions (diferidas a design)

1. **Set de iconos:** confirmar lucide-react (ya instalado, tree-shakeable) vs. Material Symbols del mockup. Recomendación: lucide, sin CDN extra.
2. **Charting:** mantener el SVG hand-rolled de `DistribucionPie`/`MiniDistribucionPie` (preserva a11y ya testeada) vs. introducir una lib. Recomendación: mantener hand-rolled.
3. **Convención de nombres de tokens:** ¿espejar los nombres Material (`surface-container-*`, `on-primary`, etc.) del DESIGN.md o normalizar a la convención shadcn/Tailwind ya presente? Decisión de naming para el `@theme`.
4. **Fuente de la fuente Inter:** `@fontsource/inter` (npm, bundled) vs. self-host manual de woff2.

## Next step

Fases `sdd-spec` y `sdd-design` (pueden correr en paralelo). Design resuelve las open questions de tokens/iconos/charting antes de `sdd-tasks`.
