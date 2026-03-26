#!/usr/bin/env bash
# =============================================================================
# @file    github_actions_test.sh
# @brief   Validates GitHub Actions workflow files for correctness and speed.
#
# @description
#   This script audits the workflow YAML files under .github/workflows/ and
#   enforces a set of rules that keep CI fast, correct, and maintainable.
#   It is designed to run both locally and inside a GitHub Actions job.
#
# @checks
#   1.  Required workflow files exist and are non-empty.
#   2.  No workflow references the non-existent actions/checkout@v6 version.
#   3.  rust_ci.yml has no duplicate WASM build steps (wastes ~60-90 s/run).
#   4.  Smoke test does not invoke non-existent contract functions.
#   5.  Smoke test initialize call includes the required --admin argument.
#   6.  Smoke test WASM build is scoped to -p crowdfund (not the full workspace).
#   7.  Smoke test uses stellar-cli, not the deprecated soroban-cli.
#   8.  rust_ci.yml includes a frontend UI test job.
#
# @security
#   - Reads workflow files only; never writes or executes them.
#   - No secrets or credentials are accessed.
#   - set -euo pipefail ensures unset variables and pipeline errors are fatal.
#
# @usage
#   bash scripts/github_actions_test.sh
#
# @exitcodes
#   0  All checks passed.
#   1  One or more checks failed (details printed to stderr).
#
# @author  stellar-raise-contracts contributors
# @version 2.0.0
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# @constant WORKFLOWS_DIR
# @brief    Path to the directory containing GitHub Actions workflow YAML files.
# -----------------------------------------------------------------------------
WORKFLOWS_DIR=".github/workflows"

# -----------------------------------------------------------------------------
# @constant PASS / FAIL
# @brief    Canonical exit codes used by the script.
# -----------------------------------------------------------------------------
PASS=0
FAIL=1

# -----------------------------------------------------------------------------
# @var errors
# @brief    Running count of failed checks. Non-zero triggers a failing exit.
# -----------------------------------------------------------------------------
errors=0

# =============================================================================
# Helper functions
# =============================================================================

# -----------------------------------------------------------------------------
# @function fail
# @brief    Records a check failure and prints a diagnostic to stderr.
# @param    $*  Human-readable description of what failed.
# @sideeffect Increments the global `errors` counter.
# -----------------------------------------------------------------------------
fail() {
  echo "FAIL: $*" >&2
  errors=$((errors + 1))
}

# -----------------------------------------------------------------------------
# @function pass
# @brief    Prints a success message for a completed check.
# @param    $*  Human-readable description of what passed.
# -----------------------------------------------------------------------------
pass() {
  echo "PASS: $*"
}

# =============================================================================
# Check 1 — Required workflow files exist and are non-empty
# =============================================================================
# @rationale
#   Missing or empty workflow files silently disable CI jobs. This check
#   catches accidental deletions or truncations before they reach the merge queue.
# =============================================================================

for file in rust_ci.yml testnet_smoke.yml spellcheck.yml; do
  path="$WORKFLOWS_DIR/$file"
  if [[ ! -f "$path" ]]; then
    fail "$path does not exist"
  elif [[ ! -s "$path" ]]; then
    fail "$path is empty"
  else
    pass "$path exists and is non-empty"
  fi
done

# =============================================================================
# Check 2 — No workflow references the non-existent actions/checkout@v6
# =============================================================================
# @rationale
#   actions/checkout@v6 does not exist. Any workflow that references it will
#   fail immediately at the checkout step, blocking every CI run. The current
#   stable release is v4.
# @see https://github.com/actions/checkout/releases
# =============================================================================

if grep -rq "actions/checkout@v6" "$WORKFLOWS_DIR/"; then
  fail "Found 'actions/checkout@v6' (non-existent version) in $WORKFLOWS_DIR/"
  grep -rn "actions/checkout@v6" "$WORKFLOWS_DIR/" >&2
else
  pass "No workflow references actions/checkout@v6"
fi

# =============================================================================
# Check 3 — rust_ci.yml has no duplicate WASM build step
# =============================================================================
# @rationale
#   Building the WASM binary twice in the same job compiles identical artifacts
#   and wastes 60-90 seconds of CI time on every run. A single scoped build
#   (`-p crowdfund`) is sufficient.
# @performance
#   Removing the duplicate step reduces median CI wall-clock time by ~90 s.
# =============================================================================

wasm_build_count=$(grep -c "cargo build --release --target wasm32-unknown-unknown" \
  "$WORKFLOWS_DIR/rust_ci.yml" || true)

if [[ "$wasm_build_count" -gt 1 ]]; then
  fail "rust_ci.yml contains $wasm_build_count WASM build steps (expected 1) — redundant build wastes CI time"
else
  pass "rust_ci.yml has exactly $wasm_build_count WASM build step(s)"
fi

# =============================================================================
# Check 4 — Smoke test does not call non-existent contract functions
# =============================================================================
# @rationale
#   Calling a function that does not exist in the deployed contract causes the
#   smoke test to fail with a confusing error. The known bad functions are
#   `is_initialized` and `get_campaign_info` — neither is part of the public
#   contract ABI.
# @security
#   Invoking unexpected entry points could trigger unintended state changes on
#   testnet if a future contract version adds those names with different semantics.
# =============================================================================

for bad_fn in "is_initialized" "get_campaign_info"; do
  if grep -qF -- "-- $bad_fn" "$WORKFLOWS_DIR/testnet_smoke.yml"; then
    fail "testnet_smoke.yml calls non-existent contract function: $bad_fn"
  else
    pass "testnet_smoke.yml does not call non-existent function '$bad_fn'"
  fi
done

# =============================================================================
# Check 5 — Smoke test initialize call includes the required --admin argument
# =============================================================================
# @rationale
#   The crowdfund contract's `initialize` entry point requires an `--admin`
#   argument. Omitting it causes the transaction to be rejected on-chain,
#   failing the smoke test with a cryptic error rather than a clear message.
# @security
#   The admin address controls privileged operations (e.g. upgrades, refunds).
#   Ensuring it is always set prevents accidental deployment with no admin.
# =============================================================================

if ! grep -qF -- "--admin" "$WORKFLOWS_DIR/testnet_smoke.yml"; then
  fail "testnet_smoke.yml initialize call is missing required --admin argument"
else
  pass "testnet_smoke.yml initialize call includes --admin"
fi

# =============================================================================
# Check 6 — Smoke test WASM build is scoped to -p crowdfund
# =============================================================================
# @rationale
#   Building the entire workspace (`cargo build --target wasm32-unknown-unknown`)
#   compiles every crate, including those that do not produce a deployable WASM
#   binary. Scoping to `-p crowdfund` reduces build time and avoids compiling
#   crates that may not support the wasm32 target.
# @performance
#   Scoped build is typically 2-4× faster than a full workspace build in CI.
# =============================================================================

if ! grep -qE "cargo build.*-p crowdfund" "$WORKFLOWS_DIR/testnet_smoke.yml"; then
  fail "testnet_smoke.yml WASM build step is missing '-p crowdfund' (builds entire workspace unnecessarily)"
else
  pass "testnet_smoke.yml WASM build step is scoped to -p crowdfund"
fi

# =============================================================================
# Check 7 — Smoke test uses stellar-cli, not the deprecated soroban-cli
# =============================================================================
# @rationale
#   The Soroban CLI was renamed to the Stellar CLI (`stellar-cli`). The old
#   `soroban-cli` package is no longer maintained and may contain unpatched
#   vulnerabilities. All invocations should use the `stellar` binary.
# @security
#   Using an unmaintained CLI tool increases supply-chain risk. Pinning to the
#   actively maintained `stellar-cli` ensures security patches are applied.
# @see https://developers.stellar.org/docs/tools/stellar-cli
# =============================================================================

if grep -qF "soroban-cli" "$WORKFLOWS_DIR/testnet_smoke.yml"; then
  fail "testnet_smoke.yml installs deprecated 'soroban-cli' — use 'stellar-cli' instead"
else
  pass "testnet_smoke.yml does not reference deprecated soroban-cli"
fi

# =============================================================================
# Check 8 — rust_ci.yml includes a frontend UI test job
# =============================================================================
# @rationale
#   Without a dedicated frontend job, Jest tests never run in CI. Frontend
#   regressions can merge undetected and break the UI for end users.
# @performance
#   The frontend job runs in parallel with the Rust check job, so it adds
#   zero wall-clock time to the pipeline on a typical PR.
# =============================================================================

if ! grep -qE "^  frontend:" "$WORKFLOWS_DIR/rust_ci.yml"; then
  fail "rust_ci.yml is missing a 'frontend' job for UI tests"
else
  pass "rust_ci.yml includes a 'frontend' job for UI tests"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
if [[ "$errors" -eq 0 ]]; then
  echo "All checks passed."
  exit $PASS
else
  echo "$errors check(s) failed." >&2
  exit $FAIL
fi
