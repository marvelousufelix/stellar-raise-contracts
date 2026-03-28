//! Tests for CrowdfundProxy - UUPS delegation + admin upgrade.

use super::*;
use soroban_sdk::testutils::{Address as _, MockAuth};
use soroban_sdk::{BytesN, Env};

#[test]
fn test_proxy_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let proxy_id = env.register(CrowdfundProxy, ());

    let admin = Address::generate(&amp;env);
    let impl_hash = nonzero_hash(&amp;env);
    let client = CrowdfundProxyClient::new(&amp;env, &amp;proxy_id);

    client.initialize(&amp;admin, &amp;impl_hash);
    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_impl_hash(), impl_hash);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_proxy_double_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let proxy_id = env.register(CrowdfundProxy, ());
    let client = CrowdfundProxyClient::new(&amp;env, &amp;proxy_id);

    let admin = Address::generate(&amp;env);
    let impl_hash = nonzero_hash(&amp;env);
    client.initialize(&amp;admin, &amp;impl_hash);
    client.initialize(&amp;admin, &amp;impl_hash); // panic
}

#[test]
#[should_panic(expected = "zero initial impl hash")]
fn test_proxy_zero_impl_hash() {
    let env = Env::default();
    env.mock_all_auths();
    let proxy_id = env.register(CrowdfundProxy, ());
    let client = CrowdfundProxyClient::new(&amp;env, &amp;proxy_id);

    let admin = Address::generate(&amp;env);
    let zero_hash = zero_hash(&amp;env);
    client.initialize(&amp;admin, &amp;zero_hash);
}

#[test]
fn test_proxy_upgrade_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let proxy_id = env.register(CrowdfundProxy, ());
    let client = CrowdfundProxyClient::new(&amp;env, &amp;proxy_id);

    let admin = Address::generate(&amp;env);
    let initial_hash = nonzero_hash(&amp;env);
    let new_hash = BytesN::from_array(&amp;env, &amp;[2u8; 32]);
    client.initialize(&amp;admin, &amp;initial_hash);

    // Non-admin fails
    let non_admin = Address::generate(&amp;env);
    env.set_auths(&amp;[]);
    let result = client.try_upgrade(&amp;new_hash);
    assert!(result.is_err());

    // Admin succeeds
    env.mock_auths(); 
    client.upgrade(&amp;new_hash);
    assert_eq!(client.get_impl_hash(), new_hash);
}

#[test]
#[should_panic(expected = "zero wasm hash")]
fn test_proxy_upgrade_zero_hash() {
    let env = Env::default();
    env.mock_all_auths();
    let proxy_id = env.register(CrowdfundProxy, ());
    let client = CrowdfundProxyClient::new(&amp;env, &amp;proxy_id);

    let admin = Address::generate(&amp;env);
    let initial_hash = nonzero_hash(&amp;env);
    client.initialize(&amp;admin, &amp;initial_hash);
    let zero_hash = zero_hash(&amp;env);
    client.upgrade(&amp;zero_hash);
}

fn zero_hash(env: &amp;Env) -> BytesN<32> {
    BytesN::from_array(env, &amp;[0u8; 32])
}

fn nonzero_hash(env: &amp;Env) -> BytesN<32> {
    BytesN::from_array(env, &amp;[1u8; 32])
}

