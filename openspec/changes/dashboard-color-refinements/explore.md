# Exploration — `dashboard-color-refinements`

> Trail copy of the Engram exploration artifact (`sdd/dashboard-color-refinements/explore`, obs #333) for the hybrid file store. Full analysis lives in Engram; key findings distilled below.

Scope: `apps/web` ONLY. No `apps/mobile` / `apps/landing` involvement (mobile deliberately diverges from web's Serene Finance palette by product decision).

## Token system (Serene Finance, Sprint 9)
- `apps/web/src/index.css`: `--background: #f9f9f9`, `--card: #ffffff`, `--primary: #475f85` (~6.5:1 on white, button bg + heading text), `--secondary: #61597f`, `--foreground: #1a1c1c`, `--muted-foreground: #44474e`.
- Bucket pastel tokens (`--color-necesidades #8fa7d1`, `--color-gustos #b1a7d1`, `--color-ahorro #e6d194`, `--color-exceso #e88a8a`) are FILLS ONLY (two-tier rule). No income/success token exists.
- `--background` consumed at `AppShell.tsx:19` (`min-h-dvh bg-background`) → app-shell-wide.
- `bucket-colors.ts` mirrors bucket hexes as literals for the pure `resumen-view-model` (must sync with `index.css`). Income card does NOT go through this module.

## Income card
- `apps/web/src/components/IngresoCard.tsx` hardcodes `border-l-4 border-l-slate-800` (purely decorative, non-semantic — safe to remove), `text-slate-500`, `text-slate-900`. Bypasses tokens.
- `IngresoCard.test.tsx`: 2 tests (amount verbatim, "INGRESOS" label); neither asserts the border.

## Icon (ADR-027 lucide)
- `lucide-react@^0.469.0` present. Idiomatic direct import (like `nav-items.ts`). `TrendingUp` chosen; avoid `PiggyBank` (collides with Ahorro category icon).

## `#2260b2` analysis
- HSL 214°, 68%, 42% — saturated royal blue, NOT a pastel. 6.2:1 on white → good emphasis color, poor page background under the app's pastel-surface identity.
- A true pale pastel blue in the same hue family lands ~`#dce7f5`–`#e8f0fa` (L 90-95%).

## Approaches
- A. Minimal fix · **B. Semantic token (chosen)** · C. Full palette pass (rejected — YAGNI, would touch SemaforoBadge).

## Ready for proposal: yes.
