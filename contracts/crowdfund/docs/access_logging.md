# Smart Contract Access Logging

## Overview

This module provides comprehensive access logging capabilities for security auditing and compliance tracking in smart contract operations. It enables detailed monitoring of all contract interactions for security analysis and regulatory compliance.

## Features

### 1. Comprehensive Access Tracking
- Function call logging
- Storage access monitoring (reads and writes)
- Token transfer tracking
- Admin operation auditing

### 2. Event-Based Logging
- Real-time event emission for all access operations
- Efficient on-chain logging without excessive storage
- Queryable event history for auditing

### 3. Anomaly Detection
- Pattern analysis for suspicious activity
- Frequency-based anomaly detection
- Behavioral analysis capabilities

### 4. Audit Reporting
- Generate comprehensive audit reports
- Time-range based queries
- Address-specific access history

## Access Types

### FunctionCall
Logs all function invocations including:
- Function name
- Caller address
- Success/failure status
- Timestamp

### StorageRead
Tracks storage read operations:
- Storage key accessed
- Caller address
- Access timestamp

### StorageWrite
Monitors storage write operations:
- Storage key modified
- Caller address
- Write timestamp

### TokenTransfer
Records token transfer operations:
- Sender and recipient addresses
- Transfer amount
- Transfer timestamp

### AdminOperation
Audits administrative operations:
- Operation type
- Admin address
- Success status
- Error details (if failed)

## Key Functions

### `log_function_call`
Logs a function call access event.

**Parameters:**
- `env`: Contract environment
- `caller`: Address of the caller
- `function_name`: Name of the function
- `success`: Whether the call succeeded

**Usage:**
```rust
log_function_call(&env, &caller, "contribute", true);
```

### `log_storage_access`
Logs storage read or write operations.

**Parameters:**
- `env`: Contract environment
- `caller`: Address performing the access
- `access_type`: StorageRead or StorageWrite
- `key_name`: Name of the storage key

**Usage:**
```rust
log_storage_access(&env, &caller, AccessType::StorageWrite, "TotalRaised");
```

### `log_token_transfer`
Logs token transfer operations.

**Parameters:**
- `env`: Contract environment
- `from`: Sender address
- `to`: Recipient address
- `amount`: Transfer amount

**Usage:**
```rust
log_token_transfer(&env, &contributor, &contract_address, 1000);
```

### `log_admin_operation`
Logs administrative operations with error tracking.

**Parameters:**
- `env`: Contract environment
- `admin`: Admin address
- `operation`: Operation name
- `success`: Success status
- `error`: Optional error message

**Usage:**
```rust
log_admin_operation(&env, &admin, "pause", true, None);
```

### `get_access_logs_for_address`
Retrieves access logs for a specific address.

**Parameters:**
- `env`: Contract environment
- `address`: Address to query
- `limit`: Maximum entries to return

**Returns:** Vector of access log entries

### `analyze_access_patterns`
Analyzes access patterns for anomaly detection.

**Parameters:**
- `env`: Contract environment
- `address`: Address to analyze

**Returns:** True if patterns are normal

### `generate_audit_report`
Generates a comprehensive audit report.

**Parameters:**
- `env`: Contract environment
- `start_time`: Start of audit period
- `end_time`: End of audit period

**Returns:** Formatted audit report

## Configuration

Configure logging behavior with `AccessLogConfig`:

```rust
let config = AccessLogConfig {
    enable_detailed_logging: true,
    max_log_entries: 1000,
    enable_log_rotation: true,
};
```

## Integration Example

```rust
use crate::access_logging::*;

pub fn contribute(env: Env, contributor: Address, amount: i128) -> Result<(), ContractError> {
    // Log the function call
    log_function_call(&env, &contributor, "contribute", true);
    
    // Log storage write
    log_storage_access(&env, &contributor, AccessType::StorageWrite, "Contribution");
    
    // Log token transfer
    log_token_transfer(&env, &contributor, &env.current_contract_address(), amount);
    
    // ... rest of function logic
}
```

## Security Benefits

1. **Audit Trail**: Complete history of all contract interactions
2. **Compliance**: Meets regulatory requirements for transaction logging
3. **Forensics**: Enables investigation of security incidents
4. **Monitoring**: Real-time detection of suspicious activity
5. **Accountability**: Clear attribution of all operations

## Performance Considerations

- Event-based logging minimizes storage costs
- Configurable log retention limits
- Automatic log rotation prevents unbounded growth
- Efficient event emission with minimal gas overhead

## Testing

Comprehensive test suite covers:
- All access type logging
- Success and failure scenarios
- Configuration options
- Multiple concurrent logs
- Error handling

Run tests with:
```bash
cargo test access_logging
```

## Compliance Standards

This module helps meet requirements for:
- SOC 2 Type II compliance
- GDPR audit trail requirements
- Financial services regulations
- Smart contract security standards

## Future Enhancements

- Off-chain log aggregation
- Advanced anomaly detection with ML
- Real-time alerting for suspicious patterns
- Integration with external SIEM systems
- Automated compliance reporting
