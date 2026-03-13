# Hard Negatives: Approval Abuse

These patterns involve token approvals that look dangerous but are actually safe due to specific mitigations or design choices. Use these to avoid flagging standard DeFi approval patterns as vulnerabilities.

## Pattern: Unlimited Approval to Immutable Router

### Why It Looks Bad

The protocol grants `type(uint256).max` approval to an external contract, giving it the ability to transfer any amount of tokens at any time. This appears to expose all approved tokens to theft if the external contract is compromised. The approval persists indefinitely and is not revoked after use.

### Why It's Safe

The approved contract is immutable (no proxy pattern, no upgrade mechanism, no admin functions that could alter its behavior). It is a battle-tested, widely-used contract such as Uniswap V2 Router, Uniswap V3 SwapRouter, or a similar well-audited protocol. The contract's code has been verified on-chain and matches known, reviewed source code. Because the contract cannot be modified after deployment, the approval's risk profile is static; it will never become more dangerous than it is today. The gas savings from avoiding repeated approvals are a deliberate trade-off against the theoretical risk of an undiscovered vulnerability in a heavily audited contract.

### Key Indicators

- The approved contract has no proxy pattern (not a `delegatecall`-based proxy, not UUPS, not transparent proxy)
- The approved contract has no `selfdestruct` or `delegatecall` to user-supplied targets
- The contract is verified on Etherscan/Sourcify with source code matching a known audit
- The contract has been deployed for an extended period (months or years) without incident
- No admin or owner functions exist that could alter the contract's `transferFrom` behavior
- The approval is set in the constructor or initializer (not in a function callable by arbitrary users)

## Pattern: Approve-Transfer-Revoke in Single Transaction

### Why It Looks Bad

The code contains an `approve` call followed by a `transferFrom`, which appears to create a race condition window. Between the `approve` and the `transferFrom`, an attacker could theoretically front-run and spend the approval.

### Why It's Safe

The approve, transferFrom, and approval revocation (set to zero) all execute within the same transaction. There is no mempool exposure because the approval is never pending; it is set and consumed atomically. No external call exists between the approval and the transfer that could allow reentrancy or front-running. The approval is revoked to zero immediately after the transfer, eliminating any persistent approval risk.

### Key Indicators

- `approve`, `transferFrom`, and `approve(spender, 0)` are called sequentially in the same function
- No external calls, delegate calls, or callbacks occur between the approve and the transfer
- The function is not payable (reducing the attack surface for value-based reentrancy)
- The approval revocation (set to zero) is unconditional (not behind an if statement)
- Alternatively, `safeApprove` is used with amount set to 0 before setting the new amount (handles USDT-style tokens)

## Pattern: SafeERC20 forceApprove Usage

### Why It Looks Bad

The code calls `approve` which is known to have the race condition vulnerability. The `approve(spender, newAmount)` call while a previous approval exists can be front-run to spend both the old and new amounts.

### Why It's Safe

The protocol uses OpenZeppelin's `SafeERC20.forceApprove` (v5+) or `safeApprove` with a zero-then-set pattern. The `forceApprove` function first attempts to set the approval to the new value. If that fails (as with USDT which requires setting to zero first), it sets to zero and then to the new value. This two-step process ensures compatibility with all ERC-20 tokens and mitigates the race condition by going through zero as an intermediate state.

### Key Indicators

- The code uses `SafeERC20.forceApprove(token, spender, amount)` from OpenZeppelin v5+
- Alternatively, the code uses `SafeERC20.safeApprove(token, spender, 0)` followed by `SafeERC20.safeApprove(token, spender, amount)` from OpenZeppelin v4
- The `SafeERC20` library is imported from a reputable source (OpenZeppelin, Solady)
- The pattern is consistently applied across all approval sites in the codebase (no mixed usage of raw `approve` and `safeApprove`)

## Pattern: Permit2 with Signature and Deadline

### Why It Looks Bad

The protocol interacts with token approvals and transfers, which historically are the source of many vulnerabilities. Users must still grant an initial approval to the Permit2 contract.

### Why It's Safe

Uniswap's Permit2 system replaces persistent, unlimited approvals with signature-based, single-use, deadline-bound permits. The user signs an off-chain message specifying the exact spender, amount, and deadline. The permit can only be used once and expires after the deadline. Even if the signature is leaked, it cannot be replayed or used after expiry. The initial unlimited approval to the Permit2 contract itself is a one-time operation to a verified, immutable contract, making it equivalent to the "unlimited approval to immutable router" pattern above.

### Key Indicators

- The protocol integrates with Uniswap Permit2 (address `0x000000000022D473030F116dDEE9F6B43aC78BA3`)
- User signatures include a deadline parameter checked on-chain
- The `permitTransferFrom` function is used (single-use permits), not `approve` on individual tokens
- Nonce management prevents signature replay
- The Permit2 contract itself is immutable and verified

## Pattern: Approval to Timelock-Protected Upgradeable Contract

### Why It Looks Bad

Users approve an upgradeable proxy contract, which means the implementation can be swapped to a malicious version that drains all approved tokens.

### Why It's Safe

The upgrade mechanism is protected by a timelock with a delay long enough for users to revoke approvals (typically 48-72 hours). The protocol has an active monitoring system that alerts users and the community when an upgrade is queued. The governance process for upgrades is transparent (on-chain voting with public discussion). Users have ample time to verify the new implementation and revoke approvals if the upgrade is malicious.

### Key Indicators

- The proxy uses a timelock controller (e.g., OpenZeppelin TimelockController) with a minimum delay of 48+ hours
- Upgrade events are publicly indexed and monitoring services alert on them
- The governance process requires a quorum and multiple approvals
- The protocol provides a user-facing tool or UI for reviewing and revoking approvals
- Historical upgrades have been benign and well-communicated
- The timelock delay cannot be shortened without going through the same timelock (no bypass)
