// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

/**
 * @title TestFunctions 
 * @notice 一个极简的Chainlink Functions测试合约
 */
contract TestFunctions is FunctionsClient {
    using FunctionsRequest for FunctionsRequest.Request;

    // 存储结果的状态变量
    bytes public lastResponse;
    bytes public lastError;
    uint64 public immutable s_subscriptionId;
    bytes32 public immutable s_donId;
    
    // 测试状态
    bool public success = false;
    
    // 事件
    event TestRequestSent(bytes32 indexed requestId);
    event TestResponseReceived(bytes32 indexed requestId, bytes response, bytes err);
    event TestSucceeded();
    event TestFailed(string reason);

    constructor(
        address router,
        uint64 subscriptionId,
        bytes32 donId
    ) FunctionsClient(router) {
        s_subscriptionId = subscriptionId;
        s_donId = donId;
    }

    // 发送测试请求，使用极简的inline JavaScript
    function sendTestRequest() external returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        
        // 极简JavaScript - 只返回一个32字节的buffer
        string memory javaScript = 
            "function handler(request) {"
            "  const buffer = Buffer.alloc(32, 0);"
            "  buffer[31] = 1;"
            "  return buffer;"
            "}";
        
        req.initializeRequestForInlineJavaScript(javaScript);
        
        // 无参数
        string[] memory args = new string[](0);
        req.setArgs(args);
        
        // 发送请求
        requestId = _sendRequest(
            req.encodeCBOR(),
            s_subscriptionId,
            300000,
            s_donId
        );
        
        emit TestRequestSent(requestId);
        return requestId;
    }

    // Chainlink Functions回调
    function _fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        lastResponse = response;
        lastError = err;
        
        emit TestResponseReceived(requestId, response, err);
        
        if (err.length > 0) {
            success = false;
            emit TestFailed(string(err));
        } else if (response.length == 32 && response[31] == 0x01) {
            success = true;
            emit TestSucceeded();
        } else {
            success = false;
            emit TestFailed("Unexpected response format");
        }
    }
} 