# security_incident_response

## Overview

`security_incident_response` is a Soroban smart contract module that provides
automated incident tracking and emergency handling for the crowdfund contract.
It counts on-chain security events and recommends an auto-pause when a
configurable threshold is reached.

## Functions

| Function | Description |
|---|---|
| `record_incident(env, reporter, severity)` | Increments the incident counter and returns an `IncidentRecord`. Sets `detected = true` once the counter reaches `AUTO_PAUSE_THRESHOLD`. |
| `get_incident_count(env)` | Returns the current counter value (0 if no incidents recorded). |
| `reset_incident_count(env)` | Resets the counter to 0. Caller must enforce access control. |
| `check_auto_pause(env)` | Returns `true` when `get_incident_count >= AUTO_PAUSE_THRESHOLD`. |

### IncidentSeverity

```rust
pub enum IncidentSeverity { Low, Medium, High, Critical }
impl IncidentSeverity { pub fn label(&self) -> &'static str }
```

### IncidentRecord

```rust
pub struct IncidentRecord {
    pub detected: bool,
    pub severity: IncidentSeverity,
    pub description: &'static str,  // "auto_pause_recommended" when detected
}
```

## Security Assumptions

1. **Permissionless recording** — any caller may record an incident so automated
   monitoring bots can operate without special privileges.
2. **Overflow safety** — the counter uses `saturating_add(1)` and never wraps.
3. **Reset is privileged** — `reset_incident_count` does not check auth; the
   call site must enforce access control (e.g. admin-only).
4. **No cross-module side-effects** — only reads/writes the `"inc_count"` Symbol
   key; never calls token or NFT contracts.

## Constants

| Constant | Value | Description |
|---|---|---|
| `MAX_INCIDENTS_PER_LEDGER` | `10` | Soft cap on incidents per ledger sequence |
| `AUTO_PAUSE_THRESHOLD` | `3` | Incidents before auto-pause is recommended |

## Usage Example

```rust
use crate::security_incident_response::{
    record_incident, check_auto_pause, reset_incident_count, IncidentSeverity,
};

// Record an incident
let record = record_incident(&env, &reporter_address, IncidentSeverity::High);
if record.detected {
    // Trigger emergency stop
}

// Check from a view function
if check_auto_pause(&env) {
    // Notify off-chain monitoring
}

// After remediation (admin only)
reset_incident_count(&env);
```

## Test Coverage

Tests are in `security_incident_response.test.rs` and cover:

- `IncidentSeverity` labels for all four variants
- `record_incident` below and at `AUTO_PAUSE_THRESHOLD`
- `get_incident_count` initial value and increment behaviour
- `reset_incident_count` clearing and subsequent fresh recording
- `check_auto_pause` false/true transitions
- Constant values

Target: **≥ 95% statement coverage**.
