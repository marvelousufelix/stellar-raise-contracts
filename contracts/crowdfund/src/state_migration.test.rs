#[cfg(test)]
mod state_migration_tests {
    use soroban_sdk::Env;

    use crate::state_migration::{
        enforce_current_version, get_schema_version, migrate_to, needs_migration, set_schema_version,
        StateMigrationError, CURRENT_SCHEMA_VERSION,
    };

    fn make_env() -> Env {
        Env::default()
    }

    #[test]
    fn test_get_schema_version_defaults_to_zero() {
        let env = make_env();
        assert_eq!(get_schema_version(&env), 0);
    }

    #[test]
    fn test_set_and_get_schema_version_roundtrip() {
        let env = make_env();
        set_schema_version(&env, 1);
        assert_eq!(get_schema_version(&env), 1);
    }

    #[test]
    fn test_needs_migration_when_lower_version() {
        let env = make_env();
        set_schema_version(&env, 1);
        assert!(needs_migration(&env, 2));
    }

    #[test]
    fn test_needs_migration_false_when_at_or_above_target() {
        let env = make_env();
        set_schema_version(&env, 2);
        assert!(!needs_migration(&env, 2));
        assert!(!needs_migration(&env, 1));
    }

    #[test]
    fn test_migrate_to_uninitialized_fails() {
        let env = make_env();
        let result = migrate_to(&env, 1);
        assert_eq!(result, Err(StateMigrationError::Uninitialized));
    }

    #[test]
    fn test_migrate_to_downgrade_not_allowed() {
        let env = make_env();
        set_schema_version(&env, 2);
        let result = migrate_to(&env, 1);
        assert_eq!(result, Err(StateMigrationError::DowngradeNotAllowed));
    }

    #[test]
    fn test_migrate_to_unsupported_version() {
        let env = make_env();
        set_schema_version(&env, 2);
        let result = migrate_to(&env, CURRENT_SCHEMA_VERSION + 1);
        assert_eq!(result, Err(StateMigrationError::UnsupportedVersion));
    }

    #[test]
    fn test_migrate_to_current_schema_succeeds() {
        let env = make_env();
        set_schema_version(&env, CURRENT_SCHEMA_VERSION);
        let result = migrate_to(&env, CURRENT_SCHEMA_VERSION);
        assert_eq!(result, Ok(CURRENT_SCHEMA_VERSION));
        assert_eq!(get_schema_version(&env), CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn test_enforce_current_version_panics_on_mismatch() {
        let env = make_env();
        set_schema_version(&env, CURRENT_SCHEMA_VERSION - 1);
        let err = std::panic::catch_unwind(|| enforce_current_version(&env));
        assert!(err.is_err());
    }
}
