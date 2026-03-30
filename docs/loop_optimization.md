# Loop Optimization for Gas Efficiency

Gas-efficient loop patterns for the Stellar Raise crowdfund contract.

## Overview

`contracts/crowdfund/src/loop_optimization.rs` provides reusable, bounded
iteration helpers that replace ad-hoc loops throughout the contract. Every
function has a predictable gas cost because iteration is capped at
`MAX_LOOP_ITEMS` (1 000) — the same limit as the contributor cap.

## Public API

| Function | Description | Gas pattern |
|----------|-------------|-------------|
| `bounded_sum` | Sum values up to the cap | O(min(n, cap)) |
| `find_first` | First value matching a predicate | O(k) — early exit |
| `count_matching` | Count values matching a predicate | O(min(n, cap)) |
| `aggregate_stats` | Count + sum + max + min in one pass | O(min(n, cap)) |
| `deduplicate_sorted` | Remove consecutive duplicates | O(min(n, cap)) |
| `all_satisfy` | True iff every element matches | O(k) — early exit |

## Design Principles

1. **Bounded iteration** — `MAX_LOOP_ITEMS` is a compile-time constant; loop
   bounds never depend on user input.
2. **Early exit** — `find_first` and `all_satisfy` return as soon as the
   answer is known.
3. **Single-pass aggregation** — `aggregate_stats` computes four statistics
   (count, sum, max, min) in one traversal instead of four separate passes.
4. **No redundant storage reads** — callers load data once and pass a `Vec`
   reference; this module never reads storage.

## Usage

```rust
use crate::loop_optimization::{aggregate_stats, bounded_sum, find_first};

// Sum contributions (bounded, saturating)
let total = bounded_sum(&amounts);

// Find the first contribution above a threshold
let large = find_first(&amounts, |v| v > threshold);

// One-pass stats for the UI
let stats = aggregate_stats(&amounts);
// stats.count, stats.sum, stats.max, stats.min
```

## Security Assumptions

- Loop bounds are compile-time constants — no user-controlled input reaches
  them.
- `bounded_sum` and `aggregate_stats` use `saturating_add` to prevent
  overflow; results never wrap.
- `deduplicate_sorted` only removes *adjacent* duplicates (same semantics as
  `std::dedup`) — input must be sorted for full deduplication.

## Running the Tests

```bash
cargo test -p crowdfund loop_optimization
```

Expected output: all tests pass (30 tests).
