# Unitpay Smart Contracts

This directory contains the smart contracts for the Unitpay payment system.

## Contracts

### UnitpayEnhanced.sol

The main enhanced contract that combines functionality from multiple contracts and adds upgradeable Chainlink Functions configuration.

Key features:
- Includes all payment functionality from Unitpay.sol
- Implements UnitpayFixCLFunctions interface for updating Chainlink Functions configurations
- Supports PayPal payment verification through Chainlink Functions
- Provides getter methods for Chainlink configuration

### Unitpay.sol

The original full contract that includes:
- Settlement functionality
- Escrow functionality
- PayPal verification via Chainlink Functions

### UnitPaySettlement.sol

Base contract for payment settlement.

### UnitPaySettlementV2.sol

Enhanced settlement contract with improved features.

### UnitPayEscrow.sol

Contract for escrow functionality.

### LinkCardSettlement.sol

Contract for Link Card settlement.

### UnitpayGetters.sol

A simple contract providing getter methods for Chainlink Functions configurations.

### UnitpayFixCLFunctions.sol

Interface defining functions for updating Chainlink Functions configurations.

## Integration with Chainlink Functions

The Unitpay system uses Chainlink Functions to verify PayPal payments. The workflow is:

1. User creates a payment order with merchant's PayPal email
2. LP submits the PayPal order ID
3. Smart contract sends a request to Chainlink Functions with order details
4. Chainlink Functions verifies the order with PayPal API
5. On callback, the contract confirms or rejects the payment

## How to Upgrade

When upgrading from an older version:

1. Deploy UnitpayEnhanced.sol using `scripts/deploy-enhanced-unitpay.js`
2. Test the deployment using `scripts/test-enhanced-contract.js`
3. Update your application to use the new contract address

## Configuration Updates

The UnitpayEnhanced contract allows dynamic updates to Chainlink Functions configuration:

- Use `updateFunctionsRouter(address)` to update the Functions Router address
- Use `updateSubscriptionId(uint64)` to update the subscription ID
- Use `updateSourceAndSecrets(bytes32, bytes32)` to update the JavaScript source code and secrets

Use `scripts/test-enhanced-contract.js` with the `UPDATE_CONFIG=true` environment variable to update these configurations.

## Testing PayPal Integration

To test the PayPal integration:

1. Deploy the UnitpayEnhanced contract
2. Configure a token for your network
3. Register an LP with a PayPal email
4. Create a payment order
5. Submit a PayPal order ID
6. Verify the payment status

Use `scripts/test-paypal-enhanced.js` to run through this workflow.

## UnitPay 智能合约

## 合约地址

最新部署的合约地址: `0x78fbc0ec12bc3087aae592f7ca31b27b515ae01c`

## 合约描述

UnitPaySettlement 是一个支付结算智能合约，支持直接支付和托管支付两种模式。托管支付模式下，资金会先锁定在合约中，待确认后再释放给接收方。

## 主要功能

1. **支付类型**
   - 直接支付(DIRECT): 资金直接从用户转移到流动性提供者(LP)
   - 托管支付(ESCROW): 资金先锁定在合约中，待确认后再释放

2. **托管支付状态**
   - NONE: 初始状态
   - LOCKED: 已锁定
   - CONFIRMED: 已确认
   - RELEASED: 已释放
   - REFUNDED: 已退款

3. **核心功能**
   - 直接支付结算
   - 托管支付锁定
   - 确认支付
   - 自动释放支付
   - 提取支付
   - 争议处理
   - 退款处理
   - 平台费用提取

4. **查询功能**
   - 获取支付状态
   - 批量获取支付状态
   - 验证支付ID有效性
   - 获取支付详情
   - 获取用户/LP支付ID
   - 检查用户是否是支付拥有者/接收者

## 合约升级内容

本版本合约相比原版增加了以下功能:

1. 支付状态变更事件 `PaymentStatusChanged`
2. 查询支付状态函数 `getPaymentStatus`
3. 批量查询支付状态 `batchGetPaymentStatus`
4. 验证支付ID格式 `isPaymentIdValid`
5. 获取支付详情函数 `getPaymentDetails`
6. 获取用户所有支付ID `getUserPaymentIds`
7. 获取LP所有支付ID `getLPPaymentIds`
8. 检查用户是否是支付拥有者 `isPaymentOwner`
9. 检查用户是否是支付接收者 `isPaymentRecipient`

这些新功能使前端应用能够更好地与智能合约交互，特别是在支付状态查询和验证方面提供了更多便利。 

## How to Upgrade

When upgrading from an older version:

1. Deploy UnitpayEnhanced.sol using `scripts/deploy-enhanced-unitpay.js`
2. Test the deployment using `scripts/test-enhanced-contract.js`
3. Update your application to use the new contract address

## Configuration Updates

The UnitpayEnhanced contract allows dynamic updates to Chainlink Functions configuration:

- Use `updateFunctionsRouter(address)` to update the Functions Router address
- Use `updateSubscriptionId(uint64)` to update the subscription ID
- Use `updateSourceAndSecrets(bytes32, bytes32)` to update the JavaScript source code and secrets

Use `scripts/test-enhanced-contract.js` with the `UPDATE_CONFIG=true` environment variable to update these configurations.

## Testing PayPal Integration

To test the PayPal integration:

1. Deploy the UnitpayEnhanced contract
2. Configure a token for your network
3. Register an LP with a PayPal email
4. Create a payment order
5. Submit a PayPal order ID
6. Verify the payment status

Use `scripts/test-paypal-enhanced.js` to run through this workflow.

## UnitPay 智能合约

## 合约地址

最新部署的合约地址: `0x78fbc0ec12bc3087aae592f7ca31b27b515ae01c`

## 合约描述

UnitPaySettlement 是一个支付结算智能合约，支持直接支付和托管支付两种模式。托管支付模式下，资金会先锁定在合约中，待确认后再释放给接收方。

## 主要功能

1. **支付类型**
   - 直接支付(DIRECT): 资金直接从用户转移到流动性提供者(LP)
   - 托管支付(ESCROW): 资金先锁定在合约中，待确认后再释放

2. **托管支付状态**
   - NONE: 初始状态
   - LOCKED: 已锁定
   - CONFIRMED: 已确认
   - RELEASED: 已释放
   - REFUNDED: 已退款

3. **核心功能**
   - 直接支付结算
   - 托管支付锁定
   - 确认支付
   - 自动释放支付
   - 提取支付
   - 争议处理
   - 退款处理
   - 平台费用提取

4. **查询功能**
   - 获取支付状态
   - 批量获取支付状态
   - 验证支付ID有效性
   - 获取支付详情
   - 获取用户/LP支付ID
   - 检查用户是否是支付拥有者/接收者

## 合约升级内容

本版本合约相比原版增加了以下功能:

1. 支付状态变更事件 `PaymentStatusChanged`
2. 查询支付状态函数 `getPaymentStatus`
3. 批量查询支付状态 `batchGetPaymentStatus`
4. 验证支付ID格式 `isPaymentIdValid`
5. 获取支付详情函数 `getPaymentDetails`
6. 获取用户所有支付ID `getUserPaymentIds`
7. 获取LP所有支付ID `getLPPaymentIds`
8. 检查用户是否是支付拥有者 `isPaymentOwner`
9. 检查用户是否是支付接收者 `isPaymentRecipient`

这些新功能使前端应用能够更好地与智能合约交互，特别是在支付状态查询和验证方面提供了更多便利。 