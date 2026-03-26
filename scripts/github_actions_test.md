# GitHub Actions Test Workflow — Script Reference

## Overview

`github_actions_test.sh` validates the GitHub Actions workflow files in this
repository. It enforces correctness, speed, and security rules that keep CI
fast and reliable. The companion test file `github_actions_test.test.sh`
exercises every check against both the real repository and synthetic fixtures.

---

## Scripts

| Script | Purpose |
|---|---|
| `scripts/github_actions_test.sh` | Validates workflow files (8 checks) |
| `scripts/github_actions_test.test.sh` | Tests the validator (14 tests, edge cases included) |

Run locally from the repository root:

```bash
bash scripts/github_actions_test.sh
bash scripts/github_actions_test.test.sh
```

---

## Checks performed

### Check 1 — Required workflow files exist and are non-empty

Verifies that `rust_ci.yml`, `testnet_smoke.yml`, and `spellcheck.yml` all
exist under `.github/workflows/` and contain at least one byte. Missing or
empty files silently disable CI jobs.

### Check 2 — No workflow references `actions/checkout@v6`

`actions/checkout@v6` does not exist. Any workflow referencing it fails
immediately at the checkout step. The current stable release is `v4`.

### Check 3 — No duplicate WASM build step in `rust_ci.yml`

Building the WASM binary twice in the same job compiles identical artifacts
and wastes 60–90 seconds of CI time per run. A single scoped build
(`-p crowdfund`) is sufficient.

### Check 4 — Smoke test does not call non-existent contract functions

The functions `is_initialized` and `get_campaign_info` are not part of the
crowdfund contract's public ABI. Calling them causes the smoke test to fail
with a confusing on-chain error.

### Check 5 — Smoke test `initialize` call includes `--admin`

The crowdfund contract's `initialize` entry point requires an `--admin`
argument. Omitting it causes the transaction to be rejected on-chain.

### Check 6 — Smoke test WASM build is scoped to `-p crowdfund`

Building the entire workspace compiles every crate unnecessarily. Scoping to
`-p crowdfund` is 2–4× faster and avoids compiling crates that may not
support the `wasm32` target.

### Check 7 — Smoke test uses `stellar-cli`, not deprecated `soroban-cli`

The Soroban CLI was renamed to the Stellar CLI. The old `soroban-cli` package
is unmaintained and may contain unpatched vulnerabilities.

### Check 8 — `rust_ci.yml` includes a `frontend` job

Without a dedicated frontend job, Jest tests never run in CI. The frontend
job runs in parallel with the Rust job, adding zero wall-clock time to the
pipeline.

---

## Speed optimisations in `rust_ci.yml`

| Optimisation | Detail |
|---|---|
| Single WASM build | Removed duplicate build step (~90 s saved per run) |
| Scoped build (`-p crowdfund`) | Compiles only the required crate |
| `Swatinem/rust-cache@v2` | Caches `~/.cargo` and `target/` between runs |
| `cache: "npm"` in `setup-node` | Restores `~/.npm` automatically |
| Parallel `frontend` job | UI tests run alongside Rust checks, not after |
| `timeout-minutes` bounds | Job: 30 min · WASM build: 10 min · Tests: 15 min |
| Elapsed-time log step | Fires on success and failure; warns if > 20 min |

---

## Security notes

- The validator reads workflow files only — it never writes or executes them.
- No secrets or credentials are accessed by the validator.
- `set -euo pipefail` ensures unset variables and pipeline errors are fatal.
- `actions/checkout@v4` is the current stable, audited release.
- Using `stellar-cli` (the maintained successor) reduces supply-chain risk
  compared to the deprecated `soroban-cli` package.
- `timeout-minutes` bounds prevent a compromised or infinite-looping
  dependency from holding a runner indefinitely.
- The spellcheck action runs with default read-only permissions.

---

## Test coverage

The test suite (`github_actions_test.test.sh`) covers:

| Test | Scenario |
|---|---|
| 1 | Real repository passes all checks (happy path) |
| 2 | `spellcheck.yml` is missing |
| 3 | Workflow file exists but is empty (zero bytes) |
| 4 | Workflow file contains only whitespace (documents current behaviour) |
| 5 | `checkout@v6` typo in `rust_ci.yml` |
| 6 | `checkout@v6` typo in `testnet_smoke.yml` |
| 7 | Duplicate WASM build steps in `rust_ci.yml` |
| 8 | Smoke test calls non-existent `is_initialized` |
| 9 | Smoke test calls non-existent `get_campaign_info` |
| 10 | Smoke test `initialize` missing `--admin` |
| 11 | Smoke test WASM build missing `-p crowdfund` |
| 12 | Smoke test uses deprecated `soroban-cli` |
| 13 | `rust_ci.yml` missing `frontend` job |
| 14 | Multiple simultaneous failures are all reported (no short-circuit) |

---

## What was fixed in the workflow files

| File | Change |
|---|---|
| `.github/workflows/rust_ci.yml` | `checkout@v6` → `checkout@v4`; removed duplicate WASM build; added `frontend` job; added `timeout-minutes` bounds; added elapsed-time log step |
| `.github/workflows/testnet_smoke.yml` | `checkout@v6` → `checkout@v4`; added `-p crowdfund`; `soroban-cli` → `stellar-cli`; all `soroban` commands → `stellar` |
| `.github/workflows/spellcheck.yml` | Replaced empty file with working `cspell-action@v6` workflow |
