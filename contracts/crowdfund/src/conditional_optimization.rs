//! Conditional execution optimization helpers for the Stellar Raise crowdfund contract.
//!
//! @title   ConditionalOptimization — Gas-efficient branching and early validation.
//! @notice  Provides branchless conditionals, role guards, safe arithmetic, and
//!          composable campaign eligibility checks to minimize CPU cycles and 
//!          rejected transactions.
//! @dev     All helpers are `const`-friendly where possible, inlineable, and 
//!          follow the existing optimization module pattern (pure/storage-thin).

use soroban_sdk::{Env, Address};

use crate::{Status, DataKey};

const BPS_SCALE: i128
