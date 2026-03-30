//! # security_regression
//!
//! @title   SecurityRegression — Automated regression scoring for known security risks.
//!
//! @notice  Tracks regression test outcomes for common vulnerability classes such
//!          as auth failures, withdrawal failures, pause abuse, and reentrancy alerts.
//!
//! @dev     Designed for low gas overhead:
//!          - Bounded batch processing.
//!          - Compact score summaries in storage.
//!          - Constant-time lookup of latest result per case id.
//!
//! ## Security Assumptions
//! 1. Only authenticated runners can record regression results.
//! 2. Batch sizes are capped to prevent resource exhaustion.
//! 3. Scoring arithmetic is overflow-safe.
//! 4. Recorded summaries are append-only metadata (no privileged state changes).

#![allow(dead_code)]

use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};

/// @notice Maximum number of test cases accepted in one batch run.
pub const MAX_CASES_PER_RUN: u32 = 64;

/// @notice Minimum score required for a case to pass.
pub const MIN_PASS_SCORE: u8 = 80;

#[derive(Clone)]
#[contracttype]
enum RegressionKey {
    RunCounter,
    LastRunAt,
    CaseResult(Symbol),
}

/// @notice Input payload for one regression scenario.
#[derive(Clone)]
#[contracttype]
pub struct RegressionCase {
    pub id: Symbol,
    pub failed_auth_attempts: u32,
    pub failed_withdrawals: u32,
    pub pause_toggles: u32,
    pub reentrancy_alerts: u32,
}

/// @notice Scored output for one regression scenario.
#[derive(Clone)]
#[contracttype]
pub struct RegressionResult {
    pub id: Symbol,
    pub passed: bool,
    pub score: u8,
    pub findings: u32,
}

/// @notice Summary for a full batch run.
#[derive(Clone)]
#[contracttype]
pub struct RegressionSummary {
    pub run_id: u64,
    pub total_cases: u32,
    pub passed_cases: u32,
    pub failed_cases: u32,
    pub worst_score: u8,
}

/// @notice Deterministically scores a regression case.
/// @dev    Penalties are weighted by risk severity.
pub fn evaluate_case(input: &RegressionCase) -> RegressionResult {
    let mut deductions: u32 = 0;
    deductions = deductions
        .checked_add(input.failed_auth_attempts.saturating_mul(4))
        .expect("score overflow");
    deductions = deductions
        .checked_add(input.failed_withdrawals.saturating_mul(3))
        .expect("score overflow");
    deductions = deductions
        .checked_add(input.pause_toggles.saturating_mul(2))
        .expect("score overflow");
    deductions = deductions
        .checked_add(input.reentrancy_alerts.saturating_mul(10))
        .expect("score overflow");

    let score_u32 = 100u32.saturating_sub(deductions);
    let score = u8::try_from(score_u32).unwrap_or(0);
    let findings = input
        .failed_auth_attempts
        .checked_add(input.failed_withdrawals)
        .and_then(|v| v.checked_add(input.pause_toggles))
        .and_then(|v| v.checked_add(input.reentrancy_alerts))
        .expect("findings overflow");

    RegressionResult {
        id: input.id.clone(),
        passed: score >= MIN_PASS_SCORE,
        score,
        findings,
    }
}

/// @notice Records one evaluated case result.
/// @dev    Overwrites the latest value for the same case id.
pub fn record_case_result(env: &Env, runner: &Address, input: RegressionCase) -> RegressionResult {
    runner.require_auth();

    let result = evaluate_case(&input);
    let key = RegressionKey::CaseResult(result.id.clone());
    env.storage().persistent().set(&key, &result);
    env.storage().persistent().extend_ttl(&key, 100, 100);

    env.events().publish(
        (Symbol::new(env, "security"), Symbol::new(env, "regression_case")),
        (runner.clone(), result.id.clone(), result.score, result.passed),
    );

    result
}

/// @notice Runs a bounded batch of regression cases and stores a summary.
pub fn run_regression_batch(
    env: &Env,
    runner: &Address,
    cases: Vec<RegressionCase>,
) -> RegressionSummary {
    runner.require_auth();

    let total = cases.len();
    assert!(total > 0, "empty regression batch");
    assert!(total <= MAX_CASES_PER_RUN, "too many regression cases");

    let mut passed_cases: u32 = 0;
    let mut worst_score: u8 = 100;

    for c in cases.iter() {
        let result = record_case_result(env, runner, c);
        if result.passed {
            passed_cases = passed_cases.checked_add(1).expect("pass count overflow");
        }
        if result.score < worst_score {
            worst_score = result.score;
        }
    }

    let failed_cases = total
        .checked_sub(passed_cases)
        .expect("failed count underflow");

    let run_id: u64 = env
        .storage()
        .instance()
        .get(&RegressionKey::RunCounter)
        .unwrap_or(0);
    let next_run_id = run_id.checked_add(1).expect("run id overflow");

    env.storage()
        .instance()
        .set(&RegressionKey::RunCounter, &next_run_id);
    env.storage()
        .instance()
        .set(&RegressionKey::LastRunAt, &env.ledger().timestamp());

    let summary = RegressionSummary {
        run_id: next_run_id,
        total_cases: total,
        passed_cases,
        failed_cases,
        worst_score,
    };

    env.events().publish(
        (Symbol::new(env, "security"), Symbol::new(env, "regression_batch")),
        (runner.clone(), summary.run_id, summary.passed_cases, summary.failed_cases),
    );

    summary
}

/// @notice Returns the most recent result for a case id, if available.
pub fn get_case_result(env: &Env, case_id: Symbol) -> Option<RegressionResult> {
    env.storage()
        .persistent()
        .get(&RegressionKey::CaseResult(case_id))
}
