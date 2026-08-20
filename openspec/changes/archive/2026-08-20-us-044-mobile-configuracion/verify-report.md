# Verify Report — US-044 Mobile Configuración with Parity

**Change:** `us-044-mobile-configuracion`
**Verdict:** PASS WITH WARNINGS
**Date:** 2026-08-20
**Worktree:** `/Users/jorge/dev/MoneyDiary.wt/us-050-mobile-dashboard` (detached at origin/main `428e53de`, clean)
**Verifier:** sdd-verify executor

---

## Suite Evidence

| Command | Result |
|---|---|
| `pnpm --filter @moneydiary/mobile test` | **657/657 tests pass, 55 suites** (exit 0) |
| `pnpm --filter @moneydiary/mobile exec tsc --noEmit` | **Clean** (exit 0, no output) |
| `pnpm --filter @moneydiary/mobile lint` | Recorded clean in T9.1 (not re-run in verify — apply-progress is authoritative) |

Console output: act() warnings and "not configured to support act()" messages in 3–4 suites. All are pre-existing
codebase convention (accepted INFO, see Known Accepted Debts below). Zero test failures.

---

## Task Completion

| Phase | Tasks | Status |
|---|---|---|
| Phase 0 (pre-flight) | T0.1, T0.2 | All [x] |
| PR1 | T1.1–T1.7 | All [x] |
| PR2a | T2a.1–T2a.5 | All [x] |
| PR2b | T2b.1–T2b.6 | All [x] |
| PR3a | T3a.1–T3a.5 | All [x] |
| PR3b | T3b.1–T3b.6 | All [x] |
| PR4a | T4a.1–T4a.5 | All [x] |
| PR4b | T4b.1–T4b.4 | All [x] |
| PR5a | T5a.1–T5a.7 | All [x] |
| PR5b | T5b.1–T5b.6 | All [x] |
| PR5c | T5c.1–T5c.4 | All [x] |
| PR6a | T6a.1–T6a.5 | All [x] |
| PR6b | T6b.1–T6b.5 | All [x] |
| PR7 | T7.1–T7.6 | All [x] |
| PR8 | T8.1–T8.5 | All [x] |
| Phase 9 (closing) | T9.1, T9.4, T9.5, T9.6 | [x] |
| Phase 9 (closing) | T9.2, T9.3 (device/EAS — manual), T9.7 (Engram sync pending), T9.8 (issue close pending) | [ ] — correctly marked pending |

**Unchecked items are all correctly classified as manual/post-merge steps. Zero implementation tasks unchecked.**

---

## Requirement → Evidence Table

### MCFG-01 — Entry point and navigation (CA-01)

| Scenario | Evidence | Status |
|---|---|---|
| Gear opens Configuración | `Header.tsx:31–34` (`accessibilityRole="button"`, `accessibilityLabel="Configuración"`, `router.push('/configuracion')`); `Header.spec.tsx` tests 1–3 assert label + push call | PASS |
| Tab switch is not a route change | `TabsConfiguracion.spec.tsx` asserts `push`/`replace` spies never called; `configuracion.tsx` uses local `useState` for tab state | PASS |
| Native back returns to dashboard | `configuracion.tsx:79–84` «Volver al resumen» renders and calls `router.back()`; `configuracion.spec.tsx` asserts it | PASS |
| Category row pushes `/categoria/[id]` | `CategoriaFila.tsx` is `Pressable` calling `router.push`; `CategoriaFila.spec.tsx` asserts push spy | PASS |
| Edit-screen back returns to Categorías | `app/categoria/[id].tsx:78–83` «Volver a Categorías» + `router.back()`; `[id].spec.tsx` asserts it | PASS |

### MCFG-02 — Perfil fields and read-only Google status

| Scenario | Evidence | Status |
|---|---|---|
| Null email renders without crash | `PerfilPanel.tsx:51` `email ?? ''`; `PerfilPanel.spec.tsx` covers null-email case explicitly | PASS |
| Google block exposes no button | `PerfilPanel.tsx:111–116` text-only pill (no Pressable); `PerfilPanel.spec.tsx` asserts `Desvincular` absent + `Vinculada`/`No vinculada` present (non-tautological, class 3) | PASS |

### MCFG-03 — Save diffs the form and sequences the two calls

| Scenario | Evidence | Status |
|---|---|---|
| Nombre-only save sends one request | `guardar-perfil.ts` orchestration; `guardar-perfil.spec.ts` "nombre-only ⇒ one call, passwordActual absent" | PASS |
| Profile failure aborts password call | `guardar-perfil.spec.ts` "profile failure ⇒ patchPassword never called" asserted via jest.fn spies | PASS |

### MCFG-04 — Perfil error/success copy is a closed table

| Scenario | Evidence | Status |
|---|---|---|
| Wrong password and taken email indistinguishable | `mensajes-perfil.ts:28` both map to `'403:PERFIL_RECHAZADO'`; `mensajes-perfil.spec.ts` asserts `toBe` (byte-identical) | PASS |
| Password change success copy | `mensajes-perfil.spec.ts` asserts «Cambios guardados. Se cerraron tus otras sesiones.» verbatim | PASS |

### MCTG-01 — Catálogo list grouped by bucket

| Scenario | Evidence | Status |
|---|---|---|
| Groups in fixed order with display label | `CategoriasPanel.tsx:57` uses `ETIQUETA_BUCKET` from `src/theme/colors.ts` (`Deseos → Gustos`); `CategoriasPanel.spec.tsx` order test uses `getAllByRole('header')` — array equality | PASS |
| Pattern-count tag three grammatical forms | `plural.ts` `etiquetaPatrones`; `plural.spec.ts` 3 forms (`sin patrones`/`1 patrón`/`N patrones`) | PASS |

### MCTG-02 — Nueva categoría (CA-03)

| Scenario | Evidence | Status |
|---|---|---|
| Creating refreshes the list | `NuevaCategoriaForm.tsx` calls `onCreada()` on success; `configuracion.tsx` passes `cargarCatalogo` as callback | PASS |

### MCTG-03 — Editar categoría identity commit and bucket-change confirmation

| Scenario | Evidence | Status |
|---|---|---|
| Dirty bucket blocks save without confirmation | `EditarCategoria.tsx:107–169` bucket-dirty guard → `Alert.alert(fraseDeImpacto(...))`; `EditarCategoria.spec.tsx` asserts no PATCH before confirm | PASS |
| Cancelar preserves committed pattern | `EditarCategoria.spec.tsx` T7.5 integration test: commits `actualizarPatron`, then Cancelar, asserts `actualizarCategoria` never called | PASS |
| `cancelable: false` on both Alert.alert calls | `EditarCategoria.tsx:169, 249`; spec tests assert `spyAlert.mock.calls[0][3]` equals `{ cancelable: false }` | PASS |

### MCTG-04 — Pattern CRUD commits per row with explicit confirm

| Scenario | Evidence | Status |
|---|---|---|
| Adding requires explicit confirm tap | `PatronFila.tsx` confirm control; `PatronFila.spec.tsx` "clean state hides confirm control" + "sucio state shows it" | PASS |
| Zero-patterns note always renders | `PatronesSection.tsx:74` static text «Sin patrones: solo asignación manual.»; `PatronesSection.spec.tsx` asserts identical string with 0 and 3 patterns | PASS |
| prioridad never sent | `categorias.ts:149` comment; `PatronFila.spec.tsx` cases 3 and 5 assert `not.toHaveProperty('prioridad')`; tsc-enforced by absent field in types | PASS |

### MCTG-05 — Delete confirmation and always-204

| Scenario | Evidence | Status |
|---|---|---|
| Delete with transactions shows impact sentence | `EditarCategoria.tsx:219–249` reads `categoria.transaccionesCount` from loaded DTO; `EditarCategoria.spec.tsx` asserts Alert body with count | PASS |
| Zero transactions still requires confirmation | `fraseDeImpacto`'s invariant (never skips); `EditarCategoria.spec.tsx` zero-count Alert test | PASS |
| Always-204, no branch on 409 | `EditarCategoria.tsx` — no 409 branch exists; `impacto-catalogo.spec.ts` tests zero-count exact literals confirm no skip | PASS |

### MCTG-06 — Catálogo error copy closed table

| Scenario | Evidence | Status |
|---|---|---|
| Unmapped code fails to compile | `mensajes-catalogo.ts:80` `COPY: Record<CodigoCatalogo, string>` (12-member union); adding a member to the union without adding a row causes tsc to fail | PASS |
| Defensive 403 still renders mapped copy | `mensajes-catalogo.ts` `DEMO_SOLO_LECTURA` row exists; `mensajes-catalogo.spec.ts` covers it | PASS |

### MCTG-07 — Dashboard refresh after a bucket change

| Scenario | Evidence | Status |
|---|---|---|
| Bucket change refreshes dashboard | `EditarCategoria.tsx:123` `solicitarRecargaResumen()` in bucket-change confirm success path only; `EditarCategoria.spec.tsx` MCTG-07 positive test (falsifiability confirmed) | PASS |
| Pattern edit does NOT refresh | `PatronFila.spec.tsx` cases 11–12 assert against REAL `resumen-refresh` module; `PatronesSection.spec.tsx` section-level defense | PASS |
| Create does NOT refresh | `NuevaCategoriaForm.spec.tsx` test 7 negative-1 (falsifiability confirmed) | PASS |
| Rename-only does NOT refresh | `EditarCategoria.spec.tsx` negative-2 (falsifiability confirmed) | PASS |
| Delete does NOT refresh | `EditarCategoria.spec.tsx` negative-3 D-11 (falsifiability confirmed) | PASS |

### MCFG-MCTG-08 — Domain purity and test coverage (CA-04, CA-05)

| Scenario | Evidence | Status |
|---|---|---|
| Server-unknown bucket still lists | `categorias.ts` read guards use `string` not closed union (D-07); `categorias.spec.ts` test for unrecognised bucket value accepted | PASS |
| Every screen/component has tests | All 10 components in `src/components/configuracion/` have `*.spec.tsx` files; 2 routes in `app/` have spec files; all pure helpers have unit specs | PASS |

---

## Design Decision Spot-Checks

| Decision | Check | Finding |
|---|---|---|
| D-07 server-authority casts | `categorias.ts` read guards use `string`; write types use `BucketAsignable`/`MatchType` closed unions | PASS |
| D-10 useFocusEffect on catalog load | `configuracion.tsx:68` imports + calls `useFocusEffect` | PASS |
| D-11 refresh semantics (bucket-change only) | `EditarCategoria.tsx:123` single call site; `solicitarRecargaResumen` absent from `NuevaCategoriaForm.tsx`, `PatronFila.tsx`, `PatronesSection.tsx` (production files) | PASS |
| D-12 no row delete on list | `CategoriaFila.tsx` is `Pressable` with `router.push` only; no delete icon, no Alert; confirmed absent via `CategoriaFila.spec.tsx` non-tautological assertion | PASS |
| D-14 no blur machinery | `PatronFila.tsx` — no `blur`, no `setTimeout`, no `clicEliminarEnCursoRef`, no focus-restore; grep confirms zero matches | PASS |
| D-15 Alert.alert replaces dialog; snapshotAlAbrirDialogo not ported | `EditarCategoria.tsx` — no `snapshotAlAbrirDialogo`, no disabled matrix ported; `cancelable: false` guards the Android back-dismiss gap | PASS |
| D-18 gear lands last | PR8 is the final merge (`428e53de`); all PR1–PR7 slices were inert until the gear landed | PASS |
| D-04 ApiError in domain/ | `api-error.ts` in `src/domain/`; `client.ts` re-exports all three; ripgrep shows zero import-path churn in `states/Error.tsx`, `app/index.tsx`, `app/subir.tsx`, `app/login.tsx` | PASS |
| D-06 enviarMutacion extracted | `mutacion.ts` exists; both `perfil.ts` and `categorias.ts` delegate to it | PASS |

---

## Scope Verification

- No files under `apps/api/**` were modified in any US-044 commit (git log scan confirmed).
- No files under `apps/web/**` were modified in any US-044 commit (git log scan confirmed).
- No `openapi.json` changes in US-044 commits.
- No Prisma migrations introduced.
- `packages/api-client/src/index.ts` received +3 additive type alias lines (CatalogoDto, CategoriaDto, PatronDto) — within design §1.5 scope.
- One new dependency: `lucide-react-native` pinned at exact `1.31.0` (quarantine-compliant, 7-day minimum-release-age passed per `.npmrc`).

---

## Findings

### CRITICAL

None.

### WARNING

**W-01 — T9.7 Engram/OpenSpec artifact sync marked pending**
`T9.7` is `[ ]` in tasks.md. The apply-progress description states "this mem_save IS the T9.7 artifact sync" — meaning the author treated the final apply-progress save as fulfilling T9.7 implicitly. The Engram artifact has been updated (obs #807). However tasks.md still shows `[ ]`. This is a bookkeeping gap, not a functional gap — the artifact exists. Recommended: mark `[x]` with the Engram save timestamp before archive.

**W-02 — T9.8 Issue #278 close pending**
`T9.8` is `[ ]` — "requires PR8 to merge to main first." PR8 merged as `428e53de` on 2026-08-20. Issue #278 has not been closed yet (pending action). Recommended: close issue #278 linking the PR chain before archive.

**W-03 — T9.2 / T9.3 device verification pending**
Manual EAS/device passes required for wireframe conformance and native Alert.alert confirmation flows. Correctly marked `[ ]` — these are not CI-gated. Recorded for completeness; the design explicitly classifies these as Maestro/manual steps (design §3 seam 1, design §3 "confirmations" row). Recommend completing before production release.

**W-04 — Red evidence quality debt (PR4b and PR7)**
`PR4b` and `PR7` both record "RED evidence not captured for behavioral assertions" — the implementation was well-understood and only module-not-found errors were observed, not behavioral failures. The debt is documented inline in tasks.md. Not a correctness risk but a process deviation from Strict TDD protocol. Carry forward to the archive note.

### SUGGESTION

**S-01 — lucide-react-native exact pin**
`lucide-react-native` is pinned at exact `1.31.0` due to `.npmrc minimum-release-age=10080` quarantine. Comment in `package.json` and `tasks.md` documents the quarantine expiry date. Once newer versions (1.33.0+) clear the 7-day quarantine, widen to a caret range. (Noted in accepted debts.)

**S-02 — act() warnings**
Multiple suites emit `"overlapping act() calls"` and `"not configured to support act()"` warnings. Per design and the accepted-debts note, this is the codebase's established convention for async-state updates in RNTL. All tests pass despite the warnings. A future cleanup could wrap async state updates in `waitFor()` throughout, but it is out of scope for US-044.

### INFO (Known Accepted Debts — no action needed)

- **T7.3 RED evidence unproven** (behavioral RED line not captured; module-not-found was the RED class).
- **act() warnings** are a codebase-wide convention, not US-044-specific.
- **LoginScreen 40pt hitSlop** is a pre-existing finding, unrelated to this change.
- **lucide-react-native exact pin** — quarantine expiry ledger is in `package.json` and `tasks.md`.
- **`useFocusEffect` re-focus untestable via RNTL** — mount-fire is covered; re-focus is Maestro-only (design §3 seam 1).

---

## Verdict

**PASS WITH WARNINGS**

All 657 tests pass. tsc is clean. All MCFG/MCTG requirements have behavioral test coverage. Design decisions D-07, D-10, D-11, D-12, D-14, D-15, D-18 verified in source. Scope boundary upheld (zero api/web/schema changes). No CRITICAL findings.

Blocking items before archive: close issue #278 (W-02), mark T9.7 checkbox (W-01). Device verification T9.2/T9.3 should be documented before release.

