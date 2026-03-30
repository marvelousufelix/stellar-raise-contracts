use soroban_sdk::{contract, contractimpl, contractclient, contracttype, Address, BytesN, Env, Symbol, Vec};
use soroban_sdk::symbol_short;

use crate::CrowdfundContract;
use crate::{DataKey, Status, PlatformConfig, ContractError};

/// Proxy storage keys
#[derive(Clone)]
#[contracttype]
pub enum ProxyDataKey {
    ImplHash,
    Admin,
}

/// Crowdfund Proxy Contract - UUPS pattern for Soroban
#[contract]
pub struct CrowdfundProxy;

#[contractimpl]
impl CrowdfundProxy {
    pub fn initialize(env: Env, admin: Address, initial_impl_hash: BytesN<32>) {
        if env.storage().instance().has(&ProxyDataKey::Admin) {
            panic!("already initialized");
        }
        if !Self::validate_wasm_hash(&initial_impl_hash) {
            panic!("invalid initial impl hash");
        }
        admin.require_auth();
        env.storage().instance().set(&ProxyDataKey::Admin, &admin);
        env.storage().instance().set(&ProxyDataKey::ImplHash, &initial_impl_hash);
        env.events().publish(symbol_short!("initialized"), (admin, initial_impl_hash));
    }

    /// Admin-only upgrade to new impl hash
    pub fn upgrade(env: Env, new_impl_hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&ProxyDataKey::Admin).unwrap();
        admin.require_auth();
        if !Self::validate_wasm_hash(&new_impl_hash) {
            panic!("zero wasm hash");
        }
        env.storage().instance().set(&ProxyDataKey::ImplHash, &new_impl_hash);
        env.events().publish(symbol_short!("upgraded"), (admin, new_impl_hash));
    }

    pub fn get_impl_hash(env: Env) -> BytesN<32> {
        env.storage().instance().get(&ProxyDataKey::ImplHash).unwrap()
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&ProxyDataKey::Admin).unwrap()
    }

    fn get_impl_client(&self, env: &Env) -> CrowdfundContractClient<'static> {
        let impl_hash = Self::get_impl_hash(env.clone());
        let impl_id = env.deployer().get_contract_id(impl_hash).expect("impl wasm missing");
        CrowdfundContractClient::new(env, &impl_id)
    }

    // Delegate crowdfund methods to impl
    pub fn initialize(
        env: Env,
        admin: Address,
        creator: Address,
        token: Address,
        goal: i128,
        deadline: u64,
        min_contribution: i128,
        platform_config: Option<PlatformConfig>,
        bonus_goal: Option<i128>,
        bonus_goal_description: Option<String>,
        metadata_uri: Option<String>,
    ) {
        let impl_client = self.get_impl_client(&env);
        impl_client.initialize(
            admin,
            creator,
            token,
            goal,
            deadline,
            min_contribution,
            platform_config,
            bonus_goal,
            bonus_goal_description,
            metadata_uri,
        );
    }

    pub fn contribute(env: Env, contributor: Address, amount: i128) {
        let impl_client = self.get_impl_client(&env);
        impl_client.contribute(contributor, amount);
    }

    pub fn status(env: Env) -> Status {
        let impl_client = self.get_impl_client(&env);
        impl_client.status()
    }

    pub fn total_raised(env: Env) -> i128 {
        let impl_client = self.get_impl_client(&env);
        impl_client.total_raised()
    }

    pub fn goal(env: Env) -> i128 {
        let impl_client = self.get_impl_client(&env);
        impl_client.goal()
    }

    pub fn version(env: Env) -> u32 {
        let impl_client = self.get_impl_client(&env);
        impl_client.version()
    }

    // Add more delegations as needed
}

impl CrowdfundProxy {
    fn validate_wasm_hash(hash: &BytesN<32>) -> bool {
        let zero_hash = BytesN::from_array(&Env::default(), &[0u8; 32]);
        hash != &zero_hash
    }
}

