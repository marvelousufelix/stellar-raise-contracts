#![cfg(test)]

use crate::access_logging::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_log_function_call_success() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    log_function_call(&env, &caller, "contribute", true);
    // Should complete without panic
}

#[test]
fn test_log_function_call_failure() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    log_function_call(&env, &caller, "withdraw", false);
    // Should complete without panic
}

#[test]
fn test_log_storage_access_read() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    log_storage_access(&env, &caller, AccessType::StorageRead, "TotalRaised");
    // Should complete without panic
}

#[test]
fn test_log_storage_access_write() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    log_storage_access(&env, &caller, AccessType::StorageWrite, "Contribution");
    // Should complete without panic
}

#[test]
fn test_log_token_transfer() {
    let env = Env::default();
    let from = Address::generate(&env);
    let to = Address::generate(&env);
    
    log_token_transfer(&env, &from, &to, 1000);
    // Should complete without panic
}

#[test]
fn test_log_admin_operation_success() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    log_admin_operation(&env, &admin, "pause", true, None);
    // Should complete without panic
}

#[test]
fn test_log_admin_operation_with_error() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    log_admin_operation(&env, &admin, "upgrade", false, Some("unauthorized"));
    // Should complete without panic
}

#[test]
fn test_access_type_equality() {
    assert_eq!(AccessType::FunctionCall, AccessType::FunctionCall);
    assert_ne!(AccessType::FunctionCall, AccessType::StorageRead);
    assert_ne!(AccessType::StorageRead, AccessType::StorageWrite);
    assert_ne!(AccessType::TokenTransfer, AccessType::AdminOperation);
}

#[test]
fn test_get_access_logs_for_address() {
    let env = Env::default();
    let address = Address::generate(&env);
    
    let logs = get_access_logs_for_address(&env, &address, 10);
    assert_eq!(logs.len(), 0); // Event-based logging returns empty
}

#[test]
fn test_analyze_access_patterns() {
    let env = Env::default();
    let address = Address::generate(&env);
    
    let is_normal = analyze_access_patterns(&env, &address);
    assert!(is_normal);
}

#[test]
fn test_generate_audit_report() {
    let env = Env::default();
    let start_time = 1000u64;
    let end_time = 2000u64;
    
    let report = generate_audit_report(&env, start_time, end_time);
    assert!(report.len() > 0);
}

#[test]
fn test_access_log_config_default() {
    let config = AccessLogConfig::default();
    
    assert!(config.enable_detailed_logging);
    assert_eq!(config.max_log_entries, 1000);
    assert!(config.enable_log_rotation);
}

#[test]
fn test_access_log_config_custom() {
    let config = AccessLogConfig {
        enable_detailed_logging: false,
        max_log_entries: 500,
        enable_log_rotation: false,
    };
    
    assert!(!config.enable_detailed_logging);
    assert_eq!(config.max_log_entries, 500);
    assert!(!config.enable_log_rotation);
}

#[test]
fn test_multiple_function_calls_logging() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    log_function_call(&env, &caller, "contribute", true);
    log_function_call(&env, &caller, "pledge", true);
    log_function_call(&env, &caller, "refund_single", false);
    
    // All should complete without panic
}

#[test]
fn test_mixed_access_logging() {
    let env = Env::default();
    let caller = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    log_function_call(&env, &caller, "contribute", true);
    log_storage_access(&env, &caller, AccessType::StorageWrite, "Contribution");
    log_token_transfer(&env, &caller, &recipient, 5000);
    
    // All should complete without panic
}

#[test]
fn test_access_log_entry_creation() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    let entry = AccessLogEntry {
        timestamp: env.ledger().timestamp(),
        caller: caller.clone(),
        access_type: AccessType::FunctionCall,
        operation: String::from_str(&env, "test_operation"),
        success: true,
        error_message: None,
    };
    
    assert_eq!(entry.access_type, AccessType::FunctionCall);
    assert!(entry.success);
    assert!(entry.error_message.is_none());
}

#[test]
fn test_access_log_entry_with_error() {
    let env = Env::default();
    let caller = Address::generate(&env);
    
    let entry = AccessLogEntry {
        timestamp: env.ledger().timestamp(),
        caller: caller.clone(),
        access_type: AccessType::AdminOperation,
        operation: String::from_str(&env, "upgrade"),
        success: false,
        error_message: Some(String::from_str(&env, "unauthorized")),
    };
    
    assert!(!entry.success);
    assert!(entry.error_message.is_some());
}
