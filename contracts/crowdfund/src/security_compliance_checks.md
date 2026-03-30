# Security Compliance Checks

## Overview

The Security Compliance Checks module provides automated compliance checks for contract testing and regulatory adherence. It validates access controls, state invariants, input validation, and security guards.

## Features

- **Automated Checks**: Pre-built compliance check implementations
- **Check Status Tracking**: Passed, Failed, Skipped, Error states
- **Check Suites**: Group related checks with aggregated results
- **Pass Rate Calculation**: Automatic pass rate computation
- **Error Tracking**: Detailed error messages for failed checks
- **Duration Tracking**: Measure check execution time

## Types

### CheckStatus

Check execution status:

```rust
pub enum CheckStatus {
    Passed = 0,   // Check passed
    Failed = 1,   // Check failed
    Skipped = 2,  // Check skipped
    Error = 3,    // Check error
}
```

### ComplianceCheck

Individual compliance check result:

```rust
pub struct ComplianceCheck {
    pub check_id: String,        // Unique identifier
    pub name: String,            // Check name
    pub description: String,     // Check description
    pub status: u8,              // Check status (0-3)
    pub error_message: String,   // Error message if failed
    pub timestamp: u64,          // Execution timestamp
    pub duration_ms: u64,        // Execution duration
}
```

### ComplianceCheckSuite

Suite of compliance checks:

```rust
pub struct ComplianceCheckSuite {
    pub suite_id: String,           // Suite identifier
    pub suite_name: String,         // Suite name
    pub total_checks: u32,          // Total checks executed
    pub passed_count: u32,          // Checks passed
    pub failed_count: u32,          // Checks failed
    pub skipped_count: u32,         // Checks skipped
    pub error_count: u32,           // Checks with errors
    pub checks: Vec<ComplianceCheck>, // Individual checks
    pub timestamp: u64,             // Suite execution timestamp
    pub total_duration_ms: u64,     // Total suite duration
    pub pass_rate: u32,             // Pass rate (0-100)
}
```

## API Functions

### check_access_control

Verifies caller is authorized:

```rust
pub fn check_access_control(
    env: &Env,
    caller: &soroban_sdk::Address,
    authorized_address: &soroban_sdk::Address,
) -> ComplianceCheck
```

**Example:**

```rust
let check = check_access_control(&env, &caller, &admin_address);
assert_eq!(check.status, CheckStatus::Passed as u8);
```

### check_state_invariant

Validates state invariant condition:

```rust
pub fn check_state_invariant(
    env: &Env,
    condition: bool,
    check_name: &str,
    error_msg: &str,
) -> ComplianceCheck
```

**Example:**

```rust
let check = check_state_invariant(
    &env,
    total_raised <= goal,
    "goal_not_exceeded",
    "Total raised exceeds goal"
);
```

### check_input_validation

Validates input is within range:

```rust
pub fn check_input_validation(
    env: &Env,
    value: i128,
    min: i128,
    max: i128,
    check_name: &str,
) -> ComplianceCheck
```

**Example:**

```rust
let check = check_input_validation(&env, amount, 1, 1_000_000, "amount_range");
```

### check_reentrancy_guard

Verifies reentrancy protection is active:

```rust
pub fn check_reentrancy_guard(
    env: &Env,
    guard_active: bool,
) -> ComplianceCheck
```

**Example:**

```rust
let check = check_reentrancy_guard(&env, is_protected);
```

### check_timestamp_validity

Validates timestamp is not in future:

```rust
pub fn check_timestamp_validity(
    env: &Env,
    timestamp: u64,
    current_time: u64,
) -> ComplianceCheck
```

**Example:**

```rust
let check = check_timestamp_validity(&env, deadline, env.ledger().timestamp());
```

### check_balance

Verifies sufficient balance:

```rust
pub fn check_balance(
    env: &Env,
    balance: i128,
    required: i128,
) -> ComplianceCheck
```

**Example:**

```rust
let check = check_balance(&env, user_balance, required_amount);
```

### build_check_suite

Creates a compliance check suite:

```rust
pub fn build_check_suite(
    env: &Env,
    suite_id: String,
    suite_name: String,
    checks: Vec<ComplianceCheck>,
) -> ComplianceCheckSuite
```

**Example:**

```rust
let mut checks = vec![&env];
checks.push_back(check_access_control(&env, &caller, &admin));
checks.push_back(check_balance(&env, balance, required));

let suite = build_check_suite(
    &env,
    String::from_slice(&env, "suite-1"),
    String::from_slice(&env, "Access Control Suite"),
    checks,
);
```

### add_check_to_suite

Adds check to existing suite:

```rust
pub fn add_check_to_suite(
    mut suite: ComplianceCheckSuite,
    check: ComplianceCheck,
) -> ComplianceCheckSuite
```

**Example:**

```rust
let new_check = check_reentrancy_guard(&env, true);
suite = add_check_to_suite(suite, new_check);
```

## Usage Examples

### Basic Check

```rust
use soroban_sdk::Env;
use crate::security_compliance_checks::*;

fn main() {
    let env = Env::default();
    let caller = soroban_sdk::Address::generate(&env);
    let admin = soroban_sdk::Address::generate(&env);

    // Perform access control check
    let check = check_access_control(&env, &caller, &admin);

    if check.status == CheckStatus::Passed as u8 {
        println!("Access control check passed");
    } else {
        println!("Access control check failed: {}", check.error_message);
    }
}
```

### Complete Check Suite

```rust
fn validate_transaction(env: &Env, caller: &Address, amount: i128) -> ComplianceCheckSuite {
    let admin = Address::generate(env);
    let mut checks = vec![env];

    // Access control check
    checks.push_back(check_access_control(env, caller, &admin));

    // Input validation check
    checks.push_back(check_input_validation(env, amount, 1, 1_000_000, "amount_range"));

    // Balance check
    let balance = 5000;
    checks.push_back(check_balance(env, balance, amount));

    // Reentrancy guard check
    checks.push_back(check_reentrancy_guard(env, true));

    // Build suite
    let suite = build_check_suite(
        env,
        String::from_slice(env, "transaction-validation"),
        String::from_slice(env, "Transaction Validation Suite"),
        checks,
    );

    suite
}
```

### Conditional Checks

```rust
fn validate_campaign(env: &Env, campaign_data: &CampaignData) -> ComplianceCheckSuite {
    let mut checks = vec![env];

    // Check goal is positive
    checks.push_back(check_state_invariant(
        env,
        campaign_data.goal > 0,
        "positive_goal",
        "Campaign goal must be positive",
    ));

    // Check deadline is in future
    checks.push_back(check_timestamp_validity(
        env,
        campaign_data.deadline,
        env.ledger().timestamp(),
    ));

    // Check minimum contribution is valid
    checks.push_back(check_input_validation(
        env,
        campaign_data.min_contribution,
        1,
        campaign_data.goal,
        "min_contribution_range",
    ));

    build_check_suite(
        env,
        String::from_slice(env, "campaign-validation"),
        String::from_slice(env, "Campaign Validation Suite"),
        checks,
    )
}
```

## Check Results

### Interpreting Results

```rust
let suite = build_check_suite(&env, id, name, checks);

// Check overall status
if suite.all_passed() {
    println!("All checks passed!");
} else if suite.has_failures() {
    println!("Some checks failed");
    for check in suite.checks.iter() {
        if check.status == CheckStatus::Failed as u8 {
            println!("Failed: {} - {}", check.name, check.error_message);
        }
    }
}

// Check pass rate
println!("Pass rate: {}%", suite.pass_rate);

// Check individual results
println!("Passed: {}", suite.passed_count);
println!("Failed: {}", suite.failed_count);
println!("Skipped: {}", suite.skipped_count);
println!("Errors: {}", suite.error_count);
```

## Validation

### Check Validation

```rust
pub fn validate(&self) -> bool {
    !self.check_id.is_empty()
        && !self.name.is_empty()
        && CheckStatus::is_valid(self.status)
        && self.timestamp > 0
}
```

### Suite Validation

```rust
pub fn validate(&self) -> bool {
    !self.suite_id.is_empty()
        && !self.suite_name.is_empty()
        && self.total_checks > 0
        && self.pass_rate <= 100
        && self.checks.iter().all(|c| c.validate())
}
```

## Pass Rate Calculation

Pass rate is calculated as:

```
pass_rate = (passed_count * 100) / total_checks
```

**Examples:**

- 0 checks → 100%
- 1/1 passed → 100%
- 1/2 passed → 50%
- 3/4 passed → 75%

## Error Handling

### Failed Checks

Failed checks include error messages:

```rust
let check = check_input_validation(&env, 150, 0, 100, "range_check");
if check.status == CheckStatus::Failed as u8 {
    println!("Error: {}", check.error_message);
    // Output: "Error: Value 150 outside range [0, 100]"
}
```

### Check Duration

Track check execution time:

```rust
let check = ComplianceCheck::new(...)
    .with_duration(42); // 42 milliseconds

println!("Check took {}ms", check.duration_ms);
```

## Testing

The module includes comprehensive tests:

```bash
cargo test security_compliance_checks
```

Test coverage includes:

- Check status validation
- Check creation and validation
- Suite creation and validation
- Pass rate calculation
- All check implementations
- Suite aggregation
- Mixed result handling

## Security Considerations

### Deterministic Checks

All checks are deterministic and repeatable:

```rust
// Same inputs always produce same results
let check1 = check_access_control(&env, &caller, &admin);
let check2 = check_access_control(&env, &caller, &admin);
assert_eq!(check1.status, check2.status);
```

### Immutable Results

Check results are immutable after creation:

```rust
let check = ComplianceCheck::new(...);
// check cannot be modified after creation
```

### Access Control

Checks validate access control:

```rust
let check = check_access_control(&env, &caller, &authorized);
// Fails if caller != authorized
```

## Performance

- **Check Execution**: O(1) for most checks
- **Suite Creation**: O(n) where n = number of checks
- **Pass Rate Calculation**: O(1)
- **Suite Validation**: O(n)

## Compliance Standards

Supports compliance with:

- OWASP Top 10
- CWE (Common Weakness Enumeration)
- SOC 2 Type II
- ISO 27001

## Integration

### With Security Compliance Reporting

```rust
use crate::security_compliance_reporting::*;

let suite = build_check_suite(&env, id, name, checks);

// Convert check results to vulnerabilities
for check in suite.checks.iter() {
    if check.status == CheckStatus::Failed as u8 {
        let vuln = Vulnerability::new(
            check.check_id.clone(),
            check.name.clone(),
            check.error_message.clone(),
            3, // High severity
            String::from_slice(&env, "compliance"),
            String::from_slice(&env, "Review and fix"),
        );
    }
}
```

## Future Enhancements

- [ ] Custom check registration
- [ ] Check dependencies
- [ ] Parallel check execution
- [ ] Check result caching
- [ ] Performance benchmarking
- [ ] Check result export

## Related Modules

- `security_compliance_reporting` - Vulnerability reporting
- `security_compliance_automation` - Automated compliance
- `security_analytics` - Analytics and insights
- `security_monitoring` - Real-time monitoring

## License

MIT
