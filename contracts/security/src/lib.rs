#![no_std]

pub mod multi_signature_execution;
pub mod output_sanitization;
pub mod security_testing_automation;
pub mod security_remediation;
pub mod security_alerting_system;
pub mod security_training_integration;

#[cfg(test)]
#[path = "multi_signature_execution.test.rs"]
mod multi_signature_execution_test;

#[cfg(test)]
#[path = "output_sanitization.test.rs"]
mod output_sanitization_test;

#[cfg(test)]
#[path = "security_testing_automation.test.rs"]
mod security_testing_automation_test;

#[cfg(test)]
#[path = "security_remediation.test.rs"]
mod security_remediation_test;

#[cfg(test)]
#[path = "security_alerting_system.test.rs"]
mod security_alerting_system_test;

#[cfg(test)]
#[path = "security_training_integration.test.rs"]
mod security_training_integration_test;
