# Approval Abuse

Approval abuse targets the ERC-20 token approval mechanism where a user grants permission for another address to spend their tokens. When approvals are too broad (unlimited), not revoked after use, or granted to upgradeable or compromisable contracts, an attacker can drain all approved tokens. The approval system's design also introduces a well-known race condition when changing approval amounts.

## Detection Cues

- Unlimited token approvals using `type(uint256).max` or `2**256 - 1`
- Approvals that are never revoked after the intended transfer completes
- `approve` called before `transferFrom` in the same execution path without subsequent revocation
- Approval granted to upgradeable proxy contracts (the implementation can change)
- Approval granted to contracts that are not verified or are controlled by external parties
- Missing use of permit/permit2 for single-use, deadline-bound approvals
- `safeApprove` used without first setting approval to zero (known USDT issue)
- Batch approval patterns where multiple tokens are approved to the same spender
- No mechanism for users to review or revoke outstanding approvals

## Attack Narrative

Approval abuse can manifest in several variants, each exploiting a different aspect of the approval mechanism:

### Variant 1: Unlimited Approval Drain

1. **Setup**: A protocol requires users to approve its contracts to spend tokens on their behalf. For convenience, the protocol requests `type(uint256).max` approval, meaning the contract can spend any amount of the user's tokens at any time.

2. **Compromise**: The approved contract is either directly compromised (private key leak, governance attack), upgraded to a malicious implementation (upgradeable proxy), or contains an undiscovered vulnerability that allows arbitrary `transferFrom` calls.

3. **Drain**: The attacker calls `transferFrom` for every user who has an outstanding unlimited approval, transferring all their tokens to the attacker's address. Because the approval is unlimited, there is no per-transaction limit on the amount stolen.

4. **Impact**: Every user who ever interacted with the protocol and granted unlimited approval loses all tokens of that type, not just the tokens they intended to use with the protocol.

### Variant 2: Approval Race Condition

1. **Initial state**: User has approved Spender for N tokens.

2. **User action**: User sends a transaction to change the approval from N to M (where M < N).

3. **Front-run**: Attacker sees the pending transaction in the mempool, front-runs it by calling `transferFrom` for N tokens (using the current approval).

4. **Completion**: The user's approval change executes, setting the approval to M. The attacker now calls `transferFrom` again for M tokens.

5. **Impact**: The attacker spent N + M tokens total, when the user only ever intended to authorize a maximum of max(N, M).

### Variant 3: Approval to Upgradeable Contract

1. **Setup**: Users approve a proxy contract to spend their tokens. The proxy delegates to a benign implementation.

2. **Upgrade**: The proxy owner (or a compromised governance) upgrades the implementation to a malicious contract that calls `transferFrom` on all approved users.

3. **Drain**: The new implementation drains all approved tokens. From the chain's perspective, the approved address (the proxy) has not changed, so all existing approvals are still valid.

## Concrete Examples

### DEX Router Unlimited Approval Drain

Users approve a DEX router with `type(uint256).max` to avoid repeated approval transactions. If the router contract has a vulnerability (or if a fake router is deployed at a similar address through a phishing attack), all approved tokens for every user can be drained in a single transaction. The 2023 Multichain exploit followed this pattern when compromised keys were used to drain tokens from users who had granted unlimited approvals.

### ERC-20 Approve Race Condition

The classic ERC-20 approve race condition is documented in the EIP-20 standard itself. When a user changes their approval from 100 to 50, an attacker can front-run the change to spend 100, then spend the new 50, extracting 150 tokens when the user intended a maximum of 100.

```solidity
// Vulnerable sequence
token.approve(spender, 100); // Transaction 1: approve 100
// ... time passes ...
token.approve(spender, 50);  // Transaction 2: change to 50
// Attacker front-runs Transaction 2:
// - transferFrom(user, attacker, 100) using old approval
// - After Transaction 2 confirms: transferFrom(user, attacker, 50)
// Total stolen: 150
```

### Approval to Upgradeable Protocol Contract

A lending protocol uses an upgradeable proxy for its pool contract. Users approve the proxy to spend their collateral tokens. When the protocol upgrades the implementation (even for a legitimate bug fix), the new implementation inherits all existing approvals. A malicious or compromised upgrade could include a hidden `drainAll()` function that transfers every approved user's tokens.

## False-Positive Refutations

Before flagging an approval abuse vulnerability, verify that none of the following mitigations are in place:

- **Approval is to a verified, immutable contract**: If the approved spender is a contract with no upgrade mechanism, no proxy pattern, and verified source code that does not contain arbitrary `transferFrom` logic, the unlimited approval is a convenience trade-off, not a vulnerability. Examples include Uniswap V2/V3 routers (non-upgradeable).

- **Protocol uses SafeERC20.safeIncreaseAllowance or forceApprove**: The `safeIncreaseAllowance` function avoids the race condition by incrementing rather than setting. The `forceApprove` function (OpenZeppelin v5) handles tokens like USDT that require setting to zero first. Either approach mitigates the race condition.

- **Approval is immediately followed by transfer and revocation**: If the approval, transfer, and revocation to zero all happen atomically within the same transaction, the window for exploitation is zero. This is the pattern used by well-designed aggregators.

- **Protocol uses permit/permit2 with deadline**: EIP-2612 `permit` and Uniswap's Permit2 provide single-use, deadline-bound approvals that cannot be replayed or used after expiry. This eliminates the persistent approval attack surface entirely.

- **Timelock on upgrades with approval revocation window**: If the protocol has a timelock on upgrades (e.g., 48-hour delay) and users are notified to revoke approvals before the upgrade executes, the upgrade-based drain is mitigated (assuming active monitoring).

- **Approval amount matches transfer amount exactly**: If the protocol approves only the exact amount needed for the next transfer (not unlimited), the maximum loss from a compromised spender is limited to that specific amount.
