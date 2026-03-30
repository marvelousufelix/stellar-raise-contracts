# emergency_stop

Permanent, irreversible contract shutdown for crisis management.

## Overview

The emergency stop is a one-way kill switch distinct from the reversible `pause` mechanism. Once triggered, all state-mutating entry points are blocked forever and the campaign status is set to `Cancelled` so contributors can immediately reclaim funds via `refund_single`.

## Difference from Pause

| | `pause` / `unpause` | `emergency_stop` |
|:--|:-------------------:|:----------------:|
| Reversible | ✅ | ❌ |
| Who can trigger | `PAUSER_ROLE` or `DEFAULT_ADMIN_ROLE` | `DEFAULT_ADMIN_ROLE` only |
| Who can undo | `DEFAULT_ADMIN_ROLE` | Nobody |
| Campaign status | Unchanged | Set to `Cancelled` |
| Use case | Operational freeze, maintenance | Irrecoverable compromise |

## Contract Entry Points

```rust
// Trigger the emergency stop (admin only, irreversible)
fn emergency_stop(env, caller);

// View: returns true if the stop has been triggered
fn is_stopped(env) -> bool;
```

## Storage

| Key | Type | Storage | Description |
|:----|:-----|:--------|:------------|
| `DataKey::EmergencyStopped` | `bool` | Instance | Set to `true` on trigger; never cleared |

## Events

| Event | Payload | Emitted when |
|:------|:--------|:-------------|
| `(emergency, stopped)` | `caller: Address` | Emergency stop is triggered |

## Blocked Entry Points

After `emergency_stop` is triggered, the following entry points panic with `"emergency stop active"`:

- `contribute()`
- `withdraw()`

`refund_single` remains callable so contributors are never permanently locked out of their funds.

## Security Assumptions

1. Only `DEFAULT_ADMIN_ROLE` may trigger the emergency stop.
2. The stop is **irreversible** — no function clears `EmergencyStopped`.
3. Triggering emits `(emergency, stopped)` for off-chain monitoring.
4. After stop, `refund_single` remains callable so contributors can recover funds.
5. `assert_not_stopped` is a cheap instance-storage read — negligible gas cost.
6. The `"already stopped"` guard prevents redundant event spam.

## CLI Usage

```bash
# Trigger emergency stop (admin only)
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <ADMIN_SECRET_KEY> \
  -- emergency_stop \
  --caller <ADMIN_ADDRESS>

# Check stop state
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <ANY_KEY> \
  -- is_stopped
```

## When to Use

Trigger `emergency_stop` only when:
- A critical vulnerability is actively being exploited
- The contract state is irrecoverably corrupted
- A `pause` + upgrade cycle is not fast enough to contain the incident

For routine maintenance or precautionary freezes, use `pause` / `unpause` instead.
