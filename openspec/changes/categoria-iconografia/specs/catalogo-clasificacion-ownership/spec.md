# Delta for Catalogo Clasificacion Ownership

## ADDED Requirements

### Requirement: CategoriaDto and catalog create/update endpoints carry the optional icono field

`CategoriaDto` (returned by `POST`, `GET`, and `PATCH /api/categorias`) MUST include an `icono`
field: a curated allowlist name (`categoria-icono` CATICO-01) or `null`. `POST /api/categorias`
MUST accept an optional `icono` in its request body, validated per CATICO-02. `PATCH
/api/categorias/:id` MUST accept an optional `icono` in its request body, validated per CATICO-03
(set/clear/leave-unchanged). `openapi.json` and `@moneydiary/api-client` MUST be regenerated to
reflect the field and MUST pass their existing CI drift gates (pattern: CAT038-09/12).

#### Scenario: icono round-trips through create and read

- GIVEN an authenticated non-demo user creates a category with `icono: "house"`
- WHEN they subsequently GET `/api/categorias`
- THEN that category's entry includes `icono: "house"`

#### Scenario: Omitting icono on create or update is a no-op regression guard

- GIVEN an existing client that never sends `icono` (e.g. mobile before this change ships)
- WHEN it calls `POST` or `PATCH /api/categorias`
- THEN the request succeeds exactly as before this change, with `icono` defaulting to `null` on
  create or left unchanged on update

#### Scenario: Contract generation stays green

- GIVEN the extended `icono` field on `POST`/`GET`/`PATCH /api/categorias`
- WHEN `openapi:check` and the `api-client` CI drift job run
- THEN both pass with zero drift
