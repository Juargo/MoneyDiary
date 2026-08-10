# Tasks — US-003: Vista previa antes de confirmar la carga

- Slug: `us-003-vista-previa`
- Phase: TASKS (ordered implementation checklist — no code written here)
- Artifact store: hybrid (Engram `sdd/us-003-vista-previa/tasks` + this file)
- Reads: spec (`openspec/changes/us-003-vista-previa/spec.md`, PREV-01..06) +
  design (`openspec/changes/us-003-vista-previa/design.md`, §1-15)
- Delivery strategy: `ask-on-risk`. Chain strategy: **not yet chosen** — see
  Review Workload Forecast, decision required before `sdd-apply`.
- Strict TDD is ACTIVE. Every implementation task is preceded by its failing
  test task. Test runners: `pnpm api test` (Vitest), `pnpm web test` (Vitest +
  Testing Library, jsdom), `pnpm --filter @moneydiary/mobile test` (jest-expo +
  RNTL). **No integration test / no `ALLOW_DESTRUCTIVE_DB` gate anywhere in
  this change** — preview touches zero DB surface (design §11, D11).
- Language: tasks in English. Domain identifiers stay in Spanish (project
  convention).

Each task cites the requirement id(s) it satisfies (`PREV-01`..`PREV-06`).
`[test]` tasks must land RED before the paired `[impl]` task; `[review]` tasks
are reviewer-facing diff checks, not new code; `[verify]` tasks close a slice
by running the full relevant suite or a real-fixture DoD check.

---

## Slice 1 — Backend: `POST /api/ingestas/preview`

Depends on: — (first slice, defines the HTTP contract Slices 2 and 3 consume).
Sequential: use case before DTO, DTO before route, route before composition
wiring. T1.1-T1.2 (use case) must land before T1.3-T1.4 (DTO), which must land
before T1.5-T1.8 (route + composition).

- [x] **T1.1** `[test]` `preview-ingesta.use-case.spec.ts` — mocked
  collaborators, no DB (design §11.1):
  - Happy Excel: stub `ingest → {extension:'.xlsx'}`, detect/validate/normalize
    ok. Assert `Result.ok` with `banco`, `estructura.totalFilasDatos ===
    normalized.length`, `muestra` = first ≤50.
  - Happy PDF: stub `{extension:'.pdf'}`. Assert the **PDF trio** is invoked
    and the **Excel trio is NOT invoked** — this is the runtime guard against
    the D4 esPdf-branch divergence risk (design §4, §11.1).
  - Cap: normalize returns 120 rows → `muestra.length === 50`,
    `totalFilasDatos === 120`.
  - Each of the 8 error stages (extension / banco-no-reconocido /
    estructura-invalida / normalizacion-invalida / pdf-invalido /
    pdf-sin-texto / estructura-pdf-invalida / rango-fechas-invalido)
    propagates as `Result.fail(thatError)` and **no later collaborator is
    called**.
  - **CA-04 guarantee:** the STRONG guarantee is by construction (the
    constructor type signature accepts only the 7 no-write collaborators —
    `IngestFileUseCase`, `DetectBankUseCase`, `DetectPdfBankUseCase`,
    `ValidateStructureUseCase`, `ValidatePdfStructureUseCase`,
    `NormalizeTransactionsUseCase`, `NormalizePdfTransactionsUseCase` — no
    `accountRepository`/persist/dedupe/categorize collaborator exists to
    stub, so nothing is ever asked to `ensure()` an account) plus the e2e
    (`test/ingesta-preview.e2e-spec.ts`) proving zero DB writes against real
    Postgres. **Post-review hardening (2026-08-01):** a raw
    `PreviewIngestaUseCase.length === 7` arity assertion was replaced with a
    behavior-focused unit test asserting `execute()`'s result exposes
    exactly `{banco, estructura, muestra}` — arity alone is a gameable
    proxy (a regression could swap a read collaborator for a write one and
    keep the count at 7).
  - Defensive catch (D9): a collaborator throws → `Result.fail` with a
    `PersistenciaFallidaError`, a fixed preview-specific message, **no raw
    amount interpolated**, and the original cause preserved separately.
  (PREV-01, PREV-02, PREV-03, PREV-04)
- [x] **T1.2** `[impl]` `application/use-cases/preview-ingesta.use-case.ts` —
  `PreviewIngestaUseCase` (constructor takes exactly the 7 collaborators from
  T1.1, **no repository/persistence port**), `PreviewIngestaResult` read
  model, `PreviewIngestaError` union, `PREVIEW_SAMPLE_MAX = 50`. The `execute`
  body implements the design §3.3 seam
  `ingest → esPdf branch → detect → validate → normalize → slice(0, 50)` —
  **no `accountRepository.ensure()` call between detect and validate** (design
  §3.2). The `esPdf` trio-selection branch (predicate + both pairs) MUST be
  copied **verbatim** from `ProcessIngestaUseCase.runPipeline`
  (process-ingesta.use-case.ts:147) — same predicate, same trio pairs, no
  reordering (design §4, D4). `totalFilasDatos` = normalized
  `transacciones.length` uniformly for Excel and PDF (design §5.1, D5) — the
  validate result value is discarded, validate only runs for its error
  side-effects. (PREV-01, PREV-02)
- [x] **T1.2a** `[review]` Reviewer diff check: place
  `preview-ingesta.use-case.ts`'s `esPdf` branch side-by-side with
  `process-ingesta.use-case.ts:147-163` and confirm the predicate
  (`archivo.extension === '.pdf'`) and both trio pairs
  (`DetectBank`↔`DetectPdfBank`, `ValidateStructure`↔`ValidatePdfStructure`,
  `NormalizeTransactions`↔`NormalizePdfTransactions`) are byte-for-byte
  identical, and that `accountRepository.ensure()` (line 163) has no
  counterpart anywhere in the preview file. Record this check explicitly in
  the PR description — a silent divergence here makes preview **lie** about
  what confirm will do (design §4). (PREV-01, PREV-02)
- [x] **T1.3** `[test]` `preview-ingesta.dto.spec.ts` — `aPreviewIngestaDto`
  maps a `PreviewIngestaResult` to `PreviewIngestaDto`: `cargo`/`abono` via
  `String(...)` (never a JSON number), `fecha` via `.toISOString()`,
  `estructura.totalFilasDatos`, and `banco`/`tipoCuenta`/`numeroCuenta` copied
  from `DetectedBank`; the DTO does **not** re-slice `muestra` (design §5.2,
  D8 — the cap is a use-case decision, the DTO trusts what it receives).
  (PREV-01, PREV-04)
- [x] **T1.4** `[impl]`
  `infrastructure/http/dto/preview-ingesta.dto.ts` — `PreviewTransaccionDto`,
  `PreviewIngestaDto`, `aPreviewIngestaDto` per design §5.2. Deliberately does
  **not** import from or edit `ingesta-response.dto.ts` (D7 — confirm's
  response DTO stays untouched, honoring the proposal's "confirm unchanged"
  lock). (PREV-01, PREV-04)
- [x] **T1.5** `[test]` Route-level test for `POST /api/ingestas/preview`
  (stubbed `previewIngesta` use case, no DB): 200 with `PreviewIngestaDto`
  shape on `Result.ok`; 400 on a representative validation error (proves
  `aHttpError` reuse — same mapper as confirm, design §6); missing `file`
  field → 400; multer 10 MB limit → 400; a thrown error /
  `PersistenciaFallidaError` → 500. (PREV-01, PREV-03, PREV-04)
- [x] **T1.6** `[impl]`
  `infrastructure/http-express/routes/ingesta.routes.ts` — add the
  `POST /ingestas/preview` handler (design §8): reuses `subirArchivo()` for
  the multipart gate and `MulterFileReaderAdapter`, calls
  `deps.previewIngesta.execute({ fileReader })` (no `userId` forwarded — the
  input type has none, design §3.3), maps failures through the existing
  `aHttpError`. `IngestaRoutesDeps` gains a 4th field:
  `previewIngesta: PreviewIngestaUseCase`. The existing `POST /ingestas`,
  `GET /ingestas`, `DELETE /ingestas/:id` handlers are **untouched** (PREV-05
  — confirm stays the existing, unmodified endpoint). (PREV-01, PREV-03,
  PREV-05)
- [x] **T1.7** `[impl]` `composition/crear-preview-ingesta.ts` (new) —
  `crearPreviewIngesta()` factory, **no arguments** (no `prisma`, no
  `crypto` — design §7.1, the composition-level echo of "this graph cannot
  reach the database"), wiring the same 7 no-write collaborators as
  `crearProcessIngesta` minus every write-capable one. (PREV-02)
- [x] **T1.8** `[impl]` `composition/container.ts` +
  `infrastructure/http-express/app.ts` — add
  `readonly previewIngesta: PreviewIngestaUseCase` to the `Container`
  interface and `createContainer` (constructed via `crearPreviewIngesta()`,
  needs neither `prisma` nor the shared `crypto` instance); add
  `previewIngesta: container.previewIngesta` to the
  `registrarIngestas(protectedApi, { ... })` deps object in `app.ts` — mounted
  on the **same `protectedApi` router**, behind
  `apiKey → session → error` (design §7.2, §8, D2). (PREV-01, PREV-05)
- [x] **T1.9** `[verify]` `pnpm api test` full suite green + `pnpm api exec
  tsc --noEmit` clean. Confirm the existing `POST /api/ingestas`,
  `GET /api/ingestas`, and `DELETE /api/ingestas/:id` flows and their tests
  are unaffected by the `IngestaRoutesDeps` 4th-field addition. (PREV-05)
- [x] **T1.10** `[verify]` Real-fixture DoD check (local dev server, no unit
  mocks): `POST` a real `.xlsx` fixture (e.g.
  `test/fixtures/movimientos-test.xlsx`) and a real `.pdf` fixture (e.g.
  `test/fixtures/pdf/bancochile-cartola-test.pdf`) to
  `/api/ingestas/preview` → assert 200, correct `banco`, plausible
  `totalFilasDatos`, `muestra` ≤50 with string `cargo`/`abono` — then query
  the DB (or re-run `GET /api/ingestas`) to confirm **zero** new `Account`,
  `Ingesta`, or `Transaccion` rows exist from either call (PREV-01, PREV-02).

## Slice 2 — Web: two-phase preview UI (`SubirCartola.tsx`)

Depends on: **Slice 1** (consumes `POST /api/ingestas/preview`'s DTO shape).
Sequential: types before client, client before hook, hook before components,
components before the `SubirCartola` reorder.

- [x] **T2.1** `[impl]` `apps/web/src/api/types.ts` — add
  `PreviewTransaccionDto` and `PreviewIngestaDto` (hand-written mirror of the
  backend DTO, `readonly` fields, money as `string`, ADR-011/012 client-DTO
  convention). (PREV-01, PREV-04)
- [x] **T2.2** `[test]` `client` tests for `previewIngesta`: `esPreviewIngestaDto`
  type-guard (rejects a numeric `cargo`/`abono`, missing `banco`, missing
  `totalFilasDatos`); status mapping 400 → `invalid` (with backend message),
  401 → `unauthorized`, malformed body → `parse`; never throws — mirrors
  `esIngestaResponseDto`'s test pattern. (PREV-03, PREV-04)
- [x] **T2.3** `[impl]` `apps/web/src/api/client.ts` — add
  `previewIngesta(file: File): Promise<ApiResult<PreviewIngestaDto>>`, a
  faithful mirror of `postIngesta`'s transport (same-origin multipart POST to
  `/api/ingestas/preview`, never throws, same status-mapping conventions).
  (PREV-01, PREV-03, PREV-04)
- [x] **T2.4** `[test]` `use-preview-ingesta` test: `useMutation` unwraps a
  successful `ApiResult` or throws the tagged `ApiError`, same pattern as
  `useIngesta`; assert **no cache invalidation** happens in `onSuccess` (D10 —
  the hook-level echo of CA-04, preview mutates nothing). (PREV-02)
- [x] **T2.5** `[impl]` `apps/web/src/api/use-preview-ingesta.ts` —
  `usePreviewIngesta()` per design §9.4. No `onSuccess` cache invalidation.
  (PREV-02)
- [x] **T2.6** `[test]` `PreviewMuestra` component test — presentational
  sample table + selector: renders `banco`, `totalFilasDatos`, and sample rows
  formatted via `formatearMontoCLP` over the string amounts; changing the
  10/25/50 selector re-slices the **same in-memory** `muestra` with **no new
  HTTP call**; selecting 25 on a 12-row sample shows all 12 rows with no
  padding or error (PREV-06). (PREV-01, PREV-06)
- [x] **T2.7** `[impl]` `apps/web/src/components/PreviewMuestra.tsx` (new,
  SRP per design §9.4) — `(muestra, banco, totalFilasDatos, cantidad,
  onCantidadChange)`, default 10, real `<button>`-driven selector with an
  associated `<label>`. (PREV-01, PREV-06)
- [x] **T2.8** `[test]` `SubirCartola` component test — full two-phase state
  machine (design §9.1): a valid pick automatically fires the preview
  mutation; on success the preview panel renders (`PreviewMuestra` content);
  the file picker is **gated** (disabled/hidden) once `preview-listo`;
  **Confirmar** re-uploads the **same held `File`** via
  `useIngesta.mutate` → the existing success summary; **Cancelar** returns to
  `idle`, re-enables the picker, and asserts **`useIngesta` is never called**
  (CA-04 at the UI layer); a failed preview shows the scrubbed message and
  allows re-picking; a11y: on `preview-listo`, focus moves to the preview
  heading and the `aria-live="polite"` region announces the ready message
  (design §9.4). (PREV-01, PREV-02, PREV-03, PREV-04, PREV-05, PREV-06)
- [x] **T2.9** `[impl]` `apps/web/src/components/SubirCartola.tsx` — reorder
  to the design §9.1 state machine (`idle → previsualizando → preview-listo
  ↔ subiendo → exito` / `preview-error`), wiring `usePreviewIngesta` before
  the existing `useIngesta`; file-picker gating (§9.2); focus + live-region
  a11y per §9.4. (PREV-01, PREV-02, PREV-03, PREV-04, PREV-05, PREV-06)
- [x] **T2.10** `[verify]` `pnpm web test` + `pnpm web typecheck` + `pnpm web
  build` green.
- [x] **T2.11** `[verify]` Real-fixture DoD check end-to-end in the browser
  (local dev server): upload a real fixture via `/subir` → preview panel
  shows the correct `banco`/sample/count → move the 10/25/50 selector and
  confirm via devtools no network request fires → click **Confirmar** →
  final import summary and the row exists in `/ingestas` → repeat with
  **Cancelar** instead and confirm nothing was persisted.

## Slice 3 — Mobile: two-phase preview UI (`subir.tsx`) — greenfield

Depends on: **Slice 1** (consumes the same DTO shape as Slice 2; independent
of Slice 2's web implementation). This is the heaviest slice (design §10,
§14) — mobile has no per-row preview today. Sequential: client before
view-model, view-model before screen wiring.

- [x] **T3.1** `[test]` `preview-ingesta` client test
  (`apps/mobile/src/api/preview-ingesta.spec.ts`) — mirrors
  `post-ingesta.ts`'s transport tests exactly: RN `Blob` file-part via
  `expo-file-system` `File` (the new-architecture requirement fixed in
  US-033, commit 041da28), `construirHeadersSesion()` applied, never-throws
  discipline, status mapping (200/400/401/network/parse →
  `PreviewIngestaError` union shaped like `PostIngestaError`), and — unlike
  `post-ingesta.ts`'s skip of `transacciones` — a shape guard on `muestra`
  rows asserting `cargo`/`abono` are strings (mobile renders per-row money).
  (PREV-01, PREV-03, PREV-04)
- [x] **T3.2** `[impl]` `apps/mobile/src/api/preview-ingesta.ts` (new) —
  `previewIngesta(asset): Promise<PreviewIngestaResult>` per design §10.2;
  hand-written `PreviewIngestaDto`/`PreviewTransaccionDto` mirror types.
  (PREV-01, PREV-03, PREV-04)
- [x] **T3.3** `[test]` `preview-cartola` view-model test
  (`apps/mobile/src/domain/preview-cartola.spec.ts`, pure, no RN import) —
  `sliceMuestra(muestra, cantidad)` for 10/25/50 including the
  smaller-than-selected case (12-row sample, selector 25 → all 12, no
  padding); `formatearFilaPreview(row)` formats CLP over the **string**
  amount via the existing mobile money formatter, never parsing to `number`.
  (PREV-06)
- [x] **T3.4** `[impl]` `apps/mobile/src/domain/preview-cartola.ts` (new) —
  pure functions only, no ports (mirrors the SOLID-skill note that mobile
  domain is pure functions, design §10.2). (PREV-06)
- [x] **T3.5** `[test]` `subir.tsx` test (jest-expo + RNTL) — the design
  §10.1 state machine: picking a file transitions through `previsualizando`
  to `preview` and renders the per-row list + banco header +
  `totalFilasDatos` + 10/25/50 selector; **Confirmar** re-posts the **held**
  `DocumentPickerAsset` via the existing `postIngesta` → `exito`;
  **Cancelar** → `idle` and asserts **`postIngesta` is never called** (CA-04
  at the UI layer, structural via the held-asset guarantee, design §10.1);
  a11y: `AccessibilityInfo.announceForAccessibility` fires on
  preview-ready/éxito/error, sample container carries
  `accessibilityLiveRegion="polite"`, each row exposes one coherent
  accessibility label, and the selector `Pressable`s expose
  `accessibilityState={{ selected }}` (design §10.3). (PREV-01, PREV-02,
  PREV-03, PREV-04, PREV-05, PREV-06)
- [x] **T3.6** `[impl]` `apps/mobile/app/subir.tsx` (edit) — the design
  §10.1 state machine, per-row sample list (inline or a small
  `MuestraCartola` component), 10/25/50 selector, Confirmar/Cancelar
  `Pressable`s, and the §10.3 a11y wiring. (PREV-01, PREV-02, PREV-03,
  PREV-04, PREV-05, PREV-06)
- [x] **T3.7** `[verify]` `pnpm --filter @moneydiary/mobile test` green.
  (24/24 `subir.spec.tsx`, 173/173 mobile workspace total; `tsc --noEmit`
  clean.)
- [x] **T3.8** `[verify]` Real-fixture DoD check on-device/Expo dev client
  (Maestro manual, non-CI per ADR-017): pick a real `.xlsx` and a real `.pdf`
  fixture → preview list renders correctly for both → selector changes
  render instantly with no network activity → **Confirmar** imports for
  real → **Cancelar** aborts cleanly and the picker is available again;
  spot-check VoiceOver/TalkBack announces the preview-ready message
  (ADR-018). **NOT run by sdd-apply** — requires a physical device/Expo dev
  client and manual Maestro flows per ADR-017 (never CI); left as an
  explicit manual follow-up before merging this slice's PR.

---

## Cross-slice dependency summary

```
Slice 1 (backend contract: POST /api/ingestas/preview)
 ├─→ Slice 2 (web: two-phase SubirCartola, consumes Slice 1's DTO)
 └─→ Slice 3 (mobile: two-phase subir.tsx, consumes Slice 1's DTO — greenfield)
```

Slices 2 and 3 are **independent of each other** (different apps, no shared
files) and can proceed in parallel once Slice 1's DTO shape is stable — unlike
US-018, where the web slice was strictly sequential after the backend slice
alone. Both still strictly need Slice 1 first: the DTO shape (§5.2 of the
design) is locked there and neither client can be honestly implemented against
a guess.

---

## Review Workload Forecast

Rough `additions + deletions` estimate per slice (impl + tests). Planning
estimates, not measured diffs — re-check with `git diff --stat` once each
slice is implemented.

| Slice | Est. changed lines | 400-line budget risk | Notes |
|-------|--------------------:|-----------------------|-------|
| Slice 1 — backend (use case + spec, DTO + spec, route handler + route test, factory, container/app wiring) | ~470-520 | **High** | No DB/integration test (unlike US-018) keeps it leaner than a typical vertical slice, but the use-case spec alone is large (8 error-stage cases + the CA-04 structural test + the D9 defensive-catch test). |
| Slice 2 — web (types, client fn + test, hook + test, `PreviewMuestra` + test, `SubirCartola` reorder + a large component test covering the full state machine) | ~450-520 | **High** | The `SubirCartola` component test covering preview→confirm/cancel→a11y in one file is the bulk; consider splitting that spec file by scenario group if it grows past ~200 lines to ease review. |
| Slice 3 — mobile (client + test, pure view-model + test, `subir.tsx` greenfield two-phase + a11y + test) | ~520-600 | **High** | Heaviest slice, confirmed by the design (§10, §14): mobile had zero per-row preview before this change, so `subir.tsx` and its test are the largest single files in the whole change. |
| **Total** | **~1440-1640** | — | Combined change is well above the 400-line single-PR budget; each slice is *individually* at or above budget too (unlike US-018, where Slice 1 was the only borderline one). |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High (all three slices)
```

**Chained PRs recommended: Yes — 3 PRs, matching the design's own slicing
(§14).** Each slice is independently at-or-above the 400-line review budget,
so folding any two together compounds an already-high individual risk. Slice
1 additionally carries the one correctness-critical guarantee of this change
(CA-04, compile-time no-write construction) and benefits from an isolated,
focused review before either client consumes its contract.

**Decision needed before apply: Yes** (per `ask-on-risk`). Ask the user which
chain strategy to use:

- **`stacked-to-main`**: Slice 1 merges to `main` first (backend-only,
  purely additive — a new endpoint, no existing route behavior changes),
  then Slices 2 and 3 each target `main` independently and can merge in
  either order (they do not depend on each other). Matches this change's
  dependency shape well: Slice 1 is a complete, safe, additive capability on
  its own even with no client consuming it yet.
- **`feature-branch-chain`**: a tracker branch for `us-003-vista-previa`,
  Slice 1 PR targets the tracker, Slices 2/3 PRs each target Slice 1's
  branch, tracker merges to `main` once all three land. Gives rollback
  control if either client slice needs rework before public release, at the
  cost of two sibling branches both depending on Slice 1's branch rather than
  `main`.

Recommendation leans **`stacked-to-main`**, for the same reason as US-018:
no schema migration, and Slice 1 alone is a safe, additive, fully-functional
backend capability that can sit on `main` before either client UI exists —
nothing intermediate is broken or inconsistent. The one difference from
US-018 is that Slices 2 and 3 are siblings, not a single follow-on — under
`stacked-to-main` they can land in any order or in parallel.

Note: the mobile slice (Slice 3) is per the design (§10) the heaviest and a
"candidate for its own PR" independent of scheduling — this forecast confirms
that recommendation with concrete line estimates.

---

## Requirement coverage check

- PREV-01 (preview endpoint, bank-detected canonical sample, no persistence
  by construction): T1.1, T1.2, T1.4, T1.5, T1.6, T1.8, T1.10, T2.3, T2.6-T2.9,
  T2.11, T3.2, T3.5, T3.6, T3.8.
- PREV-02 (preview persists nothing, success or failure): T1.1, T1.2, T1.7,
  T1.10, T2.4, T2.5, T2.8, T2.9, T3.1, T3.5, T3.6.
- PREV-03 (shared 400 error contract with confirm): T1.1, T1.5, T1.6, T2.2,
  T2.3, T2.8, T2.9, T3.1, T3.2, T3.5, T3.6.
- PREV-04 (no raw-amount leak, BigInt-safe strings): T1.1, T1.3, T1.4, T1.5,
  T2.1, T2.2, T2.3, T2.8, T2.9, T3.1, T3.2, T3.5, T3.6.
- PREV-05 (confirm is the existing, unchanged `POST /api/ingestas`): T1.6,
  T1.9, T2.8, T2.9, T2.11, T3.5, T3.6, T3.8.
- PREV-06 (client-side 10/25/50 selector, no re-request): T2.6, T2.7, T2.8,
  T2.9, T2.11, T3.3, T3.4, T3.5, T3.6, T3.8.

All 6 requirements covered by at least one test task and one impl task per
affected slice.
</content>
