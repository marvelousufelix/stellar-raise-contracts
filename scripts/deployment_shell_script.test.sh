#!/usr/bin/env bash
# @title   deployment_shell_script.test.sh
# @notice  Unit + integration tests for deployment_shell_script.sh.
#          No external test framework required.
# @dev     Run: bash scripts/deployment_shell_script.test.sh
#          Exit 0 = all tests passed.

set -euo pipefail

SCRIPT="$(dirname "$0")/deployment_shell_script.sh"
PASS=0
FAIL=0

# ── Harness ──────────────────────────────────────────────────────────────────

assert_exit() {
  local desc="$1" expected="$2"; shift 2
  local actual=0
  "$@" &>/dev/null || actual=$?
  if [[ "$actual" -eq "$expected" ]]; then
    echo "  PASS  $desc"
    (( PASS++ )) || true
  else
    echo "  FAIL  $desc  (expected exit $expected, got $actual)"
    (( FAIL++ )) || true
  fi
}

assert_output_contains() {
  local desc="$1" pattern="$2"; shift 2
  local out
  out="$("$@" 2>&1)" || true
  if echo "$out" | grep -q "$pattern"; then
    echo "  PASS  $desc"
    (( PASS++ )) || true
  else
    echo "  FAIL  $desc  (pattern '$pattern' not found in output)"
    (( FAIL++ )) || true
  fi
}

assert_file_contains() {
  local desc="$1" file="$2" pattern="$3"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo "  PASS  $desc"
    (( PASS++ )) || true
  else
    echo "  FAIL  $desc  (pattern '$pattern' not found in $file)"
    (( FAIL++ )) || true
  fi
}

# ── Source helpers only (skip main) ──────────────────────────────────────────

# shellcheck source=/dev/null
SOURCING=1
eval "$(sed 's/^main "\$@"$/: # main stubbed/' "$SCRIPT")"

FUTURE=$(( $(date +%s) + 86400 ))

# ── Tests: require_tool ───────────────────────────────────────────────────────

echo ""
echo "=== require_tool ==="

assert_exit "passes for 'bash' (always present)" 0 \
  bash -c "$(declare -f require_tool die log emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_MISSING_DEP=1; require_tool bash"

assert_exit "exits 1 for missing tool" 1 \
  bash -c "$(declare -f require_tool die log emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_MISSING_DEP=1; require_tool __no_such_tool_xyz__"

# ── Tests: validate_args ──────────────────────────────────────────────────────

echo ""
echo "=== validate_args ==="

assert_exit "passes with valid args" 0 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 1000 $FUTURE 10"

assert_exit "exits 2 when creator is empty" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args '' GTOKEN 1000 $FUTURE 10"

assert_exit "exits 2 when token is empty" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR '' 1000 $FUTURE 10"

assert_exit "exits 2 when goal is non-numeric" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN abc $FUTURE 10"

assert_exit "exits 2 when goal is negative string" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN -5 $FUTURE 10"

assert_exit "exits 2 when deadline is non-numeric" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 1000 'not-a-ts' 10"

assert_exit "exits 2 when deadline is in the past" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 1000 1 10"

assert_exit "exits 2 when min_contribution is non-numeric" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 1000 $FUTURE abc"

assert_exit "accepts min_contribution of 1" 0 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 1000 $FUTURE 1"

# ── NEW edge cases: validate_args ─────────────────────────────────────────────

echo ""
echo "=== validate_args (new edge cases) ==="

assert_exit "exits 2 when goal is zero" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 0 $FUTURE 1"

assert_exit "exits 2 when min_contribution is zero" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 1000 $FUTURE 0"

assert_exit "exits 2 when min_contribution exceeds goal" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 100 $FUTURE 200"

assert_exit "passes when min_contribution equals goal" 0 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           validate_args GCREATOR GTOKEN 100 $FUTURE 100"

assert_output_contains "warns when creator equals token address" "identical" \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet; ERROR_COUNT=0
           validate_args GSAME GSAME 1000 $FUTURE 10"

assert_exit "exits 2 when deadline equals now (not strictly future)" 2 \
  bash -c "$(declare -f validate_args die log emit_event warn sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_BAD_ARG=2; NETWORK=testnet
           NOW=\$(date +%s); validate_args GCREATOR GTOKEN 1000 \"\$NOW\" 10"

# ── Tests: check_log_writable ─────────────────────────────────────────────────

echo ""
echo "=== check_log_writable (new edge cases) ==="

assert_exit "passes when both log paths are writable" 0 \
  bash -c "$(declare -f check_log_writable); EXIT_LOG_FAIL=7
           TL=\$(mktemp); TJ=\$(mktemp)
           DEPLOY_LOG=\"\$TL\"; DEPLOY_JSON_LOG=\"\$TJ\"
           check_log_writable
           rm -f \"\$TL\" \"\$TJ\""

assert_exit "exits 7 when DEPLOY_LOG is not writable" 7 \
  bash -c "$(declare -f check_log_writable); EXIT_LOG_FAIL=7
           DEPLOY_LOG=/nonexistent_dir/deploy.log; DEPLOY_JSON_LOG=/dev/null
           check_log_writable"

assert_exit "exits 7 when DEPLOY_JSON_LOG is not writable" 7 \
  bash -c "$(declare -f check_log_writable); EXIT_LOG_FAIL=7
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/nonexistent_dir/events.json
           check_log_writable"

# ── Tests: check_wasm_integrity ───────────────────────────────────────────────

echo ""
echo "=== check_wasm_integrity (new edge cases) ==="

assert_exit "exits 8 when WASM file does not exist" 8 \
  bash -c "$(declare -f check_wasm_integrity die log emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_WASM_INTEGRITY_FAIL=8; NETWORK=testnet
           check_wasm_integrity /nonexistent.wasm"

assert_exit "exits 8 when WASM file is empty" 8 \
  bash -c "$(declare -f check_wasm_integrity die log emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_WASM_INTEGRITY_FAIL=8; NETWORK=testnet
           TMP=\$(mktemp); check_wasm_integrity \"\$TMP\"; rm -f \"\$TMP\""

assert_exit "exits 8 when WASM magic bytes are invalid" 8 \
  bash -c "$(declare -f check_wasm_integrity die log emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_WASM_INTEGRITY_FAIL=8; NETWORK=testnet
           TMP=\$(mktemp); echo 'not a wasm file' > \"\$TMP\"
           check_wasm_integrity \"\$TMP\"; rm -f \"\$TMP\""

assert_exit "passes for a valid WASM magic bytes file" 0 \
  bash -c "$(declare -f check_wasm_integrity die log emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; EXIT_WASM_INTEGRITY_FAIL=8; NETWORK=testnet
           TMP=\$(mktemp)
           printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > \"\$TMP\"
           check_wasm_integrity \"\$TMP\"; rm -f \"\$TMP\""

# ── Tests: build_contract ────────────────────────────────────────────────────

echo ""
echo "=== build_contract ==="

assert_exit "exits 3 when cargo build fails" 3 \
  bash -c "$(declare -f build_contract check_wasm_integrity run_captured die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/nonexistent.wasm; NETWORK=testnet
           EXIT_BUILD_FAIL=3; EXIT_WASM_INTEGRITY_FAIL=8
           cargo() { return 1; }
           build_contract"

assert_exit "exits 3 when WASM missing after successful build" 3 \
  bash -c "$(declare -f build_contract check_wasm_integrity run_captured die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/nonexistent.wasm; NETWORK=testnet
           EXIT_BUILD_FAIL=3; EXIT_WASM_INTEGRITY_FAIL=8
           cargo() { return 0; }
           build_contract"

assert_exit "exits 8 when WASM exists but has invalid magic bytes" 8 \
  bash -c "$(declare -f build_contract check_wasm_integrity run_captured die log emit_event sanitize)
           TMP=\$(mktemp); echo 'bad' > \"\$TMP\"
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=\"\$TMP\"; NETWORK=testnet
           EXIT_BUILD_FAIL=3; EXIT_WASM_INTEGRITY_FAIL=8
           cargo() { return 0; }
           build_contract; rm -f \"\$TMP\""

assert_exit "passes when cargo succeeds and WASM has valid magic bytes" 0 \
  bash -c "$(declare -f build_contract check_wasm_integrity run_captured die log emit_event sanitize)
           TMP=\$(mktemp)
           printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > \"\$TMP\"
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=\"\$TMP\"; NETWORK=testnet
           EXIT_BUILD_FAIL=3; EXIT_WASM_INTEGRITY_FAIL=8
           cargo() { return 0; }
           build_contract; rm -f \"\$TMP\""

# ── Tests: deploy_contract ───────────────────────────────────────────────────

echo ""
echo "=== deploy_contract ==="

assert_exit "exits 4 when stellar deploy fails" 4 \
  bash -c "$(declare -f deploy_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/dev/null; NETWORK=testnet; EXIT_DEPLOY_FAIL=4
           stellar() { return 1; }
           deploy_contract GCREATOR"

assert_exit "exits 4 when stellar returns empty contract ID" 4 \
  bash -c "$(declare -f deploy_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/dev/null; NETWORK=testnet; EXIT_DEPLOY_FAIL=4
           stellar() { echo ''; }
           deploy_contract GCREATOR"

assert_exit "exits 4 when contract ID has invalid format" 4 \
  bash -c "$(declare -f deploy_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/dev/null; NETWORK=testnet; EXIT_DEPLOY_FAIL=4
           stellar() { echo 'INVALID_ID'; }
           deploy_contract GCREATOR"

assert_exit "exits 4 when contract ID starts with wrong letter" 4 \
  bash -c "$(declare -f deploy_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/dev/null; NETWORK=testnet; EXIT_DEPLOY_FAIL=4
           stellar() { echo 'GCREATORADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; }
           deploy_contract GCREATOR"

assert_output_contains "returns contract ID on success" "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" \
  bash -c "$(declare -f deploy_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; WASM_PATH=/dev/null; NETWORK=testnet; EXIT_DEPLOY_FAIL=4
           stellar() { echo 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'; }
           deploy_contract GCREATOR"

# ── Tests: init_contract ─────────────────────────────────────────────────────

echo ""
echo "=== init_contract ==="

assert_exit "exits 5 when stellar invoke fails" 5 \
  bash -c "$(declare -f init_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; EXIT_INIT_FAIL=5; ERROR_COUNT=0
           stellar() { return 1; }
           init_contract CTEST GCREATOR GTOKEN 1000 $FUTURE 10"

assert_exit "passes when stellar invoke succeeds" 0 \
  bash -c "$(declare -f init_contract die log emit_event sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; EXIT_INIT_FAIL=5; ERROR_COUNT=0
           stellar() { return 0; }
           init_contract CTEST GCREATOR GTOKEN 1000 $FUTURE 10"

_test_init_fail_emits_retry_hint() {
  local TMP_LOG TMP_JSON; TMP_LOG=$(mktemp); TMP_JSON=$(mktemp)
  bash -c "$(declare -f init_contract die log emit_event sanitize)
           DEPLOY_LOG=\"$TMP_LOG\"; DEPLOY_JSON_LOG=\"$TMP_JSON\"; NETWORK=testnet; EXIT_INIT_FAIL=5; ERROR_COUNT=0
           stellar() { return 1; }
           init_contract CTEST GCREATOR GTOKEN 1000 $FUTURE 10" &>/dev/null || true
  grep -q '"retry_hint"' "$TMP_JSON"
  local rc=$?; rm -f "$TMP_LOG" "$TMP_JSON"; return $rc
}
assert_exit "init failure emits retry_hint in JSON event" 0 _test_init_fail_emits_retry_hint

# ── Tests: check_network (new edge cases) ────────────────────────────────────

echo ""
echo "=== check_network (new edge cases) ==="

assert_exit "exits 6 when curl returns DNS failure (exit 6)" 6 \
  bash -c "$(declare -f check_network die log emit_event warn sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; EXIT_NETWORK_FAIL=6; ERROR_COUNT=0
           RPC_TESTNET='http://fake'; NETWORK_TIMEOUT=10
           curl() { return 6; }
           check_network"

assert_exit "exits 6 when curl returns timeout (exit 28)" 6 \
  bash -c "$(declare -f check_network die log emit_event warn sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; EXIT_NETWORK_FAIL=6; ERROR_COUNT=0
           RPC_TESTNET='http://fake'; NETWORK_TIMEOUT=10
           curl() { return 28; }
           check_network"

assert_exit "exits 6 when curl returns HTTP error (exit 22)" 6 \
  bash -c "$(declare -f check_network die log emit_event warn sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; EXIT_NETWORK_FAIL=6; ERROR_COUNT=0
           RPC_TESTNET='http://fake'; NETWORK_TIMEOUT=10
           curl() { return 22; }
           check_network"

assert_exit "skips check for unknown network (no exit)" 0 \
  bash -c "$(declare -f check_network die log emit_event warn sanitize)
           DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=localnet; EXIT_NETWORK_FAIL=6; ERROR_COUNT=0
           NETWORK_TIMEOUT=10
           check_network"

# ── Tests: sanitize ───────────────────────────────────────────────────────────

echo ""
echo "=== sanitize (new edge cases) ==="

assert_output_contains "redacts Stellar secret key pattern" "\[REDACTED\]" \
  bash -c "$(declare -f sanitize)
           SENSITIVE_PATTERNS=('S[0-9A-Z]{55}')
           sanitize 'key=SCZANGBA4XLKXCNQOICQ5WWXAQRODGQ5QLXWLKIRYQQNKUQSDVPFKBA'"

assert_output_contains "passes safe strings unchanged" "safe-value" \
  bash -c "$(declare -f sanitize)
           SENSITIVE_PATTERNS=('S[0-9A-Z]{55}')
           sanitize 'safe-value'"

# ── Tests: log / die ─────────────────────────────────────────────────────────

echo ""
echo "=== log / die ==="

assert_output_contains "log writes level tag" "\[INFO\]" \
  bash -c "$(declare -f log); DEPLOY_LOG=/dev/null; log INFO 'hello'"

assert_output_contains "log writes message" "hello world" \
  bash -c "$(declare -f log); DEPLOY_LOG=/dev/null; log INFO 'hello world'"

assert_exit "die exits with supplied code" 3 \
  bash -c "$(declare -f log die emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; ERROR_COUNT=0; die 3 'boom'"

assert_output_contains "die logs ERROR level" "\[ERROR\]" \
  bash -c "$(declare -f log die emit_event sanitize); DEPLOY_LOG=/dev/null; DEPLOY_JSON_LOG=/dev/null; NETWORK=testnet; ERROR_COUNT=0; die 3 'boom'" || true

# ── Tests: emit_event / DEPLOY_JSON_LOG ──────────────────────────────────────

echo ""
echo "=== emit_event / DEPLOY_JSON_LOG ==="

_test_emit_event_fields() {
  local TMP; TMP=$(mktemp)
  bash -c "$(declare -f emit_event log)
           DEPLOY_JSON_LOG=\"$TMP\"; NETWORK=testnet; EXIT_LOG_FAIL=7
           emit_event step_ok build 'WASM built'" &>/dev/null
  grep -q '"event":"step_ok"'   "$TMP" && \
  grep -q '"step":"build"'      "$TMP" && \
  grep -q '"network":"testnet"' "$TMP" && \
  grep -q '"timestamp"'         "$TMP"
  local rc=$?; rm -f "$TMP"; return $rc
}
assert_exit "emit_event writes event/step/network/timestamp fields" 0 _test_emit_event_fields

_test_emit_event_extra() {
  local TMP; TMP=$(mktemp)
  bash -c "$(declare -f emit_event log)
           DEPLOY_JSON_LOG=\"$TMP\"; NETWORK=testnet; EXIT_LOG_FAIL=7
           emit_event step_ok deploy 'deployed' '\"contract_id\":\"CABC\"'" &>/dev/null
  grep -q '"contract_id":"CABC"' "$TMP"
  local rc=$?; rm -f "$TMP"; return $rc
}
assert_exit "emit_event includes extra JSON fragment" 0 _test_emit_event_extra

_test_emit_event_escapes_quotes() {
  local TMP; TMP=$(mktemp)
  bash -c "$(declare -f emit_event log)
           DEPLOY_JSON_LOG=\"$TMP\"; NETWORK=testnet; EXIT_LOG_FAIL=7
           emit_event step_error validate 'bad \"value\"'" &>/dev/null
  grep -q 'bad \\\"value\\\"' "$TMP"
  local rc=$?; rm -f "$TMP"; return $rc
}
assert_exit "emit_event escapes double-quotes in message" 0 _test_emit_event_escapes_quotes

_test_die_writes_json_error() {
  local TMP_LOG TMP_JSON; TMP_LOG=$(mktemp); TMP_JSON=$(mktemp)
  bash -c "$(declare -f log die emit_event sanitize)
           DEPLOY_LOG=\"$TMP_LOG\"; DEPLOY_JSON_LOG=\"$TMP_JSON\"; NETWORK=testnet; ERROR_COUNT=0; EXIT_LOG_FAIL=7
           die 4 'deploy failed' 'stellar deploy' 'deploy'" &>/dev/null || true
  grep -q '"event":"step_error"' "$TMP_JSON" && \
  grep -q '"step":"deploy"'      "$TMP_JSON" && \
  grep -q '"exit_code":4'        "$TMP_JSON"
  local rc=$?; rm -f "$TMP_LOG" "$TMP_JSON"; return $rc
}
assert_exit "die writes step_error JSON event with exit_code and step" 0 _test_die_writes_json_error

_test_emit_event_unwritable_log() {
  bash -c "$(declare -f emit_event log)
           DEPLOY_JSON_LOG=/nonexistent_dir/events.json; NETWORK=testnet; EXIT_LOG_FAIL=7
           emit_event step_ok build 'test'" &>/dev/null
  local rc=$?
  [[ $rc -eq 7 ]]
}
assert_exit "emit_event exits 7 when DEPLOY_JSON_LOG is not writable" 0 _test_emit_event_unwritable_log

_test_deploy_complete_event() {
  local TMP_LOG TMP_JSON TMP_WASM TMP_SCRIPT
  TMP_LOG=$(mktemp); TMP_JSON=$(mktemp)
  TMP_WASM=$(mktemp --suffix=.wasm)
  TMP_SCRIPT=$(mktemp --suffix=.sh)
  printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > "$TMP_WASM"
  {
    echo "cargo()   { return 0; }"
    echo 'stellar() { case "$2" in deploy) echo CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;; *) ;; esac; return 0; }'
    echo 'curl()    { return 0; }'
    sed 's/^main "\$@"$/: # stubbed/' "$SCRIPT"
    echo "WASM_PATH=\"$TMP_WASM\""
    echo "main GCREATOR GTOKEN 1000 $FUTURE 1"
  } > "$TMP_SCRIPT"
  DEPLOY_LOG="$TMP_LOG" DEPLOY_JSON_LOG="$TMP_JSON" NETWORK=testnet \
    bash "$TMP_SCRIPT" &>/dev/null
  local rc=$?
  grep -q '"event":"deploy_complete"' "$TMP_JSON" && \
  grep -q '"contract_id":"CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"' "$TMP_JSON"
  local check=$?
  rm -f "$TMP_LOG" "$TMP_JSON" "$TMP_WASM" "$TMP_SCRIPT"
  [[ $rc -eq 0 && $check -eq 0 ]]
}
assert_exit "full run emits deploy_complete event with contract_id" 0 _test_deploy_complete_event

_test_json_log_truncated() {
  local TMP_LOG TMP_JSON TMP_WASM TMP_SCRIPT
  TMP_LOG=$(mktemp); TMP_JSON=$(mktemp)
  TMP_WASM=$(mktemp --suffix=.wasm)
  TMP_SCRIPT=$(mktemp --suffix=.sh)
  printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > "$TMP_WASM"
  echo '{"event":"stale"}' > "$TMP_JSON"
  {
    echo "cargo()   { return 0; }"
    echo 'stellar() { case "$2" in deploy) echo CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;; *) ;; esac; return 0; }'
    echo 'curl()    { return 0; }'
    sed 's/^main "\$@"$/: # stubbed/' "$SCRIPT"
    echo "WASM_PATH=\"$TMP_WASM\""
    echo "main GCREATOR GTOKEN 1000 $FUTURE 1"
  } > "$TMP_SCRIPT"
  DEPLOY_LOG="$TMP_LOG" DEPLOY_JSON_LOG="$TMP_JSON" NETWORK=testnet \
    bash "$TMP_SCRIPT" &>/dev/null
  ! grep -q '"event":"stale"' "$TMP_JSON"
  local rc=$?
  rm -f "$TMP_LOG" "$TMP_JSON" "$TMP_WASM" "$TMP_SCRIPT"
  return $rc
}
assert_exit "main truncates DEPLOY_JSON_LOG at start" 0 _test_json_log_truncated

# ── Tests: DEPLOY_LOG file capture ───────────────────────────────────────────

echo ""
echo "=== DEPLOY_LOG file capture ==="

assert_exit "log appends to DEPLOY_LOG file" 0 \
  bash -c "$(declare -f log)
           TMP=\$(mktemp); DEPLOY_LOG=\"\$TMP\"
           log INFO 'test entry'
           grep -q 'test entry' \"\$TMP\"
           rm -f \"\$TMP\""

_test_main_truncates_log() {
  local TMP_LOG TMP_JSON TMP_WASM TMP_SCRIPT
  TMP_LOG=$(mktemp); TMP_JSON=$(mktemp)
  TMP_WASM=$(mktemp --suffix=.wasm)
  TMP_SCRIPT=$(mktemp --suffix=.sh)
  printf '\x00\x61\x73\x6d\x01\x00\x00\x00' > "$TMP_WASM"
  echo 'stale content' > "$TMP_LOG"
  {
    echo "cargo()   { return 0; }"
    echo 'stellar() { case "$2" in deploy) echo CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA;; *) ;; esac; return 0; }'
    echo 'curl()    { return 0; }'
    sed 's/^main "\$@"$/: # stubbed/' "$SCRIPT"
    echo "WASM_PATH=\"$TMP_WASM\""
    echo "main GCREATOR GTOKEN 1000 $FUTURE 1"
  } > "$TMP_SCRIPT"
  DEPLOY_LOG="$TMP_LOG" DEPLOY_JSON_LOG="$TMP_JSON" NETWORK=testnet \
    bash "$TMP_SCRIPT" &>/dev/null
  local rc=$?
  ! grep -q 'stale content' "$TMP_LOG"
  local check=$?
  rm -f "$TMP_LOG" "$TMP_JSON" "$TMP_WASM" "$TMP_SCRIPT"
  [[ $rc -eq 0 && $check -eq 0 ]]
}
assert_exit "main truncates DEPLOY_LOG at start" 0 _test_main_truncates_log

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
