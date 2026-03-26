//! Tests for the StellarTokenMinter contract.
//!
//! @title   StellarTokenMinter Tests
//! @notice  Validates initialization, minting, authorization, and total count.

#[cfg(test)]
mod tests {
    use crate::stellar_token_minter::StellarTokenMinter;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let minter = Address::generate(&env);
        let contract_id = env.register(StellarTokenMinter, ());
        (env, contract_id, admin, minter)
    }

    #[test]
    fn test_initialization() {
        let (env, contract_id, admin, minter) = setup();
        let client = crate::stellar_token_minter::StellarTokenMinterClient::new(&env, &contract_id);
        client.initialize(&admin, &minter);
        assert_eq!(client.total_minted(), 0);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialization() {
        let (env, contract_id, admin, minter) = setup();
        let client = crate::stellar_token_minter::StellarTokenMinterClient::new(&env, &contract_id);
        client.initialize(&admin, &minter);
        client.initialize(&admin, &minter);
    }

    #[test]
    fn test_mint_success() {
        let (env, contract_id, admin, minter) = setup();
        let client = crate::stellar_token_minter::StellarTokenMinterClient::new(&env, &contract_id);
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        client.mint(&recipient, &1u64);

        assert_eq!(client.owner(&1u64), Some(recipient));
        assert_eq!(client.total_minted(), 1);
    }

    #[test]
    #[should_panic(expected = "token already minted")]
    fn test_mint_duplicate_token_id() {
        let (env, contract_id, admin, minter) = setup();
        let client = crate::stellar_token_minter::StellarTokenMinterClient::new(&env, &contract_id);
        client.initialize(&admin, &minter);

        let recipient = Address::generate(&env);
        client.mint(&recipient, &1u64);
        client.mint(&recipient, &1u64);
    }

    #[test]
    fn test_set_minter_success() {
        let (env, contract_id, admin, minter) = setup();
        let client = crate::stellar_token_minter::StellarTokenMinterClient::new(&env, &contract_id);
        client.initialize(&admin, &minter);

        let new_minter = Address::generate(&env);
        client.set_minter(&admin, &new_minter);

        let recipient = Address::generate(&env);
        client.mint(&recipient, &1u64);
        assert_eq!(client.total_minted(), 1);
    }
}
