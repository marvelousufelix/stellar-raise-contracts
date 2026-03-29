# security_compliance_testing

On-chain compliance validation for the Stellar Raise crowdfunding contract.

## Overview

`security_compliance_testing.rs` provides a suite of pure, read-only compliance test
functions that verify the contract's security invariants at any point in time.
The module is designed to be called by CI pipelines, governance scripts, and
monitoring bots without requiring privileged access or mutating ledger state.

## Module Location

```
contracts/crowdfund/src/security_compliance_testing.rs
contracts/crowdfund/src/security_compliance_testing.test.rs
```

## Public API

### Individual Tests

| Function | What it validates |
|----------|-------------------|
| `test_goal_minimum(goal)` | `goal ≥ MIN_GOAL` (1 token unit) |
| `test_contribution_floor(min_contribution)` | `min_contribution ≥ MIN_CONTRIBUTION` (1 token unit) |
| `test_platform_fee(fee_bps)` | `fee_bps ≤ MAX_FEE_BPS` (1 000 bps = 10 %) |
| `test_deadline_buffer(deadline, now)` | `deadline ≥ now + MIN_DEADLINE_BUFFER_SECS` (60 s) |
| `test_arithmetic_bounds(total_raised, goal)` | `total_raised ≤ goal × 2` |
| `test_non_negative_contribution(amount)` | `amount ≥ 0` |
| `test_contributor_limit(count)` | `count ≤ MAX_CONTRIBUTORS` (128) |

### Aggregate Runner

```rust
pub fn run_all_tests(p: &ComplianceParams) -> ComplianceSummary
```

Runs all seven checks and returns a `ComplianceSummary` with `total`, `passed`,
`failed`, and `all_passed` fields.

### `TestResult`

```rust
pub enum TestResult {
    Passed,
    Failed(&'static str),  // violation description
}
```

Helper methods: `is_passed() -> bool`, `message() -> &'static str`.

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MIN_GOAL` | `1` | Minimum campaign goal (token units) |
| `MIN_CONTRIBUTION` | `1` | Minimum contribution floor (token units) |
| `MAX_FEE_BPS` | `1_000` | Maximum platform fee (10 %) |
| `MIN_DEADLINE_BUFFER_SECS` | `60` | Minimum deadline buffer from now |
| `MAX_CONTRIBUTORS` | `128` | Maximum compliant contributor count |

## Security Assumptions

1. **Read-only** — No function writes to storage.
2. **No auth required** — Compliance tests are permissionless.
3. **Deterministic** — Same ledger state → same result.
4. **Overflow-safe** — All arithmetic uses `checked_*` operations.
5. **Bounded** — `run_all_tests` iterates over a fixed 6-element slice (O(1)).

## Usage Example

```rust
use crate::security_compliance_testing::{run_all_tests, ComplianceParams};

let summary = run_all_tests(&ComplianceParams {
    goal: 1_000,
    min_contribution: 10,
    fee_bps: 250,
    deadline: env.ledger().timestamp() + 86_400,
    now: env.ledger().timestamp(),
    total_raised: 0,
    contributor_count: 0,
});

if !summary.all_passed {
    // emit event or return error
}
```

## Running Tests

```bash
cargo test -p crowdfund security_compliance_testing
```

Test coverage target: ≥ 95 % of all branches (50+ test cases).
