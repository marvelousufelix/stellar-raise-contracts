# Security Regression Module

## Overview

Issue: #950

This change adds an automated security regression helper module to detect and prevent vulnerability regressions during ongoing development.

Files:

- contracts/crowdfund/src/security_regression.rs
- contracts/crowdfund/src/security_regression.test.rs

## Why This Improves Security

- Standardizes scoring for high-risk regression categories.
- Enables repeatable and auditable case evaluations.
- Captures latest result per case id with event emissions for monitoring.
- Supports bounded batch execution for efficient CI checks.

## Security Model

- Runner authentication is required for state-mutating operations.
- Batch size is capped by MAX_CASES_PER_RUN.
- Arithmetic is overflow-safe and deterministic.
- Module writes only security telemetry and summaries, not privileged runtime config.

## Test Coverage

- pass/fail scoring boundaries
- persistent result storage and retrieval
- batch summary consistency
- empty batch rejection
- oversized batch rejection

Run with:

cargo test -p crowdfund security_regression

## Reviewer Notes

The implementation is additive and isolated. It can be integrated with CI pipelines or off-chain dashboards without changing core contribution flows.
