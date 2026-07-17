# Design: Sprint 5 — Grupo L (Landing pública)

## Technical Approach

Landing 100% estática con Astro 5 SSG + Tailwind 4 (`@tailwindcss/vite`), tokens de `DESIGN.md` mapeados a `@theme` CSS, desplegada en Vercel. Cero JavaScript runtime, cero backend. CTA beta se resuelve en build-time desde un módulo de configuración. CI agrega job `landing` con typecheck + build + grep de secretos.

## Architecture Decisions

| # | Decisión | Choice | Rechazado | Rationale |
|---|----------|--------|-----------|-----------|
| 1 | **Stack base** | Astro 5 SSG | Vite+React (100KB+ bundle innecesario); HTML plano (sin componentización) | Landing 100% contenido, 0% interactividad. Astro entrega HTML/CSS puro, mismo Tailwind 4 que apps/web, SEO nativo |
| 2 | **Integración Tailwind 4** | `@tailwindcss/vite` en `astro.config.ts` | `@astrojs/tailwind` (v6 alpha); PostCSS manual | Misma integración que apps/web. Astro 5 usa Vite plugins nativamente — no necesita adapter |
| 3 | **CTA condicional** | Módulo `src/config.ts` importado por componentes | Env vars; JSON externo; llamada HTTP | Config TypeScript estática: se actualiza vía PR, zero runtime. Links TestFlight/Play o fallback email |
| 4 | **Component tree** | Layout + 6 secciones planas (Hero, ComoFunciona, Bancos, Capturas, CtaBeta, Footer) | Layouts anidados; componentes compartidos con apps/web | Sin estado, sin navegación. Una sola página. YAGNI sobre abstracciones |
| 5 | **Design tokens** | Solo los ~12 tokens que la landing usa en `src/styles/theme.css` | Copiar los ~50 tokens de DESIGN.md | YAGNI: solo paleta + tipografía + radios que el contenido usa |
| 6 | **CI job** | Nuevo job `landing` paralelo al `ci` existente | Anexar al job `ci` existente (serial, más lento) | `pnpm install` compartido por caché; `astro check` y build son independientes de api/web |
| 7 | **Deploy target** | Vercel + `vercel.json` con security headers | Render (misma plataforma que api); Netlify | Vercel es el target del ADR-004. CSP/HSTS/nosniff via `vercel.json` |
| 8 | **Secret grep** | `! grep -rE '(API_KEY\|DATABASE_URL\|secret\|-----BEGIN)' dist/ -q` post-build | gitleaks (ADR-021, no implementado); audit manual | Checks directo sobre el output del build. No hay backend envs en el bundle |

## Build Flow

```
Source (.astro, .ts, .css)
    │ pnpm landing build
    ▼
Astro build (Vite + @tailwindcss/vite) → output: 'static'
    │
    ▼
dist/ (HTML + CSS + assets)
    │ git push → Vercel auto-deploy
    ▼
Vercel Edge CDN (CSP, HSTS, nosniff via vercel.json headers)
```

Sin runtime data flow. Zero JS en página por defecto (Astro `client:load` no se usa).

## File Structure

```
apps/landing/
├── astro.config.ts          # Tailwind 4 vite plugin, output: 'static', site:
├── tsconfig.json            # extends astro/tsconfigs/strict
├── package.json             # @moneydiary/landing
├── vercel.json              # CSP, HSTS, nosniff, Referrer-Policy
├── public/
│   ├── favicon.ico
│   ├── robots.txt
│   └── og-image.png
└── src/
    ├── config.ts            # CTA links + site metadata
    ├── styles/theme.css     # @import 'tailwindcss' + @theme tokens
    ├── layouts/Layout.astro # HTML shell, SEO meta, header + footer
    ├── components/          # 6 secciones (Hero, ComoFunciona, Bancos…)
    └── pages/
        ├── index.astro      # Compone las secciones
        └── 404.astro
```

## Design Tokens Mapping (DESIGN.md → @theme)

```css
@theme {
  --color-primary: #475f85;
  --color-on-primary: #ffffff;
  --color-primary-container: #8fa7d1;
  --color-surface: #f9f9f9;
  --color-on-surface: #1a1c1c;
  --color-on-surface-variant: #44474e;
  --font-sans: 'Inter', system-ui, sans-serif;
  --radius-DEFAULT: 0.5rem;  /* DESIGN.md 8px primary roundedness */
}
```

Solo los tokens necesarios — YAGNI sobre los ~50 del DESIGN.md.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/landing/` | Create | Astro 5 workspace completo |
| `package.json` (root) | Modify | Agregar `"landing": "pnpm --filter @moneydiary/landing"` |
| `.github/workflows/ci.yml` | Modify | Agregar job `landing` (typecheck + build + secret grep) |

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Static analysis | TypeScript + Astro syntax | `astro check` |
| Build | Output correcto | `astro build` succeeds; `dist/` existe |
| Security | Zero secrets in bundle | `! grep -rE 'API_KEY|DATABASE_URL|secret|-----BEGIN' dist/ -q` |
| Accessibility | WCAG 2.2 AA | axe-core + Lighthouse CI (a11y ≥95) |
| Performance | Lighthouse | LHR perf ≥90, a11y ≥95 |
| Smoke | Headers + status post-deploy | `curl -I` verifica CSP, HSTS, 200 |

## Migration / Rollout

No migration required. Rollback = revert PR + Vercel redeploy desde main.

## Open Questions

- [ ] Dominio final: se define en sprint. `*.vercel.app` funciona día 1.
- [ ] Links beta TestFlight/Play: dependen de US-021 (Track C). Mientras tanto solo fallback email `beta@moneydiary.cl`.
