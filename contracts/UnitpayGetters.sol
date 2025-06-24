// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";

/**
 * @title UnitpayGetters
 * @dev 提供Chainlink Functions配置getter方法的简单合约
 */
contract UnitpayGetters is FunctionsClient {
    // Chainlink Functions 配置
    uint64 private immutable subscriptionId;
    
    constructor(
        address _functionsRouter,
        uint64 _subscriptionId
    ) 
        FunctionsClient(_functionsRouter)
    {
        subscriptionId = _subscriptionId;
    }
    
    /**
     * @notice 获取当前的Chainlink Functions Router地址
     * @return 当前的Router地址
     */
    function getFunctionsRouter() external view returns (address) {
        return address(i_functionsRouter);
    }
    
    /**
     * @notice 获取当前的Chainlink Functions订阅ID
     * @return 当前的订阅ID
     */
    function getSubscriptionId() external view returns (uint64) {
        return subscriptionId;
    }
    
    // 实现必要的函数，满足FunctionsClient的接口要求
    function _fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        // 空实现
    }
} 
 
 
 