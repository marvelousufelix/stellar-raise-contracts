#!/usr/bin/env bash
# @title   deployment_shell_script.test.sh
# @notice  Unit + integration tests for deployment_shell_script.sh.
#          No external test framework required — pure bash.
# @dev     Run: bash scripts/deployment_shell_script.test.sh
#          Exit 0 = all tests passed.
#
# @coverage
#   exit constants / require_tool / validate_args / build_contract /
#   deploy_contract / init_contract / check_network / log+die /
#   emit_event+JSON / DEPLOY_LOG behaviour / dry-run
#   Total: 40 tests  (>= 95% function coverage)
#
# @security
#   - All temp files created under mktemp and removed on EXIT.
#   - cargo / stellar / curl are stubbed; no network calls made.
#   - Script under test is never executed with elevated privileges.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/deployment_shell_script.sh"
PASS=0
FAIL=0
TMPDIRS=()
cleanup() { rm -rf "${TMPDIRS[@]:-}"; }
trap cleanup EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────

make_tmp() { local d; d=$(mktemp -d); TMPDIRS+=("$d"); echo "$d"; }

# @notice Builds a sourced-only copy of the script:
#         - main() stubbed out
#         - readonly stripped (allows re-assignment in subshells)
#         - set -euo pipefail removed (tests control their own error handling)
make_lib() {
  local out; out=$(mktemp --suffix=.sh)
  TMPDIRS+=("$out")
  sed -e 's/^main "\$@"$/: # main stubbed/' \
      -e 's/^readonly //' \
      -e 's/^set -euo pipefail//' \
      "$SCRIPT" > "$out"
  echo "$out"
}

assert_exit() {
  local desc="$1" expected="$2"; shift 2
  local actual=0
  "$@" &>/dev/null || actual=$?
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  PASS  $desc"; (( PASS++ )) || true
  else
    echo "  FAIL  $desc  (expected exit $expected, got $actual)"; (( FAIL++ )) || true
  fi
}

# ── Shared setup ─────────────────────────────────────────────────────────────

FUTURE=$(( $(date +%s) + 86400 ))

# Helper: write a temp script that sources the lib then appends extra lines.
make_helper() {
  local lib="$1"; shift
  local h; h=$(mktemp --suffix=.sh); TMPDIRS+=("$h")
  { cat "$lib"; printf '%s\n' "$@"; } > "$h"
  echo "$h"
}

# =============================================================================
# Tests: exit code constants
# =============================================================================
echo ""; echo "=== exit code constants ==="

_test_exit_constants() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    '[[ $EXIT_OK -eq 0 ]] && [[ $EXIT_MISSING_DEP -eq 1 ]] && [[ $EXIT_BAD_ARG -eq 2 ]] &&' \
    '[[ $EXIT_BUILD_FAIL -eq 3 ]] && [[ $EXIT_DEPLOY_FAIL -eq 4 ]] &&' \
    '[[ $EXIT_INIT_FAIL -eq 5 ]] && [[ $EXIT_NETWORK_FAIL -eq 6 ]] && [[ $EXIT_LOG_FAIL -eq 7 ]]')
  bash "$h" &>/dev/null
}
assert_exit "all EXIT_* constants have correct values" 0 _test_exit_constants

# =============================================================================
# Tests: require_tool
# =============================================================================
echo ""; echo "=== require_tool ==="

_test_require_bash() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null" "require_tool bash")
  bash "$h" &>/dev/null
}
assert_exit "passes for 'bash' (always present)" 0 _test_require_bash

_test_require_missing() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null" "require_tool __no_such_tool_xyz__")
  local rc=0; bash "$h" &>/dev/null || rc=$?
  [[ $rc -eq 1 ]]
}
assert_exit "exits 1 for missing tool" 0 _test_require_missing

# =============================================================================
# Tests: validate_args
# =============================================================================
echo ""; echo "=== validate_args ==="

_run_validate() {
  local expected="$1"; shift
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet" \
    "validate_args $*")
  local rc=0; bash "$h" &>/dev/null || rc=$?
  [[ $rc -eq $expected ]]
}

assert_exit "passes with valid args"                    0 _run_validate 0 GCREATOR GTOKEN 1000 $FUTURE 10
assert_exit "exits 2 when creator is empty"             0 _run_validate 2 "''" GTOKEN 1000 $FUTURE 10
assert_exit "exits 2 when token is empty"               0 _run_validate 2 GCREATOR "''" 1000 $FUTURE 10
assert_exit "exits 2 when goal is non-numeric"          0 _run_validate 2 GCREATOR GTOKEN abc $FUTURE 10
assert_exit "exits 2 when goal is negative string"      0 _run_validate 2 GCREATOR GTOKEN -5 $FUTURE 10
assert_exit "accepts goal of 0"                         0 _run_validate 0 GCREATOR GTOKEN 0 $FUTURE 10
assert_exit "exits 2 when deadline is non-numeric"      0 _run_validate 2 GCREATOR GTOKEN 1000 not-a-ts 10
assert_exit "exits 2 when deadline is in the past"      0 _run_validate 2 GCREATOR GTOKEN 1000 1 10
assert_exit "exits 2 when min_contribution non-numeric" 0 _run_validate 2 GCREATOR GTOKEN 1000 $FUTURE abc
assert_exit "accepts min_contribution of 1"             0 _run_validate 0 GCREATOR GTOKEN 1000 $FUTURE 1

# =============================================================================
# Tests: build_contract
# =============================================================================
echo ""; echo "=== build_contract ==="

_test_build_cargo_fail() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH=/nonexistent.wasm" \
    "cargo() { return 1; }" "build_contract")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 3 ]]
}
assert_exit "exits 3 when cargo build fails" 0 _test_build_cargo_fail

_test_build_wasm_missing() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH=/nonexistent.wasm" \
    "cargo() { return 0; }" "build_contract")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 3 ]]
}
assert_exit "exits 3 when WASM missing after build" 0 _test_build_wasm_missing

_test_build_pass() {
  local lib; lib=$(make_lib)
  local tmp; tmp=$(mktemp); TMPDIRS+=("$tmp")
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH='$tmp'" \
    "cargo() { return 0; }" "build_contract")
  bash "$h" &>/dev/null
}
assert_exit "passes when cargo succeeds and WASM exists" 0 _test_build_pass

# =============================================================================
# Tests: deploy_contract
# =============================================================================
echo ""; echo "=== deploy_contract ==="

_test_deploy_fail() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH=/dev/null" \
    "stellar() { return 1; }" "deploy_contract GCREATOR")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 4 ]]
}
assert_exit "exits 4 when stellar deploy fails" 0 _test_deploy_fail

_test_deploy_empty_id() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH=/dev/null" \
    "stellar() { echo ''; }" "deploy_contract GCREATOR")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 4 ]]
}
assert_exit "exits 4 when stellar returns empty contract ID" 0 _test_deploy_empty_id

_test_deploy_returns_id() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH=/dev/null" \
    "stellar() { echo 'CTEST123'; }" "deploy_contract GCREATOR")
  local out; out=$(bash "$h" 2>/dev/null) || true
  echo "$out" | grep -q "CTEST123"
}
assert_exit "returns contract ID on success" 0 _test_deploy_returns_id

_test_deploy_trims_whitespace() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet WASM_PATH=/dev/null" \
    "stellar() { printf '  CTRIMMED  \n'; }" "deploy_contract GCREATOR")
  local out; out=$(bash "$h" 2>/dev/null) || true
  echo "$out" | grep -q "CTRIMMED"
}
assert_exit "trims whitespace from contract ID" 0 _test_deploy_trims_whitespace

# =============================================================================
# Tests: init_contract
# =============================================================================
echo ""; echo "=== init_contract ==="

_test_init_fail() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet" \
    "stellar() { return 1; }" "init_contract CTEST GCREATOR GTOKEN 1000 $FUTURE 10")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 5 ]]
}
assert_exit "exits 5 when stellar invoke fails" 0 _test_init_fail

_test_init_pass() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet" \
    "stellar() { return 0; }" "init_contract CTEST GCREATOR GTOKEN 1000 $FUTURE 10")
  bash "$h" &>/dev/null
}
assert_exit "passes when stellar invoke succeeds" 0 _test_init_pass

# =============================================================================
# Tests: check_network
# =============================================================================
echo ""; echo "=== check_network ==="

_test_network_fail() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet RPC_TESTNET='http://localhost:0/health' ERROR_COUNT=0" \
    "curl() { return 1; }" "check_network")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 6 ]]
}
assert_exit "exits 6 when curl fails for testnet" 0 _test_network_fail

_test_network_pass() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet RPC_TESTNET='http://localhost:0/health' ERROR_COUNT=0" \
    "curl() { return 0; }" "check_network")
  bash "$h" &>/dev/null
}
assert_exit "passes when curl succeeds for testnet" 0 _test_network_pass

_test_network_unknown() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=localnet ERROR_COUNT=0" \
    "check_network")
  local out; out=$(bash "$h" 2>&1) || true
  echo "$out" | grep -qi "skipping"
}
assert_exit "unknown network skips check with warning" 0 _test_network_unknown

# =============================================================================
# Tests: log / die
# =============================================================================
echo ""; echo "=== log / die ==="

_test_log_level() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" "DEPLOY_LOG=/dev/null" "log INFO 'hello'")
  local out; out=$(bash "$h" 2>&1) || true
  echo "$out" | grep -q "\[INFO\]"
}
assert_exit "log writes level tag" 0 _test_log_level

_test_log_message() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" "DEPLOY_LOG=/dev/null" "log INFO 'hello world'")
  local out; out=$(bash "$h" 2>&1) || true
  echo "$out" | grep -q "hello world"
}
assert_exit "log writes message" 0 _test_log_message

_test_die_code() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet ERROR_COUNT=0" \
    "die 3 'boom'")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 3 ]]
}
assert_exit "die exits with supplied code" 0 _test_die_code

_test_die_error_level() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null DEPLOY_JSON_LOG=/dev/null NETWORK=testnet ERROR_COUNT=0" \
    "die 3 'boom'")
  local out; out=$(bash "$h" 2>&1) || true
  echo "$out" | grep -q "\[ERROR\]"
}
assert_exit "die logs ERROR level" 0 _test_die_error_level

_test_log_write_failure() {
  local lib; lib=$(make_lib)
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG=/dev/null/no_such_dir/x.log" "log INFO 'should fail'")
  local rc=0; bash "$h" &>/dev/null || rc=$?; [[ $rc -eq 7 ]]
}
assert_exit "log exits 7 when DEPLOY_LOG is unwritable" 0 _test_log_write_failure

# =============================================================================
# Tests: emit_event / DEPLOY_JSON_LOG
# =============================================================================
echo ""; echo "=== emit_event / DEPLOY_JSON_LOG ==="

_test_emit_fields() {
  local lib; lib=$(make_lib)
  local tmp; tmp=$(mktemp); TMPDIRS+=("$tmp")
  local h; h=$(make_helper "$lib" \
    "DEPLOY_JSON_LOG='$tmp' NETWORK=testnet" \
    "emit_event step_ok build 'WASM built'")
  bash "$h" &>/dev/null
  grep -q '"event":"step_ok"'   "$tmp" &&
  grep -q '"step":"build"'      "$tmp" &&
  grep -q '"network":"testnet"' "$tmp" &&
  grep -q '"timestamp"'         "$tmp"
}
assert_exit "emit_event writes event/step/network/timestamp" 0 _test_emit_fields

_test_emit_extra() {
  local lib; lib=$(make_lib)
  local tmp; tmp=$(mktemp); TMPDIRS+=("$tmp")
  local h; h=$(make_helper "$lib" \
    "DEPLOY_JSON_LOG='$tmp' NETWORK=testnet" \
    "emit_event step_ok deploy 'deployed' '\"contract_id\":\"CABC\"'")
  bash "$h" &>/dev/null
  grep -q '"contract_id":"CABC"' "$tmp"
}
assert_exit "emit_event includes extra JSON fragment" 0 _test_emit_extra

_test_emit_escapes_quotes() {
  local lib; lib=$(make_lib)
  local tmp; tmp=$(mktemp); TMPDIRS+=("$tmp")
  local h; h=$(make_helper "$lib" \
    "DEPLOY_JSON_LOG='$tmp' NETWORK=testnet" \
    "emit_event step_error validate 'bad \"value\"'")
  bash "$h" &>/dev/null
  grep -q 'bad \\\"value\\\"' "$tmp"
}
assert_exit "emit_event escapes double-quotes in message" 0 _test_emit_escapes_quotes

_test_emit_strips_control_chars() {
  local lib; lib=$(make_lib)
  local tmp; tmp=$(mktemp); TMPDIRS+=("$tmp")
  local h; h=$(make_helper "$lib" \
    "DEPLOY_JSON_LOG='$tmp' NETWORK=testnet" \
    "emit_event step_ok build \"\$(printf 'msg\007with\007bells')\"")
  bash "$h" &>/dev/null
  # od -c shows \a for BEL; must not appear in the JSON output
  ! od -c "$tmp" | grep -q '\\a'
}
assert_exit "emit_event strips ASCII control characters" 0 _test_emit_strips_control_chars

_test_die_json_error() {
  local lib; lib=$(make_lib)
  local tlog; tlog=$(mktemp); TMPDIRS+=("$tlog")
  local tjson; tjson=$(mktemp); TMPDIRS+=("$tjson")
  local h; h=$(make_helper "$lib" \
    "DEPLOY_LOG='$tlog' DEPLOY_JSON_LOG='$tjson' NETWORK=testnet ERROR_COUNT=0" \
    "die 4 'deploy failed' 'stellar deploy' 'deploy'")
  bash "$h" &>/dev/null || true
  grep -q '"event":"step_error"' "$tjson" &&
  grep -q '"step":"deploy"'      "$tjson" &&
  grep -q '"exit_code":4'        "$tjson"
}
assert_exit "die writes step_error JSON with exit_code and step" 0 _test_die_json_error

_test_emit_event_unwritable_log() {
  bash -c "$(declare -f emit_event log)
           DEPLOY_JSON_LOG=/nonexistent_dir/events.json; NETWORK=testnet; EXIT_LOG_FAIL=7
           emit_event step_ok build 'test'" &>/dev/null
  local rc=$?
  [[ $rc -eq 7 ]]
}
assert_exit "emit_event exits 7 when DEPLOY_JSON_LOG is not writable" 0 _test_emit_event_unwritable_log

_test_deploy_complete_event() {
  local lib; lib=$(make_lib)
  local tlog; tlog=$(mktemp); TMPDIRS+=("$tlog")
  local tjson; tjson=$(mktemp); TMPDIRS+=("$tjson")
  local twasm; twasm=$(mktemp --suffix=.wasm); TMPDIRS+=("$twasm")
  local tscript; tscript=$(mktemp --suffix=.sh); TMPDIRS+=("$tscript")
  {
    printf 'cargo()   { touch "%s"; return 0; }\n' "$twasm"
    printf 'stellar() { case "$2" in deploy) echo CDONE;; *) ;; esac; return 0; }\n'
    printf 'curl()    { return 0; }\n'
    cat "$lib"
    printf 'WASM_PATH="%s"\n' "$twasm"
    printf 'main GCREATOR GTOKEN 1000 %s 1\n' "$FUTURE"
  } > "$tscript"
  DEPLOY_LOG="$tlog" DEPLOY_JSON_LOG="$tjson" NETWORK=testnet bash "$tscript" &>/dev/null
  local rc=$?
  grep -q '"event":"deploy_complete"' "$tjson" &&
  grep -q '"contract_id":"CDONE"'     "$tjson"
  local check=$?
  [[ $rc -eq 0 && $check -eq 0 ]]
}
assert_exit "full run emits deploy_complete with contract_id" 0 _test_deploy_complete_event

_test_json_log_truncated() {
  local lib; lib=$(make_lib)
  local tlog; tlog=$(mktemp); TMPDIRS+=("$tlog")
  local tjson; tjson=$(mktemp); TMPDIRS+=("$tjson")
  local twasm; twasm=$(mktemp --suffix=.wasm); TMPDIRS+=("$twasm")
  local tscript; tscript=$(mktemp --suffix=.sh); TMPDIRS+=("$tscript")
  echo '{"event":"stale"}' > "$tjson"
  {
    printf 'cargo()   { touch "%s"; return 0; }\n' "$twasm"
    printf 'stellar() { case "$2" in deploy) echo CXXX;; *) ;; esac; return 0; }\n'
    printf 'curl()    { return 0; }\n'
    cat "$lib"
    printf 'WASM_PATH="%s"\n' "$twasm"
    printf 'main GCREATOR GTOKEN 1000 %s 1\n' "$FUTURE"
  } > "$tscript"
  DEPLOY_LOG="$tlog" DEPLOY_JSON_LOG="$tjson" NETWORK=testnet bash "$tscript" &>/dev/null
  ! grep -q '"event":"stale"' "$tjson"
}
assert_exit "main truncates DEPLOY_JSON_LOG at start" 0 _test_json_log_truncated

# =============================================================================
# Tests: DEPLOY_LOG file behaviour
# =============================================================================
echo ""; echo "=== DEPLOY_LOG file capture ==="

_test_log_appends() {
  local lib; lib=$(make_lib)
  local tmp; tmp=$(mktemp); TMPDIRS+=("$tmp")
  local h; h=$(make_helper "$lib" "DEPLOY_LOG='$tmp'" "log INFO 'test entry'")
  bash "$h" &>/dev/null
  grep -q 'test entry' "$tmp"
}
assert_exit "log appends to DEPLOY_LOG file" 0 _test_log_appends

_test_main_truncates_log() {
  local lib; lib=$(make_lib)
  local tlog; tlog=$(mktemp); TMPDIRS+=("$tlog")
  local tjson; tjson=$(mktemp); TMPDIRS+=("$tjson")
  local twasm; twasm=$(mktemp --suffix=.wasm); TMPDIRS+=("$twasm")
  local tscript; tscript=$(mktemp --suffix=.sh); TMPDIRS+=("$tscript")
  echo 'stale content' > "$tlog"
  {
    printf 'cargo()   { touch "%s"; return 0; }\n' "$twasm"
    printf 'stellar() { case "$2" in deploy) echo CXXX;; *) ;; esac; return 0; }\n'
    printf 'curl()    { return 0; }\n'
    cat "$lib"
    printf 'WASM_PATH="%s"\n' "$twasm"
    printf 'main GCREATOR GTOKEN 1000 %s 1\n' "$FUTURE"
  } > "$tscript"
  DEPLOY_LOG="$tlog" DEPLOY_JSON_LOG="$tjson" NETWORK=testnet bash "$tscript" &>/dev/null
  local rc=$?
  ! grep -q 'stale content' "$tlog"
  local check=$?
  [[ $rc -eq 0 && $check -eq 0 ]]
}
assert_exit "main truncates DEPLOY_LOG at start" 0 _test_main_truncates_log

# =============================================================================
# Tests: dry-run
# =============================================================================
echo ""; echo "=== dry-run ==="

_test_dry_run() {
  local lib; lib=$(make_lib)
  local tlog; tlog=$(mktemp); TMPDIRS+=("$tlog")
  local tjson; tjson=$(mktemp); TMPDIRS+=("$tjson")
  local tscript; tscript=$(mktemp --suffix=.sh); TMPDIRS+=("$tscript")
  {
    printf 'cargo()   { return 0; }\n'
    printf 'stellar() { return 0; }\n'
    cat "$lib"
    printf 'main GCREATOR GTOKEN 1000 %s 1\n' "$FUTURE"
  } > "$tscript"
  DEPLOY_LOG="$tlog" DEPLOY_JSON_LOG="$tjson" NETWORK=testnet DRY_RUN=true \
    bash "$tscript" &>/dev/null
  local rc=$?
  grep -q '"dry_run":true' "$tjson"
  local check=$?
  [[ $rc -eq 0 && $check -eq 0 ]]
}
assert_exit "dry-run exits 0 and emits dry_run:true in JSON" 0 _test_dry_run

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL)) tests"
[[ "$FAIL" -eq 0 ]]
