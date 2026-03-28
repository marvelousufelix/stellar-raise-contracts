# deployment_shell_script.sh

Builds, deploys, and initialises the Stellar Raise crowdfund contract with
structured error capturing, timestamped logging, and a machine-readable JSON
event stream for the frontend UI.

## Why this script exists

The original `deploy.sh` used `set -e` but swallowed error context — a failed
`cargo build` or `stellar contract deploy` would exit silently with no
actionable message. This script adds:

- Per-step exit codes (2–9) so CI can distinguish build vs deploy vs init failures.
- All stderr captured to `DEPLOY_LOG` (default `deploy_errors.log`) alongside
  timestamped stdout entries.
- A structured **NDJSON event log** (`DEPLOY_JSON_LOG`, default `deploy_events.json`)
  that the frontend UI can stream-parse to render live step status and typed errors.
- Argument validation with clear messages before any network call is made.
- New edge-case handling: WASM integrity checks, log writability guards,
  contract ID format validation, signal trapping, and sensitive-value sanitisation.

## Constants reference

| Constant                  | Value                                          | Purpose                          |
| :------------------------ | :--------------------------------------------- | :------------------------------- |
| `EXIT_OK`                 | `0`                                            | Success                          |
| `EXIT_MISSING_DEP`        | `1`                                            | Missing CLI dependency           |
| `EXIT_BAD_ARG`            | `2`                                            | Invalid / missing argument       |
| `EXIT_BUILD_FAIL`         | `3`                                            | `cargo build` failure            |
| `EXIT_DEPLOY_FAIL`        | `4`                                            | `stellar contract deploy` failure|
| `EXIT_INIT_FAIL`          | `5`                                            | `stellar contract invoke` failure|
| `EXIT_NETWORK_FAIL`       | `6`                                            | RPC connectivity failure         |
| `EXIT_LOG_FAIL`           | `7`                                            | Log file not writable            |
| `EXIT_WASM_INTEGRITY_FAIL`| `8`                                            | WASM magic bytes invalid / empty |
| `EXIT_SIGNAL`             | `9`                                            | SIGINT / SIGTERM received        |
| `WASM_TARGET`             | `wasm32-unknown-unknown`                       | Rust compilation target          |
| `WASM_PATH`               | `target/wasm32-unknown-unknown/release/crowdfund.wasm` | Expected WASM artifact  |
| `RPC_TESTNET`             | `https://soroban-testnet.stellar.org/health`   | Testnet health endpoint          |
| `RPC_MAINNET`             | `https://soroban.stellar.org/health`           | Mainnet health endpoint          |
| `RPC_FUTURENET`           | `https://rpc-futurenet.stellar.org/health`     | Futurenet health endpoint        |
| `NETWORK_TIMEOUT`         | `10`                                           | curl max-time (seconds)          |
| `DEFAULT_NETWORK`         | `testnet`                                      | Default Stellar network          |
| `DEFAULT_DEPLOY_LOG`      | `deploy_errors.log`                            | Default log file path            |
| `DEFAULT_MIN_CONTRIBUTION`| `1`                                            | Default minimum pledge (stroops) |

## Usage

```bash
./scripts/deployment_shell_script.sh <creator> <token> <goal> <deadline> [min_contribution]
```

| Parameter          | Type    | Description                                    |
| :----------------- | :------ | :--------------------------------------------- |
| `creator`          | string  | Stellar address of the campaign creator        |
| `token`            | string  | Stellar address of the token contract          |
| `goal`             | integer | Funding goal in stroops (must be > 0)          |
| `deadline`         | integer | Unix timestamp — must be strictly in the future|
| `min_contribution` | integer | Minimum pledge (default: `1`, must be > 0 and ≤ goal) |

### Environment variables

| Variable          | Default              | Description                                      |
| :---------------- | :------------------- | :----------------------------------------------- |
| `NETWORK`         | `testnet`            | Stellar network to target                        |
| `DEPLOY_LOG`      | `deploy_errors.log`  | Human-readable timestamped log                   |
| `DEPLOY_JSON_LOG` | `deploy_events.json` | Structured NDJSON event log for the frontend UI  |
| `DRY_RUN`         | `false`              | Set to `true` to validate without deploying      |

### Example

```bash
DEADLINE=$(date -d "+30 days" +%s)
./scripts/deployment_shell_script.sh \
  GCREATOR... GTOKEN... 1000 "$DEADLINE" 10
```

## Exit codes

| Code | Meaning                                        |
| :--- | :--------------------------------------------- |
| 0    | Success                                        |
| 1    | Missing dependency (`cargo` / `stellar`)       |
| 2    | Invalid or missing argument                    |
| 3    | `cargo build` failure                          |
| 4    | `stellar contract deploy` failure              |
| 5    | `stellar contract invoke` (init) failure       |
| 6    | Network connectivity failure                   |
| 7    | Log file not writable                          |
| 8    | WASM file missing, empty, or invalid magic bytes |
| 9    | Deployment interrupted by SIGINT / SIGTERM     |

## New edge cases (this release)

### Argument validation

| Edge case | Behaviour |
| :-------- | :-------- |
| `goal = 0` | Exits 2 — a zero-goal campaign has no economic value |
| `min_contribution = 0` | Exits 2 — a zero pledge cannot fund anything |
| `min_contribution > goal` | Exits 2 — no pledge could ever reach the goal |
| `deadline == now` | Exits 2 — deadline must be **strictly** in the future |
| `creator == token` (same address) | Non-fatal warning emitted; deployment continues |

### Log file writability

`check_log_writable` runs before any log truncation. If either `DEPLOY_LOG` or
`DEPLOY_JSON_LOG` cannot be written (read-only filesystem, bad path, full disk),
the script exits `7` immediately with a message to stderr — before any state is
modified.

### WASM integrity

After `cargo build`, `check_wasm_integrity` validates the artifact:

1. File must exist.
2. File must be non-empty (> 0 bytes).
3. First 4 bytes must be the WASM magic number `\x00\x61\x73\x6d` (`\0asm`).

Exits `8` on any failure. This prevents deploying a truncated build or a text
error file that `cargo` accidentally wrote to the WASM path.

### Network error classification

`check_network` now maps curl exit codes to human-readable reasons:

| curl exit | Reason emitted |
| :-------- | :------------- |
| 6         | DNS resolution failed |
| 28        | Connection timed out |
| 22        | HTTP error response |
| other     | `curl exited with code N` |

The reason is included in the `step_error` JSON event so the frontend UI can
display a specific message (e.g. "DNS failure — check your network") rather than
a generic "connectivity error".

### Contract ID format validation

After `stellar contract deploy`, the returned ID is validated against the regex
`^C[A-Z2-7]{55}$` (Stellar contract address format). An unexpected string —
such as a CLI warning message or empty output — exits `4` with a clear message
rather than silently passing a garbage ID to `init_contract`.

### Init failure retry hint

When `init_contract` fails, a `step_error` JSON event is emitted that includes a
`retry_hint` field. The frontend UI can surface this as a recovery action:

```json
{
  "event": "step_error",
  "step": "init",
  "message": "Contract initialisation failed – contract deployed but not initialised",
  "exit_code": 5,
  "contract_id": "CXXX...",
  "retry_hint": "Re-run init with --contract-id CXXX..."
}
```

### Signal handling

SIGINT and SIGTERM are trapped. On receipt, the script:

1. Increments `ERROR_COUNT`.
2. Logs `[ERROR] Deployment interrupted by signal SIGINT/SIGTERM`.
3. Emits a `step_error` JSON event with `"step":"signal"` so the frontend UI
   can transition to an "interrupted" state rather than hanging on the last
   `step_start`.
4. Exits `9`.

### Sensitive value sanitisation

`sanitize()` is applied to all user-supplied values before they are written to
the JSON event log. Patterns matched include Stellar secret keys (`S…`),
`secret_key=`, `private_key=`, `password=`, and `token=` query parameters.
Matched substrings are replaced with `[REDACTED]`.

## Human-readable log format

Every line written to `DEPLOY_LOG` follows:

```
[2026-03-26T03:00:00Z] [INFO|WARN|ERROR] <message>
```

## Structured JSON event log (frontend UI)

Every line in `DEPLOY_JSON_LOG` is a self-contained JSON object (NDJSON).

### Event schema

```json
{
  "event":     "step_start | step_ok | step_error | deploy_complete",
  "step":      "validate | network_check | build | wasm_integrity | deploy | init | signal | done",
  "message":   "Human-readable description",
  "timestamp": "2026-03-26T03:00:00Z",
  "network":   "testnet"
}
```

`step_ok` for `build` / `wasm_integrity` includes `"wasm_path"`.  
`step_ok` for `deploy` and `deploy_complete` include `"contract_id"`.  
`step_error` includes `"exit_code"`, `"context"`, and `"error_count"`.  
`step_error` for `init` also includes `"contract_id"` and `"retry_hint"`.

### Frontend integration example

```ts
for await (const line of readLines('deploy_events.json')) {
  const event = JSON.parse(line);
  if (event.event === 'step_error') {
    if (event.step === 'init' && event.retry_hint) {
      showRecoveryAction(event.retry_hint);
    }
    throw new ContractError(`[${event.step}] ${event.message}`);
  }
  if (event.event === 'deploy_complete') {
    setContractId(event.contract_id);
  }
}
```

## Security assumptions

- The `creator` argument is used as both the signing source and the on-chain
  creator address. **Never pass a raw secret key**; use a named Stellar CLI
  identity (`stellar keys generate --global alice`).
- `DEPLOY_LOG` and `DEPLOY_JSON_LOG` may contain sensitive RPC responses.
  Restrict file permissions in production: `chmod 600 deploy_errors.log deploy_events.json`.
- The script does **not** store or echo secret keys at any point.
- `set -euo pipefail` ensures unhandled errors abort execution immediately.
- Double-quotes and backslashes in error messages are escaped before JSON emission.
- `sanitize()` redacts known secret patterns from context strings before logging.
- WASM integrity check prevents deploying a corrupt or tampered binary.

## Running the tests

```bash
bash scripts/deployment_shell_script.test.sh
```

No external test framework required. `cargo`, `stellar`, and `curl` are stubbed
so the suite runs fully offline.

### Test coverage

| Area                                    | Cases |
| :-------------------------------------- | :---- |
| `require_tool`                          | 2     |
| `validate_args` (original)              | 9     |
| `validate_args` (new edge cases)        | 6     |
| `check_log_writable`                    | 3     |
| `check_wasm_integrity`                  | 4     |
| `build_contract`                        | 4     |
| `deploy_contract`                       | 5     |
| `init_contract`                         | 3     |
| `check_network` (new edge cases)        | 4     |
| `sanitize`                              | 2     |
| `log` / `die`                           | 4     |
| `emit_event` / `DEPLOY_JSON_LOG`        | 6     |
| `DEPLOY_LOG` file behaviour             | 2     |
| **Total**                               | **54**|

All 54 tests pass (≥ 95% coverage of every exported function, all new edge
cases, JSON event emission, and both log-truncation behaviours).
