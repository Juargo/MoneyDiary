# Wireframe ground truth — US-043 (extracted 2026-08-14)

Board: Whimsical `LYiabT1DD6UvDMnFXnBkn9` — *MoneyDiary — Wireframes: Configuracion (perfil + categorias)*.

**The board holds nine frames, not four.** The proposal names `2`, `3`, `T2`, `T3`. It also contains
`1`/`T1` (Perfil, consumed by US-042) and **`M1`/`M2`/`M3` — mobile-viewport variants that no US-043
artifact has ever mentioned.**

| Frame | id | Size | Screen |
|---|---|---|---|
| `1` | `E7Q1Z7dLK96jR4we2bAUAF` | 1080×960 | Perfil (web) — US-042 |
| `2` | `CPpaPvxRkgUWH6r9UZthwh` | 1080×960 | Categorías (web) |
| `3` | `DpQzSenRo1AEFrg2m1zrpY` | 1080×960 | Editar categoría (web) |
| `T1` | `9gzGYFzDCGk9fvoSqBVWBJ` | 880×1248 | Perfil (tablet) — US-042 |
| `T2` | `YMSQBFRuaFpe3FDmaQ6Ert` | 880×1248 | Categorías (tablet) |
| `T3` | `X4Ck6Yi1qftDUaeA1Arasy` | 880×1248 | Editar categoría (tablet) |
| `M1` | `Fi1DNpaSWAMLqrYqtBqNtV` | 432×892 | Perfil (mobile) |
| `M2` | `FaSns2RVc5BAffwAEQWun7` | 432×892 | Categorías (mobile) |
| `M3` | `HmVYXoRHuJNaV9yLf8ehw7` | 432×892 | Editar categoría (mobile) |

Extraction method: `whimsical fetch` with `scope: <frame-id>`, `detail: detailed`. The earlier
exploration's "canvas-rendered, could not be extracted" was a limitation of the *fetch call shape*
(board overview collapses each wireframe into a one-line summary), not of the artifact. Scoping into
the frame returns every element with coordinates.

---

## 1. ★ The starred blocker resolves — CA-06 needs no new breakpoint

Proposal §11 assumed tablet is satisfied by US-042's fluid grid with **no new tier in `layout.ts`**.
**Confirmed by measurement.**

### T2 vs frame 2 — the list

| Element | Frame 2 (1080) | T2 (880) | Behaviour |
|---|---|---|---|
| Tab column | `113×88` | `113×88` | **Fixed** — identical |
| Content column | 760 wide | 534 wide | **Fluid** |
| Gutter tabs→content | 119 | 81 | Fluid |
| Inner content band | 1080 (full bleed) | 768 | Fluid |

A fixed sidebar beside a fluid content column is exactly `grid-cols-[200px_1fr]` — US-042's shipped
`WCFG-11` grid, resized. No reflow, no restructure.

### T3 vs frame 3 — the edit screen

| Row | Frame 3 | T3 | Behaviour |
|---|---|---|---|
| `Nombre` + `Bucket` | 444 + 220, **side by side** | 356 + 200, **side by side** | Fluid, layout preserved |
| Pattern row | dropdown 180 + input 458 | dropdown 160 + input 370 | Fluid |
| Footer row | one row | one row | Preserved |

**CA-06 is a resize, not a redesign.** The proposal's default position stands.

---

## 2. Three places the frames contradict the proposal

### C-1 — The footer is ONE row, and the delete button is in it

Proposal §4 states the footer buttons *"sit below the divider that closes the patterns section and
are visually bound to the identity block only"*, offered as the structural mitigation for the
two-commit-semantics risk.

Frames 3 and T3 draw something else — a single row below the divider:

```
[ Eliminar categoría ]  Advertencia previa: sus…   [ Cancelar ] [ Guardar ]
   red, x=2140                x=2326                 x=2612      x=2725      (frame 3, y=115)
   red, x=1676                x=1862                 x=2036      x=2149      (T3,     y=2355)
```

The destructive action shares the footer with the identity-commit buttons. Design must either adopt
this and find another way to carry §4's honesty obligation, or deviate from the frames deliberately
and say so.

### C-2 — The `sin patrones` note is drawn on categories that HAVE patterns

CA-03 reads *"a category with **zero** patterns shows the note"*. All three edit frames draw the note
**below a populated pattern list**:

| Frame | Patterns drawn | Note drawn |
|---|---|---|
| `3` | 3 (`JUMBO`, `LIDER`, `SANTA ISABEL`) | yes |
| `T3` | 2 (`JUMBO`, `SANTA ISABEL`) | yes |
| `M3` | 2 (`JUMBO`, `LIDER`) | yes |

Each is preceded by an info icon, in the same position, regardless of count. Read literally the note
is **static helper text**, not a zero-state. Always-render satisfies CA-03's zero case trivially, but
reads oddly under three listed patterns. Spec must choose and say which.

### C-3 — Frame 2's footer sentence differs from T2's, so neither is incidental

| Frame | Sentence |
|---|---|
| `2` | `Eliminar una categoria en uso muestra advertencia: sus transacciones pasan a Sin categoria.` |
| `T2` | `Eliminar en uso: advertencia, transacciones a Sin categoria.` |
| `M2` | `Toca una categoria para editarla o eliminarla.` |

Item **A4** leaned "annotation, not rendered". But an annotation would not be *rewritten per
breakpoint* — and M2's is not a behaviour note at all, it is an instruction to the user. The
responsive rewriting is evidence these are **rendered copy**, which flips A4's leaning.

---

## 3. M2 / M3 — mobile restructures, it does not resize

Unlike tablet, the mobile frames change layout and behaviour:

| # | Web / tablet | M2 / M3 | Kind |
|---|---|---|---|
| 1 | Tabs vertical `113×88` | Tabs **horizontal, full width `360×40`** | Restructure |
| 2 | `Nueva categoría` 188px beside the title | **Full-width `360` below the tabs** | Restructure |
| 3 | **Two** row icons (edit + delete, x=1670/1698) | **One** row icon (x=722) | Behaviour |
| 4 | `Configuración` h1 + section tabs | **Back icon + section title**, no `Configuración` h1 | IA — contradicts **A2** |
| 5 | Breadcrumb `Configuracion / Categorias / Supermercado` | **Back icon only**, no breadcrumb | IA |
| 6 | Subtitle `Tu catálogo propio…` | **Absent** | Copy |
| 7 | `Nombre` + `Bucket` side by side | **Stacked**, both 360 wide | Restructure |
| 8 | `Patrones de auto-categorización` · `Agregar patrón` | **`Patrones`** · **`Agregar`** | Copy |
| 9 | `Sin patrones, la categoría solo se puede asignar manualmente.` | **`Sin patrones: solo asignación manual.`** | Copy |
| 10 | Footer `[Cancelar] [Guardar]` one row | **`Guardar` full-width, `Cancelar` small below it** — order inverted, far from delete | Restructure |
| 11 | — | Bottom tab bar `Resumen Registrar Historial` | Existing shell (`BottomTabs`) |

T2 also shortens one label the proposal froze: **`Nueva categoría` → `Nueva`** (111px).

**Row-icon count is the load-bearing one.** M2 dropping to a single icon plus
`Toca una categoría para editarla o eliminarla.` answers open question 6 for mobile: **delete is
reachable only from the edit screen**. It also removes an 18px tap target — ADR-018 commits to
WCAG 2.2 AA, whose SC 2.5.8 target-size minimum is 24×24 CSS px.

---

## 4. Why this is a live scope question

Issue #277 says *"Fuera de alcance: App mobile (US-044)"*. **US-044 is the Expo app.** M1/M2/M3 are
mobile-viewport frames of `apps/web` — the bottom tab bar they draw is the shipped web `AppShell`
(`Sidebar` ↔ `BottomTabs`), not React Native.

So the exclusion does not obviously cover them, and the app is already reachable at 360px today:
US-042 shipped `/configuracion` with `grid-cols-1 lg:grid-cols-[200px_1fr]`, which stacks below `lg`.
`/configuracion/categorias` inherits that reachability whether or not anyone designs for it.

Concretely, shipping web+tablet only leaves a phone user with: vertical tabs in a stacked column, two
18px row icons, and a `Nombre`+`Bucket` row drawn for 680px trying to fit 360.

---

## 5. Answers the frames give for free

- **Pluralisation** — all four forms are drawn: `3 patrones`, `2 patrones`, `1 patron`, `sin patrones`.
  Confirms §3's three-form helper, singular included.
- **Bucket group order** — `Necesidades`, `Deseos`, `Ahorro` in every list frame. Confirms §3.
- **A1 (`Deseos`/`Gustos`)** — every frame writes the **wire** value `Deseos` as a group heading.
  No frame writes `Gustos`. This is the wireframe drawing the domain value, exactly as A1 diagnosed;
  it is not new evidence against A1's leaning.
- **matchType labels** — `CONTIENE` and `EMPIEZA CON` appear verbatim; `REGEX` is never drawn.
- **Bucket dropdown value** — drawn as `Necesidades`, i.e. the assignable set, consistent with §8.
