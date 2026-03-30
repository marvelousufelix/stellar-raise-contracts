//! # security_training_integration
//!
//! @notice  Security training integration module for the Stellar Raise
//!          crowdfunding contract.  Tracks team training completion, validates
//!          security knowledge, enforces training-gated access, and produces
//!          structured training reports for CI/CD pipelines and auditors.
//!
//! @dev     All state is stored in Soroban instance storage keyed by
//!          `DataKey`.  Functions are pure or read-only where possible so they
//!          can be composed freely in property-based tests.
//!
//! @custom:security-note
//!   - Training completion is required before any privileged operation.
//!   - Quiz scores below `MIN_PASSING_SCORE` (80) are treated as failures.
//!   - Expired training (> `TRAINING_VALIDITY_DAYS` days old) must be renewed.
//!   - All state mutations emit a `training_event` for off-chain audit logs.

#![allow(dead_code)]

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String};

// ── Constants ─────────────────────────────────────────────────────────────────

/// @notice  Minimum quiz score (out of 100) required to pass a training module.
pub const MIN_PASSING_SCORE: u32 = 80;

/// @notice  Number of days a completed training record remains valid.
pub const TRAINING_VALIDITY_DAYS: u64 = 365;

/// @notice  Seconds in one day (used for expiry calculations).
pub const SECONDS_PER_DAY: u64 = 86_400;

// ── Data types ────────────────────────────────────────────────────────────────

/// @notice  Severity level of a training topic.
/// @dev     Maps to the same severity vocabulary used across the security crate.
#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum TrainingSeverity {
    /// Informational — awareness only.
    Low,
    /// Should be completed within 30 days.
    Medium,
    /// Must be completed before any privileged operation.
    High,
    /// Blocks all privileged operations until completed.
    Critical,
}

/// @notice  Completion status of a single training module for one team member.
#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum TrainingStatus {
    /// Module not yet started.
    NotStarted,
    /// Module in progress.
    InProgress,
    /// Module completed and quiz passed.
    Completed,
    /// Module completed but quiz failed.
    Failed,
    /// Previously completed but validity period has expired.
    Expired,
}

/// @notice  A single training module definition.
#[derive(Clone, Debug)]
#[contracttype]
pub struct TrainingModule {
    /// Unique identifier for this module.
    pub module_id: u32,
    /// Human-readable module name.
    pub name: String,
    /// Severity / priority of this module.
    pub severity: TrainingSeverity,
    /// Whether this module must be completed before privileged operations.
    pub required: bool,
}

/// @notice  A team member's completion record for one training module.
#[derive(Clone, Debug)]
#[contracttype]
pub struct TrainingRecord {
    /// Address of the team member.
    pub member: Address,
    /// ID of the completed module.
    pub module_id: u32,
    /// Current status.
    pub status: TrainingStatus,
    /// Quiz score (0–100).  0 when not yet attempted.
    pub score: u32,
    /// Ledger timestamp when the record was last updated.
    pub completed_at: u64,
}

/// @notice  Aggregate training report for a team member.
#[derive(Clone, Debug)]
#[contracttype]
pub struct TrainingReport {
    /// Address of the team member.
    pub member: Address,
    /// Total modules assigned.
    pub total_modules: u32,
    /// Modules with `Completed` status.
    pub completed_modules: u32,
    /// Modules with `Failed` or `Expired` status.
    pub incomplete_modules: u32,
    /// Whether all required modules are completed.
    pub all_required_complete: bool,
    /// Computed compliance score (0–100).
    pub compliance_score: u32,
}

// ── Storage key ───────────────────────────────────────────────────────────────

/// @notice  Soroban storage keys for the training integration module.
#[contracttype]
pub enum DataKey {
    /// Counter tracking the number of registered modules.
    ModuleCount,
    /// A specific training module definition.
    Module(u32),
    /// A specific member's record for a specific module.
    Record(Address, u32),
}

// ── Pure / stateless helpers ──────────────────────────────────────────────────

/// @notice  Returns `true` when `score` meets the minimum passing threshold.
/// @dev     Used by `record_completion` and tests independently.
/// @custom:security-note  Scores below `MIN_PASSING_SCORE` must never grant
///          access to privileged operations.
/// @param   score  Quiz score in the range 0–100.
pub fn is_passing_score(score: u32) -> bool {
    score >= MIN_PASSING_SCORE
}

/// @notice  Returns `true` when a training record has not yet expired.
/// @dev     Expiry is `completed_at + TRAINING_VALIDITY_DAYS * SECONDS_PER_DAY`.
/// @custom:security-note  Expired training must be renewed; the member must
///          not retain privileged access after expiry.
/// @param   completed_at  Ledger timestamp when the module was completed.
/// @param   now           Current ledger timestamp.
pub fn is_training_valid(completed_at: u64, now: u64) -> bool {
    let validity_seconds = TRAINING_VALIDITY_DAYS
        .saturating_mul(SECONDS_PER_DAY);
    let expiry = completed_at.saturating_add(validity_seconds);
    now <= expiry
}

/// @notice  Computes a compliance score (0–100) from completed / total counts.
/// @dev     Returns 0 when `total` is 0 to avoid division by zero.
/// @param   completed  Number of completed modules.
/// @param   total      Total number of modules.
pub fn compute_compliance_score(completed: u32, total: u32) -> u32 {
    if total == 0 {
        return 0;
    }
    (completed.saturating_mul(100)) / total
}

/// @notice  Derives a `TrainingStatus` from a score and the current timestamp.
/// @dev     Called after a quiz attempt to determine the resulting status.
/// @custom:security-note  A score of exactly `MIN_PASSING_SCORE` is passing.
/// @param   score        Quiz score (0–100).
/// @param   completed_at Timestamp of the attempt.
/// @param   now          Current ledger timestamp.
pub fn derive_status(score: u32, completed_at: u64, now: u64) -> TrainingStatus {
    if !is_passing_score(score) {
        return TrainingStatus::Failed;
    }
    if !is_training_valid(completed_at, now) {
        return TrainingStatus::Expired;
    }
    TrainingStatus::Completed
}

/// @notice  Returns `true` when all required modules in `modules` have a
///          corresponding `Completed` record in `records`.
/// @dev     O(n²) — acceptable for the small module counts expected in practice.
/// @custom:security-note  A single incomplete required module must block access.
/// @param   modules  Slice of all training modules.
/// @param   records  Slice of the member's training records.
pub fn all_required_complete(modules: &[TrainingModule], records: &[TrainingRecord]) -> bool {
    for module in modules {
        if !module.required {
            continue;
        }
        let completed = records.iter().any(|r| {
            r.module_id == module.module_id && r.status == TrainingStatus::Completed
        });
        if !completed {
            return false;
        }
    }
    true
}

/// @notice  Builds a `TrainingReport` from a member's modules and records.
/// @dev     Pure function — no storage access.
/// @param   member   The team member's address.
/// @param   modules  All training modules.
/// @param   records  The member's training records.
pub fn build_report(
    member: Address,
    modules: &[TrainingModule],
    records: &[TrainingRecord],
) -> TrainingReport {
    let total = modules.len() as u32;
    let mut completed = 0u32;
    let mut incomplete = 0u32;

    for module in modules {
        let status = records
            .iter()
            .find(|r| r.module_id == module.module_id)
            .map(|r| r.status.clone())
            .unwrap_or(TrainingStatus::NotStarted);

        match status {
            TrainingStatus::Completed => completed = completed.saturating_add(1),
            TrainingStatus::Failed | TrainingStatus::Expired => {
                incomplete = incomplete.saturating_add(1)
            }
            _ => {}
        }
    }

    let required_ok = all_required_complete(modules, records);
    let score = compute_compliance_score(completed, total);

    TrainingReport {
        member,
        total_modules: total,
        completed_modules: completed,
        incomplete_modules: incomplete,
        all_required_complete: required_ok,
        compliance_score: score,
    }
}

// ── Contract ──────────────────────────────────────────────────────────────────

/// @notice  On-chain training integration contract.
/// @dev     Stores module definitions and per-member completion records in
///          Soroban instance storage.  Emits `training_event` events for every
///          state mutation so off-chain indexers can build audit logs.
#[contract]
pub struct SecurityTrainingIntegration;

#[contractimpl]
impl SecurityTrainingIntegration {
    // ── Module management ─────────────────────────────────────────────────────

    /// @notice  Registers a new training module on-chain.
    /// @dev     Increments the module counter and stores the module definition.
    ///          Emits a `module_registered` event.
    /// @custom:security-note  Only the contract admin should call this in
    ///          production; access control is left to the caller layer.
    /// @param   env       Soroban environment.
    /// @param   name      Human-readable module name.
    /// @param   severity  Severity level of the module.
    /// @param   required  Whether this module gates privileged operations.
    /// @return  The newly assigned module ID.
    pub fn register_module(
        env: Env,
        name: String,
        severity: TrainingSeverity,
        required: bool,
    ) -> u32 {
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ModuleCount)
            .unwrap_or(0u32);
        let module_id = count.saturating_add(1);

        let module = TrainingModule {
            module_id,
            name,
            severity,
            required,
        };

        env.storage()
            .instance()
            .set(&DataKey::Module(module_id), &module);
        env.storage()
            .instance()
            .set(&DataKey::ModuleCount, &module_id);

        env.events().publish(
            (symbol_short!("training"),),
            (symbol_short!("mod_reg"), module_id),
        );

        module_id
    }

    /// @notice  Retrieves a training module definition by ID.
    /// @param   env        Soroban environment.
    /// @param   module_id  ID of the module to retrieve.
    /// @return  `Some(TrainingModule)` if found, `None` otherwise.
    pub fn get_module(env: Env, module_id: u32) -> Option<TrainingModule> {
        env.storage()
            .instance()
            .get(&DataKey::Module(module_id))
    }

    /// @notice  Returns the total number of registered modules.
    /// @param   env  Soroban environment.
    pub fn module_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ModuleCount)
            .unwrap_or(0u32)
    }

    // ── Record management ─────────────────────────────────────────────────────

    /// @notice  Records a quiz attempt for a team member.
    /// @dev     Derives the resulting `TrainingStatus` from the score and
    ///          current ledger timestamp, then persists the record.
    ///          Emits a `quiz_attempt` event.
    /// @custom:security-note  A score below `MIN_PASSING_SCORE` sets status to
    ///          `Failed` and must not grant privileged access.
    /// @param   env        Soroban environment.
    /// @param   member     Address of the team member.
    /// @param   module_id  ID of the module being completed.
    /// @param   score      Quiz score (0–100).
    /// @return  The resulting `TrainingStatus`.
    pub fn record_completion(
        env: Env,
        member: Address,
        module_id: u32,
        score: u32,
    ) -> TrainingStatus {
        let now = env.ledger().timestamp();
        let status = derive_status(score, now, now);

        let record = TrainingRecord {
            member: member.clone(),
            module_id,
            status: status.clone(),
            score,
            completed_at: now,
        };

        env.storage()
            .instance()
            .set(&DataKey::Record(member.clone(), module_id), &record);

        let passed = status == TrainingStatus::Completed;
        env.events().publish(
            (symbol_short!("training"),),
            (symbol_short!("quiz_att"), module_id, passed),
        );

        status
    }

    /// @notice  Retrieves a member's training record for a specific module.
    /// @param   env        Soroban environment.
    /// @param   member     Address of the team member.
    /// @param   module_id  ID of the module.
    /// @return  `Some(TrainingRecord)` if found, `None` otherwise.
    pub fn get_record(env: Env, member: Address, module_id: u32) -> Option<TrainingRecord> {
        env.storage()
            .instance()
            .get(&DataKey::Record(member, module_id))
    }

    // ── Access gate ───────────────────────────────────────────────────────────

    /// @notice  Returns `true` when `member` has completed all required modules.
    /// @dev     Iterates over all registered modules and checks each required
    ///          one against the member's stored records.
    /// @custom:security-note  This is the primary access gate.  Callers must
    ///          invoke this before any privileged operation.
    /// @param   env     Soroban environment.
    /// @param   member  Address of the team member.
    pub fn is_training_complete(env: Env, member: Address) -> bool {
        let count = Self::module_count(env.clone());
        for id in 1..=count {
            if let Some(module) = Self::get_module(env.clone(), id) {
                if !module.required {
                    continue;
                }
                let record: Option<TrainingRecord> = env
                    .storage()
                    .instance()
                    .get(&DataKey::Record(member.clone(), id));
                let complete = record
                    .map(|r| r.status == TrainingStatus::Completed)
                    .unwrap_or(false);
                if !complete {
                    return false;
                }
            }
        }
        true
    }

    // ── In-progress tracking ──────────────────────────────────────────────────

    /// @notice  Marks a module as `InProgress` for a team member.
    /// @dev     Creates or overwrites the record with `InProgress` status.
    ///          Emits a `mod_start` event.  Does not overwrite a `Completed`
    ///          record — a member cannot un-complete a module.
    /// @custom:security-note  `InProgress` must never satisfy the access gate;
    ///          only `Completed` records count.
    /// @param   env        Soroban environment.
    /// @param   member     Address of the team member.
    /// @param   module_id  ID of the module being started.
    /// @return  `true` if the record was updated, `false` if already Completed.
    pub fn start_module(env: Env, member: Address, module_id: u32) -> bool {
        let existing: Option<TrainingRecord> = env
            .storage()
            .instance()
            .get(&DataKey::Record(member.clone(), module_id));

        // Do not downgrade a Completed record.
        if let Some(ref r) = existing {
            if r.status == TrainingStatus::Completed {
                return false;
            }
        }

        let record = TrainingRecord {
            member: member.clone(),
            module_id,
            status: TrainingStatus::InProgress,
            score: 0,
            completed_at: env.ledger().timestamp(),
        };

        env.storage()
            .instance()
            .set(&DataKey::Record(member.clone(), module_id), &record);

        env.events().publish(
            (symbol_short!("training"),),
            (symbol_short!("mod_strt"), module_id),
        );

        true
    }

    // ── Revocation ────────────────────────────────────────────────────────────

    /// @notice  Revokes a member's completion record, resetting it to `Failed`.
    /// @dev     Used by admins when a member's training is found to be invalid
    ///          (e.g. cheating, policy change).  Emits a `revoked` event.
    /// @custom:security-note  After revocation the member loses privileged
    ///          access until they re-complete the module with a passing score.
    /// @param   env        Soroban environment.
    /// @param   member     Address of the team member.
    /// @param   module_id  ID of the module to revoke.
    /// @return  `true` if a record existed and was revoked, `false` otherwise.
    pub fn revoke_completion(env: Env, member: Address, module_id: u32) -> bool {
        let existing: Option<TrainingRecord> = env
            .storage()
            .instance()
            .get(&DataKey::Record(member.clone(), module_id));

        match existing {
            None => false,
            Some(mut record) => {
                record.status = TrainingStatus::Failed;
                record.score = 0;
                env.storage()
                    .instance()
                    .set(&DataKey::Record(member.clone(), module_id), &record);

                env.events().publish(
                    (symbol_short!("training"),),
                    (symbol_short!("revoked"), module_id),
                );

                true
            }
        }
    }

    // ── Reporting ─────────────────────────────────────────────────────────────

    /// @notice  Computes a compliance score (0–100) for a team member.
    /// @dev     Score = (completed modules / total modules) × 100.
    /// @param   env     Soroban environment.
    /// @param   member  Address of the team member.
    pub fn compliance_score(env: Env, member: Address) -> u32 {
        let count = Self::module_count(env.clone());
        if count == 0 {
            return 0;
        }
        let mut completed = 0u32;
        for id in 1..=count {
            let record: Option<TrainingRecord> = env
                .storage()
                .instance()
                .get(&DataKey::Record(member.clone(), id));
            if record
                .map(|r| r.status == TrainingStatus::Completed)
                .unwrap_or(false)
            {
                completed = completed.saturating_add(1);
            }
        }
        compute_compliance_score(completed, count)
    }

    /// @notice  Returns a `TrainingReport` for a member built from on-chain state.
    /// @dev     Reads all registered modules and the member's records, then
    ///          computes the report inline (no `std` allocation needed).
    /// @param   env     Soroban environment.
    /// @param   member  Address of the team member.
    pub fn training_summary(env: Env, member: Address) -> TrainingReport {
        let count = Self::module_count(env.clone());
        let mut total = 0u32;
        let mut completed_count = 0u32;
        let mut incomplete_count = 0u32;
        let mut all_required_ok = true;

        for id in 1..=count {
            let module = match Self::get_module(env.clone(), id) {
                Some(m) => m,
                None => continue,
            };
            total = total.saturating_add(1);

            let record: Option<TrainingRecord> = env
                .storage()
                .instance()
                .get(&DataKey::Record(member.clone(), id));

            let status = record
                .as_ref()
                .map(|r| r.status.clone())
                .unwrap_or(TrainingStatus::NotStarted);

            match status {
                TrainingStatus::Completed => {
                    completed_count = completed_count.saturating_add(1);
                }
                TrainingStatus::Failed | TrainingStatus::Expired => {
                    incomplete_count = incomplete_count.saturating_add(1);
                    if module.required {
                        all_required_ok = false;
                    }
                }
                _ => {
                    // NotStarted or InProgress
                    if module.required {
                        all_required_ok = false;
                    }
                }
            }
        }

        let score = compute_compliance_score(completed_count, total);

        TrainingReport {
            member,
            total_modules: total,
            completed_modules: completed_count,
            incomplete_modules: incomplete_count,
            all_required_complete: all_required_ok,
            compliance_score: score,
        }
    }
}
