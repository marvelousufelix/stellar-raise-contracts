# Access Control Security Hardening

## Overview

Issue: #948

This update hardens access-control role transfer by introducing a two-step admin handoff flow.

Files:
- contracts/crowdfund/src/access_control.rs
- contracts/crowdfund/src/access_control.test.rs

## What Changed

- Added propose_default_admin_transfer.
- Added accept_default_admin_role.
- Added cancel_default_admin_transfer.
- Added get_pending_default_admin view helper.

## Why It Improves Security

- Prevents accidental one-transaction role handoff mistakes.
- Requires explicit acceptance by the designated pending admin.
- Enables cancellation by current admin if destination key is compromised.
- Emits explicit lifecycle events for monitoring and audit trails.

## Security Assumptions

- Current admin key remains uncompromised.
- Pending admin has control of the receiving key to accept transfer.
- Off-chain monitoring consumes admin transfer events.

## Test Coverage

- happy path propose -> accept
- unauthorized propose rejection
- unauthorized accept rejection
- cancel flow success
- unauthorized cancel rejection

Run with:

cargo test -p crowdfund access_control

## Reviewer Notes

Changes are additive and backward-compatible for existing pause and governance fee controls.
