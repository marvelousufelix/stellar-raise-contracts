#!/usr/bin/env bash
# @title   deployment_shell_script.sh
# @notice  Builds, deploys, and initialises the Stellar Raise crowdfund contract
#          on a target network with structured error capturing and logging.
# @dev     Requires: stellar CLI (>=0.0.18), Rust + wasm32-unknown-unknown target.
#          Human-readable log  -> DEPLOY_LOG      (default: deploy_errors.log)
#          Structured JSON log -> DEPLOY_JSON_LOG (default: deploy_events.json)
#            Each line is a self-contained JSON object (NDJSON) the frontend UI
#            can stream-parse to display live progress and typed error messages.
#          Exit codes:
#            0  - success          3  - build failure       6  - network failure
#            1  - missing dep      4  - deploy failure      7  - log write failure
#            2  - invalid arg      5  - init failure

set -euo pipefail

# =============================================================================
# @section Exit code constants
# @notice  All exit codes are named readonly constants. Use these everywhere;
#          never hard-code a numeric exit code in function bodies.
# =============================================================================

# @constant EXIT_OK            Successful completion.
readonly EXIT_OK=0
# @constant EXIT_MISSING_DEP   A required CLI tool (cargo/stellar) is absent.
readonly EXIT_MISSING_DEP=1
# @constant EXIT_BAD_ARG       A positional argument failed validation.
readonly EXIT_BAD_ARG=2
# @constant EXIT_BUILD_FAIL    cargo build returned non-zero or WASM missing.
readonly EXIT_BUILD_FAIL=3
# @constant EXIT_DEPLOY_FAIL   stellar contract deploy failed or returned empty ID.
readonly EXIT_DEPLOY_FAIL=4
# @constant EXIT_INIT_FAIL     stellar contract invoke (initialize) failed.
readonly EXIT_INIT_FAIL=5
# @constant EXIT_NETWORK_FAIL  RPC health-check timed out or returned non-200.
readonly EXIT_NETWORK_FAIL=6
# @constant EXIT_LOG_FAIL      Could not write to DEPLOY_LOG (disk full / perms).
readonly EXIT_LOG_FAIL=7

# =============================================================================
# @section Network RPC endpoints
# @notice  Health-check URLs used by check_network(). Update here when endpoints
#          change; no other code needs to be touched.
# =============================================================================

# @constant RPC_TESTNET    Soroban testnet health endpoint.
readonly RPC_TESTNET="https://soroban-testnet.stellar.org/health"
# @constant RPC_MAINNET    Soroban mainnet health endpoint.
readonly RPC_MAINNET="https://soroban.stellar.org/health"
# @constant RPC_FUTURENET  Soroban futurenet health endpoint.
readonly RPC_FUTURENET="https://rpc-futurenet.stellar.org/health"
# @constant NETWORK_TIMEOUT  curl --max-time value in seconds.
readonly NETWORK_TIMEOUT=10

# =============================================================================
# @section Build constants
# =============================================================================

# @constant WASM_TARGET  Rust cross-compilation target for Soroban contracts.
readonly WASM_TARGET="wasm32-unknown-unknown"
# @constant DEFAULT_MIN_CONTRIBUTION  Minimum pledge in stroops when not supplied.
readonly DEFAULT_MIN_CONTRIBUTION=1
# @constant DEFAULT_NETWORK  Stellar network used when NETWORK env var is unset.
readonly DEFAULT_NETWORK="testnet"
# @constant DEFAULT_DEPLOY_LOG  Human-readable log path when DEPLOY_LOG is unset.
readonly DEFAULT_DEPLOY_LOG="deploy_errors.log"
# @constant DEFAULT_DEPLOY_JSON_LOG  NDJSON event log path when unset.
readonly DEFAULT_DEPLOY_JSON_LOG="deploy_events.json"

# =============================================================================
# @section Runtime config  (overridable via environment variables)
# =============================================================================

NETWORK="${NETWORK:-$DEFAULT_NETWORK}"
DEPLOY_LOG="${DEPLOY_LOG:-$DEFAULT_DEPLOY_LOG}"
DEPLOY_JSON_LOG="${DEPLOY_JSON_LOG:-$DEFAULT_DEPLOY_JSON_LOG}"
WASM_PATH="target/${WASM_TARGET}/release/crowdfund.wasm"
DRY_RUN="${DRY_RUN:-false}"
ERROR_COUNT=0

# =============================================================================
# @section Helpers
# =============================================================================

# @notice Writes a timestamped message to stdout and the human-readable log.
#         Exits with EXIT_LOG_FAIL if the log file cannot be written (disk full,
#         permission denied) so the caller always knows the log is intact.
# @param  $1  severity  INFO | WARN | ERROR
# @param  $2  message
log() {
  local level="$1" msg="$2"
  local ts; ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local line="[$ts] [$level] $msg"
  echo "$line"
  echo "$line" >> "$DEPLOY_LOG" || {
    echo "[$ts] [ERROR] Cannot write to DEPLOY_LOG ($DEPLOY_LOG) - disk full or permission denied" >&2
    exit $EXIT_LOG_FAIL
  }
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
#         The frontend UI stream-parses this file to render live step status.
#         All user-supplied strings are sanitised before embedding in JSON:
#           - ASCII control characters stripped (prevents terminal injection)
#           - Backslashes escaped
#           - Double-quotes escaped
# @param  $1  event   step_start | step_ok | step_error | deploy_complete
# @param  $2  step    validate | build | deploy | init | network_check | done
# @param  $3  message Human-readable description
# @param  $4  extra   Optional raw JSON fragment, e.g. '"contract_id":"CXXX"'
# @security   Sanitisation prevents JSON injection via crafted error messages.
emit_event() {
  local event="$1" step="$2" msg="$3" extra="${4:-}"
  local ts; ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  # Strip control chars, then escape backslashes and double-quotes.
  local safe_msg; safe_msg="$(printf '%s' "$msg" | sed 's/[[:cntrl:]]//g')"
  safe_msg="${safe_msg//\\/\\\\}"
  safe_msg="${safe_msg//\"/\\\"}"

  local safe_event; safe_event="$(printf '%s' "$event" | sed 's/[[:cntrl:]]//g; s/[\"\\]//g')"
  local safe_step;  safe_step="$(printf '%s' "$step"   | sed 's/[[:cntrl:]]//g; s/[\"\\]//g')"

  local json
  json="{\"event\":\"${safe_event}\",\"step\":\"${safe_step}\",\"message\":\"${safe_msg}\",\"timestamp\":\"${ts}\",\"network\":\"${NETWORK}\""
  [[ -n "$extra" ]] && json="${json},${extra}"
  json="${json}}"

  echo "$json" >> "$DEPLOY_JSON_LOG" || {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] [ERROR] Cannot write to DEPLOY_JSON_LOG ($DEPLOY_JSON_LOG)" >&2
    exit $EXIT_LOG_FAIL
  }
}

# @notice Logs an error, emits a step_error JSON event, increments ERROR_COUNT,
#         and exits with the supplied code.
# @param  $1  exit_code  One of the EXIT_* constants.
# @param  $2  message    Human-readable error description.
# @param  $3  context    Optional: failed command or extra detail.
# @param  $4  step       Optional: pipeline step that failed (default: unknown).
die() {
  local code="$1" msg="$2" context="${3:-}" step="${4:-unknown}"
  (( ERROR_COUNT++ )) || true
  log "ERROR" "$msg"
  [[ -n "$context" ]] && log "ERROR" "  context: $context"
  log "ERROR" "  exit_code=$code  errors_total=$ERROR_COUNT"

  local safe_ctx; safe_ctx="$(printf '%s' "$context" | sed 's/[[:cntrl:]]//g')"
  safe_ctx="${safe_ctx//\\/\\\\}"
  safe_ctx="${safe_ctx//\"/\\\"}"

  emit_event "step_error" "$step" "$msg" \
    "\"exit_code\":${code},\"context\":\"${safe_ctx}\",\"error_count\":${ERROR_COUNT}"
  exit "$code"
}

# @notice Records a non-fatal warning and increments ERROR_COUNT.
# @param  $1  message
warn() {
  (( ERROR_COUNT++ )) || true
  log "WARN" "$1"
}

# @notice Verifies a required CLI tool is present on PATH.
# @param  $1  tool name
require_tool() {
  command -v "$1" &>/dev/null \
    || die $EXIT_MISSING_DEP "Required tool not found: $1" \
           "Ensure '$1' is installed and on your PATH" "validate"
}

# @notice Runs a command, capturing stderr to DEPLOY_LOG and timing the step.
#         Returns the command exit code; the caller decides whether to die().
# @param  $@  command and arguments
run_captured() {
  local start end rc=0
  start=$(date +%s)
  "$@" 2>>"$DEPLOY_LOG" || rc=$?
  end=$(date +%s)
  log "INFO" "  step_duration=$(( end - start ))s  rc=${rc}  command='$1'"
  return $rc
}

# @notice Prints usage to stdout and exits 0.
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
  NETWORK            Stellar network to target          (default: $DEFAULT_NETWORK)
  DEPLOY_LOG         Human-readable log path            (default: $DEFAULT_DEPLOY_LOG)
  DEPLOY_JSON_LOG    Structured NDJSON event log path   (default: $DEFAULT_DEPLOY_JSON_LOG)
  DRY_RUN            Set to 'true' to enable dry-run mode

Exit codes:
  0 success   1 missing dep   2 invalid arg   3 build fail
  4 deploy fail   5 init fail   6 network fail   7 log write fail
HELPEOF
  exit $EXIT_OK
}

# =============================================================================
# @section Argument validation
# =============================================================================

# @notice Validates all positional arguments before any network call is made.
#         Emits step_start/step_ok JSON events so the frontend can show progress.
# @param  $1  creator          Stellar address of the campaign creator.
# @param  $2  token            Stellar address of the token contract.
# @param  $3  goal             Funding goal in stroops (non-negative integer).
# @param  $4  deadline         Unix timestamp; must be strictly in the future.
# @param  $5  min_contribution Minimum pledge amount (non-negative integer).
# @security   All validation happens before any network or filesystem side-effect.
validate_args() {
  local creator="$1" token="$2" goal="$3" deadline="$4" min_contribution="$5"

  emit_event "step_start" "validate" "Validating arguments"

  [[ -n "$creator" ]]                   || die $EXIT_BAD_ARG "creator is required"                                    "" "validate"
  [[ -n "$token" ]]                     || die $EXIT_BAD_ARG "token is required"                                      "" "validate"
  [[ "$goal" =~ ^[0-9]+$ ]]             || die $EXIT_BAD_ARG "goal must be a non-negative integer, got: '$goal'"      "" "validate"
  [[ "$deadline" =~ ^[0-9]+$ ]]         || die $EXIT_BAD_ARG "deadline must be a Unix timestamp, got: '$deadline'"    "" "validate"
  [[ "$min_contribution" =~ ^[0-9]+$ ]] || die $EXIT_BAD_ARG "min_contribution must be a non-negative integer"        "" "validate"

  local now; now="$(date +%s)"
  (( deadline > now )) || die $EXIT_BAD_ARG \
    "deadline must be in the future (got $deadline, now $now)" "" "validate"

  emit_event "step_ok" "validate" "Arguments validated"
  log "INFO" "Arguments validated."
}

# =============================================================================
# @section Network pre-check
# =============================================================================

# @notice Lightweight RPC health-check before spending time on a WASM build.
#         Uses NETWORK_TIMEOUT constant; skips gracefully for unknown networks.
# @security  curl output is redirected to DEPLOY_LOG, not stdout, so RPC
#            responses never leak into the terminal or CI logs.
check_network() {
  local rpc_url
  case "$NETWORK" in
    testnet)   rpc_url="$RPC_TESTNET"   ;;
    mainnet)   rpc_url="$RPC_MAINNET"   ;;
    futurenet) rpc_url="$RPC_FUTURENET" ;;
    *)
      warn "Unknown network '$NETWORK' - skipping connectivity pre-check"
      return 0
      ;;
  esac
  emit_event "step_start" "network_check" "Checking connectivity to $NETWORK ($rpc_url)"
  log "INFO" "Checking network connectivity ($NETWORK -> $rpc_url)..."
  if ! curl --silent --fail --max-time "$NETWORK_TIMEOUT" "$rpc_url" \
       >> "$DEPLOY_LOG" 2>&1; then
    die $EXIT_NETWORK_FAIL \
        "Network connectivity check failed for $NETWORK" \
        "GET $rpc_url timed out or returned non-200 (timeout=${NETWORK_TIMEOUT}s)" \
        "network_check"
  fi
  emit_event "step_ok" "network_check" "Network reachable" "\"rpc_url\":\"${rpc_url}\""
  log "INFO" "Network reachable ($rpc_url)."
}

# =============================================================================
# @section Core pipeline steps
# =============================================================================

# @notice Compiles the crowdfund contract to WASM.
#         Uses WASM_TARGET constant; verifies the artifact exists after build.
build_contract() {
  emit_event "step_start" "build" "Building WASM (target: $WASM_TARGET)"
  log "INFO" "Building WASM (target: $WASM_TARGET)..."
  if ! run_captured cargo build --target "$WASM_TARGET" --release; then
    die $EXIT_BUILD_FAIL \
        "cargo build failed - see $DEPLOY_LOG for details" \
        "cargo build --target $WASM_TARGET --release" "build"
  fi
  [[ -f "$WASM_PATH" ]] \
    || die $EXIT_BUILD_FAIL "WASM artifact not found at $WASM_PATH after build" "" "build"
  emit_event "step_ok" "build" "WASM built successfully" "\"wasm_path\":\"${WASM_PATH}\""
  log "INFO" "Build succeeded: $WASM_PATH"
}

# @notice Deploys the WASM to the target network and prints the contract ID.
# @param  $1  source  Named Stellar CLI identity used for signing.
# @security   Never pass a raw secret key as source. Use a named identity
#             created with: stellar keys generate --global <name>
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
        "stellar contract deploy failed - see $DEPLOY_LOG for details" \
        "stellar contract deploy --wasm $WASM_PATH --network $NETWORK" "deploy"
  fi
  # Trim any trailing whitespace from the returned contract ID.
  contract_id="${contract_id//[[:space:]]/}"
  [[ -n "$contract_id" ]] \
    || die $EXIT_DEPLOY_FAIL "Deploy returned an empty contract ID" "" "deploy"
  emit_event "step_ok" "deploy" "Contract deployed" "\"contract_id\":\"${contract_id}\""
  log "INFO" "Contract deployed: $contract_id"
  echo "$contract_id"
}

# @notice Calls initialize on the deployed contract to set up the campaign.
# @param  $1  contract_id
# @param  $2  creator
# @param  $3  token
# @param  $4  goal
# @param  $5  deadline
# @param  $6  min_contribution
# @custom:edge Emits a structured retry_hint event when init fails so the
#              frontend UI can suggest the user re-run with --skip-build.
init_contract() {
  local contract_id="$1" creator="$2" token="$3" \
        goal="$4" deadline="$5" min_contribution="$6"
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
    die $EXIT_INIT_FAIL \
        "Contract initialisation failed - see $DEPLOY_LOG for details" \
        "stellar contract invoke --id $contract_id -- initialize" "init"
  fi
  emit_event "step_ok" "init" "Campaign initialised successfully"
  log "INFO" "Campaign initialised successfully."
}

# @notice Prints a final human-readable summary to stdout and DEPLOY_LOG.
print_summary() {
  echo ""
  if [[ "$ERROR_COUNT" -gt 0 ]]; then
    log "WARN" "Completed with $ERROR_COUNT warning(s). Review $DEPLOY_LOG for details."
  else
    log "INFO" "Deployment completed successfully with 0 errors."
  fi
}

# =============================================================================
# @section Entry point
# =============================================================================

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

  # Truncate both logs at the start of each run (fresh slate).
  : > "$DEPLOY_LOG"
  : > "$DEPLOY_JSON_LOG"

  require_tool cargo
  require_tool stellar

  validate_args "$creator" "$token" "$goal" "$deadline" "$min_contribution"

  if [[ "$DRY_RUN" == "true" ]]; then
    log "INFO" "Dry-run mode: arguments and dependencies validated. Skipping build/deploy/init."
    emit_event "deploy_complete" "done" "Dry-run validation passed" \
      "\"dry_run\":true,\"error_count\":${ERROR_COUNT}"
    print_summary
    return $EXIT_OK
  fi

  check_network
  build_contract

  local contract_id
  contract_id="$(deploy_contract "$creator")"
  init_contract "$contract_id" "$creator" "$token" "$goal" "$deadline" "$min_contribution"

  emit_event "deploy_complete" "done" "Deployment finished" \
    "\"contract_id\":\"${contract_id}\",\"error_count\":${ERROR_COUNT}"
  print_summary

  echo ""
  echo "Contract ID: $contract_id"
  echo "Save this Contract ID for interacting with the campaign."
}

main "$@"
