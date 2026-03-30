# state_migration

## Overview

`state_migration.rs` introduces a secure, audit-friendly schema versioning layer for the crowdfund contract.
It stores a dedicated per-instance `Version` field and provides a deterministic migration engine from legacy versions to the current contract schema.

## Behavior

- `CURRENT_SCHEMA_VERSION` is set to `2`.
- Legacy contracts with no version stored (`0`) are considered uninitialized for migration.
- `migrate_to` only allows monotonic, forward upgrades.
- Downgrade attempts fail with `DowngradeNotAllowed`.
- Unknown target versions fail with `UnsupportedVersion`.

## Security assumptions

1. Migration entrypoints must be guarded by contract-level auth (`DEFAULT_ADMIN_ROLE` in an actual deployment).
2. Each migration step is idempotent and writes the new version only after successful step completion.
3. No data mutation occurs in case of migration error; caller must retry with fixes.
4. `enforce_current_version` panics if schema mismatches, preventing accidental use of incompatible runtime logic.
