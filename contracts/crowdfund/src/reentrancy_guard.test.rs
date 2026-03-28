#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Env, Address};

    #[test]
    fn test_enter_twice_panics() {
        let env = Env::default();
        reentrancy_guard::enter_transfer(&env);
        // Second enter should panic
        let result = std::panic::catch_unwind(|| reentrancy_guard::enter_transfer(&env));
        assert!(result.is_err());
    }

    #[test]
    fn test_protected_transfer_single() {
        let env = Env::default();
        let mut called = false;
        let transfer_fn = || {
            called = true;
        };
        reentrancy_guard::protected_transfer(&env, transfer_fn);
        assert!(called);
    }

    #[test]
    fn test_reentrant_withdraw_panics() {
        let env = Env::default();
        let mut inner_called = false;
        let outer_fn = || {
            // Simulate withdraw transfers
            let inner_fn = || {
                inner_called = true;
                // This would be a reentrant call to withdraw from malicious token callback
                reentrancy_guard::enter_transfer(&env); // Should panic!
                panic!("should not reach");
            };
            reentrancy_guard::protected_transfer(&env, inner_fn);
        };
        let result = std::panic::catch_unwind(|| reentrancy_guard::protected_transfer(&env, outer_fn));
        // Reentrancy attempt should panic
        assert!(result.is_err());
        // Inner not called due to panic
        assert!(!inner_called);
    }

    #[test]
    fn test_protected_withdraw_single_succeeds() {
        let env = Env::default();
        let mut platform_fee_emitted = false;
        let mut creator_paid = false;
        let mut nfts_minted = 0;
        let mut withdraw_emitted = false;

        let withdraw_fn = || {
            // Simulate platform fee emit
            platform_fee_emitted = true;
            // Simulate creator transfer
            creator_paid = true;
            // Simulate NFT mint batch (mock)
            nfts_minted = 5;
            // Simulate withdraw event
            withdraw_emitted = true;
        };

        reentrancy_guard::protected_transfer(&env, withdraw_fn);

        assert!(platform_fee_emitted);
        assert!(creator_paid);
        assert_eq!(nfts_minted, 5);
        assert!(withdraw_emitted);
    }

    #[test]
    fn test_protected_refund_single_succeeds() {
        let env = Env::default();
        let mut refund_executed = false;

        let refund_fn = || {
            refund_executed = true; // Simulate execute_refund_single
        };

        reentrancy_guard::protected_transfer(&env, refund_fn);
        assert!(refund_executed);
    }
}

