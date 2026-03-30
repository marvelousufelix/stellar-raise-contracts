//! # security_incident_response
//!
//! @title   SecurityIncidentResponse — Automated incident tracking and
//!          emergency handling for the crowdfund contract.
//!
//! @notice  Provides on-chain incident recording helpers that count security
//!          events, recommend auto-pause when a critical threshold is reached,
//!          and allow authorised operators to reset the counter after remediation.
//!
//! @dev     All state is stored in instance storage under the Symbol key
//!          `"inc_count"`.  Functions are intentionally stateless beyond that
//!          single counter so they compose cleanly with the rest of the contract.
//!
//! ## Security Assumptions
//!
//! 1. **Permissionless recording** — any caller may record an incident so that
//!    automated monitoring bots can operate without special privileges.
//! 2. **Overflow safety** — the counter uses `saturating_add(1)` so it never
//!    wraps around to zero under sustained attack.
//! 3. **Reset is privileged** — callers of `reset_incident_count` must enforce
//!    access control at the call site; this module does not check auth.
//! 4. **No cross-module side-effects** — this module only reads/writes
//!    `"inc_count"` and never calls token or NFT contracts.

#![allow(dead_code)]

use soroban_sdk::{Address, Env, Symbol};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Maximum number of incidents that should be recorded within a single ledger
/// sequence before the counter is considered saturated.
pub const MAX_INCIDENTS_PER_LEDGER: u32 = 10;

/// Number of recorded incidents that triggers an auto-pause recommendation.
pub const AUTO_PAUSE_THRESHOLD: u32 = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

/// Severity level attached to every recorded incident.
///
/// @notice `Low` is informational; `Critical` should trigger immediate action.
#[derive(Clone, PartialEq, Debug)]
pub enum IncidentSeverity {
    Low,
    Medium,
    High,
    Critical,
}

impl IncidentSeverity {
    /// Returns a static string label for the severity level.
    pub fn label(&self) -> &'static str {
        match self {
            IncidentSeverity::Low => "LOW",
            IncidentSeverity::Medium => "MEDIUM",
            IncidentSeverity::High => "HIGH",
            IncidentSeverity::Critical => "CRITICAL",
        }
    }
}

/// Result returned by `record_incident`.
///
/// @notice When `detected` is `true` the caller should consider pausing the
///         contract via the emergency-stop mechanism.
#[derive(Clone, PartialEq, Debug)]
pub struct IncidentRecord {
    /// Whether the auto-pause threshold has been reached.
    pub detected: bool,
    /// Severity of the recorded incident.
    pub severity: IncidentSeverity,
    /// Human-readable description; `"auto_pause_recommended"` when detected.
    pub description: &'static str,
}

// ── Storage helpers ───────────────────────────────────────────────────────────

fn inc_count_key(env: &Env) -> Symbol {
    Symbol::new(env, "inc_count")
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Records a new security incident and increments the on-chain counter.
///
/// @param env      The Soroban environment.
/// @param reporter Address of the entity reporting the incident (logged only).
/// @param severity Severity level of the incident.
/// @return         An `IncidentRecord` with `detected = true` once the counter
///                 reaches `AUTO_PAUSE_THRESHOLD`.
pub fn record_incident(
    env: &Env,
    _reporter: &Address,
    severity: IncidentSeverity,
) -> IncidentRecord {
    let key = inc_count_key(env);
    let count: u32 = env.storage().instance().get(&key).unwrap_or(0);
    let new_count = count.saturating_add(1);
    env.storage().instance().set(&key, &new_count);

    let detected = new_count >= AUTO_PAUSE_THRESHOLD;
    IncidentRecord {
        detected,
        severity,
        description: if detected { "auto_pause_recommended" } else { "" },
    }
}

/// Returns the current incident counter value.
///
/// @param env The Soroban environment.
/// @return    Counter value, or 0 if no incidents have been recorded.
pub fn get_incident_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&inc_count_key(env))
        .unwrap_or(0)
}

/// Resets the incident counter to zero.
///
/// @dev Callers must enforce access control before invoking this function.
/// @param env The Soroban environment.
pub fn reset_incident_count(env: &Env) {
    env.storage().instance().set(&inc_count_key(env), &0u32);
}

/// Returns `true` when the incident count has reached `AUTO_PAUSE_THRESHOLD`.
///
/// @param env The Soroban environment.
/// @return    `true` if auto-pause is recommended.
pub fn check_auto_pause(env: &Env) -> bool {
    get_incident_count(env) >= AUTO_PAUSE_THRESHOLD
}
