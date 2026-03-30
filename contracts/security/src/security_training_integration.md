# security_training_integration

## Overview

`security_training_integration.rs` provides on-chain security training tracking
for the Stellar Raise crowdfunding project.  It registers training modules,
records per-member quiz completions, enforces a training-gated access check, and
computes compliance scores — all within the Soroban smart-contract environment.

The companion test file (`security_training_integration.test.rs`) delivers ≥ 95 %
coverage across 60+ test cases in seven sections, including property-based fuzz
tests via `proptest`.

---

## Security Assumptions

| Assumption | Enforcement |
|---|---|
| Quiz score ≥ 80 required to pass | `is_passing_score` — `MIN_PASSING_SCORE = 80` |
| Training expires after 365 days | `is_training_valid` — `TRAINING_VALIDITY_DAYS = 365` |
| All required modules must be complete before privileged access | `is_training_complete` iterates every required module |
| Failed status never grants access | `derive_status` returns `Failed` for score < 80 |
| Expired training must be renewed | `derive_status` returns `Expired` when past validity window |
| Members have independent records | Storage key is `(Address, module_id)` — no cross-member leakage |
| Saturating arithmetic prevents overflow | `saturating_mul` / `saturating_add` used throughout |

---

## Constants

| Constant | Value | Description |
|---|---|---|
| `MIN_PASSING_SCORE` | `80` | Minimum quiz score (0–100) to pass a module |
| `TRAINING_VALIDITY_DAYS` | `365` | Days a completed record remains valid |
| `SECONDS_PER_DAY` | `86_400` | Used for expiry timestamp calculations |

---

## Data Types

### `TrainingSeverity`
```rust
pub enum TrainingSeverity { Low, Medium, High, Critical }
```
Maps to the severity vocabulary used across the security crate.

### `TrainingStatus`
```rust
pub enum TrainingStatus { NotStarted, InProgress, Completed, Failed, Expired }
```
Lifecycle of a single module for one team member.

### `TrainingModule`
Defines a training module: `module_id`, `name`, `severity`, `required`.

### `TrainingRecord`
Stores a member's attempt: `member`, `module_id`, `status`, `score`, `completed_at`.

### `TrainingReport`
Aggregate view: `total_modules`, `completed_modules`, `incomplete_modules`,
`all_required_complete`, `compliance_score`.

---

## Pure Helper Functions

### `is_passing_score(score: u32) -> bool`
Returns `true` when `score >= MIN_PASSING_SCORE`.

### `is_training_valid(completed_at: u64, now: u64) -> bool`
Returns `true` when `now <= completed_at + TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY`.

### `compute_compliance_score(completed: u32, total: u32) -> u32`
Returns `(completed * 100) / total`, or `0` when `total == 0`.

### `derive_status(score: u32, completed_at: u64, now: u64) -> TrainingStatus`
Combines score and expiry checks into a single `TrainingStatus`.

### `all_required_complete(modules, records) -> bool`
Returns `true` when every `required` module has a `Completed` record.

### `build_report(member, modules, records) -> TrainingReport`
Pure function that assembles a `TrainingReport` from slices — no storage access.

---

## Contract Functions

### `register_module(env, name, severity, required) -> u32`
Registers a new training module and returns its auto-incremented ID.
Emits a `(training, mod_reg, module_id)` event.

### `get_module(env, module_id) -> Option<TrainingModule>`
Retrieves a module definition by ID.

### `module_count(env) -> u32`
Returns the total number of registered modules.

### `record_completion(env, member, module_id, score) -> TrainingStatus`
Records a quiz attempt.  Derives and stores the resulting `TrainingStatus`.
Emits a `(training, quiz_att, module_id, passed)` event.

### `get_record(env, member, module_id) -> Option<TrainingRecord>`
Retrieves a member's training record for a specific module.

### `is_training_complete(env, member) -> bool`
Returns `true` when all required modules have `Completed` records for `member`.
This is the primary access gate — call it before any privileged operation.

### `compliance_score(env, member) -> u32`
Returns the member's compliance score (0–100).

---

## Usage

### Registering modules (admin)

```rust
let module_id = SecurityTrainingIntegration::register_module(
    env.clone(),
    String::from_str(&env, "Reentrancy Basics"),
    TrainingSeverity::Critical,
    true, // required
);
```

### Recording a quiz attempt

```rust
let status = SecurityTrainingIntegration::record_completion(
    env.clone(),
    member.clone(),
    module_id,
    92, // score out of 100
);
// status == TrainingStatus::Completed
```

### Gating a privileged operation

```rust
if !SecurityTrainingIntegration::is_training_complete(env.clone(), caller.clone()) {
    panic!("Training not complete");
}
// proceed with privileged operation
```

### Checking compliance

```rust
let score = SecurityTrainingIntegration::compliance_score(env.clone(), member);
// score in 0..=100
```

---

## CI/CD Integration

Add to your test pipeline:

```bash
cargo test --package security security_training_integration
```

For coverage:

```bash
cargo tarpaulin --package security --out Stdout
```

---

## Test Coverage Map

| Section | Tests | Coverage area |
|---|---|---|
| 1 — Pure helpers | 20 | `is_passing_score`, `is_training_valid`, `compute_compliance_score`, `derive_status`, `all_required_complete`, `build_report` |
| 2 — Module registration | 6 | ID sequencing, retrieval, count, optional flag |
| 3 — Completion recording | 8 | Pass/fail/boundary scores, overwrite, independent members |
| 4 — Access gate | 6 | All done, missing one, failed required, optional skipped, no modules, new member |
| 5 — Compliance scoring | 4 | 100%, 50%, no modules, failed not counted |
| 6 — Property-based | 8 | Score bounds, compliance bounds, expiry, derive_status |
| 7 — Edge cases | 8 | Perfect/zero score, expiry boundary, multi-member, all-optional, overflow, variant distinctness |

---

## Adding a New Training Module Type

1. Add a variant to `TrainingSeverity` if needed.
2. Register the module via `register_module` with the appropriate `required` flag.
3. Add a test in `security_training_integration.test.rs` covering the new module's
   happy path, failure path, and any edge cases.
4. Run `cargo test --package security` and confirm ≥ 95 % coverage.
