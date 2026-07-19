# client-ingesta-upload Specification

## Purpose

Client surface (web authenticated, web demo, mobile authenticated) for uploading a bank statement (`.xlsx`/`.pdf`) to the existing, unchanged `POST /api/ingestas`: validation, progress, result, error mapping, and resumen refresh. No backend/domain change.

## Requirements

### Requirement: CU-01 — Web file selection with client-side validation

Web MUST offer a file picker restricted to `.xlsx`/`.pdf` and MUST reject, client-side and without calling the backend, any file with a different extension or at/above the web size limit (**4 MB** — set below the Vercel proxy's 4.5 MB body cap), showing a clear message that the file is too large for web upload and suggesting the mobile app for larger files.

#### Scenario: Oversized file rejected without a request

- GIVEN a user selects a 6 MB `.xlsx` or a `.csv`
- WHEN they confirm
- THEN the UI rejects it with a clear message and no HTTP request is sent

### Requirement: CU-02 — Web submission via same-origin proxy with progress and no double-submit

On confirm, the web MUST POST `multipart/form-data` to same-origin `/api/ingestas` (key injected server-side by the dev proxy / Vercel function; never present in browser code), entering a `subiendo` state that disables further submits until the request settles.

#### Scenario: Second submit blocked while one is in flight

- GIVEN an upload is `subiendo`
- WHEN the user clicks submit again
- THEN no second request is sent and the control stays disabled

### Requirement: CU-03 — Web success result and resumen refresh

On success, the UI MUST show banco, tipoCuenta, numeroCuenta, totalTransacciones, and a transaction preview, and MUST invalidate the `resumen`, `resumen-anual`, and `detalle-bucket` queries so the 50/30/20 view updates without a manual reload (the web app has no `movimientos` query — verified against `apps/web/src/api`).

#### Scenario: Resumen updates without reload

- GIVEN a successful ingesta response
- WHEN the user navigates back to the resumen screen
- THEN it reflects the new transactions without a page reload

### Requirement: CU-04 — Web backend-error mapping

Each known backend error (banco no reconocido, estructura inválida, PDF sin texto, tamaño/extensión rechazada) MUST render a specific, actionable Spanish message; any unrecognized error MUST fall back to a generic message — never a raw stack trace or JSON body.

#### Scenario: Banco no reconocido maps to a specific message

- GIVEN the backend returns a banco-no-reconocido error
- WHEN the response arrives
- THEN the UI shows a message naming that specific problem, not "algo salió mal"

### Requirement: CU-05 — Web upload accessibility (WCAG 2.2 AA)

The file input MUST be keyboard-operable and screen-reader labeled; state transitions (`validando/subiendo/éxito/error`) MUST be announced via `aria-live`.

#### Scenario: State change is announced

- GIVEN the upload moves from `subiendo` to `éxito`
- WHEN a screen reader is active
- THEN the new state is announced via `aria-live` without requiring focus to move manually

### Requirement: CU-06 — Demo session reuses the identical upload UI, isolated by userId

A demo session (`esDemo: true`) MUST use the same component, hook, and route as an authenticated user with no registration gate, and ingested transactions MUST be scoped to that demo session's `userId`, invisible to any other user's data.

#### Scenario: Demo upload works with no gate and stays isolated

- GIVEN an active demo session, and a second demo/registered user
- WHEN the first user opens "Subir cartola" and uploads a valid file
- THEN the flow completes with no extra gate, and none of the transactions appear in the second user's resumen

### Requirement: CU-07 — Demo temporary-data nudge

When `esDemo` is true, the upload flow MUST show a notice that demo data is temporary plus a CTA to create an account, without blocking or interrupting the upload itself.

#### Scenario: Nudge visible but non-blocking

- GIVEN a demo session on the upload screen
- WHEN the screen renders
- THEN the temporary-data notice and CTA are visible and the file picker remains usable

### Requirement: CU-08 — Mobile document picker restricted to supported types

Mobile MUST open `expo-document-picker` filtered to `.xlsx`/`.pdf` only.

#### Scenario: Picker only offers supported types

- GIVEN the user taps "Subir cartola" on mobile
- WHEN the document picker opens
- THEN only `.xlsx`/`.pdf` files are selectable

### Requirement: CU-09 — Mobile upload submission

On confirm, mobile MUST POST the file as RN `FormData` to `/api/ingestas` with `Authorization: Bearer <token>` and `x-api-key`, entering a `subiendo` state; mobile MUST NOT apply the web's 4.5 MB cap and keeps the backend's 10 MB limit.

#### Scenario: 7 MB file uploads successfully on mobile

- GIVEN a valid 7 MB `.xlsx` selected on mobile
- WHEN the user confirms
- THEN the upload proceeds (no client-side size rejection below 10 MB)

### Requirement: CU-10 — Mobile success result and resumen refetch

On success, mobile MUST show a result summary (banco, cuenta, totalTransacciones) and re-fetch the mobile resumen.

#### Scenario: Resumen refetches after successful mobile upload

- GIVEN a successful ingesta response on mobile
- WHEN the result screen renders
- THEN the mobile resumen query re-fetches and reflects the new data

### Requirement: CU-11 — Mobile error handling never hangs

On a backend validation error or network failure, mobile MUST show a clear message and return to a retryable state; it MUST NOT remain stuck in `subiendo`.

#### Scenario: Network failure allows retry

- GIVEN the upload request fails due to network loss
- WHEN the failure is detected
- THEN an error message appears and the user can retry immediately

### Requirement: CU-12 — Mobile upload accessibility and ingesta-only write scope

The picker trigger and result/error views MUST expose RN accessibility labels/roles (TalkBack/VoiceOver). Enabling upload MUST NOT introduce any other mobile write capability (transaction/category edit, ingesta history management) — mobile write access stays scoped to creating a new ingesta (ADR-026).

#### Scenario: Trigger is announced and no edit affordance leaks in

- GIVEN TalkBack/VoiceOver is active and the upload feature is live
- WHEN focus reaches "Subir cartola", and later a user views a transaction from the result preview or resumen
- THEN the trigger's label/role is announced correctly, and no edit/delete control is present
