//! Tests for security_regression.

#![cfg(test)]

use soroban_sdk::{
    testutils::Address as _,
    vec, Address, Env, Symbol,
};

use crate::security_regression::{
    evaluate_case, get_case_result, record_case_result, run_regression_batch, RegressionCase,
    MAX_CASES_PER_RUN, MIN_PASS_SCORE,
};

fn mk_case(env: &Env, id: &str, a: u32, w: u32, p: u32, r: u32) -> RegressionCase {
    RegressionCase {
        id: Symbol::new(env, id),
        failed_auth_attempts: a,
        failed_withdrawals: w,
        pause_toggles: p,
        reentrancy_alerts: r,
    }
}

#[test]
fn evaluate_case_passes_on_low_risk() {
    let env = Env::default();
    let c = mk_case(&env, "LOW", 1, 0, 0, 0);

    let result = evaluate_case(&c);

    assert!(result.passed);
    assert!(result.score >= MIN_PASS_SCORE);
}

#[test]
fn evaluate_case_fails_on_high_risk() {
    let env = Env::default();
    let c = mk_case(&env, "HIGH", 4, 4, 4, 2);

    let result = evaluate_case(&c);

    assert!(!result.passed);
    assert!(result.score < MIN_PASS_SCORE);
    assert!(result.findings > 0);
}

#[test]
fn record_case_result_persists_latest_result() {
    let env = Env::default();
    env.mock_all_auths();

    let runner = Address::generate(&env);
    let id = Symbol::new(&env, "AUTHREG");
    let c = RegressionCase {
        id: id.clone(),
        failed_auth_attempts: 2,
        failed_withdrawals: 0,
        pause_toggles: 0,
        reentrancy_alerts: 0,
    };

    let saved = record_case_result(&env, &runner, c);
    let loaded = get_case_result(&env, id).expect("result should exist");

    assert_eq!(saved.score, loaded.score);
    assert_eq!(saved.passed, loaded.passed);
}

#[test]
fn run_regression_batch_returns_consistent_summary() {
    let env = Env::default();
    env.mock_all_auths();

    let runner = Address::generate(&env);
    let cases = vec![
        &env,
        mk_case(&env, "C1", 0, 0, 0, 0),
        mk_case(&env, "C2", 3, 2, 1, 0),
        mk_case(&env, "C3", 4, 4, 2, 1),
    ];

    let summary = run_regression_batch(&env, &runner, cases);

    assert_eq!(summary.total_cases, 3);
    assert_eq!(summary.passed_cases + summary.failed_cases, 3);
    assert!(summary.worst_score <= 100);
    assert!(summary.run_id > 0);
}

#[test]
#[should_panic(expected = "empty regression batch")]
fn run_regression_batch_rejects_empty_batch() {
    let env = Env::default();
    env.mock_all_auths();

    let runner = Address::generate(&env);
    let cases = vec![&env];

    run_regression_batch(&env, &runner, cases);
}

#[test]
#[should_panic(expected = "too many regression cases")]
fn run_regression_batch_rejects_oversized_batch() {
    let env = Env::default();
    env.mock_all_auths();

    let runner = Address::generate(&env);
    let mut cases = vec![&env];

    for i in 0..(MAX_CASES_PER_RUN + 1) {
        let id = if i % 2 == 0 { "A" } else { "B" };
        cases.push_back(mk_case(&env, id, 0, 0, 0, 0));
    }

    run_regression_batch(&env, &runner, cases);
}
