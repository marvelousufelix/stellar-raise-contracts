//! # security_monitoring tests
//!
//! @title   SecurityMonitoring Test Suite
//! @notice  Comprehensive tests for threat detection and anomaly tracking.
//!
//! ## Test output notes
//! Run with:
//!   cargo test -p crowdfund security_monitoring -- --nocapture
//!
//! ## Security notes
//! - Burst detection: counter increments per call; alert fires above BURST_THRESHOLD.
//! - Failure detection: alert fires at exactly FAILURE_THRESHOLD consecutive failures.
//! - Whale detection: pure arithmetic check; no storage side-effects on miss.
//! - Unauthorized access: shares the failure counter path; same threshold applies.
//! - Counter resets: verified to clear state so legitimate users are not permanently flagged.
//! - Overflow safety: counters saturate at u32::MAX rather than wrapping.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::{
    security_monitoring::{
        check_unauthorized_access_attempt, check_whale_contribution,
        get_alert_count, get_burst_count, get_failure_count, get_security_summary,
        record_contribution_attempt, record_failed_operation, reset_burst_count,
        reset_failure_count, AlertSeverity, ThreatRecord, BURST_THRESHOLD, FAILURE_THRESHOLD,
        WHALE_THRESHOLD_BPS,
    },
    DataKey,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn env() -> Env {
    Env::default()
}

// ── AlertSeverity ─────────────────────────────────────────────────────────────

#[test]
fn test_severity_labels() {
    assert_eq!(AlertSeverity::Low.label(), "LOW");
    assert_eq!(AlertSeverity::Medium.label(), "MEDIUM");
    assert_eq!(AlertSeverity::High.label(), "HIGH");
}

// ── ThreatRecord ──────────────────────────────────────────────────────────────

#[test]
fn test_threat_record_none_not_detected() {
    let env = env();
    let addr = Address::generate(&env);
    // A below-threshold call should return a non-detected record.
    let record = record_contribution_attempt(&env, &addr);
    assert!(!record.detected);
    assert_eq!(record.description, "");
}

#[test]
fn test_threat_record_detected_has_description() {
    let env = env();
    let addr = Address::generate(&env);
    // Exhaust the burst threshold.
    for _ in 0..=BURST_THRESHOLD {
        record_contribution_attempt(&env, &addr);
    }
    let record = record_contribution_attempt(&env, &addr);
    assert!(record.detected);
    assert!(!record.description.is_empty());
}

// ── get_burst_count ───────────────────────────────────────────────────────────

#[test]
fn test_burst_count_starts_at_zero() {
    let env = env();
    let addr = Address::generate(&env);
    assert_eq!(get_burst_count(&env, &addr), 0);
}

#[test]
fn test_burst_count_increments() {
    let env = env();
    let addr = Address::generate(&env);
    record_contribution_attempt(&env, &addr);
    record_contribution_attempt(&env, &addr);
    assert_eq!(get_burst_count(&env, &addr), 2);
}

// ── record_contribution_attempt ───────────────────────────────────────────────

#[test]
fn test_no_alert_below_burst_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..BURST_THRESHOLD {
        let r = record_contribution_attempt(&env, &addr);
        assert!(!r.detected, "should not alert below threshold");
    }
}

#[test]
fn test_alert_above_burst_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    // Fill up to threshold (no alert yet).
    for _ in 0..=BURST_THRESHOLD {
        record_contribution_attempt(&env, &addr);
    }
    // One more push over the threshold.
    let r = record_contribution_attempt(&env, &addr);
    assert!(r.detected);
    assert_eq!(r.severity, AlertSeverity::Medium);
}

#[test]
fn test_burst_alert_increments_global_alert_count() {
    let env = env();
    let addr = Address::generate(&env);
    let before = get_alert_count(&env);
    for _ in 0..=BURST_THRESHOLD + 1 {
        record_contribution_attempt(&env, &addr);
    }
    assert!(get_alert_count(&env) > before);
}

#[test]
fn test_different_addresses_have_independent_burst_counters() {
    let env = env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    for _ in 0..BURST_THRESHOLD {
        record_contribution_attempt(&env, &a);
    }
    // b should still be at zero.
    assert_eq!(get_burst_count(&env, &b), 0);
}

// ── reset_burst_count ─────────────────────────────────────────────────────────

#[test]
fn test_reset_burst_count_clears_counter() {
    let env = env();
    let addr = Address::generate(&env);
    record_contribution_attempt(&env, &addr);
    record_contribution_attempt(&env, &addr);
    reset_burst_count(&env, &addr);
    assert_eq!(get_burst_count(&env, &addr), 0);
}

#[test]
fn test_reset_burst_count_on_fresh_address_is_noop() {
    let env = env();
    let addr = Address::generate(&env);
    reset_burst_count(&env, &addr); // should not panic
    assert_eq!(get_burst_count(&env, &addr), 0);
}

// ── get_failure_count ─────────────────────────────────────────────────────────

#[test]
fn test_failure_count_starts_at_zero() {
    let env = env();
    let addr = Address::generate(&env);
    assert_eq!(get_failure_count(&env, &addr), 0);
}

// ── record_failed_operation ───────────────────────────────────────────────────

#[test]
fn test_no_alert_below_failure_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..FAILURE_THRESHOLD - 1 {
        let r = record_failed_operation(&env, &addr);
        assert!(!r.detected);
    }
}

#[test]
fn test_alert_at_failure_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..FAILURE_THRESHOLD - 1 {
        record_failed_operation(&env, &addr);
    }
    let r = record_failed_operation(&env, &addr);
    assert!(r.detected);
    assert_eq!(r.severity, AlertSeverity::High);
}

#[test]
fn test_failure_alert_increments_global_alert_count() {
    let env = env();
    let addr = Address::generate(&env);
    let before = get_alert_count(&env);
    for _ in 0..FAILURE_THRESHOLD {
        record_failed_operation(&env, &addr);
    }
    assert!(get_alert_count(&env) > before);
}

#[test]
fn test_failure_alert_continues_after_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..FAILURE_THRESHOLD + 2 {
        record_failed_operation(&env, &addr);
    }
    // Counter should be above threshold.
    assert!(get_failure_count(&env, &addr) >= FAILURE_THRESHOLD);
}

// ── reset_failure_count ───────────────────────────────────────────────────────

#[test]
fn test_reset_failure_count_clears_counter() {
    let env = env();
    let addr = Address::generate(&env);
    record_failed_operation(&env, &addr);
    reset_failure_count(&env, &addr);
    assert_eq!(get_failure_count(&env, &addr), 0);
}

#[test]
fn test_reset_failure_count_allows_fresh_window() {
    let env = env();
    let addr = Address::generate(&env);
    // Trigger threshold.
    for _ in 0..FAILURE_THRESHOLD {
        record_failed_operation(&env, &addr);
    }
    reset_failure_count(&env, &addr);
    // After reset, should not alert on first failure.
    let r = record_failed_operation(&env, &addr);
    assert!(!r.detected);
}

// ── check_whale_contribution ──────────────────────────────────────────────────

#[test]
fn test_no_whale_alert_below_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    let goal = 1_000_000i128;
    // 49 % of goal — below 50 % threshold.
    let amount = goal * 49 / 100;
    let r = check_whale_contribution(&env, &addr, amount, goal);
    assert!(!r.detected);
}

#[test]
fn test_whale_alert_above_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    let goal = 1_000_000i128;
    // 51 % of goal — above 50 % threshold.
    let amount = goal * 51 / 100;
    let r = check_whale_contribution(&env, &addr, amount, goal);
    assert!(r.detected);
    assert_eq!(r.severity, AlertSeverity::Medium);
}

#[test]
fn test_whale_alert_exactly_at_threshold_not_triggered() {
    let env = env();
    let addr = Address::generate(&env);
    let goal = 10_000i128;
    // Exactly 50 % — threshold is strictly greater-than.
    let amount = goal / 2;
    let r = check_whale_contribution(&env, &addr, amount, goal);
    assert!(!r.detected);
}

#[test]
fn test_whale_check_zero_goal_returns_no_threat() {
    let env = env();
    let addr = Address::generate(&env);
    // Zero goal must not panic (division guard).
    let r = check_whale_contribution(&env, &addr, 1_000, 0);
    assert!(!r.detected);
}

#[test]
fn test_whale_alert_increments_global_alert_count() {
    let env = env();
    let addr = Address::generate(&env);
    let before = get_alert_count(&env);
    let goal = 1_000i128;
    check_whale_contribution(&env, &addr, goal, goal); // 100 % — definitely a whale
    assert!(get_alert_count(&env) > before);
}

// ── check_unauthorized_access_attempt ────────────────────────────────────────

#[test]
fn test_no_unauth_alert_below_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..FAILURE_THRESHOLD - 1 {
        let r = check_unauthorized_access_attempt(&env, &addr);
        assert!(!r.detected);
    }
}

#[test]
fn test_unauth_alert_at_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..FAILURE_THRESHOLD - 1 {
        check_unauthorized_access_attempt(&env, &addr);
    }
    let r = check_unauthorized_access_attempt(&env, &addr);
    assert!(r.detected);
    assert_eq!(r.severity, AlertSeverity::High);
}

#[test]
fn test_unauth_and_failure_share_counter() {
    let env = env();
    let addr = Address::generate(&env);
    // One failure recorded via record_failed_operation.
    record_failed_operation(&env, &addr);
    // Then one via check_unauthorized_access_attempt.
    check_unauthorized_access_attempt(&env, &addr);
    // Counter should be 2.
    assert_eq!(get_failure_count(&env, &addr), 2);
}

// ── get_security_summary ──────────────────────────────────────────────────────

#[test]
fn test_security_summary_starts_at_zero() {
    let env = env();
    assert_eq!(get_security_summary(&env), 0);
}

#[test]
fn test_security_summary_reflects_alerts() {
    let env = env();
    let addr = Address::generate(&env);
    // Trigger a burst alert.
    for _ in 0..=BURST_THRESHOLD + 1 {
        record_contribution_attempt(&env, &addr);
    }
    assert!(get_security_summary(&env) >= 1);
}

// ── get_alert_count ───────────────────────────────────────────────────────────

#[test]
fn test_alert_count_accumulates_across_alert_types() {
    let env = env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    let goal = 1_000i128;

    // Trigger burst alert.
    for _ in 0..=BURST_THRESHOLD + 1 {
        record_contribution_attempt(&env, &a);
    }
    // Trigger whale alert.
    check_whale_contribution(&env, &b, goal, goal);
    // Trigger failure alert.
    for _ in 0..FAILURE_THRESHOLD {
        record_failed_operation(&env, &b);
    }

    assert!(get_alert_count(&env) >= 3);
}

// ── DataKey variants ──────────────────────────────────────────────────────────

#[test]
fn test_burst_count_key_is_per_address() {
    let env = env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    env.storage()
        .instance()
        .set(&DataKey::BurstCount(a.clone()), &7u32);
    // b's key should still be absent.
    let b_count: Option<u32> = env
        .storage()
        .instance()
        .get(&DataKey::BurstCount(b.clone()));
    assert!(b_count.is_none());
}

#[test]
fn test_failure_count_key_is_per_address() {
    let env = env();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    env.storage()
        .instance()
        .set(&DataKey::FailureCount(a.clone()), &5u32);
    let b_count: Option<u32> = env
        .storage()
        .instance()
        .get(&DataKey::FailureCount(b.clone()));
    assert!(b_count.is_none());
}

#[test]
fn test_security_alert_count_key_is_global() {
    let env = env();
    env.storage()
        .instance()
        .set(&DataKey::SecurityAlertCount, &42u32);
    let v: u32 = env
        .storage()
        .instance()
        .get(&DataKey::SecurityAlertCount)
        .unwrap();
    assert_eq!(v, 42);
}
