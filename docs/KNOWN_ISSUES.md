# Known Issues

Repository-level concerns and investigation history. Existing component records and plan decisions remain authoritative for their own scope; link them here rather than duplicating them. No comprehensive defect audit is implied by this file.

## Model findings pilot intake

Pilot: `BDS-MODEL-FINDINGS-TOP10-v0.1`. See [the review checklist and evidence rules](MODEL_FINDINGS_PILOT.md) and [session log](model-findings/sessions.yaml).

Initial phase: **`baseline_after_merge`**. During the comparison baseline, continue normal issue handling. During structured intake, record each distinct model-raised concern here or link it to an existing record before closing the review. Untested claims are **unverified**. Keep verification separate from open/deferred/closed disposition, preserve disproven claims, and require relevant evidence for fix closure. Existing entries retain their historical provenance and are not reverified by this addition.

### Pilot findings

New observations go below this heading or into existing linked entries. Setup observations are marked separately and do not count as pilot effectiveness results.

#### MF-BDS-20260906-001 — Documentation build skips the snapshot validator in a clean checkout

- Origin: Codex setup inspection, 2026-09-06; model version unavailable.
- Baseline: `842b63aee2f7b3f31cf88d88e98052f4b334e239`; category: documentation validation; setup observation, excluded from effectiveness metrics.
- Evidence: `doc/system/BUILD.sh` invokes the snapshot validator only when `[ -x "$VALIDATOR" ]` is true. The pinned Git tree records `doc/system/validate_snapshots.sh` with mode `100644`, so that condition is false in a clean checkout. The native build exits successfully without running that check.
- Expected: the documented snapshot validation runs during a normal documentation build, or an unavailable validator is reported explicitly.
- Verification: **confirmed conditional validation gap**. An explicit `bash doc/system/validate_snapshots.sh doc/BDSSYSTEM.md` passed for the pilot candidate; this does not repair the build condition.
- Severity: provisional medium; build success alone can omit the snapshot check.
- Disposition: **closed** 2026-09-25. Owner: Charles Boswell.
- Candidate correction in PR #29: invoke the validator through Bash when the file exists and fail if it is missing. CI also rebuilds the generated reference and rejects drift. Closure requires the corrected commit's verification and merge receipt.
- Closure receipt, 2026-09-25: PR #29 merged at 2026-09-06T12:04:00Z as `ba09bac8c8f4babef88bfe8d40c70b2ad3815882`. Both PR #29 CI jobs passed. On `main` at `43a14d4b97b0fd724ffd2b88697406688a87d1f5`, `doc/system/BUILD.sh` runs the validator through Bash (mode `100644` still applies). A normal build ran the snapshot validation and produced no `doc/BDSSYSTEM.md` drift. A build with the validator removed failed with `BUILD_FAILED: missing validator` and exit 1.
- Verification limit: GitHub Actions did not start CI for `main` at `1cf855f` or `43a14d4`. See KI-BDS-20260925-001. The CI documentation job was run locally on `43a14d4` in its place and passed.

## KI-BDS-20260925-001 — GitHub Actions does not start CI because of an account billing lock

- Found: 2026-09-25, during the closure check for MF-BDS-20260906-001.
- Evidence: the `CI` runs for `main` at `1cf855f` and `43a14d4` show `failure`. Neither job started. The check-run annotation reads: "The job was not started because your account is locked due to a billing issue."
- Root cause: a billing lock on the GitHub account or the `Boswell-Digital-Solutions` organization. The cause is not in this repository.
- Impact: no CI evidence exists for commits after `df2904f`. A red check on `main` does not mean a code failure while the lock applies. The HUD browser job has no local substitute run.
- Local substitute, 2026-09-25, `43a14d4`: `bun test tests` passed 24/24, `tools/qc/no-side-door.ts` passed, `qc:stateforge` passed, and the documentation build produced no drift.
- Fix: clear the billing lock in the GitHub account or organization billing settings, then re-run CI on `main`.
- Disposition: **open**. Owner: Charles Boswell. Close when CI starts and passes on `main`.
