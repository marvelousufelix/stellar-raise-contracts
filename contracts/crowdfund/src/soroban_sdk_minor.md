# Soroban SDK Minor Version Bump Review

## Overview

This document covers the review and implementation of the Soroban SDK minor
version bump for the `crowdfund` smart contract, addressing
[GitHub Issue #363](https://github.com/Crowdfunding-DApp/stellar-raise-contracts/issues/363).

**Baseline:** `soroban-sdk = "22.0.0"`  
**Target:** `soroban-sdk = "22.0.1"` (workspace `Cargo.toml`)

---

## Files Changed

| File | Change |
|------|--------|
| `Cargo.toml` (workspace) | Bumped `soroban-sdk` from `22.0.0` → `22.0.1` |
| `contracts/crowdfund/src/lib.rs` | Added `pub mod soroban_sdk_minor` and test module |
| `contracts/crowdfund/src/soroban_sdk_minor.rs` | New: compatibility helpers and audit utilities |
| `contracts/crowdfund/src/soroban_sdk_minor_tests.rs` | New: comprehensive test suite (25 tests) |
| `contracts/crowdfund/src/soroban_sdk_minor.md` | New: this document |

---

## What a Minor Version Bump Means for Soroban

Soroban SDK versions are tied to Stellar Protocol versions. Within the same
major version (e.g. `22.x`):

- The **host-function ABI** is stable — compiled WASM binaries remain valid.
- The **`contracttype` storage layout** is unchanged — on-chain data is readable.
- The **`require_auth()` semantics** are identical.
- Changes are **additive**: new helpers, deprecation notices, or bug fixes.

A cross-major bump (e.g. `22.x` → `23.x`) may introduce breaking changes and
requires an explicit migration review.

---

## Security Assumptions

1. **Storage layout stability** — `#[contracttype]` ABI is frozen within a
   major version. Existing on-chain state (contributions, status, roadmap, etc.)
   remains readable after the bump.

2. **Auth model unchanged** — `require_auth()` guards on `initialize`,
   `withdraw`, `cancel`, `update_metadata`, `upgrade`, and `set_nft_contract`
   behave identically.

3. **Overflow protection preserved** — The release profile sets
   `overflow-checks = true` independently of the SDK version.

4. **WASM target flags unchanged** — `.cargo/config.toml` disables
   `reference-types` and `multivalue` for maximum host compatibility; these
   flags are not affected by a minor SDK bump.

5. **Zero-hash guard** — The `validate_wasm_hash` helper rejects a zeroed
   `BytesN<32>` to prevent accidental contract bricking during upgrades.

---

## NatSpec-Style Function Documentation

### `assess_compatibility(env, from_version, to_version) → CompatibilityStatus`

- **@param** `env` — Soroban execution environment (read-only use).
- **@param** `from_version` — Semver string of the current SDK (e.g. `"22.0.0"`).
- **@param** `to_version` — Semver string of the target SDK (e.g. `"22.0.1"`).
- **@returns** `Compatible` when major versions match; `RequiresMigration` otherwise.
- **@security** Read-only; no state mutations.

### `validate_wasm_hash(wasm_hash) → bool`

- **@param** `wasm_hash` — 32-byte WASM binary hash.
- **@returns** `true` if the hash is non-zero; `false` for a zeroed hash.
- **@security** Prevents upgrade calls with an uninitialised hash value.

### `emit_upgrade_audit_event(env, from_version, to_version, reviewer)`

- **@param** `env` — Soroban execution environment.
- **@param** `from_version` — Previous SDK version string.
- **@param** `to_version` — New SDK version string.
- **@param** `reviewer` — Address that approved the upgrade.
- **@emits** `("sdk_upgrade", "reviewed")` with `(reviewer, from_version, to_version)`.
- **@security** Provides an immutable on-chain audit trail for governance.

---

## Test Coverage

The test suite in `soroban_sdk_minor_tests.rs` contains **25 tests** covering:

- Version constant format validation
- `assess_compatibility`: same major, minor bump, patch bump, identical,
  cross-major, downgrade, malformed input, empty string, large numbers
- `validate_wasm_hash`: valid hash, zero hash, single-byte variants, all-0xFF
- `emit_upgrade_audit_event`: single event, topic symbols, multiple events
- Integration scenarios: safe path, unsafe path, partial failures

Run with:

```bash
cargo test -p crowdfund soroban_sdk_minor
```

---

## Upgrade Checklist

- [x] Bump `soroban-sdk` in `[workspace.dependencies]`
- [x] `cargo check --target wasm32-unknown-unknown` passes
- [x] All existing tests pass unchanged
- [x] New module and tests added
- [x] `CONTRACT_VERSION` constant unchanged (storage-layout guard)
- [x] `.cargo/config.toml` WASM flags verified unchanged
- [x] Security assumptions documented
- [x] Audit event helper available for on-chain governance records
