//! # security_training_integration.test.rs
//!
//! @notice  Comprehensive test suite for `security_training_integration.rs`.
//!          Covers pure helpers, contract state mutations, access-gate logic,
//!          compliance scoring, property-based tests, and edge cases.
//!
//! @dev     Tests are grouped into six sections:
//!          1. Pure helper functions.
//!          2. Module registration (contract).
//!          3. Completion recording (contract).
//!          4. Access gate (`is_training_complete`).
//!          5. Compliance scoring.
//!          6. Property-based / fuzz tests.
//!          7. Edge cases.
//!
//! @custom:security-note  Every failure path asserts the exact resulting
//!          `TrainingStatus` or boolean so regressions in access-control logic
//!          are caught immediately.

#![cfg(test)]

use proptest::prelude::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::security_training_integration::{
    all_required_complete, build_report, compute_compliance_score, derive_status,
    is_passing_score, is_training_valid, SecurityTrainingIntegration, TrainingModule,
    TrainingRecord, TrainingSeverity, TrainingStatus, MIN_PASSING_SCORE,
    SECONDS_PER_DAY, TRAINING_VALIDITY_DAYS,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn env() -> Env {
    let e = Env::default();
    e.mock_all_auths();
    e
}

fn str(e: &Env, s: &str) -> String {
    String::from_str(e, s)
}

/// Builds a minimal `TrainingModule` for use in pure-function tests.
fn make_module(env: &Env, id: u32, required: bool) -> TrainingModule {
    TrainingModule {
        module_id: id,
        name: str(env, "Test Module"),
        severity: TrainingSeverity::High,
        required,
    }
}

/// Builds a `TrainingRecord` with the given status.
fn make_record(env: &Env, member: &Address, module_id: u32, status: TrainingStatus) -> TrainingRecord {
    TrainingRecord {
        member: member.clone(),
        module_id,
        status,
        score: 90,
        completed_at: 0,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PURE HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// --- is_passing_score ---

/// @notice  Happy path: score at exactly MIN_PASSING_SCORE passes.
/// @custom:security-note  Boundary — must be inclusive.
#[test]
fn test_is_passing_score_at_minimum() {
    assert!(is_passing_score(MIN_PASSING_SCORE));
}

/// @notice  Happy path: score above minimum passes.
#[test]
fn test_is_passing_score_above_minimum() {
    assert!(is_passing_score(100));
    assert!(is_passing_score(95));
}

/// @notice  Failure path: score one below minimum fails.
/// @custom:security-note  79 must never grant access.
#[test]
fn test_is_passing_score_one_below_minimum() {
    assert!(!is_passing_score(MIN_PASSING_SCORE - 1));
}

/// @notice  Failure path: zero score fails.
#[test]
fn test_is_passing_score_zero() {
    assert!(!is_passing_score(0));
}

// --- is_training_valid ---

/// @notice  Happy path: completed just now is valid.
#[test]
fn test_is_training_valid_just_completed() {
    let now = 1_000_000u64;
    assert!(is_training_valid(now, now));
}

/// @notice  Happy path: completed one second before expiry is valid.
#[test]
fn test_is_training_valid_one_second_before_expiry() {
    let completed_at = 0u64;
    let validity = TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY;
    let now = validity; // exactly at expiry boundary
    assert!(is_training_valid(completed_at, now));
}

/// @notice  Failure path: one second past expiry is invalid.
/// @custom:security-note  Expired training must block privileged access.
#[test]
fn test_is_training_valid_one_second_past_expiry() {
    let completed_at = 0u64;
    let validity = TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY;
    let now = validity + 1;
    assert!(!is_training_valid(completed_at, now));
}

/// @notice  Edge case: completed_at in the future (clock skew) is valid.
#[test]
fn test_is_training_valid_future_completed_at() {
    let now = 1_000u64;
    let completed_at = 2_000u64; // future timestamp
    assert!(is_training_valid(completed_at, now));
}

// --- compute_compliance_score ---

/// @notice  Happy path: all modules completed → 100.
#[test]
fn test_compute_compliance_score_full() {
    assert_eq!(compute_compliance_score(10, 10), 100);
}

/// @notice  Happy path: half completed → 50.
#[test]
fn test_compute_compliance_score_half() {
    assert_eq!(compute_compliance_score(5, 10), 50);
}

/// @notice  Edge case: zero total → 0 (no division by zero).
#[test]
fn test_compute_compliance_score_zero_total() {
    assert_eq!(compute_compliance_score(0, 0), 0);
}

/// @notice  Edge case: zero completed → 0.
#[test]
fn test_compute_compliance_score_none_completed() {
    assert_eq!(compute_compliance_score(0, 5), 0);
}

// --- derive_status ---

/// @notice  Happy path: passing score at current time → Completed.
#[test]
fn test_derive_status_completed() {
    let now = 1_000_000u64;
    assert_eq!(derive_status(90, now, now), TrainingStatus::Completed);
}

/// @notice  Failure path: failing score → Failed regardless of timestamp.
/// @custom:security-note  Failed status must never grant access.
#[test]
fn test_derive_status_failed() {
    let now = 1_000_000u64;
    assert_eq!(derive_status(79, now, now), TrainingStatus::Failed);
}

/// @notice  Failure path: passing score but expired → Expired.
/// @custom:security-note  Expired training must be renewed before access.
#[test]
fn test_derive_status_expired() {
    let completed_at = 0u64;
    let now = (TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY) + 1;
    assert_eq!(
        derive_status(MIN_PASSING_SCORE, completed_at, now),
        TrainingStatus::Expired
    );
}

/// @notice  Edge case: score of exactly 0 → Failed.
#[test]
fn test_derive_status_zero_score() {
    let now = 1_000u64;
    assert_eq!(derive_status(0, now, now), TrainingStatus::Failed);
}

// --- all_required_complete ---

/// @notice  Happy path: all required modules have Completed records.
#[test]
fn test_all_required_complete_pass() {
    let env = env();
    let member = Address::generate(&env);
    let modules = vec![make_module(&env, 1, true), make_module(&env, 2, true)];
    let records = vec![
        make_record(&env, &member, 1, TrainingStatus::Completed),
        make_record(&env, &member, 2, TrainingStatus::Completed),
    ];
    assert!(all_required_complete(&modules, &records));
}

/// @notice  Failure path: one required module is Failed.
/// @custom:security-note  A single failed required module must block access.
#[test]
fn test_all_required_complete_one_failed() {
    let env = env();
    let member = Address::generate(&env);
    let modules = vec![make_module(&env, 1, true), make_module(&env, 2, true)];
    let records = vec![
        make_record(&env, &member, 1, TrainingStatus::Completed),
        make_record(&env, &member, 2, TrainingStatus::Failed),
    ];
    assert!(!all_required_complete(&modules, &records));
}

/// @notice  Failure path: required module has no record at all.
#[test]
fn test_all_required_complete_missing_record() {
    let env = env();
    let member = Address::generate(&env);
    let modules = vec![make_module(&env, 1, true)];
    let records: Vec<TrainingRecord> = vec![];
    assert!(!all_required_complete(&modules, &records));
}

/// @notice  Happy path: optional module not completed does not block.
#[test]
fn test_all_required_complete_optional_not_done() {
    let env = env();
    let member = Address::generate(&env);
    let modules = vec![
        make_module(&env, 1, true),
        make_module(&env, 2, false), // optional
    ];
    let records = vec![make_record(&env, &member, 1, TrainingStatus::Completed)];
    assert!(all_required_complete(&modules, &records));
}

/// @notice  Edge case: no modules → trivially complete.
#[test]
fn test_all_required_complete_no_modules() {
    let modules: Vec<TrainingModule> = vec![];
    let records: Vec<TrainingRecord> = vec![];
    assert!(all_required_complete(&modules, &records));
}

// --- build_report ---

/// @notice  Happy path: all modules completed → 100% compliance.
#[test]
fn test_build_report_all_complete() {
    let env = env();
    let member = Address::generate(&env);
    let modules = vec![make_module(&env, 1, true), make_module(&env, 2, true)];
    let records = vec![
        make_record(&env, &member, 1, TrainingStatus::Completed),
        make_record(&env, &member, 2, TrainingStatus::Completed),
    ];
    let report = build_report(member, &modules, &records);
    assert_eq!(report.total_modules, 2);
    assert_eq!(report.completed_modules, 2);
    assert_eq!(report.incomplete_modules, 0);
    assert!(report.all_required_complete);
    assert_eq!(report.compliance_score, 100);
}

/// @notice  Failure path: one failed module reduces score and flags incomplete.
#[test]
fn test_build_report_one_failed() {
    let env = env();
    let member = Address::generate(&env);
    let modules = vec![make_module(&env, 1, true), make_module(&env, 2, true)];
    let records = vec![
        make_record(&env, &member, 1, TrainingStatus::Completed),
        make_record(&env, &member, 2, TrainingStatus::Failed),
    ];
    let report = build_report(member, &modules, &records);
    assert_eq!(report.completed_modules, 1);
    assert_eq!(report.incomplete_modules, 1);
    assert!(!report.all_required_complete);
    assert_eq!(report.compliance_score, 50);
}

/// @notice  Edge case: no modules → zero score, all_required_complete = true.
#[test]
fn test_build_report_no_modules() {
    let env = env();
    let member = Address::generate(&env);
    let report = build_report(member, &[], &[]);
    assert_eq!(report.total_modules, 0);
    assert_eq!(report.compliance_score, 0);
    assert!(report.all_required_complete);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MODULE REGISTRATION (CONTRACT)
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: first module gets ID 1.
#[test]
fn test_register_module_first_id() {
    let env = env();
    let id = SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Reentrancy Basics"),
        TrainingSeverity::Critical,
        true,
    );
    assert_eq!(id, 1);
}

/// @notice  Happy path: IDs increment sequentially.
#[test]
fn test_register_module_sequential_ids() {
    let env = env();
    let id1 = SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module A"),
        TrainingSeverity::High,
        true,
    );
    let id2 = SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module B"),
        TrainingSeverity::Medium,
        false,
    );
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
}

/// @notice  Happy path: registered module can be retrieved.
#[test]
fn test_get_module_returns_correct_data() {
    let env = env();
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Access Control 101"),
        TrainingSeverity::Critical,
        true,
    );
    let module = SecurityTrainingIntegration::get_module(env.clone(), 1);
    assert!(module.is_some());
    let m = module.unwrap();
    assert_eq!(m.module_id, 1);
    assert!(m.required);
    assert_eq!(m.severity, TrainingSeverity::Critical);
}

/// @notice  Failure path: non-existent module ID returns None.
#[test]
fn test_get_module_nonexistent_returns_none() {
    let env = env();
    let result = SecurityTrainingIntegration::get_module(env.clone(), 99);
    assert!(result.is_none());
}

/// @notice  Happy path: module_count reflects registered modules.
#[test]
fn test_module_count_increments() {
    let env = env();
    assert_eq!(SecurityTrainingIntegration::module_count(env.clone()), 0);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "M1"),
        TrainingSeverity::Low,
        false,
    );
    assert_eq!(SecurityTrainingIntegration::module_count(env.clone()), 1);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "M2"),
        TrainingSeverity::Medium,
        true,
    );
    assert_eq!(SecurityTrainingIntegration::module_count(env.clone()), 2);
}

/// @notice  Happy path: optional module is stored with required = false.
#[test]
fn test_register_optional_module() {
    let env = env();
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Optional Module"),
        TrainingSeverity::Low,
        false,
    );
    let m = SecurityTrainingIntegration::get_module(env.clone(), 1).unwrap();
    assert!(!m.required);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COMPLETION RECORDING (CONTRACT)
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: passing score → Completed status stored.
#[test]
fn test_record_completion_passing_score() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::High,
        true,
    );
    let status = SecurityTrainingIntegration::record_completion(
        env.clone(),
        member.clone(),
        1,
        90,
    );
    assert_eq!(status, TrainingStatus::Completed);
}

/// @notice  Failure path: failing score → Failed status stored.
/// @custom:security-note  Failed status must not grant privileged access.
#[test]
fn test_record_completion_failing_score() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::High,
        true,
    );
    let status = SecurityTrainingIntegration::record_completion(
        env.clone(),
        member.clone(),
        1,
        50,
    );
    assert_eq!(status, TrainingStatus::Failed);
}

/// @notice  Edge case: score of exactly MIN_PASSING_SCORE → Completed.
/// @custom:security-note  Boundary — must be inclusive.
#[test]
fn test_record_completion_boundary_score() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::Medium,
        true,
    );
    let status = SecurityTrainingIntegration::record_completion(
        env.clone(),
        member.clone(),
        1,
        MIN_PASSING_SCORE,
    );
    assert_eq!(status, TrainingStatus::Completed);
}

/// @notice  Edge case: score of MIN_PASSING_SCORE - 1 → Failed.
#[test]
fn test_record_completion_one_below_boundary() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::Medium,
        true,
    );
    let status = SecurityTrainingIntegration::record_completion(
        env.clone(),
        member.clone(),
        1,
        MIN_PASSING_SCORE - 1,
    );
    assert_eq!(status, TrainingStatus::Failed);
}

/// @notice  Happy path: record can be retrieved after completion.
#[test]
fn test_get_record_after_completion() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::High,
        true,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 95);
    let record = SecurityTrainingIntegration::get_record(env.clone(), member.clone(), 1);
    assert!(record.is_some());
    let r = record.unwrap();
    assert_eq!(r.score, 95);
    assert_eq!(r.status, TrainingStatus::Completed);
}

/// @notice  Failure path: no record returns None.
#[test]
fn test_get_record_nonexistent_returns_none() {
    let env = env();
    let member = Address::generate(&env);
    let result = SecurityTrainingIntegration::get_record(env.clone(), member, 1);
    assert!(result.is_none());
}

/// @notice  Happy path: re-attempt overwrites previous record.
#[test]
fn test_record_completion_overwrite_previous() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::High,
        true,
    );
    // First attempt: fail
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 50);
    // Second attempt: pass
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 95);
    let record = SecurityTrainingIntegration::get_record(env.clone(), member, 1).unwrap();
    assert_eq!(record.status, TrainingStatus::Completed);
    assert_eq!(record.score, 95);
}

/// @notice  Happy path: different members have independent records.
#[test]
fn test_record_completion_independent_per_member() {
    let env = env();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Module 1"),
        TrainingSeverity::High,
        true,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), alice.clone(), 1, 90);
    SecurityTrainingIntegration::record_completion(env.clone(), bob.clone(), 1, 50);

    let alice_rec = SecurityTrainingIntegration::get_record(env.clone(), alice, 1).unwrap();
    let bob_rec = SecurityTrainingIntegration::get_record(env.clone(), bob, 1).unwrap();

    assert_eq!(alice_rec.status, TrainingStatus::Completed);
    assert_eq!(bob_rec.status, TrainingStatus::Failed);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACCESS GATE (is_training_complete)
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: member with all required modules completed → true.
#[test]
fn test_is_training_complete_all_done() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required A"),
        TrainingSeverity::Critical,
        true,
    );
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required B"),
        TrainingSeverity::High,
        true,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 90);
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 2, 85);
    assert!(SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

/// @notice  Failure path: member missing one required module → false.
/// @custom:security-note  Partial completion must not grant access.
#[test]
fn test_is_training_complete_missing_one() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required A"),
        TrainingSeverity::Critical,
        true,
    );
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required B"),
        TrainingSeverity::High,
        true,
    );
    // Only complete module 1
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 90);
    assert!(!SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

/// @notice  Failure path: member failed a required module → false.
/// @custom:security-note  Failed status must block access.
#[test]
fn test_is_training_complete_failed_required() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required A"),
        TrainingSeverity::Critical,
        true,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 50);
    assert!(!SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

/// @notice  Happy path: optional module not completed does not block access.
#[test]
fn test_is_training_complete_optional_skipped() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required"),
        TrainingSeverity::High,
        true,
    );
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Optional"),
        TrainingSeverity::Low,
        false,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 90);
    // Module 2 (optional) not completed
    assert!(SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

/// @notice  Edge case: no modules registered → trivially complete.
#[test]
fn test_is_training_complete_no_modules() {
    let env = env();
    let member = Address::generate(&env);
    assert!(SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

/// @notice  Failure path: brand-new member with required modules → false.
#[test]
fn test_is_training_complete_new_member() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required"),
        TrainingSeverity::Critical,
        true,
    );
    assert!(!SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPLIANCE SCORING (CONTRACT)
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Happy path: all modules completed → 100.
#[test]
fn test_compliance_score_all_complete() {
    let env = env();
    let member = Address::generate(&env);
    for i in 1..=4u32 {
        SecurityTrainingIntegration::register_module(
            env.clone(),
            str(&env, "M"),
            TrainingSeverity::Medium,
            true,
        );
        SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), i, 90);
    }
    assert_eq!(
        SecurityTrainingIntegration::compliance_score(env.clone(), member),
        100
    );
}

/// @notice  Happy path: half completed → 50.
#[test]
fn test_compliance_score_half_complete() {
    let env = env();
    let member = Address::generate(&env);
    for _ in 0..4 {
        SecurityTrainingIntegration::register_module(
            env.clone(),
            str(&env, "M"),
            TrainingSeverity::Medium,
            true,
        );
    }
    // Complete only modules 1 and 2
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 90);
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 2, 90);
    assert_eq!(
        SecurityTrainingIntegration::compliance_score(env.clone(), member),
        50
    );
}

/// @notice  Edge case: no modules → score is 0.
#[test]
fn test_compliance_score_no_modules() {
    let env = env();
    let member = Address::generate(&env);
    assert_eq!(
        SecurityTrainingIntegration::compliance_score(env.clone(), member),
        0
    );
}

/// @notice  Failure path: failed attempts do not contribute to score.
#[test]
fn test_compliance_score_failed_attempts_not_counted() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "M"),
        TrainingSeverity::High,
        true,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), member.clone(), 1, 50);
    assert_eq!(
        SecurityTrainingIntegration::compliance_score(env.clone(), member),
        0
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROPERTY-BASED / FUZZ TESTS
// ─────────────────────────────────────────────────────────────────────────────

proptest! {
    /// @notice  Property: any score >= MIN_PASSING_SCORE always passes.
    #[test]
    fn prop_passing_score_always_passes(score in MIN_PASSING_SCORE..=100u32) {
        prop_assert!(is_passing_score(score));
    }

    /// @notice  Property: any score < MIN_PASSING_SCORE always fails.
    /// @custom:security-note  No sub-threshold score must ever grant access.
    #[test]
    fn prop_failing_score_always_fails(score in 0u32..MIN_PASSING_SCORE) {
        prop_assert!(!is_passing_score(score));
    }

    /// @notice  Property: compliance score is always in [0, 100].
    #[test]
    fn prop_compliance_score_bounded(completed in 0u32..=1000u32, total in 1u32..=1000u32) {
        let completed = completed.min(total);
        let score = compute_compliance_score(completed, total);
        prop_assert!(score <= 100);
    }

    /// @notice  Property: compliance score is 100 iff completed == total.
    #[test]
    fn prop_compliance_score_100_iff_all_complete(total in 1u32..=100u32) {
        prop_assert_eq!(compute_compliance_score(total, total), 100);
    }

    /// @notice  Property: compliance score is 0 when completed == 0.
    #[test]
    fn prop_compliance_score_0_when_none_complete(total in 1u32..=100u32) {
        prop_assert_eq!(compute_compliance_score(0, total), 0);
    }

    /// @notice  Property: training completed just now is always valid.
    #[test]
    fn prop_just_completed_always_valid(now in 0u64..u64::MAX / 2) {
        prop_assert!(is_training_valid(now, now));
    }

    /// @notice  Property: training completed far in the past is always expired.
    #[test]
    fn prop_ancient_training_always_expired(
        completed_at in 0u64..1_000u64,
        extra in 1u64..1_000_000u64
    ) {
        let validity = TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY;
        let now = completed_at.saturating_add(validity).saturating_add(extra);
        prop_assert!(!is_training_valid(completed_at, now));
    }

    /// @notice  Property: derive_status with score < MIN_PASSING_SCORE is always Failed.
    #[test]
    fn prop_low_score_always_failed(score in 0u32..MIN_PASSING_SCORE, ts in 0u64..1_000_000u64) {
        prop_assert_eq!(derive_status(score, ts, ts), TrainingStatus::Failed);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

/// @notice  Edge case: score of 100 (perfect) → Completed.
#[test]
fn test_perfect_score_completed() {
    let now = 1_000_000u64;
    assert_eq!(derive_status(100, now, now), TrainingStatus::Completed);
}

/// @notice  Edge case: score of 0 → Failed.
#[test]
fn test_zero_score_failed() {
    let now = 1_000_000u64;
    assert_eq!(derive_status(0, now, now), TrainingStatus::Failed);
}

/// @notice  Edge case: training valid at exact expiry boundary (inclusive).
#[test]
fn test_training_valid_at_exact_expiry() {
    let completed_at = 0u64;
    let expiry = TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY;
    assert!(is_training_valid(completed_at, expiry));
}

/// @notice  Edge case: training invalid one second after expiry.
#[test]
fn test_training_invalid_one_second_after_expiry() {
    let completed_at = 0u64;
    let expiry = TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY;
    assert!(!is_training_valid(completed_at, expiry + 1));
}

/// @notice  Edge case: multiple members, each with independent access gate.
#[test]
fn test_multiple_members_independent_access() {
    let env = env();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Required"),
        TrainingSeverity::Critical,
        true,
    );
    SecurityTrainingIntegration::record_completion(env.clone(), alice.clone(), 1, 90);
    // Bob has not completed

    assert!(SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        alice
    ));
    assert!(!SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        bob
    ));
}

/// @notice  Edge case: all-optional modules → new member is trivially complete.
#[test]
fn test_all_optional_modules_new_member_complete() {
    let env = env();
    let member = Address::generate(&env);
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Optional A"),
        TrainingSeverity::Low,
        false,
    );
    SecurityTrainingIntegration::register_module(
        env.clone(),
        str(&env, "Optional B"),
        TrainingSeverity::Low,
        false,
    );
    assert!(SecurityTrainingIntegration::is_training_complete(
        env.clone(),
        member
    ));
}

/// @notice  Edge case: saturating arithmetic — compute_compliance_score with
///          large values does not overflow.
#[test]
fn test_compliance_score_large_values() {
    let score = compute_compliance_score(u32::MAX / 2, u32::MAX / 2);
    assert_eq!(score, 100);
}

/// @notice  Security assumption: TrainingStatus variants are distinct.
#[test]
fn test_training_status_variants_distinct() {
    assert_ne!(TrainingStatus::Completed, TrainingStatus::Failed);
    assert_ne!(TrainingStatus::Completed, TrainingStatus::Expired);
    assert_ne!(TrainingStatus::Completed, TrainingStatus::NotStarted);
    assert_ne!(TrainingStatus::Completed, TrainingStatus::InProgress);
    assert_ne!(TrainingStatus::Failed, TrainingStatus::Expired);
}

/// @notice  Security assumption: TrainingSeverity variants are distinct.
#[test]
fn test_training_severity_variants_distinct() {
    assert_ne!(TrainingSeverity::Critical, TrainingSeverity::High);
    assert_ne!(TrainingSeverity::High, TrainingSeverity::Medium);
    assert_ne!(TrainingSeverity::Medium, TrainingSeverity::Low);
}