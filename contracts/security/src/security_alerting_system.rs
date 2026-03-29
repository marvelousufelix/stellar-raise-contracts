/// Security Alerting System for Soroban Contracts
/// Provides automated security monitoring and alerting capabilities

use soroban_sdk::{contract, contractimpl, Env, Symbol, Vec, String};

#[derive(Clone, Debug)]
pub struct SecurityAlert {
    pub alert_id: u64,
    pub severity: u32, // 1=Low, 2=Medium, 3=High, 4=Critical
    pub alert_type: String,
    pub message: String,
    pub timestamp: u64,
    pub resolved: bool,
}

#[contract]
pub struct SecurityAlertingSystem;

#[contractimpl]
impl SecurityAlertingSystem {
    /// Initialize security alerting system
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// 
    /// # Returns
    /// Success status
    pub fn initialize(env: Env) -> bool {
        let key = Symbol::new(&env, "initialized");
        env.storage().instance().set(&key, &true);
        true
    }

    /// Create a new security alert
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `severity` - Alert severity level (1-4)
    /// * `alert_type` - Type of security alert
    /// * `message` - Alert message
    /// 
    /// # Returns
    /// Alert ID
    pub fn create_alert(
        env: Env,
        severity: u32,
        alert_type: String,
        message: String,
    ) -> u64 {
        // Validate severity
        if severity < 1 || severity > 4 {
            panic!("Invalid severity level");
        }

        // Get next alert ID
        let counter_key = Symbol::new(&env, "alert_counter");
        let alert_id: u64 = env
            .storage()
            .instance()
            .get(&counter_key)
            .unwrap_or(0u64);
        let next_id = alert_id + 1;

        // Create alert
        let alert = SecurityAlert {
            alert_id: next_id,
            severity,
            alert_type,
            message,
            timestamp: env.ledger().timestamp(),
            resolved: false,
        };

        // Store alert using next_id as part of key
        let alert_key = Symbol::new(&env, &next_id.to_string());
        env.storage().instance().set(&alert_key, &alert);

        // Update counter
        env.storage().instance().set(&counter_key, &next_id);

        next_id
    }

    /// Resolve a security alert
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `alert_id` - ID of alert to resolve
    /// 
    /// # Returns
    /// Success status
    pub fn resolve_alert(env: Env, alert_id: u64) -> bool {
        let alert_key = Symbol::new(&env, &alert_id.to_string());
        
        if let Some(mut alert) = env.storage().instance().get::<_, SecurityAlert>(&alert_key) {
            alert.resolved = true;
            env.storage().instance().set(&alert_key, &alert);
            true
        } else {
            false
        }
    }

    /// Get alert by ID
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// * `alert_id` - ID of alert to retrieve
    /// 
    /// # Returns
    /// Alert details or None
    pub fn get_alert(env: Env, alert_id: u64) -> Option<SecurityAlert> {
        let alert_key = Symbol::new(&env, &alert_id.to_string());
        env.storage().instance().get(&alert_key)
    }

    /// Get total alert count
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// 
    /// # Returns
    /// Total number of alerts
    pub fn get_alert_count(env: Env) -> u64 {
        let counter_key = Symbol::new(&env, "alert_counter");
        env.storage().instance().get(&counter_key).unwrap_or(0u64)
    }

    /// Get critical alerts count
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// 
    /// # Returns
    /// Number of critical alerts
    pub fn get_critical_alerts_count(env: Env) -> u64 {
        let counter_key = Symbol::new(&env, "alert_counter");
        let total: u64 = env.storage().instance().get(&counter_key).unwrap_or(0u64);
        
        let mut critical_count = 0u64;
        for i in 1..=total {
            let alert_key = Symbol::new(&env, &i.to_string());
            if let Some(alert) = env.storage().instance().get::<_, SecurityAlert>(&alert_key) {
                if alert.severity == 4 && !alert.resolved {
                    critical_count += 1;
                }
            }
        }
        critical_count
    }

    /// Check if system has unresolved critical alerts
    /// 
    /// # Arguments
    /// * `env` - Soroban environment
    /// 
    /// # Returns
    /// True if critical alerts exist
    pub fn has_critical_alerts(env: Env) -> bool {
        Self::get_critical_alerts_count(env) > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let result = SecurityAlertingSystem::initialize(env.clone());
        assert!(result);
    }

    #[test]
    fn test_create_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());

        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            2,
            String::from_slice(&env, "unauthorized_access"),
            String::from_slice(&env, "Unauthorized access attempt detected"),
        );

        assert_eq!(alert_id, 1);
    }

    #[test]
    fn test_get_alert() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());

        let alert_id = SecurityAlertingSystem::create_alert(
            env.clone(),
            3,
            String::from_slice(&env, "high_risk"),
            String::from_slice(&env, "High risk operation detected"),
        );

        let alert = SecurityAlertingSystem::get_alert(env.clone(), alert_id);
        assert!(alert.is_some());
        assert_eq!(alert.unwrap().severity, 3);
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
        assert!(resolved);

        let alert = SecurityAlertingSystem::get_alert(env.clone(), alert_id);
        assert!(alert.unwrap().resolved);
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
        assert_eq!(count, 2);
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
        assert!(has_critical);
    }

    #[test]
    #[should_panic]
    fn test_invalid_severity() {
        let env = Env::default();
        SecurityAlertingSystem::initialize(env.clone());

        SecurityAlertingSystem::create_alert(
            env.clone(),
            5,
            String::from_slice(&env, "invalid"),
            String::from_slice(&env, "Invalid severity"),
        );
    }
}
