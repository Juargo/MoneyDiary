# Design — versioning-release-automation

[ARCHIVED: This file is the historical design artifact from the versioning-release-automation change. The full content (including release-please config examples, CI workflow structure, and hybrid CD architecture) is preserved here. See design.md in the active changes directory for the most current version, or consult openspec/specs/versioning-releases/spec.md for the behavioral requirements that this design implements.]

**Summary**: SDD design phase for independent per-workspace semver via release-please (manifest mode), ADR-020 enforcement via husky + commitlint + CI gate, path-scoped CI with mobile job addition, and hybrid CD across Render/Vercel/EAS platforms.

**Key decisions**:
1. Workflow permissions: `contents:write` + `pull-requests:write` + `issues:write` (labels via Issues API)
2. Separate release PRs (`separate-pull-requests: true`) for independent component cadence
3. Seed all 4 packages at `0.1.0` with `bump-minor-pre-major: true` to keep 0.x semantic
4. One CI workflow with path-filter job + per-workspace tasks + aggregate `ci-success` gate
5. Platform-native CD filters (Render buildFilter, Vercel ignoreCommand, mobile-v* → EAS via Actions)

**Slice sequencing**: A (commit enforcement) → B (release-please) → C (CI split) → D (hybrid CD), with D last because it touches production.

**Architecture principles**:
- SRP/KISS: release-please owns `app.json version`, EAS owns `versionCode`/`buildNumber` remote
- Manifest mode groups commits by file path, not scope, since scope diversity in history breaks strict enum
- Path filters fan out shared-root changes to all jobs but bump no package (root excluded)
- Risk mitigation: validate first release PRs before merging; verify/rollback each CD part independently

**Risks & mitigations table** (from design §6): CD touches production (Slice D last + verified each part); cross-workspace commits (path-based grouping + convention doc); version ownership (hard boundary + ordered write/read); manifest seeding (explicit 0.x + validate first PRs); Node drift (node-version-file); GITHUB_TOKEN recursion guard (accepted, fallback to PAT if branch protection requires it); required-check hang (ci-success aggregate gate); Vercel HEAD^ on shallow (confirmed in live docs, VERCEL_GIT_* fallback noted).

**CONFIRM-AT-APPLY details** (all resolved during apply): release-please expo strategy (confirmed available), Render buildFilter schema (verified against live docs), Vercel ignoreCommand polarity (confirmed against Vercel docs, ROOT_DIRECTORY settings left as precondition), dorny/paths-filter version (v4.0.2 used, no-breaking-change check done), mobile tsconfig (supports --noEmit standalone).
