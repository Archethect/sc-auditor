// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
}

contract CallbackGrief {
    mapping(address => uint256) public balances;

    function transferToken(address to, uint256 amount) external {
        balances[msg.sender] -= amount;
        // External call before state update - grief vector
        IERC1155Receiver(to).onERC1155Received(msg.sender, address(0), 1, amount, "");
        balances[to] += amount;
    }
}
