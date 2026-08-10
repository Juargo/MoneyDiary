## Exploration: Sprint 5 — Grupo L (Landing pública)

### Current State
El monorepo tiene 3 workspaces (`apps/api`, `apps/web`, `apps/mobile`) desplegados en Render (solo API). No existe CI automatizado ni configuración de Vercel. La identidad visual está documentada en `DESIGN.md` con un sistema Material 3 adaptado, colores pastel y tipografía Inter.

### Affected Areas
- `pnpm-workspace.yaml` — ya cubre `apps/*`, sin cambios necesarios
- `package.json` (raíz) — agregar shortcut `"landing": "pnpm --filter @moneydiary/landing"`
- `apps/landing/` — nuevo workspace Astro (crear)
- `.github/workflows/ci.yml` — NO existe, habría que crearlo desde cero (no hay CI actual)
- `DESIGN.md` — fuente de tokens de diseño reutilizables

### Approaches

1. **Astro con Tailwind 4 (`@astrojs/tailwind` v6 o integración nativa)** — recomendado
   - Pros: Misma versión de Tailwind que `apps/web`; equipo ya conoce Tailwind 4; `@theme` directive compatible; rendimiento nativo de Astro
   - Cons: La integración Tailwind en Astro 5+ usa Vite plugin, no PostCSS; documentación de Tailwind 4 + Astro es reciente
   - Effort: Medium

2. **Tailwind 3 via PostCSS** — alternativa conservadora
   - Pros: Documentación madura de Astro + Tailwind 3; `@astrojs/tailwind` v5 probada
   - Cons: Diverge de la versión que usa `apps/web`; el equipo tendría que mantener dos configs de Tailwind; más legacy
   - Effort: Medium (ligeramente más config)

3. **Astro vanilla + CSS Modules/vanilla-extract**
   - Pros: Mínimas dependencias
   - Cons: Sin Design System compartido; pierde consistencia visual con el ecosistema MoneyDiary
   - Effort: High (más CSS propio)

### Recommendation
Usar **Astro + Tailwind 4** en `apps/landing`. La web ya usa Tailwind 4 y el DESIGN.md define la paleta en términos compatibles. Astro 5+ tiene integración nativa con Tailwind 4 via el plugin de Vite. No hay razón para retroceder a Tailwind 3.

### Risks
- **`minimum-release-age`**: Astro tiene release frecuentes. Puede bloquear versiones recién publicadas. Mitigación: pin a una versión conocida (`astro@5.x`).
- **Tailwind version split**: web usa `^4.0.0`, mobile usa `3.4.19`. No hay conflicto real (workspaces aislados), pero agrega complejidad mental. La landing debe ir con 4.
- **CI inexistente**: No hay `.github/workflows/`. Habrá que crearlo. Riesgo bajo porque la landing es 100% estática (no tiene build complejo ni tests).
- **No hay `vercel.json` existente**: Es el primer deploy Vercel del repo. La configuración será nueva.

### Ready for Proposal
Yes — la exploración es suficiente para pasar a propuesta. Los riesgos son conocidos y mitigables.
