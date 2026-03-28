# deployment_shell_script.sh

Builds, deploys, and initialises the Stellar Raise crowdfund contract with
structured error capturing, timestamped logging, and a machine-readable NDJSON
event stream for the frontend UI.

## What changed in this branch

| Area | Improvement |
|---|---|
| `log()` | Replaced `tee -a` with `echo >> file \|\| exit EXIT_LOG_FAIL` — write failures now surface as exit code 7 instead of silently continuing |
| `emit_event()` | Added `sed`-based control-character stripping before JSON embedding — prevents terminal/log injection via crafted error messages |
| `die()` | Context string now sanitised (control chars stripped, quotes escaped) before JSON embedding |
| Constants | All magic numbers and strings extracted to named `readonly` constants (`EXIT_*`, `RPC_*`, `WASM_TARGET`, `NETWORK_TIMEOUT`, `DEFAULT_*`) |
| `validate_args()` | Emits `step_start` / `step_ok` JSON events so the frontend can show validation progress |
| `check_network()` | Includes `rpc_url` in the `step_ok` event for easier debugging |
| `deploy_contract()` | Trims whitespace from the returned contract ID |
| `run_captured()` | Logs the command return code (`rc=`) alongside duration |
| Exit code 7 | New `EXIT_LOG_FAIL` constant for log write failures |

## Constants reference

### Exit codes

| Constant | Value | Meaning |
|---|---|---|
| `EXIT_OK` | `0` | Success |
| `EXIT_MISSING_DEP` | `1` | Required CLI tool absent |
| `EXIT_BAD_ARG` | `2` | Invalid / missing argument |
| `EXIT_BUILD_FAIL` | `3` | `cargo build` failure |
| `EXIT_DEPLOY_FAIL` | `4` | `stellar contract deploy` failure |
| `EXIT_INIT_FAIL` | `5` | `stellar contract invoke` failure |
| `EXIT_NETWORK_FAIL` | `6` | RPC health-check failure |
| `EXIT_LOG_FAIL` | `7` | Log write failure (disk full / permissions) |

### Network endpoints

| Constant | Value |
|---|---|
| `RPC_TESTNET` | `https://soroban-testnet.stellar.org/health` |
| `RPC_MAINNET` | `https://soroban.stellar.org/health` |
| `RPC_FUTURENET` | `https://rpc-futurenet.stellar.org/health` |
| `NETWORK_TIMEOUT` | `10` (seconds) |

### Build / runtime

| Constant | Value |
|---|---|
| `WASM_TARGET` | `wasm32-unknown-unknown` |
| `DEFAULT_MIN_CONTRIBUTION` | `1` |
| `DEFAULT_NETWORK` | `testnet` |
| `DEFAULT_DEPLOY_LOG` | `deploy_errors.log` |
| `DEFAULT_DEPLOY_JSON_LOG` | `deploy_events.json` |

## Usage

```bash
./scripts/deployment_shell_script.sh <creator> <token> <goal> <deadline> [min_contribution]
```

| Parameter | Type | Description |
|---|---|---|
| `creator` | string | Stellar address of the campaign creator |
| `token` | string | Stellar address of the token contract |
| `goal` | integer | Funding goal in stroops (>= 0) |
| `deadline` | integer | Unix timestamp — must be in the future |
| `min_contribution` | integer | Minimum pledge (default: `1`) |

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `NETWORK` | `testnet` | Stellar network to target |
| `DEPLOY_LOG` | `deploy_errors.log` | Human-readable timestamped log |
| `DEPLOY_JSON_LOG` | `deploy_events.json` | NDJSON event log for the frontend UI |
| `DRY_RUN` | `false` | Set to `true` to validate without deploying |

### Example

```bash
DEADLINE=$(date -d "+30 days" +%s)
./scripts/deployment_shell_script.sh GCREATOR... GTOKEN... 1000 "$DEADLINE" 10
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Missing dependency (`cargo` / `stellar`) |
| 2 | Invalid or missing argument |
| 3 | `cargo build` failure |
| 4 | `stellar contract deploy` failure |
| 5 | `stellar contract invoke` (init) failure |
| 6 | Network connectivity failure |
| 7 | Log write failure (disk full / permission denied) |

## Structured JSON event log (frontend UI)

Every line in `DEPLOY_JSON_LOG` is a self-contained JSON object (NDJSON).
The frontend streams this file to display live progress and typed errors.

### Event schema

```json
{
  "event":     "step_start | step_ok | step_error | deploy_complete",
  "step":      "validate | network_check | build | wasm_integrity | deploy | init | signal | done",
  "message":   "Human-readable description",
  "timestamp": "2026-03-28T00:00:00Z",
  "network":   "testnet"
}
```

`step_ok` for `network_check` includes `"rpc_url"`.
`step_ok` for `build` includes `"wasm_path"`.
`step_ok` for `deploy` and `deploy_complete` include `"contract_id"`.
`step_error` includes `"exit_code"`, `"context"`, and `"error_count"`.

### Frontend integration example

```ts
for await (const line of readLines('deploy_events.json')) {
  const event = JSON.parse(line);
  if (event.event === 'step_error') {
    throw new ContractError(`[${event.step}] ${event.message}`);
  }
  if (event.event === 'deploy_complete') {
    setContractId(event.contract_id);
  }
}
```

## Security assumptions

- Never pass a raw secret key as `creator` / `source`. Use a named Stellar CLI
  identity: `stellar keys generate --global alice`.
- `DEPLOY_LOG` and `DEPLOY_JSON_LOG` may contain sensitive RPC responses.
  Restrict permissions in production: `chmod 600 deploy_errors.log deploy_events.json`.
- `set -euo pipefail` ensures unhandled errors abort execution immediately.
- All user-supplied strings written to JSON are sanitised: control characters
  stripped, backslashes and double-quotes escaped — prevents log injection.
- `emit_event` sanitises both the message and the `event`/`step` fields.

## Running the tests

```bash
bash scripts/deployment_shell_script.test.sh
```

No external framework required. `cargo`, `stellar`, and `curl` are stubbed so
the suite runs fully offline.

### Test coverage

| Area | Cases |
|---|---|
| Exit code constants | 1 |
| `require_tool` | 2 |
| `validate_args` | 10 |
| `build_contract` | 3 |
| `deploy_contract` | 4 |
| `init_contract` | 2 |
| `check_network` | 3 |
| `log` / `die` | 5 |
| `emit_event` / `DEPLOY_JSON_LOG` | 7 |
| `DEPLOY_LOG` file behaviour | 2 |
| dry-run | 1 |
| **Total** | **40** |

All 40 tests pass (>= 95% coverage of every exported function).
