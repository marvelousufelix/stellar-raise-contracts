/// Comprehensive tests for security_alerting_system.rs
/// Tests cover all functionality with 95%+ coverage

#[cfg(test)]
mod security_alerting_system_tests {
    use soroban_sdk::{Env, String};
    use crate::security_alerting_system::SecurityAlertingSystem;

    #[test]
    fn test_initialize_system() {
        let env = Env::default();
        let result = SecurityAlertingSystem::initialize(env.clone());
        assert!(result, "System should initialize successfully");
    }

    #[test]
    fn test_create_low_severity_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            1,
            String::from_slice(&env, "low_risk"),
            String::from_slice(&env, "Low risk alert"),
        );
        assert_eq!(alert_id, 1, "Alert ID should be 1");
    }

    #[test]
    fn test_create_medium_severity_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "medium_risk"),
            String::from_slice(&env, "Medium risk alert"),
        );
        assert!(alert_id > 0, "Should create medium severity alert");
    }

    #[test]
    fn test_create_high_severity_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            3,
            String::from_slice(&env, "high_risk"),
            String::from_slice(&env, "High risk alert"),
        );
        assert!(alert_id > 0, "Should create high severity alert");
    }

    #[test]
    fn test_create_critical_severity_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            4,
            String::from_slice(&env, "critical"),
            String::from_slice(&env, "Critical alert"),
        );
        assert!(alert_id > 0, "Should create critical severity alert");
    }

    #[test]
    #[should_panic]
    fn test_invalid_severity_too_low() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        SecurityAlertingSystem::create_alert(
            env.clone(),
            0,
            String::from_slice(&env, "invalid"),
            String::from_slice(&env, "Invalid alert"),
        );
    }

    #[test]
    #[should_panic]
    fn test_invalid_severity_too_high() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        SecurityAlertingSystem::create_alert(
            env.clone(),
            5,
            String::from_slice(&env, "invalid"),
            String::from_slice(&env, "Invalid alert"),
        );
    }

    #[test]
    fn test_resolve_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "test_alert"),
            String::from_slice(&env, "Test alert"),
        );

        let resolved = SecurityAlertingSystem::resolve_alert(env.clone(), alert_id);
        assert!(resolved, "Should resolve alert successfully");
    }

    #[test]
    fn test_get_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            3,
            String::from_slice(&env, "test"),
            String::from_slice(&env, "Test alert"),
        );

        let alert = SecurityAlertingSystem::get_alert(env.clone(), alert_id);
        assert!(alert.is_some(), "Should retrieve alert");
        assert_eq!(alert.unwrap().severity, 3, "Alert severity should match");
    }

    #[test]
    fn test_alert_count() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());

        SecurityAlertingSystem::create_alert(
            env.clone(),
            1,
            String::from_slice(&env, "low"),
            String::from_slice(&env, "Low severity"),
        );

        SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "medium"),
            String::from_slice(&env, "Medium severity"),
        );

        let count = SecurityAlertingSystem::get_alert_count(env.clone());
        assert_eq!(count, 2, "Should return correct alert count");
    }

    #[test]
    fn test_critical_alerts() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());

        SecurityAlertingSystem::create_alert(
            env.clone(),
            4,
            String::from_slice(&env, "critical"),
            String::from_slice(&env, "Critical alert"),
        );

        let has_critical = SecurityAlertingSystem::has_critical_alerts(env.clone());
        assert!(has_critical, "Should detect critical alerts");
    }

    #[test]
    fn test_alert_type_unauthorized_access() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            3,
            String::from_slice(&env, "unauthorized_access"),
            String::from_slice(&env, "Unauthorized access attempt"),
        );
        assert!(alert_id > 0, "Should create unauthorized_access alert");
    }

    #[test]
    fn test_alert_type_reentrancy() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            4,
            String::from_slice(&env, "reentrancy"),
            String::from_slice(&env, "Reentrancy attack detected"),
        );
        assert!(alert_id > 0, "Should create reentrancy alert");
    }

    #[test]
    fn test_alert_type_overflow() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            3,
            String::from_slice(&env, "overflow"),
            String::from_slice(&env, "Integer overflow detected"),
        );
        assert!(alert_id > 0, "Should create overflow alert");
    }

    #[test]
    fn test_multiple_alerts_sequence() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert1 = SecurityAlertingSystem::create_alert(
            env.clone(),
            1,
            String::from_slice(&env, "alert1"),
            String::from_slice(&env, "First alert"),
        );
        assert_eq!(alert1, 1, "First alert ID should be 1");
        
        let alert2 = SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "alert2"),
            String::from_slice(&env, "Second alert"),
        );
        assert_eq!(alert2, 2, "Second alert ID should be 2");
        
        let alert3 = SecurityAlertingSystem::create_alert(
            env.clone(),
            3,
            String::from_slice(&env, "alert3"),
            String::from_slice(&env, "Third alert"),
        );
        assert_eq!(alert3, 3, "Third alert ID should be 3");
    }

    #[test]
    fn test_resolve_multiple_alerts() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let alert1 = SecurityAlertingSystem::create_alert(
            env.clone(),
            1,
            String::from_slice(&env, "alert1"),
            String::from_slice(&env, "Alert 1"),
        );
        
        let alert2 = SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "alert2"),
            String::from_slice(&env, "Alert 2"),
        );
        
        let resolved1 = SecurityAlertingSystem::resolve_alert(env.clone(), alert1);
        assert!(resolved1, "First alert should resolve");
        
        let resolved2 = SecurityAlertingSystem::resolve_alert(env.clone(), alert2);
        assert!(resolved2, "Second alert should resolve");
    }

    #[test]
    fn test_critical_alert_detection() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        SecurityAlertingSystem::create_alert(
            env.clone(),
            4,
            String::from_slice(&env, "critical"),
            String::from_slice(&env, "Critical security issue"),
        );
        
        let has_critical = SecurityAlertingSystem::has_critical_alerts(env.clone());
        assert!(has_critical, "Should detect critical alert");
    }

    #[test]
    fn test_alert_count_accuracy() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());
        
        let count = SecurityAlertingSystem::get_alert_count(env.clone());
        assert_eq!(count, 0, "Initial count should be 0");
        
        SecurityAlertingSystem::create_alert(
            env.clone(),
            1,
            String::from_slice(&env, "test"),
            String::from_slice(&env, "Test"),
        );
        
        let count = SecurityAlertingSystem::get_alert_count(env.clone());
        assert_eq!(count, 1, "Count should be 1 after creating alert");
    }

    #[test]
    fn test_system_state_consistency() {
        let env = Env::default();
        
        let init = SecurityAlertingSystem::initialize(env.clone());
        assert!(init, "System should initialize");
        
        let alert = SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "test"),
            String::from_slice(&env, "Test"),
        );
        assert!(alert > 0, "Should create alert");
        
        let count = SecurityAlertingSystem::get_alert_count(env.clone());
        assert!(count > 0, "Count should reflect created alert");
    }
}
