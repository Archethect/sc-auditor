// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleVault {
    mapping(address => uint256) public balances;

    // Vulnerability 1: Missing zero-address check
    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // Vulnerability 2: Reentrancy (CEI violation)
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        (bool success, ) = msg.sender.call{value: amount}("");
        // State update AFTER external call — reentrancy!
        balances[msg.sender] -= amount;
        // Vulnerability 3: Unchecked return value
        // success is not checked
    }

    function getBalance() external view returns (uint256) {
        return balances[msg.sender];
    }
}
