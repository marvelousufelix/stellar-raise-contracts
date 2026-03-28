# PR Description: feat: add-logging-bounds-to-withdraw-event-emission-for-security (closes #321)

## Summary
✅ **Already fully implemented**: Bounded withdraw() event emission improves security/readability.

## Changes
- `contracts/crowdfund/src/withdraw_event_emission.rs`: Validated emitters (`emit_fee_transferred/emit_nft_batch_minted/emit_withdrawn`), NFT cap `MAX_NFT_MINT_BATCH=50`.
- Integrated in `lib.rs::withdraw()` (O(1) events).
- `withdraw_event_emission_test.rs`: 25+ tests (caps, panics, fee/net payout).
- `withdraw_event_emission.md`: API/security/docs.

## Security
- Panics on <=0 amounts.
- Single summary events (no per-contributor DoS).

## PR Link
https://github.com/dev-fatima-24/stellar-raise-contracts/pull/new/feature/add-logging-bounds-to-withdraw-event-emission-for-security

**Ready for merge.**
