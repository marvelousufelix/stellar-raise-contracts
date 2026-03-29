//! Tests for `withdraw_event_emission`.
//!
//! @notice  Covers all emit helpers, the NFT batch minting cap, event payload
//!          shapes, fee deduction correctness, and security panic paths.
//!          Minimum 95% branch coverage.
//!
//! @dev     Uses typed `EventPayload` return values where possible so tests
//!          assert on return values rather than scanning `env.events()`.

#[cfg(test)]
mod tests {
    extern crate std;

    use soroban_sdk::{
        contract, contractimpl, contracttype,
        testutils::{Address as _, Ledger},
        token, Address, Env, TryFromVal,
    };

    use crate::{
        withdraw_event_emission::{
            emit_fee_transferred, emit_nft_batch_minted, emit_withdrawn,
            FeeTransferredPayload, WithdrawnPayload,
        },
        CrowdfundContract, CrowdfundContractClient, PlatformConfig, MAX_NFT_MINT_BATCH,
    };

    // ── Mock NFT contract ─────────────────────────────────────────────────────

    #[derive(Clone)]
    #[contracttype]
    enum MockNftKey {
        Count,
    }

    #[contract]
    struct MockNft;

    #[contractimpl]
    impl MockNft {
        pub fn mint(env: Env, _to: Address) {
            let n: u32 = env
                .storage()
                .instance()
                .get(&MockNftKey::Count)
                .unwrap_or(0);
            env.storage().instance().set(&MockNftKey::Count, &(n + 1));
        }
        pub fn count(env: Env) -> u32 {
            env.storage()
                .instance()
                .get(&MockNftKey::Count)
                .unwrap_or(0)
        }
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    fn setup_with_nft(
        contributor_count: u32,
    ) -> (Env, CrowdfundContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CrowdfundContract, ());
        let client = CrowdfundContractClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();
        let sac = token::StellarAssetClient::new(&env, &token_addr);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 3_600;
        let goal = contributor_count as i128 * 100;
        let nft_id = env.register(MockNft, ());

        client.initialize(
            &creator, &creator, &token_addr, &goal, &deadline,
            &1, &None, &None, &None, &None,
        );
        client.set_nft_contract(&creator, &nft_id);

        for _ in 0..contributor_count {
            let c = Address::generate(&env);
            sac.mint(&c, &100);
            client.contribute(&c, &100);
        }

        env.ledger().set_timestamp(deadline + 1);
        client.finalize();

        (env, client, creator, nft_id)
    }

    fn setup_no_nft(
        contribution: i128,
    ) -> (Env, CrowdfundContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CrowdfundContract, ());
        let client = CrowdfundContractClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();
        let sac = token::StellarAssetClient::new(&env, &token_addr);

        let creator = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 3_600;

        client.initialize(
            &creator, &creator, &token_addr, &contribution, &deadline,
            &1, &None, &None, &None, &None,
        );

        let c = Address::generate(&env);
        sac.mint(&c, &contribution);
        client.contribute(&c, &contribution);

        env.ledger().set_timestamp(deadline + 1);
        client.finalize();

        (env, client, creator, token_addr)
    }

    fn setup_with_fee(
        goal: i128,
        fee_bps: u32,
    ) -> (Env, CrowdfundContractClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(CrowdfundContract, ());
        let client = CrowdfundContractClient::new(&env, &contract_id);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
        let token_addr = token_id.address();
        let sac = token::StellarAssetClient::new(&env, &token_addr);

        let creator = Address::generate(&env);
        let platform = Address::generate(&env);
        let deadline = env.ledger().timestamp() + 3_600;

        client.initialize(
            &creator, &creator, &token_addr, &goal, &deadline,
            &1, &None,
            &Some(PlatformConfig { address: platform.clone(), fee_bps }),
            &None, &None,
        );

        let c = Address::generate(&env);
        sac.mint(&c, &goal);
        client.contribute(&c, &goal);

        env.ledger().set_timestamp(deadline + 1);
        client.finalize();

        (env, client, creator, platform)
    }

    fn count_events(env: &Env, t1: &str, t2: &str) -> usize {
        env.events().all().iter().filter(|(_, topics, _)| {
            topics.len() >= 2
                && topics.get(0).map(|v| v == soroban_sdk::Symbol::new(env, t1).into()).unwrap_or(false)
                && topics.get(1).map(|v| v == soroban_sdk::Symbol::new(env, t2).into()).unwrap_or(false)
        }).count()
    }

    fn event_data(env: &Env, t1: &str, t2: &str) -> Option<soroban_sdk::Val> {
        env.events().all().iter().find(|(_, topics, _)| {
            topics.len() >= 2
                && topics.get(0).map(|v| v == soroban_sdk::Symbol::new(env, t1).into()).unwrap_or(false)
                && topics.get(1).map(|v| v == soroban_sdk::Symbol::new(env, t2).into()).unwrap_or(false)
        }).map(|(_, _, data)| data)
    }

    // ── emit_fee_transferred: return value ────────────────────────────────────

    #[test]
    fn fee_transferred_returns_typed_payload() {
        let env = Env::default();
        let addr = Address::generate(&env);
        let payload = emit_fee_transferred(&env, &addr, 500, 250);
        assert_eq!(payload, FeeTransferredPayload { platform: addr, fee: 500, fee_bps: 250 });
    }

    #[test]
    fn fee_transferred_payload_fee_bps_matches() {
        let env = Env::default();
        let addr = Address::generate(&env);
        let payload = emit_fee_transferred(&env, &addr, 1_000, 100);
        assert_eq!(payload.fee_bps, 100);
    }

    #[test]
    fn fee_transferred_payload_fee_matches() {
        let env = Env::default();
        let addr = Address::generate(&env);
        let payload = emit_fee_transferred(&env, &addr, 9_999, 500);
        assert_eq!(payload.fee, 9_999);
    }

    // ── emit_fee_transferred: security panics ─────────────────────────────────

    #[test]
    #[should_panic(expected = "fee_transferred: fee must be positive")]
    fn fee_transferred_panics_on_zero() {
        let env = Env::default();
        emit_fee_transferred(&env, &Address::generate(&env), 0, 100);
    }

    #[test]
    #[should_panic(expected = "fee_transferred: fee must be positive")]
    fn fee_transferred_panics_on_negative() {
        let env = Env::default();
        emit_fee_transferred(&env, &Address::generate(&env), -1, 100);
    }

    // ── emit_nft_batch_minted: return value ───────────────────────────────────

    #[test]
    fn nft_batch_minted_returns_count() {
        let env = Env::default();
        let returned = emit_nft_batch_minted(&env, 7);
        assert_eq!(returned, 7);
    }

    #[test]
    fn nft_batch_minted_returns_one() {
        let env = Env::default();
        assert_eq!(emit_nft_batch_minted(&env, 1), 1);
    }

    // ── emit_nft_batch_minted: security panic ─────────────────────────────────

    #[test]
    #[should_panic(expected = "nft_batch_minted: minted_count must be positive")]
    fn nft_batch_minted_panics_on_zero() {
        let env = Env::default();
        emit_nft_batch_minted(&env, 0);
    }

    // ── emit_withdrawn: return value ──────────────────────────────────────────

    #[test]
    fn withdrawn_returns_typed_payload() {
        let env = Env::default();
        let addr = Address::generate(&env);
        let payload = emit_withdrawn(&env, &addr, 1_000, 5);
        assert_eq!(payload, WithdrawnPayload { creator: addr, creator_payout: 1_000, nft_minted_count: 5 });
    }

    #[test]
    fn withdrawn_allows_zero_nft_count() {
        let env = Env::default();
        let payload = emit_withdrawn(&env, &Address::generate(&env), 500, 0);
        assert_eq!(payload.nft_minted_count, 0);
    }

    // ── emit_withdrawn: security panics ──────────────────────────────────────

    #[test]
    #[should_panic(expected = "withdrawn: creator_payout must be positive")]
    fn withdrawn_panics_on_zero_payout() {
        let env = Env::default();
        emit_withdrawn(&env, &Address::generate(&env), 0, 0);
    }

    #[test]
    #[should_panic(expected = "withdrawn: creator_payout must be positive")]
    fn withdrawn_panics_on_negative_payout() {
        let env = Env::default();
        emit_withdrawn(&env, &Address::generate(&env), -100, 0);
    }

    // ── NFT minting cap ───────────────────────────────────────────────────────

    #[test]
    fn mints_all_when_below_cap() {
        let count = MAX_NFT_MINT_BATCH - 1;
        let (env, client, _creator, nft_id) = setup_with_nft(count);
        client.withdraw();
        assert_eq!(MockNftClient::new(&env, &nft_id).count(), count);
    }

    #[test]
    fn mints_exactly_at_cap() {
        let (env, client, _creator, nft_id) = setup_with_nft(MAX_NFT_MINT_BATCH);
        client.withdraw();
        assert_eq!(MockNftClient::new(&env, &nft_id).count(), MAX_NFT_MINT_BATCH);
    }

    #[test]
    fn caps_minting_above_max_batch() {
        let (env, client, _creator, nft_id) = setup_with_nft(MAX_NFT_MINT_BATCH + 5);
        client.withdraw();
        assert_eq!(MockNftClient::new(&env, &nft_id).count(), MAX_NFT_MINT_BATCH);
    }

    #[test]
    fn mints_single_contributor() {
        let (env, client, _creator, nft_id) = setup_with_nft(1);
        client.withdraw();
        assert_eq!(MockNftClient::new(&env, &nft_id).count(), 1);
    }

    // ── nft_batch_minted event ────────────────────────────────────────────────

    #[test]
    fn emits_single_batch_event() {
        let (env, client, _creator, _nft) = setup_with_nft(5);
        client.withdraw();
        assert_eq!(count_events(&env, "campaign", "nft_batch_minted"), 1);
    }

    #[test]
    fn no_batch_event_without_nft_contract() {
        let (env, client, _creator, _token) = setup_no_nft(1_000);
        client.withdraw();
        assert_eq!(count_events(&env, "campaign", "nft_batch_minted"), 0);
    }

    #[test]
    fn batch_event_data_equals_minted_count() {
        let count: u32 = 3;
        let (env, client, _creator, _nft) = setup_with_nft(count);
        client.withdraw();
        let data = event_data(&env, "campaign", "nft_batch_minted").expect("event missing");
        let minted: u32 = u32::try_from_val(&env, &data).unwrap();
        assert_eq!(minted, count);
    }

    #[test]
    fn batch_event_data_capped_at_max() {
        let (env, client, _creator, _nft) = setup_with_nft(MAX_NFT_MINT_BATCH + 5);
        client.withdraw();
        let data = event_data(&env, "campaign", "nft_batch_minted").expect("event missing");
        let minted: u32 = u32::try_from_val(&env, &data).unwrap();
        assert_eq!(minted, MAX_NFT_MINT_BATCH);
    }

    // ── withdrawn event ───────────────────────────────────────────────────────

    #[test]
    fn emits_withdrawn_event_once_with_nft() {
        let (env, client, _creator, _nft) = setup_with_nft(2);
        client.withdraw();
        assert_eq!(count_events(&env, "campaign", "withdrawn"), 1);
    }

    #[test]
    fn emits_withdrawn_event_once_without_nft() {
        let (env, client, _creator, _token) = setup_no_nft(1_000);
        client.withdraw();
        assert_eq!(count_events(&env, "campaign", "withdrawn"), 1);
    }

    #[test]
    fn withdrawn_event_nft_count_zero_without_nft_contract() {
        let (env, client, _creator, _token) = setup_no_nft(1_000);
        client.withdraw();
        let data = event_data(&env, "campaign", "withdrawn").unwrap();
        let tuple: (Address, i128, u32) = <(Address, i128, u32)>::try_from_val(&env, &data).unwrap();
        assert_eq!(tuple.2, 0u32);
    }

    #[test]
    fn withdrawn_event_payout_equals_total_no_fee() {
        let contribution: i128 = 5_000;
        let (env, client, creator, _token) = setup_no_nft(contribution);
        client.withdraw();
        let data = event_data(&env, "campaign", "withdrawn").unwrap();
        let tuple: (Address, i128, u32) = <(Address, i128, u32)>::try_from_val(&env, &data).unwrap();
        assert_eq!(tuple.0, creator);
        assert_eq!(tuple.1, contribution);
    }

    // ── fee_transferred event ─────────────────────────────────────────────────

    #[test]
    fn emits_fee_transferred_event_with_fee() {
        let (env, client, _creator, _platform) = setup_with_fee(1_000_000, 500);
        client.withdraw();
        assert_eq!(count_events(&env, "campaign", "fee_transferred"), 1);
    }

    #[test]
    fn no_fee_event_without_platform_config() {
        let (env, client, _creator, _token) = setup_no_nft(1_000);
        client.withdraw();
        assert_eq!(count_events(&env, "campaign", "fee_transferred"), 0);
    }

    #[test]
    fn fee_event_data_includes_fee_bps() {
        let goal: i128 = 1_000_000;
        let fee_bps: u32 = 300;
        let (env, client, _creator, _platform) = setup_with_fee(goal, fee_bps);
        client.withdraw();
        let data = event_data(&env, "campaign", "fee_transferred").unwrap();
        let tuple: (Address, i128, u32) = <(Address, i128, u32)>::try_from_val(&env, &data).unwrap();
        // fee = 1_000_000 * 300 / 10_000 = 30_000
        assert_eq!(tuple.1, 30_000);
        assert_eq!(tuple.2, fee_bps);
    }

    #[test]
    fn withdrawn_event_payout_reflects_fee_deduction() {
        let goal: i128 = 1_000_000;
        let fee_bps: u32 = 500; // 5%
        let (env, client, _creator, _platform) = setup_with_fee(goal, fee_bps);
        client.withdraw();
        let data = event_data(&env, "campaign", "withdrawn").unwrap();
        let tuple: (Address, i128, u32) = <(Address, i128, u32)>::try_from_val(&env, &data).unwrap();
        // 5% of 1_000_000 = 50_000 fee; creator payout = 950_000
        assert_eq!(tuple.1, 950_000);
    }

    #[test]
    fn fee_amount_matches_bps_calculation() {
        let goal: i128 = 500_000;
        let fee_bps: u32 = 100; // 1%
        let (env, client, _creator, _platform) = setup_with_fee(goal, fee_bps);
        client.withdraw();
        let data = event_data(&env, "campaign", "fee_transferred").unwrap();
        let tuple: (Address, i128, u32) = <(Address, i128, u32)>::try_from_val(&env, &data).unwrap();
        // fee = 500_000 * 100 / 10_000 = 5_000
        assert_eq!(tuple.1, 5_000);
    }

    // ── Double-withdraw guard ─────────────────────────────────────────────────

    #[test]
    #[should_panic]
    fn double_withdraw_panics() {
        let (_, client, _creator, _token) = setup_no_nft(1_000);
        client.withdraw();
        client.withdraw();
    }
}
