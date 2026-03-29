# Security Baseline Scanning

## Overview

This module (`security_baseline_scanning.rs`) provides automated, on-chain
security baseline checks for the Stellar Raise crowdfund contract. It validates
that critical storage invariants hold at any point in the contract lifecycle and
surfaces violations as typed errors.

---

## Architecture

```
CrowdfundContract
    │
    └── security_scan()   ← public, read-only, no auth required
            │
            └── security_baseline_scanning module
                    │
                    ├── run_baseline_scan(env)              ← runs all checks
                    ├── check_admin_set(env)
                    ├── check_creator_set(env)
                    ├── check_goal_positive(env)
                    ├── check_deadline_valid(env)
                    ├── check_min_contribution_valid(env)
                    ├── check_total_raised_non_negative(env)
                    ├── check_status_set(env)
                    └── check_contributions_non_negative(env)
```

---

## Checks

| Function | Invariant | Error on failure |
|----------|-----------|-----------------|
| `check_admin_set` | `DataKey::Admin` present in storage | `AdminNotSet` (100) |
| `check_creator_set` | `DataKey::Creator` present in storage | `CreatorNotSet` (101) |
| `check_goal_positive` | Goal > 0 | `GoalInvalid` (102) |
| `check_deadline_valid` | Deadline > current ledger timestamp | `DeadlineInvalid` (103) |
| `check_min_contribution_valid` | `min_contribution` ≥ 0 | `MinContributionInvalid` (104) |
| `check_total_raised_non_negative` | `total_raised` ≥ 0 | `TotalRaisedNegative` (105) |
| `check_status_set` | `DataKey::Status` present in storage | `StatusNotSet` (106) |
| `check_contributions_non_negative` | All per-contributor amounts ≥ 0 | `ContributionNegative` (107) |

---

## Security Assumptions

1. `run_baseline_scan` is **read-only** — it never mutates state. It is safe to
   call at any time without side effects.
2. Any `ScanError` returned indicates a corrupted or mis-initialised contract
   and should be treated as a critical finding requiring immediate investigation.
3. The scan is callable by **anyone** with no auth gate, because it only reads
   storage. This is intentional — monitoring tools and auditors should be able
   to run it permissionlessly.
4. `check_deadline_valid` will always return `DeadlineInvalid` after the
   campaign deadline has passed. This is expected behaviour — callers should
   only use this check during the `Active` phase.
5. `check_contributions_non_negative` is O(n) over the contributors list, which
   is bounded by `MAX_CONTRIBUTORS` (1,000). It will not exceed gas limits.

---

## Error Codes

| Code | Variant | Meaning |
|------|---------|---------|
| 100 | `AdminNotSet` | Admin key missing — contract not properly initialised |
| 101 | `CreatorNotSet` | Creator key missing — contract not properly initialised |
| 102 | `GoalInvalid` | Goal is zero, negative, or missing |
| 103 | `DeadlineInvalid` | Deadline is in the past or missing |
| 104 | `MinContributionInvalid` | `min_contribution` is negative or missing |
| 105 | `TotalRaisedNegative` | `total_raised` went below zero (critical) |
| 106 | `StatusNotSet` | Status key missing — contract not properly initialised |
| 107 | `ContributionNegative` | A contributor's stored amount is negative (critical) |

---

## Usage

### Run the full scan (CLI)

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- security_scan
```

Returns nothing on success. Returns a `ScanError` code on failure.

### Run in CI / monitoring scripts

```bash
RESULT=$(stellar contract invoke --id $CONTRACT_ID --network testnet -- security_scan 2>&1)
if [ $? -ne 0 ]; then
  echo "SECURITY BASELINE FAILED: $RESULT"
  exit 1
fi
echo "Security baseline: OK"
```

---

## Test Coverage

Tests are in `security_baseline_scanning_test.rs` and cover:

| Test | Scenario |
|------|----------|
| `test_full_scan_passes_on_valid_contract` | All checks pass after normal init |
| `test_check_admin_set_passes` | Admin present |
| `test_check_admin_set_fails_when_missing` | Admin absent → `AdminNotSet` |
| `test_check_creator_set_passes` | Creator present |
| `test_check_creator_set_fails_when_missing` | Creator absent → `CreatorNotSet` |
| `test_check_goal_positive_passes` | Goal > 0 |
| `test_check_goal_positive_fails_when_zero` | Goal = 0 → `GoalInvalid` |
| `test_check_goal_positive_fails_when_missing` | Goal absent → `GoalInvalid` |
| `test_check_deadline_valid_passes_during_active_campaign` | Deadline in future |
| `test_check_deadline_valid_fails_after_deadline` | Ledger past deadline → `DeadlineInvalid` |
| `test_check_deadline_valid_fails_when_missing` | Deadline absent → `DeadlineInvalid` |
| `test_check_min_contribution_valid_passes` | `min_contribution` ≥ 0 |
| `test_check_min_contribution_valid_fails_when_missing` | Missing → `MinContributionInvalid` |
| `test_check_total_raised_non_negative_passes` | `total_raised` = 0 |
| `test_check_total_raised_non_negative_passes_when_missing` | Missing defaults to 0 |
| `test_check_status_set_passes` | Status present |
| `test_check_status_set_fails_when_missing` | Status absent → `StatusNotSet` |
| `test_check_contributions_non_negative_passes_with_no_contributors` | Empty list |
| `test_check_contributions_non_negative_passes_with_contributors` | Contributor with valid amount |

Run with:

```bash
cargo test -p crowdfund security_baseline
```
