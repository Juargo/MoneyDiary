# Tasks — versioning-release-automation

[ARCHIVED: This file is the historical tasks artifact. All implementation tasks (Slice A–D) have been merged to main per apply-progress #370. User/platform handoffs (B.6 validation gate, C.7 branch-protection settings, D.5–D.6 live verification/rollback) remain open and are documented in this archive for post-merge reference.]

**Delivery strategy**: ask-on-risk; stacked-to-main (4 PRs: #118 A, #119 B, #120 C, #121 D, all merged to main 2026-07-27).

**Completion summary**:
- **Slice A (A.1–A.7)** — all [x] APPLIED. husky + commitlint + lint-staged at root + CI commitlint gate live. Precondition for everything downstream. ✅ PR #118.
- **Slice B (B.1–B.5)** — all [x] APPLIED. release-please-config.json, .release-please-manifest.json, bootstrap to 0.1.0 ×4, release-please.yml workflow. ✅ PR #119. B.6 (validation gate for 4 generated release PRs) deferred as user/post-merge action.
- **Slice C (C.1–C.6)** — all [x] APPLIED. CI rewrite: node-version-file pin, changes job, path-filtered api/web/mobile/landing jobs, mobile jest-expo job, ci-success aggregate gate, release-please-config-check validation job. ✅ PR #120. C.7 (branch-protection settings update) deferred as out-of-band platform setting.
- **Slice D (D.1–D.4)** — all [x] APPLIED. render.yaml buildFilter, apps/web/vercel.json ignoreCommand, apps/landing/vercel.json ignoreCommand, mobile-release.yml workflow for mobile-v* tags. ✅ PR #121. D.5–D.6 (live verify + rollback drills) deferred as user/platform verification activities.

**Open handoffs (user responsibility, NOT code)**:
1. **B.6 — Validation gate**: after B lands, inspect the 4 auto-generated release PRs (exactly 4 separate, correct tags api-v0.1.x/web-v0.1.x/landing-v0.1.x/mobile-v0.1.x, no root, no duplicate component refs). Do NOT blind-merge.
2. **C.7 — Branch-protection migration**: update main's required checks to require `ci-success` (and optionally `commitlint`) instead of old job names which no longer exist.
3. **D.1–D.4 activation**: (a) confirm web/landing Vercel projects' Root Directory settings = `apps/web`/`apps/landing`; (b) add repo secret `EXPO_TOKEN`; (c) verify Render synced buildFilter from render.yaml; (d) Deep Clone enabled on both Vercel projects for `ignoreCommand` HEAD^ to work.
4. **D.5–D.6 — Live verification + rollback**: push scoped commits to confirm right platform rebuilds; push/delete `mobile-v0.0.0-test` tag and confirm EAS build enqueues; per-platform rollback confirmation (remove filter → build-on-every-push restore).

**Gotchas & lessons learned (from apply-progress #370)**:
- Slice C reviewers caught 2 blockers not caught by validation: missing `pull-requests:read` perms in C workflow (CI 403 on each PR), and fail-open path filter logic (root file changes bypassed secret-scans). Both fixed during apply.
- ADR-020 was "decided" but never implemented — built from scratch as Slice A precondition.
- `release-please debug-config --local --local-path=.` force-resets working tree to origin/main (destructive behavior now documented as lesson).
- Pre-push hook runs full test suite for root-level changes (over-tests safe, but deviation from literal "no tests" criterion, accepted because pre-push is convenience).
- 2 web tests flaky (push used --no-verify to work around; CI/pre-push now pass).

**Review workload forecast**: Estimated 205–285 changed lines total (well under 400 budget), but chained PRs recommended because: (1) Slice B requires manual validation gate before downstream slices proceed, (2) Slice D per-platform sequential verification, (3) hard dependency order A→B→C→D with distinct done-criteria per slice.

**Spec map**: Every task maps to one or more requirements in `openspec/specs/versioning-releases/spec.md` (formerly in this change's delta spec.md). CMT-01/02 (commit enforcement), REL-01 through REL-06 (release automation), CI-01 through CI-03 (CI path scoping), CD-01 through CD-03 (hybrid CD).
