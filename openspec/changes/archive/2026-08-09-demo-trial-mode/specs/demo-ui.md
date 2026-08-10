# demo-ui Specification

## Purpose

Define the user-facing components for demo mode: the landing page "Probar demo" button, the redirect flow, and the sticky DemoBanner in the authenticated web app layout.

## Requirements

### Requirement: DEMO-UI-01 — Landing "Probar demo" Button

The landing page header MUST render a "Probar demo" button that links to `https://app.moneydiary.cl/api/auth/demo` with `target="_blank" rel="noopener noreferrer"`.

#### Scenario: Button renders with correct href

- GIVEN a visitor on the landing page
- WHEN inspecting the "Probar demo" anchor tag in the header
- THEN the `href` MUST be `https://app.moneydiary.cl/api/auth/demo`
- AND `target="_blank"` and `rel="noopener noreferrer"` MUST be present
- AND the visible label MUST be "Probar demo"

#### Scenario: Config-driven URL

- GIVEN the `PROBAR.url` value in `config.ts`
- WHEN the application builds
- THEN the button MUST use `PROBAR.url` as its `href`
- AND `PROBAR.url` MUST default to the demo endpoint

### Requirement: DEMO-UI-02 — DemoBanner Component

The authenticated web app layout (`_authenticated.tsx`) MUST render a `<DemoBanner>` sticky banner at the top when `fetchMe.esDemo` is `true`. The banner MUST NOT render for non-demo users.

#### Scenario: Banner visible for demo user

- GIVEN a demo user is authenticated
- WHEN `_authenticated` layout renders
- THEN `<DemoBanner>` MUST appear at the top of the viewport, above all other content
- AND the banner text MUST communicate demo mode and invite registration
- AND a CTA button with "Crear cuenta" or equivalent MUST be visible

#### Scenario: Banner hidden for real user

- GIVEN a non-demo user is authenticated
- WHEN `_authenticated` layout renders
- THEN `<DemoBanner>` MUST NOT render
- AND the layout MUST appear as normal

#### Scenario: Banner drives from auth context

- GIVEN the `fetchMe` response is cached in the auth context
- WHEN the layout checks `context.esDemo`
- THEN the banner SHALL use this cached value
- AND MUST NOT make an additional API call

### Requirement: DEMO-UI-03 — Redirect Flow

After `GET /api/auth/demo` creates the session, the system MUST redirect to `https://app.moneydiary.cl/`. The web app MUST recognize the valid session cookie on arrival and render the authenticated dashboard.

#### Scenario: Redirect lands on dashboard

- GIVEN the browser follows the `302` from `/api/auth/demo`
- WHEN the request reaches `https://app.moneydiary.cl/`
- THEN the `md_session` cookie MUST be present in the request
- AND `SessionGuard` MUST validate the session
- AND the dashboard MUST render with demo data visible

### Requirement: DEMO-UI-04 — DemoBanner Persistence and Dismissal

The DemoBanner SHOULD be dismissable per session. When dismissed, it MUST NOT reappear for the duration of the current session.

#### Scenario: Dismiss banner

- GIVEN the DemoBanner is visible
- WHEN the user clicks the dismiss button (×)
- THEN the banner MUST hide immediately
- AND MUST NOT reappear on subsequent page navigations within the same session

#### Scenario: Banner reappears on new session

- GIVEN the user dismissed the banner in a previous session
- WHEN they log out and start a new demo session
- THEN the banner MUST reappear
