# Proposal: Correction path for committed manual movements

> SDD change `correccion-movimientos-manuales` — propose phase (2026-08-29).
> Canonical copy also in Engram: `sdd/correccion-movimientos-manuales/proposal`.
> Input: `explore.md` (same directory) / `sdd/correccion-movimientos-manuales/explore`.
>
> **Language note:** this proposal is in English per the SDD artifact convention. The
> embedded ADR draft (§6) is in **Spanish**, because `docs/adr/` is unambiguously a
> Spanish corpus (ADR-001…ADR-039) and this ADR extends it. Mixing languages inside
> `docs/adr/` would be the drift, not the compliance.

**Working US name:** *Eliminar un movimiento manual registrado por error* (descriptive;
the GitHub issue and its global sequential number get created at delivery time, per the
house convention that US state lives in Issues, not in prose).

---

## 1. Why

**The product currently tells the user, in writing, that their mistake is permanent.**
`apps/web/src/components/RegistrarMovimientoForm.tsx:55-56` hardcodes:

> "Un movimiento registrado no se puede editar ni eliminar después; su categoría sí puede
> reclasificarse desde el dashboard."

That sentence is rendered **twice** (an always-visible `role="note"` at line 625 and again
inside the confirmation dialog at line 706). It was an honest description of US-058's
shipped scope — and it is also the clearest possible statement of the defect. A user who
types `450000` instead of `45000` in a manual movement has **no path back**. The wrong
number is now inside the 50/30/20 semáforo, the monthly resumen and the annual grid,
permanently, and the app has told them so.

Three things make this worth doing now rather than deferring again:

1. **It is the last deferral.** The Impeccable critique rounds r8/r9 (P2) raised
   undo/correction, and the product owner deferred it each time as *"a future US with its
   own ADR."* This change is that US. Deferring a fourth time without new evidence would
   turn a considered deferral into an unowned defect.
2. **The permanence promise is load-bearing UX debt.** The copy exists precisely because
   the capability doesn't. Every sprint it stays, it teaches the user to distrust the
   manual-entry form — the very form US-058 shipped to make the phone-to-dashboard loop
   complete. Error *prevention* (the confirm dialog) was the correct first move; it is not
   a substitute for error *recovery*.
3. **The cost has already been paid, structurally.** ADR-039 made a manual row
   identifiable in the data itself (`origen='Manual'`, enforced by the
   `Transaccion_origen_ingesta_consistency` CHECK). `Transaccion` is a leaf node — no
   cascade. Every reader recomputes per request — no cache, no invalidation, no
   denormalized total to fix up. The deletion this change proposes is, at the persistence
   layer, a single scoped `deleteMany` whose blast radius is provably one row.

**What success looks like:** a user who mistypes a manual movement can remove it from the
same screen where they see it, in two clicks, and watch the semáforo return to the truth —
without contacting anyone, without a migration, and without the app ever having lied to
them about what it can do.

---

## 2. The decision this change actually makes

The engineering question ("can we delete a row?") is trivial. The **product** question is
durable and will be re-asked every sprint, so it gets stated as a rule rather than as a
list of exceptions — following the ADR-038 precedent that replaced a growing exception
list with an enunciable frontier:

> **Provenance determines mutability. What the user typed, the user can undo. What a
> cartola produced belongs to the bank's record and is never edited or deleted
> individually.**

This rule answers, in advance and with a reason, the four questions that would otherwise
arrive one at a time: *can I delete a bank movement?* (no — the cartola is the source of
truth; delete the whole ingesta and re-upload, which already exists). *Can I edit a manual
amount?* (a separate, later slice — see §4). *Can I delete from the phone?* (not until the
phone can also create — see §3c). *Is there a time limit?* (no — see §3b).

---

## 3. Decisions

### (a) Delete-only in v1; edit is a separate, later slice — **DELETE ONLY**

This change ships **hard delete of `origen='Manual'` rows** (exploration option 1). Edit
(`PATCH` of `monto`/`fecha`/`descripcion`, option 3) is **deferred with a registered
trigger**, not abandoned.

*Rationale.* Delete already restores **100 %** of the user's ability to correct a wrong
manual movement — delete and re-register produces exactly the correct end state, just with
more typing. Edit buys **ergonomics**, not capability. Against that marginal gain, edit
carries the single heaviest risk profile in the backlog: it would be the **first
post-persist mutation of a money field anywhere in this codebase**, which under ADR-024 and
the plan de pruebas ("dinero con tipos exactos, nunca float"; unit-level rigor on rounding,
decimals and sign) demands creation-grade validation — the entire
`MovimientoManualInvalidoError` / `CategoriaFueraDeCatalogoError` /
`BucketCategoriaNoConcuerdaError` surface reopened, plus a partial-update schema and a new
response DTO. Delete, by contrast, is a near-verbatim mirror of `EliminarIngesta` — a
pattern already hardened through multiple review rounds (`RNF-SEC-006` scoping, the
`deleteMany`-count-as-ownership-gate anti-enumeration idiom). The exploration is explicit
that the two are **separable, independently shippable slices**; shipping the low-risk one
that removes the lie from the UI, and letting real usage tell us whether the ergonomic gap
hurts, is the house's own sanctioned pattern (`yagni`: *mínimo hoy + deuda registrada con
gatillo explícito*). Bundling them would put the riskiest money-mutation in the repo behind
the same review gate as its cheapest, most obviously-correct sibling.

**Registered trigger for edit:** ship it when either (i) users report delete-and-retype as
the dominant correction flow with friction, or (ii) a movement gains a dependent artifact
(attachment, note, split) that makes delete lossy rather than merely inconvenient.

### (b) Unrestricted deletion, **no time box** — **UNRESTRICTED**

Any `origen='Manual'` row owned by the session user is deletable at any time. No undo
window, no expiry, no soft delete, no audit table.

*Rationale.* The exploration establishes that a time-boxed delete is not a distinct
engineering approach — it is option 1 plus either a client timer or new server-side expiry
state. So the only reason to build it would be a **business** reason, and there is none
available: a manual row has no external source of truth to reconcile against (that is
precisely what makes it manual), MoneyDiary has no concept of a closed accounting period
(readers take a `periodo` parameter; nothing locks), and it is mono-user with no compliance
regime imposing an audit obligation (ADR-023). A window would therefore invent a rule to
protect against a hypothetical, and would do real harm in the common case: the user who
notices the fat-finger *tomorrow, in the semáforo* — the single most likely discovery
moment — is exactly the user a window strands. There is also a consistency argument:
`DELETE /api/ingestas/:id` already destroys **hundreds** of rows with no window and no
audit trail; adding a window to the single-row, self-authored case would be strictly
inconsistent with the more destructive capability that shipped first. Friction is already
provided by the mandatory confirmation dialog (the `InlineConfirm` idiom, per ADR-038's
"confirmación obligatoria antes de una acción destructiva").

**Registered trigger for revisiting:** MoneyDiary becomes multi-user with shared data, or
an accounting/compliance obligation appears. Either would make soft-delete + audit trail
the correct design — and either would be a larger decision than this one.

### (c) Web-only in v1 — **WEB ONLY**

The delete affordance ships on web. Mobile keeps rendering manual movements read-only, with
no correction affordance and **no ADR-038 amendment**.

*Rationale.* Mobile has **no movement-creation surface at all** — ADR-038 rule 2 draws the
frontier at "lo propio del usuario y cómo se lee su dinero", and transactions sit outside
it; there is no manual-entry form in `apps/mobile`. Shipping delete-without-create on
mobile would produce an asymmetry that is *worse than the current gap*: the user could
**destroy** on the phone what they can only **recreate** on the desktop. A see-but-can't-fix
gap is mildly frustrating; a destroy-but-can't-rebuild gap is a trap. Second, the
correction affordance's natural home is beside the creation affordance whose promise it
changes — `MENSAJE_PERMANENCIA` lives in the web form, and the copy fix and the capability
must land together or the UI actively lies (§5). Keeping mobile out therefore **reaffirms**
ADR-038's frontier rather than amending it, which is the cheaper and more honest ADR (see
§6 and the note in §8 on the framing correction).

**Registered trigger for mobile parity:** mobile gains movement registration. At that point
create + correct are decided together as one coherent write surface, which is exactly the
shape ADR-038 rule 6 asks for ("la frontera se amplía por ADR, nunca por PR").

### (d) The ADR — **ADR-040, amending ADR-039, reaffirming ADR-038**

Number **040 verified free** (`docs/adr/` currently ends at ADR-039; ADR-040 is unused).
Proposed slug: `docs/adr/ADR-040-correccion-de-movimientos-manuales.md`.
Full draft text in **§6**.

*Rationale for the amendment target.* The ADR the house pattern actually calls for here
**amends ADR-039**, not ADR-038. ADR-039 introduced the manual `Transaccion` as a new
species of row but said nothing about its lifecycle after creation — a silence that US-058
turned into a shipped product promise of permanence. ADR-040 fills that silence: the manual
row gains a lifecycle. ADR-038's rule 2 is explicitly **mobile-scoped** (its rule 6 says
"una escritura **mobile** que no encaje en la regla 2 exige un ADR propio"), so a web-only
capability does not cross it; decision (c) keeps mobile out, which reaffirms that frontier
rather than superseding it. The ADR says so explicitly so the next reader does not have to
re-derive it. This is a deliberate deviation from the framing in this phase's brief — see
§8.

---

## 4. Scope

### In scope

**Backend (`apps/api`)**
- New ISP-narrow port for the delete writer (`application/ports/`), one thin
  demo-gate-first use case, one Prisma repository, mirroring the `EliminarIngesta` triad.
- `DELETE /api/movimientos/:id` as a **sibling handler** in
  `infrastructure/http-express/routes/movimientos.routes.ts` — the established D-12/T-19
  pattern already used by `registrarMovimientos` / `registrarMovimientoManual` in that file.
- Persistence gate: `deleteMany({ where: { id, origen: 'Manual', account: { userId } } })`
  — a single statement, no `$transaction` (leaf row, no cascade). The `origen: 'Manual'`
  clause is what makes the scoping airtight against cartola-derived rows, backed by the
  ADR-039 CHECK.
- **Demo gate before touching the writer**, matching `EliminarIngestaUseCase` /
  `EliminarCategoriaUseCase`; a demo session never reaches persistence. A fourth
  `*DemoSoloLecturaError` sibling follows the existing per-domain naming
  (`ingesta-` / `perfil-` / `catalogo-`).
- Reuse `TransaccionNoEncontradaError` as-is for the merged 404.
- Zod schema + `pnpm openapi:emit` regeneration in the same PR (ADR-011; CI `openapi:check`
  blocks on drift).

**Web (`apps/web`)**
- Hand-written client fn in `src/api/movimientos.ts`, following `postMovimientoManual`'s
  exact `ApiResult` / response-guard shape (no generated client — ADR-012 stays deferred).
- A per-row delete control mirroring `EliminarIngestaControl` (destructive `InlineConfirm`,
  per-row `aria-label`, error stays open in the dialog for retry, success announced by the
  parent list because the control unmounts with its row). `ReclasificarCategoriaControl`
  diverges on error handling — read both before choosing, per the exploration.
- **Rewrite `MENSAJE_PERMANENCIA` at both render sites** (lines 625 and 706) — mandatory,
  same slice (§5).
- The affordance appears on **every surface that lists a manual movement**, and **only on
  manual rows**: `IngresosMesTable` (which already badges `origen`) *and* the gasto side
  (`BucketDetalleMesPage` / `GrupoMovimientos`). The exploration flags that the origen
  signal's survival through `detalle-bucket-mes.dto.ts` → `detalle-bucket-mes-view-model.ts`
  is **UNCONFIRMED** — verifying it is design work, and **plumbing it through if absent is
  in scope**. Shipping delete on incomes but not on expenses would be an inexplicable half
  capability ("why can I remove this manual income but not this manual grocery run?"), and
  a fat-fingered expense is at least as likely as a fat-fingered income.

**Docs**
- `docs/adr/ADR-040-correccion-de-movimientos-manuales.md` (§6), plus the ADR-040 row and
  the ADR-039 amendment note in `docs/adr/README.md` — following the house index convention
  visible on the ADR-026/038/039 rows.

### Out of scope (deferred, each with a trigger)

| Deferred | Why | Trigger to revisit |
|---|---|---|
| **Edit of manual movements** (`monto`/`fecha`/`descripcion`) | First post-persist money mutation; creation-grade validation rigor (§3a) | Delete-and-retype reported as high-friction, **or** a movement gains a dependent artifact |
| **Any correction of ingesta-born rows** | Out **by rule**, not by cost — the cartola is the source of truth (§2). The existing path is delete the ingesta and re-upload | Permanent; would require superseding the ADR-040 rule itself |
| **Mobile delete** | No movement-creation surface on mobile; destroy-without-rebuild is a trap (§3c) | Mobile gains movement registration |
| **Undo window / soft delete / audit trail** | No business rule requires it; inconsistent with unrestricted ingesta delete (§3b) | Multi-user, or a compliance/accounting obligation |
| **Bulk delete of manual movements** | No evidence of volume; per-row confirm is the safe default | Users report deleting manual rows in batches |
| **Exposing `origen` as a first-class wire field on every reader** | ADR-039 deliberately kept `origen` as DB provenance, not a wire field | Only if the gasto-side signal turns out to need it (design decides) |

---

## 5. Impact

**The copy fix is a correctness requirement, not polish.** `MENSAJE_PERMANENCIA` is
rendered at two sites from one constant. The moment `DELETE /api/movimientos/:id` ships,
that sentence is **factually false** and the app is lying to the user at the exact moment
it asks them to commit. Both render sites must change in the same PR as the capability.
The replacement copy must stay in the house's calm register — it should state what is true
(a manual movement can be removed later; a movement from a cartola cannot) rather than
inviting carelessness. Pinning the string in a unit test (the ADR-038 mitigation for copy
drift) keeps a future divergence intentional and reviewable.

**Blast radius is provably small.** `Transaccion` is a leaf — no `onDelete: Cascade`
anywhere pointing away from it. No cache layer exists in `apps/api/src`; the resumen,
semáforo, detalle-bucket, movimientos-mes, ingresos-mes and resumen-anual readers all query
fresh per request, so the corrected numbers appear on the next read with **zero
invalidation logic and zero reader changes** — the same "cero cambios en los 5 readers"
property ADR-039 established.

**Security posture is inherited, not invented.** `RNF-SEC-006` isolation via
`account: { userId }` in the WHERE (never in memory); anti-enumeration via the
`deleteMany` count as the ownership gate. **A deletion attempt against a cartola-born row
must return the same merged 404 as a non-existent or foreign row** — never a distinct "this
row is not manual" error, which would be a provenance oracle. Demo sessions stay read-only,
gated before persistence. No new credential, no new PII, no migration, no schema change:
ADR-039 already shipped everything needed to identify a manual row.

**Contract.** ADR-011 requires the Zod schema + `openapi:emit` in the same PR or CI fails.
No generated client to regenerate (ADR-012 deferred). Route-level error translation should
go through the `responderErrorTraducido` chokepoint used by `DELETE /ingestas/:id`
(issue #507).

**Rollback.** Revert the route + control; the data model is untouched, so nothing becomes
inaccessible and no down-migration exists to get wrong.

**Sizing.** Small — one backend triad + one route + one web control + copy + openapi regen.
Well inside a single PR under the 400-line review budget; no chained-PR split anticipated.

---

## 6. Draft ADR — `docs/adr/ADR-040-correccion-de-movimientos-manuales.md`

> **Draft.** Per the house convention (`docs/adr/README.md` — "se revisan en el PR que las
> implementa"), this file lands in the implementing PR, not in the propose phase. Text is
> in Spanish to match the `docs/adr/` corpus.

```markdown
---
tags:
  - adr
  - fase-diseño
  - movimientos
  - producto
proyecto: MoneyDiary
estado: 🔵 Propuesto
fecha_creacion: 2026-08-29
fecha_actualizacion: 2026-08-29
---

# ADR-040 — Corrección de movimientos: la proveniencia determina la mutabilidad

## Estado

🔵 **Propuesto** (2026-08-29, change SDD `correccion-movimientos-manuales`).

> [!info] Relación con ADR-039
> Este ADR **enmienda ADR-039** en una omisión de ciclo de vida: ADR-039 introdujo la
> `Transaccion` manual (`origen='Manual'`, cuenta centinela per-user, CHECK de paridad)
> pero no dijo nada sobre qué pasa con esa fila **después** de creada. US-058 convirtió ese
> silencio en una promesa de producto explícita en la UI: *"Un movimiento registrado no se
> puede editar ni eliminar después"*. Este ADR llena el silencio: el movimiento manual gana
> un ciclo de vida — su autor puede eliminarlo. Todo lo demás de ADR-039 (columna `origen`,
> semántica C-a, cuenta centinela, CHECK, inmunidad al borrado de ingesta) sigue **vigente
> sin cambios**.
>
> Se sigue el mismo patrón de enmienda que ADR-039 → ADR-026 y ADR-038 → ADR-026: el ADR
> viejo **no se edita**; la relación se declara acá y el índice agrega la nota.

> [!info] Relación con ADR-038 — **reafirmación, no enmienda**
> ADR-038 regla 2 fija la frontera de escritura **de mobile** ("lo propio del usuario y cómo
> se lee su dinero entra; las transacciones no"), y su regla 6 lo dice sin ambigüedad:
> *"una escritura **mobile** que no encaje en la regla 2 exige un ADR propio"*. La capacidad
> que decide este ADR es **solo web**, así que no cruza esa frontera. La decisión de dejar
> mobile afuera (ver Decisión, regla 5) **reafirma** ADR-038 y no lo supersede. Se deja
> escrito para que el próximo lector no tenga que re-derivarlo.

---

## Contexto

US-058 (ADR-039) habilitó registrar un movimiento a mano, sin cartola. El diseño resolvió
la **creación** con cuidado — validación de monto exacto, fecha ≤ hoy, membresía de
categoría, CHECK de paridad en la BD — y resolvió el riesgo de error del usuario por
**prevención**: un diálogo de confirmación antes de comprometer.

Lo que no resolvió es la **recuperación**. Y como el equipo fue honesto, lo dijo en la UI.
`RegistrarMovimientoForm.tsx:55-56` fija esta constante, renderizada en dos lugares (nota
siempre visible + cuerpo del diálogo):

> *"Un movimiento registrado no se puede editar ni eliminar después; su categoría sí puede
> reclasificarse desde el dashboard."*

Esa frase describe correctamente lo que se construyó, y por eso mismo es el mejor enunciado
del defecto. El usuario que tipea `450000` en vez de `45000` no tiene vuelta atrás: el
número equivocado queda dentro del semáforo 50/30/20, del resumen mensual y de la grilla
anual, para siempre. Prevención sin recuperación es media solución, y la mitad que falta es
la que importa cuando el error ya ocurrió.

La corrección venía difiriéndose desde las rondas r8/r9 de la crítica Impeccable (P2), cada
vez con la misma nota: *"US futura, con su propio ADR"*. Este es ese ADR.

Tres hechos verificables en el repo hacen que el momento sea ahora y el costo bajo:

1. **La identidad del origen ya es dato durable.** ADR-039 dejó `origen='Manual'` en la
   fila y el CHECK `Transaccion_origen_ingesta_consistency` garantizando la paridad con
   `ingestaId`. Distinguir una fila corregible de una intocable **no requiere migración
   alguna**: ya está en la BD.
2. **`Transaccion` es una hoja.** No hay `onDelete: Cascade` saliendo de ella. Borrar una
   fila tiene radio de explosión uno.
3. **No hay caché ni desnormalización.** Los cinco readers consultan `Transaccion` fresco
   por request. La corrección se ve en la lectura siguiente, sin lógica de invalidación y
   **sin tocar ningún reader** — la misma propiedad que ADR-039 defendió en CA-05/D-07.

La pregunta de diseño no es entonces *"¿podemos borrar una fila?"* — eso es trivial. Es
**"¿cuál es la regla que dice qué dato financiero es corregible y cuál no?"**. Sin esa
regla, la próxima solicitud ("¿y editar el monto?", "¿y borrar un movimiento del banco?",
"¿y desde el teléfono?") se resuelve por conveniencia y la frontera se erosiona — que es
exactamente el problema que ADR-038 resolvió reemplazando una lista de excepciones por un
criterio enunciable.

---

## Decisión

**La proveniencia determina la mutabilidad: lo que el usuario tipeó, el usuario lo puede
deshacer; lo que produjo una cartola pertenece al registro del banco y no se edita ni se
borra individualmente. En su primera entrega, la corrección es eliminación (no edición),
sin ventana de tiempo, y solo en web.**

Reglas que fija esta decisión:

1. **Corregible ⟺ `origen='Manual'`.** Un usuario puede eliminar una `Transaccion` propia
   con `origen='Manual'` vía `DELETE /api/movimientos/:id`. El gate vive en el WHERE de
   persistencia (`{ id, origen: 'Manual', account: { userId } }`), no en una validación de
   aplicación: el CHECK de paridad de ADR-039 hace que esa cláusula sea estanca contra
   filas nacidas de ingesta, por construcción y no por disciplina.

2. **Las filas nacidas de cartola no se tocan de a una.** Su fuente de verdad es el archivo
   del banco. El camino de corrección existente y suficiente es borrar la ingesta completa
   y volver a subirla (`DELETE /api/ingestas/:id`, US-018). Un endpoint de borrado por fila
   sobre datos bancarios crearía divergencia silenciosa entre lo que muestra MoneyDiary y
   lo que muestra el banco — precisamente la confianza que la app existe para construir.

3. **Corrección = eliminar y volver a registrar, no editar.** La edición de
   `monto`/`fecha`/`descripcion` queda **fuera** de esta entrega (ver Alternativas, Opción
   C). Sería la primera mutación post-persistencia de un campo de dinero en todo el
   codebase, y bajo ADR-024 y el plan de pruebas exige rigor de nivel-creación. Se difiere
   con gatillo registrado, no se abandona.

4. **Sin ventana de tiempo, sin borrado lógico, sin bitácora.** La eliminación no expira.
   No hay concepto de período contable cerrado en MoneyDiary, no hay fuente externa contra
   la cual reconciliar una fila manual, y no hay obligación de auditoría (mono-usuario,
   ADR-023). La fricción necesaria ya la aporta el diálogo de confirmación obligatorio.

5. **Solo web.** Mobile sigue mostrando los movimientos manuales sin afordancia de
   corrección. Mobile **no tiene formulario de registro** de movimientos: darle borrado sin
   creación dejaría al usuario pudiendo **destruir** en el teléfono lo que solo puede
   **rehacer** en el escritorio. Se difiere hasta que mobile gane registro, y ahí se decide
   crear + corregir como una sola superficie coherente (ADR-038 regla 6).

6. **La UI no puede seguir prometiendo permanencia.** `MENSAJE_PERMANENCIA` es falso desde
   el momento en que el endpoint existe, y se renderiza en **dos** sitios. Reescribir ambos
   es parte de esta decisión, no pulido posterior: enviar la capacidad sin el copy deja a la
   app mintiendo justo cuando le pide al usuario que confirme.

7. **La frontera se amplía por ADR, nunca por PR** (regla 6 de ADR-038, conservada). Una
   corrección que no encaje en la regla 1 — editar montos, borrar filas de cartola, borrar
   desde mobile, borrado masivo — exige su propio ADR, igual que exigió éste.

---

## Alternativas consideradas

### Opción A — No hacer nada: la permanencia es la política ✅ honesta, ❌ insostenible

Mantener el estado actual y la copy de permanencia. La prevención (diálogo de confirmación)
es la única defensa; el usuario que se equivoca convive con el dato malo.

✅ Cero superficie nueva, cero riesgo, la copy actual ya es honesta.
✅ Defendible mientras el registro manual era una capacidad nueva sin uso probado.
❌ **Deja un dato financiero incorrecto sin remedio**, contradiciendo la razón de ser del
producto: mostrar el dinero **exacto** (ADR-024). Un semáforo calculado sobre un monto que
el usuario sabe que está mal es peor que no tener semáforo.
❌ La copy convierte el defecto en promesa: cada vez que el usuario abre el formulario, la
app le enseña a desconfiar de él.
❌ Ya se difirió tres veces (r8/r9 P2). Un cuarto diferimiento sin evidencia nueva deja de
ser una decisión y pasa a ser un defecto sin dueño.

### Opción B — Ventana de deshacer post-commit (temporizador o expiración server-side)

Permitir eliminar solo dentro de N minutos/horas del registro, por temporizador de cliente
o por estado de expiración en el servidor.

✅ Acota la superficie destructiva a un intervalo conocido.
❌ **No es un enfoque distinto:** la variante de cliente es esta misma decisión más un
temporizador; la variante de servidor agrega estado y expiración (columna o tabla + barrido)
para nada que la confirmación ya no logre.
❌ **No existe una regla de negocio que la justifique.** No hay período contable que cerrar,
no hay fuente externa contra la cual reconciliar, no hay obligación de auditoría. Sería
inventar una restricción para un requisito hipotético (`yagni`).
❌ **Daña el caso más frecuente:** el error se descubre típicamente *después*, mirando el
semáforo al día siguiente. Ese es exactamente el usuario que la ventana deja varado.
❌ **Inconsistente con lo ya enviado:** `DELETE /api/ingestas/:id` destruye cientos de filas
sin ventana ni bitácora. Poner un cerrojo a la operación de una fila, hecha por su propio
autor, sería más estricto con lo menos destructivo.

### Opción C — Edición completa (`PATCH` de monto/fecha/descripcion) en esta entrega

Arreglar el dedo gordo en el lugar, sin borrar y volver a tipear.

✅ **El mayor valor de producto de las tres** — es literalmente lo que el usuario quiere hacer.
✅ Preserva la identidad de la fila (id, fecha de creación, cualquier referencia futura).
❌ **Primera mutación post-persistencia de un campo de dinero en el repo.** Bajo ADR-024 y el
plan de pruebas ("dinero con tipos exactos, nunca `float`"; redondeo, decimales y signo
cubiertos explícitamente) exige rigor de nivel-creación, no un toque liviano.
❌ Reabre **toda** la superficie de validación de la creación
(`MovimientoManualInvalidoError`, `CategoriaFueraDeCatalogoError`,
`BucketCategoriaNoConcuerdaError`) más un esquema de actualización parcial y un DTO de
respuesta nuevo.
❌ **Eliminar ya recupera el 100 % de la capacidad**: borrar y volver a registrar produce
exactamente el mismo estado final. La edición compra ergonomía, no capacidad — y al mayor
costo de riesgo del backlog.
⚠️ Se difiere con gatillo explícito (ver Consecuencias), no se descarta.

### Opción D — Eliminación con alcance `origen='Manual'`, sin ventana, solo web ✅ (elegida)

✅ **Espejo casi literal de un patrón ya endurecido** (`EliminarIngesta`): gate demo antes
del writer, `deleteMany` cuyo conteo **es** el gate de propiedad (anti-enumeración),
aislamiento estructural por `userId` en el WHERE.
✅ **Alcance estanco por construcción**: la cláusula `origen: 'Manual'` no puede convertirse
en una puerta trasera a datos de cartola mientras el CHECK de ADR-039 exista.
✅ **Sin migración, sin cambios de schema, sin cambios en readers, sin invalidación de
caché** — hoja + cómputo por request.
✅ Devuelve la exactitud del dinero, que es el compromiso central del producto.
✅ Sustituye la promesa de permanencia por una **regla enunciable** (proveniencia →
mutabilidad) contra la cual responder las próximas cuatro solicitudes con fundamento.
⚠️ Obliga a reescribir copy ya enviada en dos sitios (regla 6) — trabajo pequeño pero de
cumplimiento obligatorio.
⚠️ Deja la brecha de ergonomía de la edición abierta a propósito, y la brecha de paridad con
mobile explícita.

---

## Seguridad

- **Aislamiento por `userId` estructural** (RNF-SEC-006): el `userId` sale de la sesión,
  nunca del path ni del body, y entra en el WHERE de persistencia —  nunca en un filtro en
  memoria.
- **Anti-enumeración por conteo**: `deleteMany` con `count === 0` → 404. Inexistente, ajena
  y **no-manual** colapsan en la **misma** respuesta. Un error distinguible del tipo "esta
  fila no es manual" sería un oráculo de proveniencia sobre datos de otro usuario; no
  existe.
- **Gate demo antes del writer**, igual que `EliminarIngestaUseCase` y
  `EliminarCategoriaUseCase`: una sesión demo corta antes de tocar persistencia, no se
  intenta el borrado. El demo es de solo lectura y sigue siéndolo.
- **Sin credencial, endpoint de auth ni PII nuevos.** No se agregan campos ni columnas; el
  `descripcion` cifrado (ADR-013) desaparece con la fila.
- **Confirmación obligatoria antes de una acción destructiva** (patrón ADR-038): el diálogo
  nombra el movimiento; el error queda en el diálogo para reintentar.
- **Sin montos en logs ni en mensajes de error** (ADR-013/ADR-033): el log de resultado
  registra id de fila y outcome, como hace `EliminarIngestaUseCase`.

---

## Consecuencias

**Positivas:**

- **La app deja de mentir.** La única promesa de la UI que era falsa-por-diseño desaparece,
  y la copy pasa a describir una capacidad real.
- **Dinero exacto recuperable.** El compromiso de ADR-024 deja de depender de que el usuario
  nunca se equivoque al tipear.
- **Una regla en vez de una lista de excepciones.** "La proveniencia determina la
  mutabilidad" responde por adelantado a editar montos, borrar filas de cartola, borrar
  desde mobile y borrado masivo — con un motivo, no con un juicio caso a caso.
- **Costo estructural nulo:** sin migración, sin schema, sin readers, sin caché, sin
  contrato nuevo más allá de una ruta. Rollback = revertir commits; ningún dato queda
  inaccesible.

**A tener en cuenta:**

- **La edición queda como deuda registrada, con gatillo:** enviarla cuando (i) se reporte
  fricción real de "borrar y volver a tipear" como flujo dominante, o (ii) un movimiento
  gane un artefacto dependiente (adjunto, nota, división) que haga que eliminar pierda
  información en vez de solo incomodar. Hasta entonces, eliminar + re-registrar es la
  respuesta sancionada.
- **Brecha de paridad con mobile, explícita:** el usuario ve el movimiento manual en el
  teléfono y no puede corregirlo ahí. Es la contraparte aceptada de no darle destrucción sin
  creación. Gatillo: mobile gana registro de movimientos.
- **Presión de scope futura:** habilitar el borrado va a invitar a pedir "¿y editar?" y "¿y
  borrar el del banco?". Las reglas 2 y 3 existen para poder responder con fundamento.
- **Sin bitácora:** una eliminación no deja rastro. Aceptado bajo mono-usuario (ADR-023); si
  MoneyDiary pasa a multi-usuario con datos compartidos o aparece una obligación contable,
  borrado lógico + bitácora vuelven a la mesa como decisión propia.
- **Copy duplicada web ↔ (futuro) mobile:** se mitiga fijando el string en un test unitario,
  igual que ADR-038, para que una divergencia sea intencional y revisable.

---

## No incluido en este ADR

- **Editar monto, fecha o descripción de un movimiento manual** — diferido con gatillo
  (Opción C).
- **Eliminar o editar transacciones nacidas de cartola, de a una** — fuera por la regla 2;
  el camino es borrar la ingesta completa (US-018).
- **Eliminar movimientos desde mobile** — fuera por la regla 5, hasta que mobile gane
  registro.
- **Ventana de deshacer, borrado lógico o bitácora de auditoría** — fuera por la regla 4.
- **Borrado masivo de movimientos manuales** — sin evidencia de volumen; el confirm por fila
  es el default seguro.
- **Exponer `origen` como campo de contrato en todos los readers** — ADR-039 lo dejó como
  proveniencia de BD deliberadamente; solo entra si el diseño lo necesita para la superficie
  de gastos.

---

## Referencias

- ADR-039 — Movimientos manuales: `origen` y cuenta centinela (este ADR **enmienda** su
  omisión de ciclo de vida; el resto sigue vigente)
- ADR-038 — Alcance de escritura de mobile: frontera **reafirmada**, no enmendada (regla 5)
- ADR-026 — Ingesta desde mobile: `DELETE /api/ingestas/:id` como camino de corrección para
  datos de cartola
- ADR-024 — Arquitectura de clientes: dinero exacto en el backend; el cliente solo renderiza
- ADR-023 — Topología de despliegue: mono-usuario, sin obligación de auditoría hoy
- ADR-013 — Cifrado en reposo: `descripcion` cifrada; sin montos en logs
- ADR-011 — Contrato-first: la ruta nueva exige esquema Zod + `openapi:emit` en el mismo PR
- ADR-015 — Verificación por capas: aislamiento por `userId` y anti-enumeración con test de
  integración
- US-018 — Eliminar ingesta: patrón HTTP y de persistencia espejado acá
- US-058 — Registro manual: historia que creó la promesa de permanencia que este ADR retira

---

*Fecha de propuesta: 2026-08-29 — change SDD `correccion-movimientos-manuales`.*
```

---

## 7. Proposal question round

*(The propose phase should offer the product owner a question round; running as a
sub-agent I cannot ask interactively, so the questions and the assumptions I made in their
absence are recorded here for the orchestrator to surface. **None of these block the spec
and design phases** — each has a defensible default already baked into §3.)*

**Questions (product, not harness):**

1. **Delete vs. edit as the v1 correction verb.** I chose delete-only because it recovers
   100 % of the capability at a fraction of the risk (§3a). But the *felt* product outcome
   differs: "remove it and type it again" vs. "fix the number". If the owner's mental model
   of this US is "fix the typo", edit-first would be the right call and the risk budget has
   to move. Which verb does the user story actually promise?
2. **Manual expenses as well as manual incomes.** I scoped the affordance to every surface
   that lists a manual movement, including the gasto/bucket-detail side — which may require
   plumbing the origen signal through a DTO chain that the exploration could not confirm.
   If the owner is willing to ship incomes-only for one sprint, the change gets materially
   smaller. Is a half-capability acceptable temporarily?
3. **The replacement copy's register.** Removing the permanence warning removes a piece of
   friction that was deliberately designed to make people careful. Should the new copy stay
   reassuring ("you can remove it later"), or stay cautionary and merely accurate ("a
   movement you type can be removed; one from a cartola cannot")? This is a house-voice call
   ("calm over drama") more than an engineering one.
4. **Deletion of a manual movement in a month already reviewed.** I assumed no restriction
   (no period-lock concept exists in the product). If the owner thinks of a past month as
   "closed" once reviewed, that is a product invariant I have not encoded anywhere.

**Assumptions made in the absence of answers** — each is reversible before spec:

- Correction means **delete + re-register**; edit is a later, separate US (§3a).
- **No time limit**, no soft delete, no audit trail (§3b).
- **Web only**; mobile keeps read-only parity and ADR-038 is reaffirmed, not amended (§3c).
- Cartola-born rows are **never** individually deletable — the ingesta-level delete is the
  sanctioned path (ADR-040 rule 2).
- The affordance appears on **both** the ingresos and gastos surfaces, and only on manual
  rows.
- A demo session can never delete; the gate sits before persistence.

---

## 8. Risks and one framing correction

**Framing correction (flagged deliberately).** This phase's brief asked for an ADR
*"amending ADR-038's write-surface scope"*. Verified against the source: ADR-038's rule 2 is
**mobile-scoped** — its own rule 6 reads *"una escritura **mobile** que no encaje en la
regla 2 exige un ADR propio"*, and the excluded list ("reclasificar transacciones, editar
montos, borrar ingestas") names capabilities that **already exist on web today**
(`ReclasificarCategoriaControl`, `DELETE /api/ingestas/:id`). So a **web-only** delete does
not cross ADR-038's frontier at all, and decision (c) keeps mobile out. The ADR that the
house pattern actually calls for **amends ADR-039** — which introduced the manual row and
was silent about its lifecycle — and **reaffirms** ADR-038 explicitly so the next reader
does not re-derive it. Had decision (c) gone the other way (web + mobile), ADR-038 *would*
need amending; the two decisions are coupled, and this is noted in the ADR itself.

**Risks:**

1. **Copy drift is a correctness bug, not polish.** `MENSAJE_PERMANENCIA` renders at two
   sites from one constant. Ship the endpoint without rewriting both and the app lies to the
   user inside its own confirmation dialog. Mitigation: same PR, plus a unit test pinning
   the string.
2. **Gasto-side origen signal is UNCONFIRMED.** Whether `origen` survives
   `DetalleBucketRow.banco` → `detalle-bucket-mes.dto.ts` →
   `detalle-bucket-mes-view-model.ts` was not verified in exploration. If it does not, the
   design must either plumb it (in scope) or fall back to incomes-only (question 2). This
   is the single largest sizing uncertainty in the change.
3. **The `origen: 'Manual'` WHERE clause is the whole safety story.** It is airtight *only
   while* the ADR-039 CHECK holds. A future writer that sets `origen` to some third value
   (`'API'`, `'Import-preview'` — a possibility ADR-039 itself anticipates) would silently
   fall outside the delete clause. Verification must test the negative case (deleting a
   cartola-born row returns the merged 404) as an integration test, not a unit mock.
4. **Anti-enumeration must merge three cases, not two.** Not-found, not-owned and
   **not-manual** all collapse to the same 404. A well-meaning "this movement can't be
   deleted because it came from your bank" message would be friendlier and would leak
   provenance about rows the caller does not own.
5. **Deferred-edit pressure.** Shipping delete makes "and let me just fix the number"
   the obvious next ask. Mitigated by ADR-040 rule 3 plus a registered trigger — but it will
   be asked, probably in the same sprint.
6. **Mobile parity is a visible gap by choice.** A user seeing an uncorrectable manual
   movement on the phone may read it as a bug rather than a boundary. Accepted; the trigger
   is registered.

---

## 9. Next

`sdd-spec` and `sdd-design` can run in parallel from this proposal.

- **Spec** must encode: the merged-404 anti-enumeration contract (three cases), the demo
  gate, the `origen='Manual'` scoping including the negative case, the surfaces where the
  affordance appears, and the replacement copy's acceptance criteria.
- **Design** must resolve: the gasto-side origen DTO chain (risk 2), the port/use
  case/repository triad shape, the `responderErrorTraducido` mapping (issue #507), the Zod
  schema + `openapi:emit` step, and whether the web control mirrors `EliminarIngestaControl`
  or `ReclasificarCategoriaControl` on error handling.
