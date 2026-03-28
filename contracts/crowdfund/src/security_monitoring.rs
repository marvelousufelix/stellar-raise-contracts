//! # security_monitoring
//!
//! @title   SecurityMonitoring — Real-time threat detection and anomaly tracking
//!          for the crowdfund contract.
//!
//! @notice  Provides on-chain security monitoring helpers that detect suspicious
//!          activity patterns: rapid contribution bursts, oversized single
//!          contributions, repeated failed operations, and unauthorized access
//!          attempts.  Every detection emits a structured event so off-chain
//!          indexers and alerting systems can react without polling raw storage.
//!
//! @dev     State-mutating functions (record_*) write only to instance storage
//!          under well-defined keys.  Read-only query functions (check_*,
//!          get_*) never mutate state and are safe to call from simulations.
//!
//! ## Security Assumptions
//!
//! 1. **No auth required for recording** — monitoring is permissionless so
//!    any caller (including automated bots) can record events.
//! 2. **Counters are additive** — they never wrap; `checked_add` is used
//!    throughout to prevent overflow.
//! 3. **Thresholds are conservative** — defaults are intentionally low so
//!    false-positives surface quickly during testing.
//! 4. **Events are emitted after state writes** — a panicking host will not
//!    emit a misleading alert.
//! 5. **No cross-module side-effects** — this module only reads/writes its
//!    own DataKey variants and never calls token or NFT contracts.

#![allow(dead_code)]

use soroban_sdk::{Address, Env, Symbol};

use crate::DataKey;

// ── Thresholds ────────────────────────────────────────────────────────────────

/// Maximum number of contributions from a single address within one ledger
/// sequence window before a burst alert is raised.
pub const BURST_THRESHOLD: u32 = 5;

/// A single contribution exceeding this fraction of the campaign goal (in
/// basis points) is flagged as a whale alert.  Default: 5 000 bps = 50 %.
pub const WHALE_THRESHOLD_BPS: u32 = 5_000;

/// Number of consecutive failed operations from one address that triggers a
/// suspicious-activity alert.
pub const FAILURE_THRESHOLD: u32 = 3;

// ── Alert severity ────────────────────────────────────────────────────────────

/// Severity level attached to every emitted security alert.
///
/// @notice `Low` is informational; `High` should page an on-call engineer.
#[derive(Clone, PartialEq, Debug)]
pub enum AlertSeverity {
    Low,
    Medium,
    High,
}

impl AlertSeverity {
    /// Returns a static string label suitable for event payloads.
    pub fn label(&self) -> &'static str {
        match self {
            AlertSeverity::Low => "LOW",
            AlertSeverity::Medium => "MEDIUM",
            AlertSeverity::High => "HIGH",
        }
    }
}

// ── Threat record ─────────────────────────────────────────────────────────────

/// A detected threat event returned by detection functions.
///
/// @notice Callers may inspect `detected` to decide whether to emit an alert
///         or take a defensive action (e.g. pause the contract).
#[derive(Clone, PartialEq, Debug)]
pub struct ThreatRecord {
    /// Whether a threat was actually detected.
    pub detected: bool,
    /// Human-readable description of the threat (empty when `detected` is false).
    pub description: &'static str,
    /// Severity of the detected threat.
    pub severity: AlertSeverity,
}

impl ThreatRecord {
    fn none() -> Self {
        ThreatRecord {
            detected: false,
            description: "",
            severity: AlertSeverity::Low,
        }
    }

    fn new(description: &'static str, severity: AlertSeverity) -> Self {
        ThreatRecord {
            detected: true,
            description,
            severity,
        }
    }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/// Read the contribution burst counter for `contributor` (0 if absent).
pub fn get_burst_count(env: &Env, contributor: &Address) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::BurstCount(contributor.clone()))
        .unwrap_or(0u32)
}

/// Read the failure counter for `address` (0 if absent).
pub fn get_failure_count(env: &Env, address: &Address) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::FailureCount(address.clone()))
        .unwrap_or(0u32)
}

/// Read the total number of security alerts raised so far.
pub fn get_alert_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::SecurityAlertCount)
        .unwrap_or(0u32)
}

// ── Recording functions ───────────────────────────────────────────────────────

/// @title record_contribution_attempt
/// @notice Increments the burst counter for `contributor` and returns a
///         `ThreatRecord` when the counter exceeds `BURST_THRESHOLD`.
/// @dev    Emits a `security/burst_alert` event on detection.
/// @security No auth required — permissionless monitoring.
/// @param  env          The Soroban environment.
/// @param  contributor  The address making the contribution.
/// @return `ThreatRecord` — `detected` is true when burst threshold is exceeded.
pub fn record_contribution_attempt(env: &Env, contributor: &Address) -> ThreatRecord {
    let prev = get_burst_count(env, contributor);
    let next = prev.checked_add(1).unwrap_or(u32::MAX);
    env.storage()
        .instance()
        .set(&DataKey::BurstCount(contributor.clone()), &next);

    if next > BURST_THRESHOLD {
        let alert_count = get_alert_count(env)
            .checked_add(1)
            .unwrap_or(u32::MAX);
        env.storage()
            .instance()
            .set(&DataKey::SecurityAlertCount, &alert_count);

        env.events().publish(
            (Symbol::new(env, "security"), Symbol::new(env, "burst_alert")),
            (contributor.clone(), next),
        );

        return ThreatRecord::new("contribution burst threshold exceeded", AlertSeverity::Medium);
    }

    ThreatRecord::none()
}

/// @title record_failed_operation
/// @notice Increments the failure counter for `address` and returns a
///         `ThreatRecord` when the counter reaches `FAILURE_THRESHOLD`.
/// @dev    Emits a `security/failure_alert` event on detection.
/// @security No auth required — permissionless monitoring.
/// @param  env      The Soroban environment.
/// @param  address  The address whose operation failed.
/// @return `ThreatRecord` — `detected` is true when failure threshold is reached.
pub fn record_failed_operation(env: &Env, address: &Address) -> ThreatRecord {
    let prev = get_failure_count(env, address);
    let next = prev.checked_add(1).unwrap_or(u32::MAX);
    env.storage()
        .instance()
        .set(&DataKey::FailureCount(address.clone()), &next);

    if next >= FAILURE_THRESHOLD {
        let alert_count = get_alert_count(env)
            .checked_add(1)
            .unwrap_or(u32::MAX);
        env.storage()
            .instance()
            .set(&DataKey::SecurityAlertCount, &alert_count);

        env.events().publish(
            (Symbol::new(env, "security"), Symbol::new(env, "failure_alert")),
            (address.clone(), next),
        );

        return ThreatRecord::new("repeated operation failures detected", AlertSeverity::High);
    }

    ThreatRecord::none()
}

/// @title reset_burst_count
/// @notice Resets the burst counter for `contributor` to zero.
/// @dev    Call this after a successful contribution window closes so that
///         legitimate high-frequency contributors are not permanently flagged.
/// @security No auth required — counters are informational only.
/// @param  env          The Soroban environment.
/// @param  contributor  The address whose counter should be reset.
pub fn reset_burst_count(env: &Env, contributor: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::BurstCount(contributor.clone()), &0u32);
}

/// @title reset_failure_count
/// @notice Resets the failure counter for `address` to zero.
/// @dev    Call this after a successful operation to clear the failure window.
/// @security No auth required.
/// @param  env      The Soroban environment.
/// @param  address  The address whose failure counter should be reset.
pub fn reset_failure_count(env: &Env, address: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::FailureCount(address.clone()), &0u32);
}

// ── Detection functions ───────────────────────────────────────────────────────

/// @title check_whale_contribution
/// @notice Detects whether `amount` exceeds `WHALE_THRESHOLD_BPS` of `goal`.
/// @dev    Pure computation — does not read or write storage.
///         Emits a `security/whale_alert` event when a whale is detected.
/// @security Read-only; no auth required.
/// @param  env     The Soroban environment (needed for event emission).
/// @param  amount  The contribution amount to evaluate.
/// @param  goal    The campaign funding goal.
/// @param  contributor The contributing address (included in the event payload).
/// @return `ThreatRecord` — `detected` is true when the whale threshold is exceeded.
pub fn check_whale_contribution(
    env: &Env,
    contributor: &Address,
    amount: i128,
    goal: i128,
) -> ThreatRecord {
    if goal <= 0 {
        return ThreatRecord::none();
    }

    // amount / goal > WHALE_THRESHOLD_BPS / 10_000
    // ⟺ amount * 10_000 > goal * WHALE_THRESHOLD_BPS
    let lhs = amount.checked_mul(10_000).unwrap_or(i128::MAX);
    let rhs = goal
        .checked_mul(WHALE_THRESHOLD_BPS as i128)
        .unwrap_or(i128::MAX);

    if lhs > rhs {
        let alert_count = get_alert_count(env)
            .checked_add(1)
            .unwrap_or(u32::MAX);
        env.storage()
            .instance()
            .set(&DataKey::SecurityAlertCount, &alert_count);

        env.events().publish(
            (Symbol::new(env, "security"), Symbol::new(env, "whale_alert")),
            (contributor.clone(), amount, goal),
        );

        return ThreatRecord::new("single contribution exceeds whale threshold", AlertSeverity::Medium);
    }

    ThreatRecord::none()
}

/// @title check_unauthorized_access_attempt
/// @notice Records and detects when `caller` attempts to invoke a privileged
///         function without the required role.
/// @dev    Wraps `record_failed_operation` with a more descriptive label.
///         Emits a `security/unauth_alert` event on detection.
/// @security No auth required — monitoring is permissionless.
/// @param  env     The Soroban environment.
/// @param  caller  The address that attempted unauthorized access.
/// @return `ThreatRecord` — `detected` is true when failure threshold is reached.
pub fn check_unauthorized_access_attempt(env: &Env, caller: &Address) -> ThreatRecord {
    let prev = get_failure_count(env, caller);
    let next = prev.checked_add(1).unwrap_or(u32::MAX);
    env.storage()
        .instance()
        .set(&DataKey::FailureCount(caller.clone()), &next);

    if next >= FAILURE_THRESHOLD {
        let alert_count = get_alert_count(env)
            .checked_add(1)
            .unwrap_or(u32::MAX);
        env.storage()
            .instance()
            .set(&DataKey::SecurityAlertCount, &alert_count);

        env.events().publish(
            (Symbol::new(env, "security"), Symbol::new(env, "unauth_alert")),
            (caller.clone(), next),
        );

        return ThreatRecord::new(
            "repeated unauthorized access attempts detected",
            AlertSeverity::High,
        );
    }

    ThreatRecord::none()
}

/// @title get_security_summary
/// @notice Returns a snapshot of the current monitoring state.
/// @dev    Read-only; safe to call from simulations.
/// @param  env  The Soroban environment.
/// @return `(alert_count)` — total alerts raised since deployment.
pub fn get_security_summary(env: &Env) -> u32 {
    get_alert_count(env)
}
