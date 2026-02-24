// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * Test contract with intentional vulnerabilities for Slither integration tests.
 * This contract contains multiple detector-triggerable issues.
 */
contract VulnerableVault {
    mapping(address => uint256) public balances;

    // Reentrancy vulnerability: external call before state update
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");

        // Vulnerable: external call before state update
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        // State update after external call - reentrancy risk
        balances[msg.sender] -= amount;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // Low-level call without return value check
    function unsafeTransfer(address payable to, uint256 amount) external {
        to.call{value: amount}("");
    }
}
