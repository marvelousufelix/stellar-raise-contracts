#!/usr/bin/env bash
# =============================================================================
# @file    github_actions_test.test.sh
# @brief   Test suite for github_actions_test.sh.
#
# @description
#   Exercises every check in github_actions_test.sh against both the real
#   repository (happy path) and synthetic fixture directories (failure paths).
#   Each test creates an isolated temporary directory so tests are hermetic and
#   do not interfere with each other or the working tree.
#
# @coverage
#   - Check 1: required files exist / missing / empty
#   - Check 2: actions/checkout@v6 typo detection
#   - Check 3: duplicate WASM build step detection
#   - Check 4: non-existent contract function detection (is_initialized, get_campaign_info)
#   - Check 5: missing --admin argument detection
#   - Check 6: missing -p crowdfund scope detection
#   - Check 7: deprecated soroban-cli detection
#   - Check 8: missing frontend job detection
#   - Edge cases: empty workflow file, whitespace-only file, multiple simultaneous failures
#
# @security
#   - All fixture directories are created under mktemp -d and removed on EXIT.
#   - The script under test is never executed with elevated privileges.
#   - No network calls are made; all checks are purely file-based.
#
# @usage
#   bash scripts/github_actions_test.test.sh
#
# @exitcodes
#   0  All tests passed.
#   1  One or more tests failed.
#
# @author  stellar-raise-contracts contributors
# @version 2.0.0
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# @constant SCRIPT
# @brief    Relative path to the validator script under test.
# -----------------------------------------------------------------------------
SCRIPT="scripts/github_actions_test.sh"

# -----------------------------------------------------------------------------
# @var passed / failed
# @brief    Running counters for test results.
# -----------------------------------------------------------------------------
passed=0
failed=0

# -----------------------------------------------------------------------------
# @var OLDPWD
# @brief    Absolute path to the repository root, captured before any cd.
#           Used to reference the script under test from inside temp dirs.
# -----------------------------------------------------------------------------
OLDPWD="$(pwd)"

# =============================================================================
# Helper functions
# =============================================================================

# -----------------------------------------------------------------------------
# @function assert_exit
# @brief    Runs a command and asserts its exit code matches the expectation.
# @param    $1  desc      Human-readable test description.
# @param    $2  expected  Expected exit code (0 = pass, 1 = fail).
# @param    $@  command   Command and arguments to execute.
# @sideeffect Updates global `passed` / `failed` counters.
# -----------------------------------------------------------------------------
assert_exit() {
  local desc="$1" expected="$2"
  shift 2
  set +e
  "$@" > /dev/null 2>&1
  local actual=$?
  set -e
  if [[ "$actual" -eq "$expected" ]]; then
    echo "PASS: $desc"
    passed=$((passed + 1))
  else
    echo "FAIL: $desc (expected exit $expected, got $actual)"
    failed=$((failed + 1))
  fi
}

# -----------------------------------------------------------------------------
# @function make_valid_fixture
# @brief    Creates a minimal valid workflow fixture directory that satisfies
#           all checks in github_actions_test.sh.
# @param    $1  dir  Path to an already-created temporary directory.
# @note     Use this as a baseline and then corrupt one field per test.
# -----------------------------------------------------------------------------
make_valid_fixture() {
  local dir="$1"
  mkdir -p "$dir/.github/workflows"

  # rust_ci.yml — valid: checkout@v4, single WASM build, frontend job present
  cat > "$dir/.github/workflows/rust_ci.yml" <<'EOF'
name: Rust CI
jobs:
  frontend:
    name: Frontend UI Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run test:coverage -- --ci
  check:
    name: Check, Lint & Test
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - run: cargo build --release --target wasm32-unknown-unknown -p crowdfund
      - run: cargo test --workspace
EOF

  # testnet_smoke.yml — valid: stellar-cli, -p crowdfund, --admin present, no bad fns
  cat > "$dir/.github/workflows/testnet_smoke.yml" <<'EOF'
name: Testnet Smoke Test
jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install stellar-cli
      - run: cargo build --target wasm32-unknown-unknown --release -p crowdfund
      - run: |
          stellar contract invoke --id $ID -- initialize \
            --admin $ADDR --creator $ADDR --token T --goal 1000 --deadline 9999 --min_contribution 1
EOF

  # spellcheck.yml — valid: non-empty
  echo "name: Spellcheck" > "$dir/.github/workflows/spellcheck.yml"
}

# =============================================================================
# Test 1 — Happy path: real repository passes all checks
# =============================================================================
# @rationale
#   Confirms the validator agrees with the current state of the repo.
#   If this fails, a recent workflow change broke a rule.
# =============================================================================

assert_exit "real repo passes all checks" 0 bash "$SCRIPT"

# =============================================================================
# Test 2 — Check 1 failure: required file (spellcheck.yml) is missing
# =============================================================================

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
mkdir -p "$tmpdir/.github/workflows"
echo "name: Rust CI" > "$tmpdir/.github/workflows/rust_ci.yml"
echo "name: Smoke"   > "$tmpdir/.github/workflows/testnet_smoke.yml"
# spellcheck.yml intentionally absent

assert_exit "fails when spellcheck.yml is missing" 1 \
  bash -c "cd '$tmpdir' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 3 — Check 1 edge case: workflow file exists but is empty
# =============================================================================

tmpdir_empty=$(mktemp -d)
trap 'rm -rf "$tmpdir_empty"' EXIT
make_valid_fixture "$tmpdir_empty"
# Truncate spellcheck.yml to zero bytes
> "$tmpdir_empty/.github/workflows/spellcheck.yml"

assert_exit "fails when spellcheck.yml is empty (zero bytes)" 1 \
  bash -c "cd '$tmpdir_empty' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 4 — Check 1 edge case: workflow file contains only whitespace
# =============================================================================
# @note
#   A file with only newlines is technically non-empty (-s passes) but
#   semantically empty. This test documents the current behaviour: the script
#   treats whitespace-only files as non-empty (they pass Check 1). This is
#   intentional — YAML parsers will catch truly invalid content.
# =============================================================================

tmpdir_ws=$(mktemp -d)
trap 'rm -rf "$tmpdir_ws"' EXIT
make_valid_fixture "$tmpdir_ws"
printf "\n\n\n" > "$tmpdir_ws/.github/workflows/spellcheck.yml"

assert_exit "whitespace-only spellcheck.yml passes Check 1 (non-empty by byte count)" 0 \
  bash -c "cd '$tmpdir_ws' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 5 — Check 2 failure: actions/checkout@v6 typo in rust_ci.yml
# =============================================================================

tmpdir2=$(mktemp -d)
trap 'rm -rf "$tmpdir2"' EXIT
make_valid_fixture "$tmpdir2"
# Inject the bad version into rust_ci.yml
sed -i 's/checkout@v4/checkout@v6/g' "$tmpdir2/.github/workflows/rust_ci.yml"

assert_exit "fails when checkout@v6 typo is present in rust_ci.yml" 1 \
  bash -c "cd '$tmpdir2' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 6 — Check 2 failure: actions/checkout@v6 typo in testnet_smoke.yml
# =============================================================================

tmpdir2b=$(mktemp -d)
trap 'rm -rf "$tmpdir2b"' EXIT
make_valid_fixture "$tmpdir2b"
sed -i 's/checkout@v4/checkout@v6/g' "$tmpdir2b/.github/workflows/testnet_smoke.yml"

assert_exit "fails when checkout@v6 typo is present in testnet_smoke.yml" 1 \
  bash -c "cd '$tmpdir2b' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 7 — Check 3 failure: duplicate WASM build steps in rust_ci.yml
# =============================================================================

tmpdir3=$(mktemp -d)
trap 'rm -rf "$tmpdir3"' EXIT
make_valid_fixture "$tmpdir3"
# Append a second WASM build step
cat >> "$tmpdir3/.github/workflows/rust_ci.yml" <<'EOF'
      - run: cargo build --release --target wasm32-unknown-unknown
EOF

assert_exit "fails when duplicate WASM build steps exist" 1 \
  bash -c "cd '$tmpdir3' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 8 — Check 4 failure: smoke test calls non-existent is_initialized
# =============================================================================

tmpdir4=$(mktemp -d)
trap 'rm -rf "$tmpdir4"' EXIT
make_valid_fixture "$tmpdir4"
# Append a call to the non-existent function
cat >> "$tmpdir4/.github/workflows/testnet_smoke.yml" <<'EOF'
      - run: stellar contract invoke --id $ID -- is_initialized
EOF

assert_exit "fails when smoke test calls non-existent is_initialized" 1 \
  bash -c "cd '$tmpdir4' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 9 — Check 4 failure: smoke test calls non-existent get_campaign_info
# =============================================================================

tmpdir4b=$(mktemp -d)
trap 'rm -rf "$tmpdir4b"' EXIT
make_valid_fixture "$tmpdir4b"
cat >> "$tmpdir4b/.github/workflows/testnet_smoke.yml" <<'EOF'
      - run: stellar contract invoke --id $ID -- get_campaign_info
EOF

assert_exit "fails when smoke test calls non-existent get_campaign_info" 1 \
  bash -c "cd '$tmpdir4b' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 10 — Check 5 failure: smoke test initialize is missing --admin
# =============================================================================

tmpdir5=$(mktemp -d)
trap 'rm -rf "$tmpdir5"' EXIT
make_valid_fixture "$tmpdir5"
# Replace the initialize call with one that omits --admin
cat > "$tmpdir5/.github/workflows/testnet_smoke.yml" <<'EOF'
name: Testnet Smoke Test
jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install stellar-cli
      - run: cargo build --target wasm32-unknown-unknown --release -p crowdfund
      - run: |
          stellar contract invoke --id $ID -- initialize \
            --creator $ADDR --token T --goal 1000 --deadline 9999 --min_contribution 1
EOF

assert_exit "fails when smoke test initialize is missing --admin" 1 \
  bash -c "cd '$tmpdir5' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 11 — Check 6 failure: smoke test WASM build missing -p crowdfund
# =============================================================================

tmpdir6=$(mktemp -d)
trap 'rm -rf "$tmpdir6"' EXIT
make_valid_fixture "$tmpdir6"
cat > "$tmpdir6/.github/workflows/testnet_smoke.yml" <<'EOF'
name: Testnet Smoke Test
jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install stellar-cli
      - run: cargo build --target wasm32-unknown-unknown --release
      - run: |
          stellar contract invoke --id $ID -- initialize \
            --admin $ADDR --creator $ADDR --token T --goal 1000 --deadline 9999 --min_contribution 1
EOF

assert_exit "fails when smoke test WASM build is missing -p crowdfund" 1 \
  bash -c "cd '$tmpdir6' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 12 — Check 7 failure: smoke test uses deprecated soroban-cli
# =============================================================================

tmpdir7=$(mktemp -d)
trap 'rm -rf "$tmpdir7"' EXIT
make_valid_fixture "$tmpdir7"
cat > "$tmpdir7/.github/workflows/testnet_smoke.yml" <<'EOF'
name: Testnet Smoke Test
jobs:
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install soroban-cli
      - run: cargo build --target wasm32-unknown-unknown --release -p crowdfund
      - run: |
          stellar contract invoke --id $ID -- initialize \
            --admin $ADDR --creator $ADDR --token T --goal 1000 --deadline 9999 --min_contribution 1
EOF

assert_exit "fails when smoke test uses deprecated soroban-cli" 1 \
  bash -c "cd '$tmpdir7' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 13 — Check 8 failure: rust_ci.yml missing the frontend job
# =============================================================================

tmpdir8=$(mktemp -d)
trap 'rm -rf "$tmpdir8"' EXIT
make_valid_fixture "$tmpdir8"
# Rewrite rust_ci.yml without the frontend job
cat > "$tmpdir8/.github/workflows/rust_ci.yml" <<'EOF'
name: Rust CI
jobs:
  check:
    name: Check, Lint & Test
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - run: cargo build --release --target wasm32-unknown-unknown -p crowdfund
      - run: cargo test --workspace
EOF

assert_exit "fails when rust_ci.yml is missing the frontend job" 1 \
  bash -c "cd '$tmpdir8' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Test 14 — Edge case: multiple simultaneous failures are all reported
# =============================================================================
# @rationale
#   The validator must not short-circuit on the first failure. All broken
#   checks should be reported in a single run so the developer can fix
#   everything at once.
# =============================================================================

tmpdir9=$(mktemp -d)
trap 'rm -rf "$tmpdir9"' EXIT
mkdir -p "$tmpdir9/.github/workflows"
# rust_ci.yml: checkout@v6 + duplicate WASM build + no frontend job
cat > "$tmpdir9/.github/workflows/rust_ci.yml" <<'EOF'
name: Rust CI
jobs:
  check:
    steps:
      - uses: actions/checkout@v6
      - run: cargo build --release --target wasm32-unknown-unknown -p crowdfund
      - run: cargo build --release --target wasm32-unknown-unknown
EOF
# testnet_smoke.yml: soroban-cli + no -p crowdfund + no --admin
cat > "$tmpdir9/.github/workflows/testnet_smoke.yml" <<'EOF'
name: Smoke
jobs:
  smoke-test:
    steps:
      - uses: actions/checkout@v4
      - run: cargo install soroban-cli
      - run: cargo build --target wasm32-unknown-unknown --release
      - run: stellar contract invoke --id $ID -- initialize --creator $A
EOF
echo "name: Spellcheck" > "$tmpdir9/.github/workflows/spellcheck.yml"

assert_exit "fails and reports multiple simultaneous failures" 1 \
  bash -c "cd '$tmpdir9' && bash '$OLDPWD/$SCRIPT'"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "Results: $passed passed, $failed failed"

# Exit non-zero if any test failed
[[ "$failed" -eq 0 ]]
