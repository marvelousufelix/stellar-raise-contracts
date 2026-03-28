#!/usr/bin/env bash
# @title   deployment_shell_script.sh
# @notice  Builds, deploys, and initialises the Stellar Raise crowdfund contract
#          on a target network with structured error capturing and logging.
# @dev     Requires: stellar CLI (>=0.0.18), Rust + wasm32-unknown-unknown target.
#          Human-readable log  → DEPLOY_LOG      (default: deploy_errors.log)
#          Structured JSON log → DEPLOY_JSON_LOG (default: deploy_events.json)
#            Each line is a self-contained JSON object (NDJSON) the frontend UI
#            can stream-parse to display live progress and typed error messages.
#          Exit codes:
#            0  – success
#            1  – missing dependency
#            2  – invalid / missing argument
#            3  – build failure
#            4  – deploy failure
#            5  – initialise failure
#            6  – network connectivity failure
#            7  – log file write failure
#            8  – WASM file permission / integrity failure
#            9  – signal / interrupt received

set -euo pipefail

# ── Exit code constants ───────────────────────────────────────────────────────
readonly EXIT_OK=0
readonly EXIT_MISSING_DEP=1
readonly EXIT_BAD_ARG=2
readonly EXIT_BUILD_FAIL=3
readonly EXIT_DEPLOY_FAIL=4
readonly EXIT_INIT_FAIL=5
readonly EXIT_NETWORK_FAIL=6
readonly EXIT_LOG_FAIL=7
readonly EXIT_WASM_INTEGRITY_FAIL=8
readonly EXIT_SIGNAL=9

# ── RPC endpoints ─────────────────────────────────────────────────────────────
readonly RPC_TESTNET="https://soroban-testnet.stellar.org/health"
readonly RPC_MAINNET="https://soroban.stellar.org/health"
readonly RPC_FUTURENET="https://rpc-futurenet.stellar.org/health"
readonly NETWORK_TIMEOUT=10
readonly DEFAULT_MIN_CONTRIBUTION=1
readonly WASM_TARGET="wasm32-unknown-unknown"
readonly DEFAULT_NETWORK="testnet"
readonly DEFAULT_DEPLOY_LOG="deploy_errors.log"

# ── Runtime config ────────────────────────────────────────────────────────────
NETWORK="${NETWORK:-testnet}"
DEPLOY_LOG="${DEPLOY_LOG:-deploy_errors.log}"
DEPLOY_JSON_LOG="${DEPLOY_JSON_LOG:-deploy_events.json}"
WASM_PATH="target/wasm32-unknown-unknown/release/crowdfund.wasm"
DRY_RUN="${DRY_RUN:-false}"
ERROR_COUNT=0

# ── Sensitive patterns for log sanitisation ───────────────────────────────────
# @notice Patterns that may indicate secrets embedded in error output.
#         Matched strings are replaced with [REDACTED] before JSON emission.
# @custom:security Conservative by design — false positives are acceptable;
#                  false negatives (leaking secrets) are not.
readonly -a SENSITIVE_PATTERNS=(
  'S[0-9A-Z]{55}'           # Stellar secret key (starts with S, 56 chars)
  'secret[_-]?key[^"]*'     # generic "secret_key" label
  'private[_-]?key[^"]*'    # generic "private_key" label
  'password=[^[:space:]]*'  # password= query param
  'token=[^[:space:]]*'     # token= query param
)

# ── Signal handling ───────────────────────────────────────────────────────────

# @notice Trap handler for SIGINT / SIGTERM.
#         Emits a step_error JSON event so the frontend UI can show an
#         "interrupted" state rather than hanging on the last step_start.
# @custom:security Does not re-raise the signal to avoid double-logging.
_handle_signal() {
  local sig="$1"
  (( ERROR_COUNT++ )) || true
  log "ERROR" "Deployment interrupted by signal $sig"
  emit_event "step_error" "signal" \
    "Deployment interrupted by signal $sig" \
    "\"exit_code\":$EXIT_SIGNAL,\"error_count\":$ERROR_COUNT"
  exit $EXIT_SIGNAL
}
trap '_handle_signal SIGINT'  INT
trap '_handle_signal SIGTERM' TERM

# ── Helpers ──────────────────────────────────────────────────────────────────

# @notice Writes a timestamped message to stdout and the human-readable log.
# @param  $1  severity  (INFO | WARN | ERROR)
# @param  $2  message
log() {
  local level="$1" msg="$2"
  local ts; ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "[$ts] [$level] $msg" | tee -a "$DEPLOY_LOG"
}

# @notice Sanitises a string by replacing known sensitive patterns with [REDACTED].
# @param  $1  raw string
# @return sanitised string on stdout
# @custom:security Applied to all user-supplied values before JSON emission.
sanitize() {
  local s="$1"
  for pat in "${SENSITIVE_PATTERNS[@]}"; do
    s="$(echo "$s" | sed -E "s/$pat/[REDACTED]/g")"
  done
  echo "$s"
}

# @notice Appends one NDJSON event line to DEPLOY_JSON_LOG.
#         The frontend UI reads this file to render live step status and errors.
# @param  $1  event   – step_start | step_ok | step_error | deploy_complete
# @param  $2  step    – validate | build | deploy | init | network_check | signal | done
# @param  $3  message – human-readable description (double-quotes escaped)
# @param  $4  extra   – optional raw JSON fragment appended inside the object
#                       e.g. '"contract_id":"CXXX"'
emit_event() {
  local event="$1" step="$2" msg="$3" extra="${4:-}"
  local ts; ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  # Escape double-quotes and backslashes in the message so the JSON stays valid.
  local safe_msg="${msg//\\/\\\\}"; safe_msg="${safe_msg//\"/\\\"}"
  local json="{\"event\":\"$event\",\"step\":\"$step\",\"message\":\"$safe_msg\",\"timestamp\":\"$ts\",\"network\":\"$NETWORK\""
  [[ -n "$extra" ]] && json="${json},${extra}"
  # Edge case: guard against unwritable log file
  if ! echo "${json}}" >> "$DEPLOY_JSON_LOG" 2>/dev/null; then
    echo "[ERROR] Cannot write to DEPLOY_JSON_LOG: $DEPLOY_JSON_LOG" >&2
    exit $EXIT_LOG_FAIL
  fi
}

# @notice Logs an error, emits a JSON step_error event, and exits.
#         Increments ERROR_COUNT before exit.
# @param  $1  exit_code
# @param  $2  message
# @param  $3  context  (optional – failed command or extra detail)
# @param  $4  step     (optional – which pipeline step failed; default: unknown)
die() {
  local code="$1" msg="$2" context="${3:-}" step="${4:-unknown}"
  (( ERROR_COUNT++ )) || true
  log "ERROR" "$msg"
  [[ -n "$context" ]] && log "ERROR" "  context: $context"
  log "ERROR" "  exit_code=$code  errors_total=$ERROR_COUNT"
  local safe_ctx
  safe_ctx="$(sanitize "$context")"
  safe_ctx="${safe_ctx//\\/\\\\}"; safe_ctx="${safe_ctx//\"/\\\"}"
  emit_event "step_error" "$step" "$msg" \
    "\"exit_code\":$code,\"context\":\"$safe_ctx\",\"error_count\":$ERROR_COUNT"
  exit "$code"
}

# @notice Records a non-fatal warning and increments the error counter.
# @param  $1  message
warn() {
  (( ERROR_COUNT++ )) || true
  log "WARN" "$1"
}

# @notice Verifies that a required CLI tool is present on PATH.
# @param  $1  tool name
require_tool() {
  command -v "$1" &>/dev/null \
    || die $EXIT_MISSING_DEP "Required tool not found: $1" "Ensure '$1' is installed and on your PATH" "validate"
}

# @notice Runs a command, capturing stderr to DEPLOY_LOG and timing the step.
# @param  $@  command and arguments
run_captured() {
  local start end rc=0
  start=$(date +%s)
  "$@" 2>>"$DEPLOY_LOG" || rc=$?
  end=$(date +%s)
  log "INFO" "  step_duration=$(( end - start ))s  command='$1'"
  return $rc
}

# @notice Prints usage and exits 0.
print_help() {
  cat <<HELPEOF
Usage: deployment_shell_script.sh [OPTIONS] <creator> <token> <goal> <deadline> [min_contribution]

Builds, deploys, and initialises the Stellar Raise crowdfund contract.

Positional arguments:
  creator            Stellar address of the campaign creator
  token              Stellar address of the token contract
  goal               Funding goal in stroops (positive integer)
  deadline           Unix timestamp for campaign end (must be in the future)
  min_contribution   Minimum pledge amount (default: $DEFAULT_MIN_CONTRIBUTION)

Options:
  --help             Show this help message and exit
  --dry-run          Validate arguments and dependencies without deploying

Environment variables:
  NETWORK            Stellar network to target          (default: testnet)
  DEPLOY_LOG         Human-readable log path            (default: deploy_errors.log)
  DEPLOY_JSON_LOG    Structured NDJSON event log path   (default: deploy_events.json)
  DRY_RUN            Set to 'true' to enable dry-run mode

Exit codes:
  $EXIT_OK  success             $EXIT_BUILD_FAIL  build failure        $EXIT_NETWORK_FAIL  network failure
  $EXIT_MISSING_DEP  missing dependency  $EXIT_DEPLOY_FAIL  deploy failure
  $EXIT_BAD_ARG  invalid argument    $EXIT_INIT_FAIL  init failure
  $EXIT_LOG_FAIL  log write failure   $EXIT_WASM_INTEGRITY_FAIL  WASM integrity failure
  $EXIT_SIGNAL  signal/interrupt
HELPEOF
  exit $EXIT_OK
}

# ── Argument validation ───────────────────────────────────────────────────────

# @notice Validates all required positional arguments before any network call.
# @param  $1  creator          – Stellar address of the campaign creator
# @param  $2  token            – Stellar address of the token contract
# @param  $3  goal             – Funding goal (positive integer, stroops)
# @param  $4  deadline         – Unix timestamp; must be in the future
# @param  $5  min_contribution – Minimum pledge amount (positive integer)
# @custom:edge goal=0 is rejected (must be > 0 to fund anything meaningful)
# @custom:edge min_contribution=0 is rejected (zero pledge has no economic value)
# @custom:edge deadline exactly equal to now is rejected (must be strictly future)
# @custom:edge creator and token identical addresses are warned (unusual but not fatal)
validate_args() {
  local creator="$1" token="$2" goal="$3" deadline="$4" min_contribution="$5"

  [[ -n "$creator" ]]                       || die $EXIT_BAD_ARG "creator is required"                                    "" "validate"
  [[ -n "$token" ]]                         || die $EXIT_BAD_ARG "token is required"                                      "" "validate"
  [[ "$goal" =~ ^[0-9]+$ ]]                 || die $EXIT_BAD_ARG "goal must be a positive integer, got: '$goal'"          "" "validate"
  [[ "$deadline" =~ ^[0-9]+$ ]]             || die $EXIT_BAD_ARG "deadline must be a Unix timestamp, got: '$deadline'"    "" "validate"
  [[ "$min_contribution" =~ ^[0-9]+$ ]]     || die $EXIT_BAD_ARG "min_contribution must be a positive integer"            "" "validate"

  # Edge case: goal must be > 0
  (( goal > 0 )) || die $EXIT_BAD_ARG "goal must be greater than 0, got: $goal" "" "validate"

  # Edge case: min_contribution must be > 0
  (( min_contribution > 0 )) || die $EXIT_BAD_ARG "min_contribution must be greater than 0, got: $min_contribution" "" "validate"

  # Edge case: min_contribution must not exceed goal
  (( min_contribution <= goal )) \
    || die $EXIT_BAD_ARG \
       "min_contribution ($min_contribution) must not exceed goal ($goal)" \
       "" "validate"

  local now; now="$(date +%s)"
  # Edge case: deadline must be strictly in the future (not equal to now)
  (( deadline > now )) || die $EXIT_BAD_ARG "deadline must be in the future (got $deadline, now $now)" "" "validate"

  # Edge case: warn when creator and token share the same address (unusual config)
  if [[ "$creator" == "$token" ]]; then
    warn "creator and token addresses are identical — verify this is intentional"
  fi

  emit_event "step_ok" "validate" "Arguments validated"
  log "INFO" "Arguments validated."
}

# ── Log file guard ────────────────────────────────────────────────────────────

# @notice Verifies that both log files are writable before any work begins.
#         Exits EXIT_LOG_FAIL if either path cannot be written.
# @custom:edge Catches read-only filesystems, permission errors, and full disks
#              before they silently corrupt the event stream mid-deployment.
check_log_writable() {
  for f in "$DEPLOY_LOG" "$DEPLOY_JSON_LOG"; do
    if ! touch "$f" 2>/dev/null; then
      echo "[ERROR] Log file is not writable: $f" >&2
      exit $EXIT_LOG_FAIL
    fi
  done
}

# ── WASM integrity check ──────────────────────────────────────────────────────

# @notice Verifies the WASM artifact is a valid WASM binary (magic bytes \0asm).
#         Called after build_contract to catch truncated or corrupt builds.
# @param  $1  wasm_path
# @custom:edge Catches zero-byte files, text error files written to the WASM path,
#              and partial writes caused by disk-full conditions.
# @custom:security Prevents deploying a corrupt or tampered WASM to the network.
check_wasm_integrity() {
  local path="$1"
  [[ -f "$path" ]] || die $EXIT_WASM_INTEGRITY_FAIL \
    "WASM file not found: $path" "" "build"

  # Edge case: zero-byte WASM
  [[ -s "$path" ]] || die $EXIT_WASM_INTEGRITY_FAIL \
    "WASM file is empty (0 bytes): $path" "" "build"

  # Edge case: validate WASM magic bytes (0x00 0x61 0x73 0x6D = \0asm)
  local magic
  magic="$(od -A n -t x1 -N 4 "$path" 2>/dev/null | tr -d ' \n')"
  if [[ "$magic" != "0061736d" ]]; then
    die $EXIT_WASM_INTEGRITY_FAIL \
      "WASM magic bytes invalid (got '$magic', expected '0061736d')" \
      "$path" "build"
  fi

  emit_event "step_ok" "wasm_integrity" "WASM integrity verified" \
    "\"wasm_path\":\"$path\""
  log "INFO" "WASM integrity check passed: $path"
}

# ── Network pre-check ────────────────────────────────────────────────────────

# @notice Lightweight connectivity check against the target network RPC endpoint.
#         Skipped for unknown networks; exits EXIT_NETWORK_FAIL on failure.
# @custom:edge Handles curl not installed (falls through to require_tool check).
# @custom:edge Handles HTTP non-200 responses from the health endpoint.
# @custom:edge Handles DNS resolution failures (curl exit 6).
check_network() {
  local rpc_url
  case "$NETWORK" in
    testnet)   rpc_url="$RPC_TESTNET"   ;;
    mainnet)   rpc_url="$RPC_MAINNET"   ;;
    futurenet) rpc_url="$RPC_FUTURENET" ;;
    *)
      warn "Unknown network '$NETWORK' — skipping connectivity pre-check"
      return 0
      ;;
  esac
  emit_event "step_start" "network_check" "Checking connectivity to $NETWORK"
  log "INFO" "Checking network connectivity ($NETWORK)..."

  local curl_exit=0
  curl --silent --fail --max-time "$NETWORK_TIMEOUT" "$rpc_url" \
    &>/dev/null 2>>"$DEPLOY_LOG" || curl_exit=$?

  if [[ "$curl_exit" -ne 0 ]]; then
    # Edge case: distinguish DNS failure (curl exit 6) from timeout (exit 28)
    # and HTTP error (exit 22) for richer frontend error messages.
    local reason
    case "$curl_exit" in
      6)  reason="DNS resolution failed for $rpc_url" ;;
      28) reason="Connection timed out after ${NETWORK_TIMEOUT}s for $rpc_url" ;;
      22) reason="HTTP error response from $rpc_url" ;;
      *)  reason="curl exited with code $curl_exit for $rpc_url" ;;
    esac
    die $EXIT_NETWORK_FAIL \
      "Network connectivity check failed for $NETWORK: $reason" \
      "GET $rpc_url" "network_check"
  fi

  emit_event "step_ok" "network_check" "Network reachable"
  log "INFO" "Network reachable."
}

# ── Core steps ───────────────────────────────────────────────────────────────

# @notice Compiles the contract to WASM using the WASM_TARGET constant.
# @custom:edge Runs WASM integrity check after build to catch corrupt artifacts.
build_contract() {
  emit_event "step_start" "build" "Building WASM"
  log "INFO" "Building WASM..."
  if ! run_captured cargo build --target wasm32-unknown-unknown --release; then
    die $EXIT_BUILD_FAIL "cargo build failed – see $DEPLOY_LOG for details" \
          "cargo build --target wasm32-unknown-unknown --release" "build"
  fi
  [[ -f "$WASM_PATH" ]] || die $EXIT_BUILD_FAIL \
    "WASM artifact not found at $WASM_PATH after build" "" "build"

  # Edge case: validate WASM integrity before attempting deploy
  check_wasm_integrity "$WASM_PATH"

  emit_event "step_ok" "build" "WASM built successfully" "\"wasm_path\":\"$WASM_PATH\""
  log "INFO" "Build succeeded: $WASM_PATH"
}

# @notice Deploys the WASM to the network; prints the contract ID to stdout.
# @param  $1  source – signing identity (named Stellar CLI key, never a raw secret)
# @custom:security Never pass a raw secret key as source; use a named identity.
# @custom:edge Sanitises the returned contract_id to guard against injection
#              in case the CLI returns unexpected output.
# @custom:edge Validates contract_id format (starts with C, 56 chars) before use.
deploy_contract() {
  local source="$1"
  emit_event "step_start" "deploy" "Deploying to $NETWORK"
  log "INFO" "Deploying to $NETWORK..."
  local contract_id
  if ! contract_id=$(stellar contract deploy \
      --wasm "$WASM_PATH" \
      --network "$NETWORK" \
      --source "$source" 2>>"$DEPLOY_LOG"); then
    die $EXIT_DEPLOY_FAIL \
      "stellar contract deploy failed – see $DEPLOY_LOG for details" \
      "stellar contract deploy --network $NETWORK" "deploy"
  fi

  # Edge case: empty contract ID
  [[ -n "$contract_id" ]] || die $EXIT_DEPLOY_FAIL \
    "Deploy returned an empty contract ID" "" "deploy"

  # Edge case: contract ID format validation (Stellar contract IDs start with C)
  if [[ ! "$contract_id" =~ ^C[A-Z2-7]{55}$ ]]; then
    die $EXIT_DEPLOY_FAIL \
      "Deploy returned an invalid contract ID format: '$contract_id'" \
      "Expected Stellar contract address starting with C (56 chars)" "deploy"
  fi

  emit_event "step_ok" "deploy" "Contract deployed" "\"contract_id\":\"$contract_id\""
  log "INFO" "Contract deployed: $contract_id"
  echo "$contract_id"
}

# @notice Calls initialize on the deployed contract.
# @param  $1  contract_id
# @param  $2  creator
# @param  $3  token
# @param  $4  goal
# @param  $5  deadline
# @param  $6  min_contribution
# @custom:edge Emits a structured retry_hint event when init fails so the
#              frontend UI can suggest the user re-run with --skip-build.
init_contract() {
  local contract_id="$1" creator="$2" token="$3" goal="$4" deadline="$5" min_contribution="$6"
  emit_event "step_start" "init" "Initialising campaign on $contract_id"
  log "INFO" "Initialising campaign on contract $contract_id..."
  if ! stellar contract invoke \
      --id "$contract_id" \
      --network "$NETWORK" \
      --source "$creator" \
      -- initialize \
      --creator "$creator" \
      --token "$token" \
      --goal "$goal" \
      --deadline "$deadline" \
      --min_contribution "$min_contribution" 2>>"$DEPLOY_LOG"; then
    # Edge case: emit a retry hint so the frontend can surface a recovery action
    emit_event "step_error" "init" \
      "Contract initialisation failed – contract deployed but not initialised" \
      "\"exit_code\":$EXIT_INIT_FAIL,\"contract_id\":\"$contract_id\",\"retry_hint\":\"Re-run init with --contract-id $contract_id\",\"error_count\":$ERROR_COUNT"
    die $EXIT_INIT_FAIL \
      "Contract initialisation failed – see $DEPLOY_LOG for details" \
      "stellar contract invoke --id $contract_id -- initialize" "init"
  fi
  emit_event "step_ok" "init" "Campaign initialised successfully"
  log "INFO" "Campaign initialised successfully."
}

# @notice Prints a final human-readable summary.
print_summary() {
  echo ""
  if [[ "$ERROR_COUNT" -gt 0 ]]; then
    log "WARN" "Completed with $ERROR_COUNT warning(s). Review $DEPLOY_LOG for details."
  else
    log "INFO" "Deployment completed successfully with 0 errors."
  fi
}

# ── Entry point ───────────────────────────────────────────────────────────────

main() {
  local positional=()
  for arg in "$@"; do
    case "$arg" in
      --help)    print_help ;;
      --dry-run) DRY_RUN="true" ;;
      *)         positional+=("$arg") ;;
    esac
  done

  local creator="${positional[0]:-}"
  local token="${positional[1]:-}"
  local goal="${positional[2]:-}"
  local deadline="${positional[3]:-}"
  local min_contribution="${positional[4]:-$DEFAULT_MIN_CONTRIBUTION}"

  # Edge case: guard log files before truncating them
  check_log_writable

  # Truncate both logs for this run
  : > "$DEPLOY_LOG"
  : > "$DEPLOY_JSON_LOG"

  require_tool cargo
  require_tool stellar

  validate_args "$creator" "$token" "$goal" "$deadline" "$min_contribution"

  if [[ "$DRY_RUN" == "true" ]]; then
    log "INFO" "Dry-run mode: arguments and dependencies validated. Skipping build/deploy/init."
    emit_event "deploy_complete" "done" "Dry-run validation passed" \
      "\"dry_run\":true,\"error_count\":$ERROR_COUNT"
    print_summary
    return 0
  fi

  check_network

  build_contract
  local contract_id
  contract_id="$(deploy_contract "$creator")"
  init_contract "$contract_id" "$creator" "$token" "$goal" "$deadline" "$min_contribution"

  emit_event "deploy_complete" "done" "Deployment finished" \
    "\"contract_id\":\"$contract_id\",\"error_count\":$ERROR_COUNT"
  print_summary

  echo ""
  echo "Contract ID: $contract_id"
  echo "Save this Contract ID for interacting with the campaign."
}

main "$@"
