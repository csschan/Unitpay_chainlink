// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface UnitpayFixCLFunctions {
    // 读取函数
    function getFunctionsRouter() external view returns (address);
    function getSubscriptionId() external view returns (uint64);
    
    // 更新函数
    function updateFunctionsRouter(address _functionsRouter) external;
    function updateSubscriptionId(uint64 _subscriptionId) external;
    function updateSourceAndSecrets(bytes32 _source, bytes32 _secrets) external;
} 