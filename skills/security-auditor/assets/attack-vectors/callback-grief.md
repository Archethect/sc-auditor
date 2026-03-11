# Callback Grief

Callback grief attacks exploit user-controlled callback targets to cause denial of service, reentrancy, or gas griefing. Any time a protocol makes an external call to an address that a user can influence, the recipient can execute arbitrary logic in response, including reverting, consuming all forwarded gas, or re-entering the calling contract.

## Detection Cues

- User-controlled callback targets (addresses passed as parameters or stored from user input)
- External calls without return value checks (low-level `.call` without checking success)
- Loops over user-supplied addresses with external calls (batch operations iterating over recipients)
- ERC-777 `tokensReceived` hooks triggered during transfers
- ERC-721 `onERC721Received` / ERC-1155 `onERC1155Received` callbacks via `safeTransferFrom`
- Flash loan receiver callbacks (`onFlashLoan`, `executeOperation`)
- Fallback/receive functions triggered by ETH transfers to arbitrary addresses
- Callbacks invoked before state updates (violating checks-effects-interactions)

## Attack Narrative

The attack proceeds in the following steps:

1. **Setup**: The attacker deploys a malicious contract with a callback function (e.g., `onERC1155Received`, `tokensReceived`, or a plain `receive` function) that either reverts unconditionally, consumes all available gas via an infinite loop, or re-enters the calling contract.

2. **Trigger**: The attacker interacts with the target protocol in a way that causes the protocol to make an external call to the attacker's contract. This could be selling a token (triggering a transfer callback), receiving a flash loan, or being part of a batch distribution.

3. **Grief**: When the protocol calls the attacker's contract, the malicious callback executes. If it reverts, the entire transaction reverts, blocking the operation for all participants. If it consumes gas, the transaction runs out of gas. If it re-enters, the attacker manipulates state before the original function completes.

4. **Impact**: Depending on the context, this results in permanent denial of service (nobody can sell tokens, nobody can withdraw), temporary griefing (blocking specific operations until gas price changes), or state corruption through reentrancy.

The severity escalates dramatically when the callback is inside a loop. A single malicious recipient in a batch of 100 can block the entire batch. If there is no mechanism to skip or remove the malicious recipient, the denial of service becomes permanent.

## Concrete Examples

### Curves.sol Token Transfer Grief

In the Curves protocol, `_transferCurvesToken` calls `onERC1155Received` on the recipient when transferring curve tokens. An attacker deploys a contract that reverts in `onERC1155Received`. When any user tries to sell their curve tokens, the transfer to the fee recipient (the attacker's contract) reverts, blocking all sells for that curve. The attacker effectively freezes the entire market for a specific token.

```solidity
// Vulnerable pattern
function _transferCurvesToken(address to, uint256 amount) internal {
    // State updates happen here...
    IERC1155Receiver(to).onERC1155Received(msg.sender, from, id, amount, "");
    // If 'to' reverts, the entire sell transaction reverts
}
```

### ERC-777 Reentrancy via tokensReceived

ERC-777 tokens call `tokensReceived` on the recipient before the transfer completes. If the receiving contract re-enters the protocol (e.g., calling `withdraw` again), it can drain funds because the balance has not yet been updated. This is the same class of vulnerability that caused the Imbtc Uniswap pool drain.

### Flash Loan Callback Bricking Liquidations

A lending protocol uses flash loans to facilitate liquidations. The flash loan calls `onFlashLoan` on the borrower. If a borrower deploys a contract that reverts in `onFlashLoan`, no one can liquidate their position via flash loan, potentially making the position permanently unliquidatable and leaving bad debt in the protocol.

## False-Positive Refutations

Before flagging a callback grief vulnerability, verify that none of the following mitigations are in place:

- **Callback target is a known, immutable contract**: If the callback recipient is hardcoded to a verified, immutable contract address (not user-supplied), the recipient cannot execute malicious logic. Check that the address is not upgradeable and not derived from user input.

- **Protocol uses try/catch around the callback**: If the external call is wrapped in `try/catch`, a reverting callback will not revert the parent transaction. The protocol can gracefully handle the failure (e.g., skip the recipient, queue for later). Verify that the catch block does not simply revert with a different message.

- **Reentrancy guard is active across the full code path**: If a `nonReentrant` modifier (or equivalent mutex) protects the entire function, reentrancy through the callback is prevented. Verify the guard covers the specific entry point an attacker would re-enter through, not just the function containing the callback.

- **Pull-over-push pattern eliminates callback dependency**: If the protocol does not push funds/tokens to recipients but instead lets them pull (e.g., `claim()` functions), there is no callback to grief. The attacker can only grief themselves.

- **Gas-limited external calls**: If the external call forwards limited gas (e.g., 2300 gas stipend from `transfer`), the callback cannot execute complex logic. Note that `transfer` and `send` provide this limit, but `.call{value: x}("")` forwards all available gas by default.

- **Bounded loops with skip logic**: If the loop has a maximum iteration count controlled by the protocol and includes logic to skip failed transfers, a single malicious recipient cannot block the entire batch.
