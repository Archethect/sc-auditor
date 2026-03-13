# Hard Negatives: Entitlement Drift

These patterns involve reward calculations, balance tracking, or share accounting that appear to use stale state but are actually safe. Use these to avoid flagging well-established DeFi patterns as vulnerabilities.

## Pattern: Lazy Reward Update (MasterChef-Style)

### Why It Looks Bad

User rewards appear "stale" between interactions. If a user deposited 30 days ago and has not interacted since, their `pendingReward` mapping still shows the value from 30 days ago. The reward accumulator `rewardPerShare` has been updated many times since then, but the user's personal record has not caught up. This looks like the user will lose rewards from the past 30 days.

### Why It's Safe

The update happens atomically at the beginning of every user interaction (deposit, withdraw, claim). When the user finally calls `claim()` or `withdraw()`, the first thing the function does is compute the delta between the current global `rewardPerShare` and the user's `lastRewardPerShare`, multiplied by the user's stake. This delta captures all accumulated rewards since the last interaction. There is no window for exploitation because the catch-up calculation and the state update happen in the same transaction, before any external calls or token transfers.

### Key Indicators

- The user's reward is recalculated as the first operation in every state-changing function (deposit, withdraw, claim, transfer)
- The pattern follows: (1) calculate pending, (2) update user checkpoint to current global accumulator, (3) transfer rewards, (4) adjust user stake
- `rewardPerShare` is a monotonically increasing accumulator (never decreases)
- No external calls or state changes happen between the reward calculation and the checkpoint update
- The reward debt or last-claimed value is updated in the same transaction as the reward calculation

## Pattern: Fee-on-Transfer Token Exclusion

### Why It Looks Bad

After a `transferFrom` call, the contract's actual balance increase is less than the `amount` parameter due to the token's transfer tax. If the protocol records the `amount` parameter as the deposit value (rather than measuring the actual balance change), the internal accounting drifts from reality. Over time, the protocol becomes insolvent as recorded balances exceed actual balances.

### Why It's Safe

The protocol explicitly documents that it does not support fee-on-transfer tokens. The token whitelist (either hardcoded or governance-managed) only includes standard ERC-20 tokens without transfer fees. Before a token is added to the whitelist, it is verified to not have fee-on-transfer mechanics. This is a deliberate scope limitation, not an oversight. Users who attempt to use unsupported tokens do so at their own risk, and the protocol's documentation and UI make this clear.

### Key Indicators

- Protocol documentation, NatSpec comments, or README explicitly states fee-on-transfer tokens are not supported
- A token whitelist exists that is checked before deposit/transfer operations
- The whitelist is managed by governance or admin with a verification process for new tokens
- No claim of "supporting all ERC-20 tokens" exists in the documentation
- Integration tests verify behavior with standard tokens only (not a gap but an intentional scope decision)

## Pattern: Epoch-Based Settlement with Clear Boundaries

### Why It Looks Bad

Rewards or entitlements are calculated based on a previous epoch's snapshot, not real-time state. A user who deposited in epoch N does not earn rewards until epoch N+1. This appears to be a drift between the user's actual deposit time and their reward entitlement.

### Why It's Safe

The epoch boundary is explicit, well-documented, and consistently applied to all users. No user can earn rewards for an epoch in which they were not fully staked at the snapshot time. The delay is intentional and prevents flash-deposit attacks where a user deposits just before rewards are distributed, claims the rewards, and immediately withdraws. The epoch system ensures minimum commitment periods.

### Key Indicators

- Epoch boundaries are defined by block numbers, timestamps, or explicit governance calls
- All users are subject to the same epoch delay (no special treatment)
- Documentation clearly explains the epoch system and settlement timing
- Deposits made during an epoch are recorded but do not participate in that epoch's reward calculation
- Withdrawals requested during an epoch are processed at the epoch boundary, not immediately
- No way to deposit and claim in the same epoch (prevents flash-deposit attacks)

## Pattern: Internal Accounting with Separate Balance Tracking

### Why It Looks Bad

The protocol tracks balances through internal mappings rather than reading `token.balanceOf(address(this))`. This means the internal balance can diverge from the actual token balance if tokens are sent directly to the contract (donations) or if rebasing tokens change balances. The divergence looks like an entitlement drift vulnerability.

### Why It's Safe

Internal accounting is the recommended approach precisely because it prevents donation-based attacks. By tracking deposits and withdrawals through internal state rather than balance snapshots, the protocol is immune to external manipulation of its token balance. Any tokens sent directly to the contract (outside the deposit flow) are simply unaccounted-for surplus that does not affect any user's entitlement. The protocol may include a sweep function to recover these surplus tokens, or they remain as an additional safety buffer.

### Key Indicators

- Deposits increment an internal `totalDeposited` counter; withdrawals decrement it
- Share-to-asset conversions use `totalDeposited` (or equivalent internal variable), not `token.balanceOf(address(this))`
- No code path sets internal balances from actual token balances (no `sync` function that reads `balanceOf`)
- A sweep or rescue function exists for tokens sent directly to the contract (surplus recovery)
- The invariant `internalBalance <= actualBalance` is maintained (internal balance never exceeds actual)
