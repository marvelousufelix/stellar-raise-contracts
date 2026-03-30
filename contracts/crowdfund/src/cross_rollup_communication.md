# Cross-Contract Communication

## Overview

This module (`cross_rollup_communication.rs`) provides gas-efficient, secure
cross-contract communication primitives for the Stellar Raise crowdfund contract.

> **Note on terminology:** Stellar is a single-chain Layer-1 network — it has no
> rollups. The concept of "cross-rollup communication" maps directly to
> **cross-contract invocation** on Soroban: calling external contracts (token
> contracts, NFT contracts, factory contracts, or third-party protocol adapters)
> from within this contract. This module implements that pattern with an explicit
> security allowlist.

---

## Architecture

```
CrowdfundContract
    │
    ├── register_trusted_contract(admin, address)   ← admin-only
    ├── deregister_trusted_contract(admin, address) ← admin-only
    ├── trusted_contracts()                         ← view
    ├── is_trusted_contract(address)                ← view
    │
    └── cross_rollup_communication module
            │
            ├── invoke_external(target, fn, args)   ← allowlist-gated dispatch
            ├── register_trusted_contract(...)
            ├── deregister_trusted_contract(...)
            ├── trusted_contracts()
            └── is_trusted()
```

---

## Public API

### `register_trusted_contract(env, admin, contract_address)`

Adds `contract_address` to the trusted allowlist.

- Only the stored **admin** may call this (panics otherwise).
- Idempotent — calling with an already-registered address is a no-op.
- Enforces a hard cap of `MAX_TRUSTED_CONTRACTS` (20) entries.
- Emits a `xc_reg` event on success.

### `deregister_trusted_contract(env, admin, contract_address)`

Removes `contract_address` from the trusted allowlist.

- Only the stored **admin** may call this.
- No-ops silently if the address was not registered.
- Emits a `xc_dreg` event on success.

### `invoke_external(env, target, function, args) -> Val`

Dispatches a cross-contract call to `target`.

- Panics with `"target contract is not trusted"` if `target` is not allowlisted.
- Emits a `xc_call` audit event after every successful dispatch.
- Returns the raw `Val` from the external contract.

### `trusted_contracts(env) -> Vec<Address>`

Returns the current allowlist. Read-only.

### `is_trusted(env, contract_address) -> bool`

Returns `true` if `contract_address` is in the allowlist. Read-only.

---

## Security Model

| Threat | Mitigation |
|--------|-----------|
| Arbitrary external call | `invoke_external` only dispatches to allowlisted addresses |
| Allowlist manipulation | Only the admin (set at `initialize`) can register/deregister |
| Unbounded storage growth | Hard cap of `MAX_TRUSTED_CONTRACTS = 20` entries |
| Re-entrancy via external call | CEI pattern: all state mutations happen before `invoke_external` |
| Audit trail | Every register, deregister, and dispatch emits an on-chain event |

### Security Assumptions

1. The **admin** key is kept secure. Compromise of the admin key allows
   arbitrary contracts to be added to the allowlist.
2. Callers of `invoke_external` are responsible for any auth required by the
   target contract (e.g. `require_auth` on the target side).
3. The allowlist is a **necessary but not sufficient** security control — the
   admin must only register contracts that have been audited.

---

## Gas Efficiency

- The trusted-contract list is stored in **instance storage** (cheapest
  Soroban storage tier for frequently-read data).
- `is_trusted` performs a single storage read and a linear scan of at most
  `MAX_TRUSTED_CONTRACTS` (20) entries — O(1) in practice.
- No unbounded loops: the allowlist cap prevents runaway gas consumption.

---

## Events

| Event topic | Data | Emitted when |
|-------------|------|--------------|
| `xc_reg`    | `contract_address` | A contract is added to the allowlist |
| `xc_dreg`   | `contract_address` | A contract is removed from the allowlist |
| `xc_call`   | `function_name`    | An external contract is invoked |

---

## Usage Examples

### Register a trusted contract (CLI)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <ADMIN_SECRET_KEY> \
  -- register_trusted_contract \
  --admin <ADMIN_ADDRESS> \
  --contract_address <EXTERNAL_CONTRACT_ADDRESS>
```

### Check if a contract is trusted

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- is_trusted_contract \
  --contract_address <ADDRESS>
```

### Remove a trusted contract

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <ADMIN_SECRET_KEY> \
  -- deregister_trusted_contract \
  --admin <ADMIN_ADDRESS> \
  --contract_address <EXTERNAL_CONTRACT_ADDRESS>
```

---

## Test Coverage

Tests are in `cross_rollup_communication_test.rs` and cover:

| Test | Scenario |
|------|----------|
| `test_register_trusted_contract_happy_path` | Normal registration |
| `test_register_trusted_contract_idempotent` | Duplicate registration is a no-op |
| `test_register_trusted_contract_non_admin_panics` | Non-admin is rejected |
| `test_register_trusted_contract_limit_enforced` | Cap of 20 is enforced |
| `test_deregister_trusted_contract_removes_entry` | Correct entry removed, others intact |
| `test_deregister_trusted_contract_noop_when_not_registered` | No panic on unknown address |
| `test_deregister_trusted_contract_non_admin_panics` | Non-admin is rejected |
| `test_is_trusted_returns_false_for_unknown` | Unknown address returns false |
| `test_trusted_contracts_empty_by_default` | Empty list on fresh contract |
| `test_invoke_external_dispatches_to_trusted_contract` | Correct return value |
| `test_invoke_external_emits_audit_event` | `xc_call` event emitted |
| `test_invoke_external_panics_on_untrusted_target` | Untrusted target panics |
| `test_register_emits_event` | `xc_reg` event emitted |
| `test_deregister_emits_event` | `xc_dreg` event emitted |

Run with:

```bash
cargo test -p crowdfund cross_rollup
```
