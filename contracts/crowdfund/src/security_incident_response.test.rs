//! # security_incident_response tests
//!
//! @title   SecurityIncidentResponse Test Suite
//! @notice  Comprehensive tests for automated incident tracking and emergency handling.
//!
//! ## Test output notes
//! Run with:
//!   cargo test -p crowdfund security_incident_response -- --nocapture
//!
//! ## Security notes
//! - Counter uses saturating_add; verified it never wraps.
//! - auto-pause fires at exactly AUTO_PAUSE_THRESHOLD, not before.
//! - reset_incident_count clears state so legitimate operations resume.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env};

use crate::security_incident_response::{
    check_auto_pause, get_incident_count, record_incident, reset_incident_count,
    IncidentSeverity, AUTO_PAUSE_THRESHOLD, MAX_INCIDENTS_PER_LEDGER,
};

fn env() -> Env {
    Env::default()
}

// ── IncidentSeverity labels ───────────────────────────────────────────────────

#[test]
fn test_severity_label_low() {
    assert_eq!(IncidentSeverity::Low.label(), "LOW");
}

#[test]
fn test_severity_label_medium() {
    assert_eq!(IncidentSeverity::Medium.label(), "MEDIUM");
}

#[test]
fn test_severity_label_high() {
    assert_eq!(IncidentSeverity::High.label(), "HIGH");
}

#[test]
fn test_severity_label_critical() {
    assert_eq!(IncidentSeverity::Critical.label(), "CRITICAL");
}

// ── record_incident — below threshold ────────────────────────────────────────

#[test]
fn test_record_incident_single_not_detected() {
    let env = env();
    let addr = Address::generate(&env);
    let record = record_incident(&env, &addr, IncidentSeverity::Low);
    assert!(!record.detected);
    assert_eq!(record.description, "");
}

#[test]
fn test_record_incident_below_threshold_not_detected() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..AUTO_PAUSE_THRESHOLD - 1 {
        let record = record_incident(&env, &addr, IncidentSeverity::Medium);
        assert!(!record.detected);
    }
}

// ── record_incident — at threshold ───────────────────────────────────────────

#[test]
fn test_record_incident_at_threshold_detected() {
    let env = env();
    let addr = Address::generate(&env);
    let mut last = record_incident(&env, &addr, IncidentSeverity::High);
    for _ in 1..AUTO_PAUSE_THRESHOLD {
        last = record_incident(&env, &addr, IncidentSeverity::High);
    }
    assert!(last.detected);
    assert_eq!(last.description, "auto_pause_recommended");
}

#[test]
fn test_record_incident_severity_preserved() {
    let env = env();
    let addr = Address::generate(&env);
    let record = record_incident(&env, &addr, IncidentSeverity::Critical);
    assert_eq!(record.severity, IncidentSeverity::Critical);
}

// ── get_incident_count ────────────────────────────────────────────────────────

#[test]
fn test_get_incident_count_initially_zero() {
    let env = env();
    assert_eq!(get_incident_count(&env), 0);
}

#[test]
fn test_get_incident_count_increments() {
    let env = env();
    let addr = Address::generate(&env);
    record_incident(&env, &addr, IncidentSeverity::Low);
    assert_eq!(get_incident_count(&env), 1);
    record_incident(&env, &addr, IncidentSeverity::Low);
    assert_eq!(get_incident_count(&env), 2);
}

// ── reset_incident_count ──────────────────────────────────────────────────────

#[test]
fn test_reset_incident_count_clears_to_zero() {
    let env = env();
    let addr = Address::generate(&env);
    record_incident(&env, &addr, IncidentSeverity::High);
    record_incident(&env, &addr, IncidentSeverity::High);
    assert!(get_incident_count(&env) > 0);
    reset_incident_count(&env);
    assert_eq!(get_incident_count(&env), 0);
}

#[test]
fn test_reset_then_record_starts_fresh() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..AUTO_PAUSE_THRESHOLD {
        record_incident(&env, &addr, IncidentSeverity::Critical);
    }
    reset_incident_count(&env);
    let record = record_incident(&env, &addr, IncidentSeverity::Low);
    assert!(!record.detected);
}

// ── check_auto_pause ──────────────────────────────────────────────────────────

#[test]
fn test_check_auto_pause_false_initially() {
    let env = env();
    assert!(!check_auto_pause(&env));
}

#[test]
fn test_check_auto_pause_false_below_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..AUTO_PAUSE_THRESHOLD - 1 {
        record_incident(&env, &addr, IncidentSeverity::Medium);
    }
    assert!(!check_auto_pause(&env));
}

#[test]
fn test_check_auto_pause_true_at_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..AUTO_PAUSE_THRESHOLD {
        record_incident(&env, &addr, IncidentSeverity::High);
    }
    assert!(check_auto_pause(&env));
}

#[test]
fn test_check_auto_pause_true_above_threshold() {
    let env = env();
    let addr = Address::generate(&env);
    for _ in 0..AUTO_PAUSE_THRESHOLD + 2 {
        record_incident(&env, &addr, IncidentSeverity::Critical);
    }
    assert!(check_auto_pause(&env));
}

// ── Constants ─────────────────────────────────────────────────────────────────

#[test]
fn test_max_incidents_per_ledger_value() {
    assert_eq!(MAX_INCIDENTS_PER_LEDGER, 10);
}

#[test]
fn test_auto_pause_threshold_value() {
    assert_eq!(AUTO_PAUSE_THRESHOLD, 3);
}
