# Plasma Chain Module

## Overview

Issue: #951

This change introduces a lightweight plasma-style helper module focused on gas efficiency and scalability for checkpointing and exits.

File:

- contracts/crowdfund/src/plasma_chain.rs
- contracts/crowdfund/src/plasma_chain.test.rs

## Design Goals

- Keep storage compact and predictable.
- Keep per-operation costs bounded.
- Minimize trust assumptions while retaining practical usability.
- Make security-critical paths easy to audit.

## Gas and Scalability Improvements

- Checkpoint batches are capped with MAX_TXS_PER_CHECKPOINT to avoid unbounded resource usage.
- Constant-time checkpoint retrieval by block number.
- One pending exit per claimant to bound storage growth.
- No unbounded loops in write paths.

## Security Notes

- Operators must authenticate before posting checkpoints.
- Checkpoint block numbers must strictly increase.
- Exit flow includes a mandatory delay (EXIT_DELAY_SECS).
- Challenged exits are blocked from finalization.
- Exit request validation enforces positive amount, minimum bond, and tx index bounds.

## Test Coverage

The test suite validates:

- checkpoint monotonicity and batch size boundaries
- checkpoint root verification
- duplicate and malformed exit requests
- challenge path behavior
- finalize timing boundary and state cleanup

Run with:

cargo test -p crowdfund plasma_chain

## Reviewer Notes

The module is intentionally isolated and additive. It does not change existing contribution or withdrawal flows, making review straightforward and reducing regression risk.
