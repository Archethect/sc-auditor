# Entitlement Drift

Entitlement drift occurs when a user's recorded entitlement (balance, reward share, withdrawal amount) diverges from the actual backing value due to non-atomic state updates. The protocol "thinks" a user is owed one amount, but the underlying assets tell a different story. Attackers exploit this gap to extract value that does not belong to them or to deny legitimate users their fair share.

## Detection Cues

- Balance reads before transfers (checking `balanceOf` before a transfer that changes it)
- Reward calculations using stale state (`rewardPerShare` read before the latest distribution is applied)
- Share-to-token ratio computed with cached values (using a stored ratio instead of recalculating from current reserves)
- Fee deductions that do not update related mappings (subtracting a fee from `amount` but not adjusting `userBalance`)
- Checkpoint-based accounting where the checkpoint update is not the first operation
- Functions that read entitlement, then perform external calls, then update entitlement
- Airdrop or distribution logic that uses a snapshot taken at a stale block
- Withdrawal calculations that do not account for pending fees or slashing

## Attack Narrative

The attack exploits the temporal gap between when entitlement is calculated and when the underlying state is updated:

1. **Identify the drift window**: The attacker reads the contract code and finds a function where entitlement is computed from state that will change later in the same transaction or in a closely-timed subsequent transaction. The key insight is that between the read and the update, the entitlement value is stale.

2. **Position for exploitation**: The attacker arranges their state to maximize the drift. For reward drift, they deposit just before a large reward distribution. For share drift, they manipulate the share price through a donation or flash loan. For balance drift, they time their transaction to land between the stale read and the state update.

3. **Extract value**: The attacker calls the function during the drift window. Because entitlement is computed from stale state, they receive more than their fair share. In reward scenarios, they claim rewards they have not earned. In share scenarios, they redeem shares at an inflated rate. In balance scenarios, they withdraw funds that have already been committed elsewhere.

4. **Impact**: Other users receive less than expected because the attacker has siphoned value from the pool. In severe cases, the protocol becomes insolvent (total claims exceed total assets).

## Concrete Examples

### TraitForge Airdrop Stale Entropy

In the TraitForge protocol, airdrop entitlement was computed from `lastTokenEntropy`, a value that was not updated atomically with the airdrop distribution. Users who performed certain actions between the entropy snapshot and the airdrop calculation received incorrect amounts. Some users received more than their fair share while others received less, with no way to reconcile after the fact.

### Stale rewardPerShare in Staking Contracts

A common pattern in staking contracts involves a global `rewardPerShare` accumulator. When new rewards arrive, `rewardPerShare` increases. Each user's pending reward is `(rewardPerShare - userLastRewardPerShare) * userStake`. If a function reads `rewardPerShare`, then distributes new rewards (incrementing `rewardPerShare`), then calculates a user's entitlement, the user misses the latest distribution. Worse, an attacker who stakes after the read but before the distribution captures rewards they did not earn.

```solidity
// Vulnerable pattern
uint256 currentReward = rewardPerShare; // stale read
distributeNewRewards();                  // rewardPerShare increases
uint256 userReward = (currentReward - user.lastClaimed) * user.stake;
// userReward is calculated from the stale value
```

### Burn-Then-Withdraw Fee Mismatch

A protocol allows users to burn shares to withdraw underlying assets. The burn amount is computed before a fee deduction, but the withdrawal amount uses the post-fee balance. The user burns shares worth X tokens but receives X minus fee tokens. The fee tokens remain in the contract with no accounting entry, effectively distributing them to remaining shareholders. While this might seem acceptable, if the fee percentage is configurable and the drift is not documented, an admin can exploit this to extract user funds.

## False-Positive Refutations

Before flagging an entitlement drift vulnerability, verify that none of the following conditions apply:

- **Lazy update pattern with atomic catch-up**: If pending rewards are recalculated on every user interaction (deposit, withdraw, claim) and the update is the first operation in the function, there is no drift window. The entitlement is always current at the point of use. This is the standard pattern in MasterChef-style contracts.

- **Protocol explicitly documents delayed settlement**: Some protocols intentionally settle entitlements with a delay (e.g., epoch-based systems where rewards are claimable only after the epoch ends). This is by design, not a bug, provided the delay is documented and users cannot exploit the settlement boundary.

- **Fee-on-transfer token exclusion**: If the protocol explicitly states it does not support fee-on-transfer tokens and validates a token whitelist, the balance mismatch from transfer fees is an intentional scope limitation, not a vulnerability.

- **Snapshot-based accounting with immutable snapshots**: If entitlements are computed from an immutable snapshot (e.g., Merkle root for an airdrop), and the snapshot cannot be updated after distribution begins, drift cannot occur. Verify the snapshot is taken at a well-defined block and cannot be replayed.

- **Two-step settlement with locking**: If the protocol uses a commit-reveal or lock-settle pattern where entitlements are locked before settlement, drift between the lock and settlement phases is prevented. Verify the lock is enforced on-chain, not just by convention.
