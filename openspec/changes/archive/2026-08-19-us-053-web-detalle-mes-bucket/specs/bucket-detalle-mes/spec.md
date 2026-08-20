# Delta for bucket-detalle-mes

Source: `openspec/changes/us-053-web-detalle-mes-bucket/proposal.md` (US-053, issue #287).
Backend contract unchanged — this delta only records, in this spec, the retirement the Purpose's
forward reference anticipated ("the flat endpoint, dashboard panel and interim drill-down keep working
until US-053"). The flat endpoint and every MBD-01..08 behavior stay exactly as specified.

## ADDED Requirements

### Requirement: MBD-09 — The flat US-017 endpoint loses its sole web consumer when US-053 retires the interim panel (informational note)

As of US-053, `apps/web`'s `/buckets/:bucket` page consumes the grouped endpoint (MBD-01..08) and the
dashboard's inline US-047 panel — the flat US-017 endpoint's only web consumer — is retired (web-app
WDM-06/WCAT-01). The flat endpoint MUST remain deployed and behaviorally unchanged (US-053 rollback path):
no backend contract, implementation, or test in this spec changes; its consumer count is a web-app
concern, not a backend behavior.

#### Scenario: The flat endpoint responds unchanged after US-053 ships

- GIVEN US-053 is shipped and the dashboard panel is retired
- WHEN a client calls `GET /api/buckets/Necesidades?periodo=<period>`
- THEN it responds exactly as its own (unchanged) contract specifies — this spec's MBD-01..08 are
  unaffected
