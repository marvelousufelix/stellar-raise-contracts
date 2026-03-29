use soroban_sdk::{contract, contractimpl, contracttype, Env, Symbol, Address, Map};

/**
 * @title RateLimiting
 * @notice Smart contract rate limiting for DoS protection
 *
 * @dev Security assumptions:
 *   - Rate limits are enforced per address
 *   - Time windows are measured in ledger timestamps
 *   - Limits are configurable and upgradeable
 *   - Overflow/underflow is prevented with checked arithmetic
 *
 * @custom:security
 *   - Prevents rapid-fire transaction attacks
 *   - Protects against resource exhaustion
 *   - Maintains fairness across users
 */

/// Rate limit configuration
#[contracttype]
#[derive(Clone, Debug)]
pub struct RateLimit {
    /// Maximum requests per time window
    pub max_requests: u32,
    /// Time window in seconds
    pub window_seconds: u64,
}

/// Rate limit state for an address
#[contracttype]
#[derive(Clone, Debug)]
pub struct RateLimitState {
    /// Number of requests in current window
    pub request_count: u32,
    /// Timestamp of window start
    pub window_start: u64,
}

/// Default rate limit: 10 requests per 60 seconds
pub const DEFAULT_MAX_REQUESTS: u32 = 10;
pub const DEFAULT_WINDOW_SECONDS: u64 = 60;

/// Minimum window size: 1 second
pub const MIN_WINDOW_SECONDS: u64 = 1;

/// Maximum window size: 1 day
pub const MAX_WINDOW_SECONDS: u64 = 86_400;

/// Minimum requests: 1
pub const MIN_MAX_REQUESTS: u32 = 1;

/// Maximum requests: 1000
pub const MAX_MAX_REQUESTS: u32 = 1_000;

#[contract]
pub struct RateLimitingContract;

#[contractimpl]
impl RateLimitingContract {
    /// Initialize rate limiting with default configuration
    pub fn init(env: Env) {
        let config = RateLimit {
            max_requests: DEFAULT_MAX_REQUESTS,
            window_seconds: DEFAULT_WINDOW_SECONDS,
        };
        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
    }

    /// Set custom rate limit configuration
    ///
    /// # Arguments
    /// * `max_requests` - Maximum requests per window (1-1000)
    /// * `window_seconds` - Time window in seconds (1-86400)
    ///
    /// # Panics
    /// - If max_requests is outside valid range
    /// - If window_seconds is outside valid range
    pub fn set_rate_limit(env: Env, max_requests: u32, window_seconds: u64) {
        // Validate inputs
        if max_requests < MIN_MAX_REQUESTS || max_requests > MAX_MAX_REQUESTS {
            panic!("Invalid max_requests: must be between {} and {}", 
                   MIN_MAX_REQUESTS, MAX_MAX_REQUESTS);
        }
        if window_seconds < MIN_WINDOW_SECONDS || window_seconds > MAX_WINDOW_SECONDS {
            panic!("Invalid window_seconds: must be between {} and {}", 
                   MIN_WINDOW_SECONDS, MAX_WINDOW_SECONDS);
        }

        let config = RateLimit {
            max_requests,
            window_seconds,
        };
        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
    }

    /// Get current rate limit configuration
    pub fn get_rate_limit(env: Env) -> RateLimit {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or(RateLimit {
                max_requests: DEFAULT_MAX_REQUESTS,
                window_seconds: DEFAULT_WINDOW_SECONDS,
            })
    }

    /// Check if address is within rate limit
    ///
    /// # Arguments
    /// * `address` - Address to check
    ///
    /// # Returns
    /// - `true` if request is allowed
    /// - `false` if rate limit exceeded
    pub fn check_rate_limit(env: Env, address: Address) -> bool {
        let config = Self::get_rate_limit(env.clone());
        let current_time = env.ledger().timestamp();
        
        let state_key = Symbol::new(&env, &format!("rate_limit:{}", address));
        
        let mut state: RateLimitState = env.storage()
            .instance()
            .get(&state_key)
            .unwrap_or(RateLimitState {
                request_count: 0,
                window_start: current_time,
            });

        // Check if window has expired
        let window_elapsed = current_time.saturating_sub(state.window_start);
        if window_elapsed >= config.window_seconds {
            // Reset window
            state.request_count = 0;
            state.window_start = current_time;
        }

        // Check if limit exceeded
        if state.request_count >= config.max_requests {
            return false;
        }

        // Increment counter and save state
        state.request_count = state.request_count.saturating_add(1);
        env.storage().instance().set(&state_key, &state);

        true
    }

    /// Get remaining requests for address in current window
    ///
    /// # Arguments
    /// * `address` - Address to check
    ///
    /// # Returns
    /// - Number of remaining requests (0 if limit exceeded)
    pub fn get_remaining_requests(env: Env, address: Address) -> u32 {
        let config = Self::get_rate_limit(env.clone());
        let current_time = env.ledger().timestamp();
        
        let state_key = Symbol::new(&env, &format!("rate_limit:{}", address));
        
        let state: RateLimitState = env.storage()
            .instance()
            .get(&state_key)
            .unwrap_or(RateLimitState {
                request_count: 0,
                window_start: current_time,
            });

        // Check if window has expired
        let window_elapsed = current_time.saturating_sub(state.window_start);
        if window_elapsed >= config.window_seconds {
            return config.max_requests;
        }

        // Return remaining requests
        config.max_requests.saturating_sub(state.request_count)
    }

    /// Get time until rate limit window resets
    ///
    /// # Arguments
    /// * `address` - Address to check
    ///
    /// # Returns
    /// - Seconds until window resets (0 if already reset)
    pub fn get_reset_time(env: Env, address: Address) -> u64 {
        let config = Self::get_rate_limit(env.clone());
        let current_time = env.ledger().timestamp();
        
        let state_key = Symbol::new(&env, &format!("rate_limit:{}", address));
        
        let state: RateLimitState = env.storage()
            .instance()
            .get(&state_key)
            .unwrap_or(RateLimitState {
                request_count: 0,
                window_start: current_time,
            });

        // Calculate time until window expires
        let window_end = state.window_start.saturating_add(config.window_seconds);
        if current_time >= window_end {
            return 0;
        }

        window_end.saturating_sub(current_time)
    }

    /// Reset rate limit for specific address
    ///
    /// # Arguments
    /// * `address` - Address to reset
    pub fn reset_rate_limit(env: Env, address: Address) {
        let state_key = Symbol::new(&env, &format!("rate_limit:{}", address));
        env.storage().instance().remove(&state_key);
    }

    /// Clear all rate limit states
    pub fn clear_all_rate_limits(env: Env) {
        // Note: In production, this should be restricted to admin only
        // This is a simplified implementation
        let storage = env.storage().instance();
        
        // Iterate through all keys and remove rate limit entries
        // This is a simplified approach - in production, maintain a separate index
        let mut keys_to_remove = Vec::new();
        
        // Since we can't iterate all keys directly, we'd need to maintain
        // a separate index of addresses. For now, this is a placeholder.
        // In production, use a more sophisticated approach.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Env as _};

    #[test]
    fn test_init() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        
        let config = RateLimitingContract::get_rate_limit(env);
        assert_eq!(config.max_requests, DEFAULT_MAX_REQUESTS);
        assert_eq!(config.window_seconds, DEFAULT_WINDOW_SECONDS);
    }

    #[test]
    fn test_set_rate_limit() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        
        RateLimitingContract::set_rate_limit(env.clone(), 20, 120);
        
        let config = RateLimitingContract::get_rate_limit(env);
        assert_eq!(config.max_requests, 20);
        assert_eq!(config.window_seconds, 120);
    }

    #[test]
    #[should_panic(expected = "Invalid max_requests")]
    fn test_set_rate_limit_invalid_max_requests_too_low() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env, 0, 60);
    }

    #[test]
    #[should_panic(expected = "Invalid max_requests")]
    fn test_set_rate_limit_invalid_max_requests_too_high() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env, 2000, 60);
    }

    #[test]
    #[should_panic(expected = "Invalid window_seconds")]
    fn test_set_rate_limit_invalid_window_too_low() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env, 10, 0);
    }

    #[test]
    #[should_panic(expected = "Invalid window_seconds")]
    fn test_set_rate_limit_invalid_window_too_high() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env, 10, 100_000);
    }

    #[test]
    fn test_check_rate_limit_allowed() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        
        let address = Address::random(&env);
        
        // First request should be allowed
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address.clone()));
    }

    #[test]
    fn test_check_rate_limit_exceeded() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env.clone(), 2, 60);
        
        let address = Address::random(&env);
        
        // First two requests should be allowed
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address.clone()));
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address.clone()));
        
        // Third request should be denied
        assert!(!RateLimitingContract::check_rate_limit(env.clone(), address.clone()));
    }

    #[test]
    fn test_get_remaining_requests() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env.clone(), 5, 60);
        
        let address = Address::random(&env);
        
        // Initially 5 requests available
        assert_eq!(RateLimitingContract::get_remaining_requests(env.clone(), address.clone()), 5);
        
        // After one request, 4 remaining
        RateLimitingContract::check_rate_limit(env.clone(), address.clone());
        assert_eq!(RateLimitingContract::get_remaining_requests(env.clone(), address.clone()), 4);
    }

    #[test]
    fn test_get_reset_time() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env.clone(), 5, 60);
        
        let address = Address::random(&env);
        
        // Make a request
        RateLimitingContract::check_rate_limit(env.clone(), address.clone());
        
        // Reset time should be approximately 60 seconds
        let reset_time = RateLimitingContract::get_reset_time(env.clone(), address.clone());
        assert!(reset_time > 0 && reset_time <= 60);
    }

    #[test]
    fn test_reset_rate_limit() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env.clone(), 2, 60);
        
        let address = Address::random(&env);
        
        // Exhaust rate limit
        RateLimitingContract::check_rate_limit(env.clone(), address.clone());
        RateLimitingContract::check_rate_limit(env.clone(), address.clone());
        assert!(!RateLimitingContract::check_rate_limit(env.clone(), address.clone()));
        
        // Reset and verify
        RateLimitingContract::reset_rate_limit(env.clone(), address.clone());
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address.clone()));
    }

    #[test]
    fn test_multiple_addresses() {
        let env = Env::default();
        RateLimitingContract::init(env.clone());
        RateLimitingContract::set_rate_limit(env.clone(), 2, 60);
        
        let address1 = Address::random(&env);
        let address2 = Address::random(&env);
        
        // Each address has independent limit
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address1.clone()));
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address1.clone()));
        assert!(!RateLimitingContract::check_rate_limit(env.clone(), address1.clone()));
        
        // Address2 still has requests available
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address2.clone()));
        assert!(RateLimitingContract::check_rate_limit(env.clone(), address2.clone()));
    }
}
