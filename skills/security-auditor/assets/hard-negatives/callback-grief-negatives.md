# Hard Negatives: Callback Grief

These patterns involve external calls and callbacks that look dangerous at first glance but are actually safe when specific conditions are met. Use these to avoid false positives when auditing callback-related code.

## Pattern: External Call in a Bounded Loop

### Why It Looks Bad

A loop iterates over a set of addresses and makes an external call to each one. This appears vulnerable to gas griefing (one address consumes all gas or reverts, blocking the entire batch) and unbounded iteration (if the array grows large, the transaction exceeds the block gas limit).

### Why It's Safe

The loop is bounded by a protocol-controlled length that cannot be influenced by users. Examples include iterating over a fixed validator set defined at deployment, a governance-controlled whitelist with a hard maximum size, or a fixed number of reward tokens. Additionally, each call within the loop uses `try/catch` to handle failures gracefully. A reverting target is skipped rather than causing the entire transaction to revert. The protocol may also emit an event for the failed call to allow off-chain retry.

### Key Indicators

- Loop bound is a protocol-controlled constant or a storage variable with an enforced maximum (e.g., `require(validators.length <= MAX_VALIDATORS)`)
- Each external call is wrapped in `try/catch` with meaningful error handling in the catch block
- The catch block does not simply `revert` with a different message (that would still block the batch)
- Gas forwarded to each call is explicitly limited (e.g., `target.call{gas: 50000}(...)`)
- The array cannot be appended to by arbitrary users

## Pattern: ERC-721 safeTransferFrom Callback

### Why It Looks Bad

`safeTransferFrom` calls `onERC721Received` on the recipient, allowing arbitrary code execution. This looks like a reentrancy vector because the recipient can call back into the originating contract during the callback. The callback runs with the caller's remaining gas, giving it ample room for complex operations.

### Why It's Safe

The transfer follows the checks-effects-interactions pattern: all state changes (ownership update, balance update, approval clearing) are completed before the callback executes. When the callback fires, the contract's state already reflects the completed transfer, so re-entering any function will see consistent state. Additionally, a reentrancy guard (`nonReentrant` modifier) is active on the calling function, preventing any re-entrant call from executing state-changing logic.

### Key Indicators

- The `safeTransferFrom` call is the last operation in the function (or after all state updates)
- The calling function has a `nonReentrant` modifier or equivalent mutex
- All storage writes (balance updates, ownership changes, mapping updates) occur before the transfer
- No state reads after the external call depend on state that could change through reentrancy
- The contract does not hold temporary intermediate state (e.g., partially completed swaps) at the time of the callback

## Pattern: Flash Loan Callback to Known Contract

### Why It Looks Bad

Flash loan protocols call an arbitrary callback function on the borrower, allowing the borrower to execute any logic with borrowed funds. This appears to enable manipulation of the lending protocol's state during the callback, price oracle manipulation, or governance attacks with temporarily-held voting power.

### Why It's Safe

The flash loan contract verifies the exact repayment amount (plus fee) after the callback returns. If the borrower does not repay, the entire transaction reverts. The lending protocol checkpoints its critical state (reserves, utilization rate, health factors) before the callback and validates that these invariants still hold after repayment. The callback cannot permanently alter the protocol's state because any manipulation that is not unwound by repayment causes a revert.

### Key Indicators

- The flash loan function checks `balanceOf(address(this)) >= balanceBefore + fee` after the callback returns
- Critical protocol state (total borrows, total reserves) is checkpointed before the callback and validated after
- The flash loan function has a reentrancy guard preventing the callback from initiating another flash loan
- The protocol does not use spot prices or balances for critical calculations during the callback window (uses TWAP or oracle prices instead)
- The callback interface enforces a specific function signature (`onFlashLoan`) that returns a known magic value, preventing unintended function calls

## Pattern: ETH Transfer via call to msg.sender

### Why It Looks Bad

Sending ETH to `msg.sender` via `.call{value: amount}("")` allows the sender to execute arbitrary fallback logic. If `msg.sender` is a contract, it could reenter the protocol or consume excessive gas.

### Why It's Safe

The transfer is to `msg.sender`, who is the initiator of the transaction. The sender can only grief themselves by reverting in their own fallback function. The protocol's state has already been updated (checks-effects-interactions), so reentrancy would see the updated state. Additionally, the sender has no incentive to grief themselves since they are the one receiving funds.

### Key Indicators

- The recipient is `msg.sender` (not a third-party or user-supplied address)
- All state updates are completed before the ETH transfer
- The function has a reentrancy guard as defense in depth
- The return value of the call is checked, and failure is handled (revert or event emission)
