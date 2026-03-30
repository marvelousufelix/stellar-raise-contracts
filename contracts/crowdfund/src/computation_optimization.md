# computation_optimization

## Overview

`computation_optimization.rs` provides seven pure, gas-efficient computation
helpers for the Stellar Raise crowdfunding contract.  Every helper is
storage-thin (no ledger reads/writes), overflow-safe, and bounded to prevent
unbounded instruction consumption in Soroban's metered execution environment.

---

## Security Assumptions

| Assumption | Enforcement |
|---|---|
| No overflow / underflow | `checked_mul`, `checked_add`, `checked_div`, `saturating_mul` throughout |
| No floating-point | All ratios use basis points (BPS_SCALE = 10 000) |
| Bounded iteration | Every loop capped at `MAX_BATCH` (50) or `MAX_TIERS` (8) |
| No auth required | All helpers are pure / read-only; auth enforced by callers |
| Deterministic output | No randomness or timestamp reads inside pure helpers |
| Fee ≤ amount | `tiered_fee_bps` with `fee_bps = 10_000` (100%) returns exactly `amount` |

---

## API Reference

### `isqrt(n: u128) -> u128`

Integer square root via Newton–Raphson iteration.  Returns the largest integer
`r` such that `r * r <= n`.  O(log n), no floating-point.

```rust
assert_eq!(isqrt(100), 10);
assert_eq!(isqrt(99),  9);   // floor
```

Gas benefit: replaces expensive floating-point `sqrt` with pure integer ops.

---

### `weighted_average(amounts: &[i128], weights: &[i128]) -> Option<i128>`

Single-pass weighted average.  Returns `None` when:
- slice lengths differ
- slice length > `MAX_BATCH` (50)
- any weight or amount is negative
- total weight is zero
- any intermediate product overflows `i128`

```rust
// (100*1 + 200*3) / 4 = 175
assert_eq!(weighted_average(&[100, 200], &[1, 3]), Some(175));
```

Gas benefit: one pass instead of N separate storage reads.

---

### `tiered_fee_bps(amount: i128, tiers: &[FeeTier]) -> Option<i128>`

Tiered platform fee using basis points.  Tiers must be sorted by `threshold`
ascending.  Falls back to the last tier when `amount` exceeds all thresholds.

```rust
let tiers = [
    FeeTier { threshold: 1_000,     fee_bps: 500 },  // 5%
    FeeTier { threshold: i128::MAX, fee_bps: 100 },  // 1%
];
assert_eq!(tiered_fee_bps(500, &tiers), Some(25));    // 500 * 5% = 25
assert_eq!(tiered_fee_bps(5_000, &tiers), Some(50));  // 5000 * 1% = 50
```

Returns `None` for empty tiers, zero/negative amounts, or > `MAX_TIERS` (8).

---

### `batch_min_max(values: &[i128]) -> Option<(i128, i128)>`

Single-pass min/max scan.  Returns `None` for empty or oversized (> `MAX_BATCH`) slices.

```rust
assert_eq!(batch_min_max(&[5, 1, 9, 3]), Some((1, 9)));
```

Gas benefit: one pass instead of two separate scans.

---

### `percentile_rank_bps(target: i128, values: &[i128]) -> Option<i128>`

O(n) percentile rank without sorting.  Returns the fraction of values ≤ target,
expressed in basis points.

```rust
// 2 out of 3 values ≤ 50 → 6_666 bps
assert_eq!(percentile_rank_bps(50, &[10, 50, 100]), Some(6_666));
```

Returns `None` for empty or oversized slices.

---

### `deadline_proximity_bps(now: u64, start: u64, deadline: u64) -> u32`

Normalised urgency score: 0 bps at `start`, `BPS_SCALE` at or past `deadline`.

```rust
assert_eq!(deadline_proximity_bps(500, 0, 1_000), 5_000); // 50%
assert_eq!(deadline_proximity_bps(2_000, 0, 1_000), 10_000); // clamped
```

Returns `0` for invalid ranges (`deadline <= start` or `now < start`).

---

### `compound_progress_bps(total_raised: i128, goals: &[i128]) -> Option<Vec<u32>>`

Multi-goal progress in one call.  Returns a `Vec<u32>` parallel to `goals`,
each value in `[0, BPS_SCALE]`.

```rust
// raised=500: goal1=1000→5000bps, goal2=500→10000bps
assert_eq!(
    compound_progress_bps(500, &[1_000, 500]),
    Some(vec![5_000, 10_000])
);
```

Returns `None` for empty, oversized, or non-positive goals.

---

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `BPS_SCALE` | `10_000` | Basis-point denominator (100%) |
| `MAX_BATCH` | `50` | Maximum slice length for batch helpers |
| `MAX_TIERS` | `8` | Maximum number of fee tiers |

---

## Gas Optimisation Notes

1. **Single-pass algorithms** — `batch_min_max`, `weighted_average`, and
   `compound_progress_bps` each make exactly one pass over their input.
2. **No storage I/O** — all helpers are pure; callers control when to read/write.
3. **Integer-only arithmetic** — no floating-point host calls.
4. **Early exit** — `tiered_fee_bps` stops at the first matching tier.
5. **Bounded loops** — `MAX_BATCH` and `MAX_TIERS` caps prevent runaway gas.

---

## Running the Tests

```bash
cargo test --package crowdfund computation_optimization
```

Expected: all tests pass with ≥ 95% line coverage.

To measure coverage:

```bash
cargo tarpaulin --package crowdfund --out Stdout
```

---

## Test Coverage Map

| Section | Tests | Coverage area |
|---|---|---|
| `isqrt` | 12 | Base cases, perfect squares, floor invariant, u128::MAX |
| `weighted_average` | 11 | Equal/unequal weights, mismatches, overflow, bounds |
| `tiered_fee_bps` | 11 | All tiers, fallback, zero/negative, overflow, bounds |
| `batch_min_max` | 10 | Single, multiple, negatives, extremes, bounds |
| `percentile_rank_bps` | 9 | Max/min/below/equal, single, bounds |
| `deadline_proximity_bps` | 11 | Start/mid/end, past, invalid ranges, large timestamps |
| `compound_progress_bps` | 11 | Single/multi goal, zero, saturation, invalid, bounds |
| Security assumptions | 7 | Constants, no-panic, fee cap, range invariants |

---

## Adding a New Helper

1. Add the function in `computation_optimization.rs` following the existing
   pattern (pure, `checked_*` arithmetic, bounded input).
2. Document with `@notice`, `@dev`, `@custom:security-note`, and `@param`/`@return`.
3. Add a happy-path test, at least one failure-path test, and a boundary test
   in `computation_optimization.test.rs`.
4. Run `cargo test` and confirm ≥ 95% coverage.
