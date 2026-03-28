# security_monitoring

Real-time threat detection and anomaly tracking for the crowdfund contract.

## Overview

`security_monitoring.rs` provides on-chain helpers that detect suspicious activity
patterns and emit structured events for off-chain alerting systems.  It is
intentionally permissionless — any caller (monitoring bot, CI pipeline, governance
script) can invoke the recording functions without a privileged key.

## Detected threats

| Threat | Trigger | Severity | Event topic |
|---|---|---|---|
| Contribution burst | > `BURST_THRESHOLD` (5) calls from one address | Medium | `security/burst_alert` |
| Whale contribution | Single amount > `WHALE_THRESHOLD_BPS` (50 %) of goal | Medium | `security/whale_alert` |
| Repeated failures | ≥ `FAILURE_THRESHOLD` (3) consecutive failures | High | `security/failure_alert` |
| Unauthorized access | ≥ `FAILURE_THRESHOLD` (3) unauthorized attempts | High | `security/unauth_alert` |

## Public API

```rust
// Recording (mutating)
record_contribution_attempt(env, contributor) -> ThreatRecord
record_failed_operation(env, address)         -> ThreatRecord
reset_burst_count(env, contributor)
reset_failure_count(env, address)

// Detection (pure / read-only)
check_whale_contribution(env, contributor, amount, goal) -> ThreatRecord
check_unauthorized_access_attempt(env, caller)           -> ThreatRecord

// Queries (read-only)
get_burst_count(env, contributor)  -> u32
get_failure_count(env, address)    -> u32
get_alert_count(env)               -> u32
get_security_summary(env)          -> u32
```

## Storage keys

Three new `DataKey` variants are used:

- `DataKey::BurstCount(Address)` — per-address contribution burst counter (instance storage).
- `DataKey::FailureCount(Address)` — per-address consecutive failure counter (instance storage).
- `DataKey::SecurityAlertCount` — global alert counter (instance storage).

## Security assumptions

1. **No auth required** — monitoring is permissionless so automated tooling does not need a privileged key.
2. **Overflow-safe** — all counters use `checked_add` and saturate at `u32::MAX`.
3. **Events after writes** — a panicking host will not emit a misleading alert.
4. **No cross-module side-effects** — this module never calls token or NFT contracts.
5. **Counters are informational** — they do not block operations by themselves; callers decide what action to take on a detected `ThreatRecord`.

## Running tests

```bash
cargo test -p crowdfund security_monitoring -- --nocapture
```
