# Chainlink Functions PayPal验证故障排除指南

## 问题概述

在使用Chainlink Functions进行PayPal订单验证时，我们遇到了验证失败的问题，错误信息为"External error during verification"。这表明Chainlink Functions DON (Decentralized Oracle Network) 在执行外部API调用时遇到了问题。

## 关键检查点

### 1. Secrets配置

Chainlink Functions需要PayPal API凭证来验证订单。请确保：

- **创建正确的secrets文件**：在`functions/`目录下创建`secrets.json`文件（参考`secrets.json.example`）
- **确保secrets包含必要的键**：
  - `PAYPAL_CLIENT_ID`: PayPal应用程序的客户端ID
  - `PAYPAL_SECRET`: PayPal应用程序的密钥
  - 确保这些凭证有权限访问PayPal的Orders API

```json
{
  "PAYPAL_CLIENT_ID": "your-paypal-client-id",
  "PAYPAL_SECRET": "your-paypal-secret",
  "API_BASE_URL": "https://api-m.sandbox.paypal.com"
}
```

### 2. 上传Secrets到Chainlink Functions

使用Chainlink Functions UI或CLI工具上传secrets：

```bash
# 使用Functions CLI
npx @chainlink/functions-toolkit secrets upload functions/secrets.json
```

上传后，获取secretsHash并确保与合约中配置的一致。

### 3. 验证Source代码

使用改进版的`handler-improved.js`作为Functions源代码，它具有增强的错误处理和日志记录功能。上传此代码并确保sourceHash与合约中配置的一致。

```bash
# 使用Functions CLI上传源代码
npx @chainlink/functions-toolkit source upload functions/handler-improved.js
```

### 4. 检查Subscription配置

确保：

- Subscription ID正确配置在合约中
- Subscription有足够的LINK代币余额
- 合约已被添加为该Subscription的Consumer

通过Chainlink Functions UI进行验证，或使用以下命令：

```bash
npx hardhat run scripts/verify-chainlink-secrets.js --network sepolia
```

### 5. 检查Function参数

确保传递给Functions的参数正确无误：

- `orderId`: PayPal订单ID（例如`8Y939514R7793982R`）
- `merchantEmail`: 商家PayPal邮箱
- `amount`: 订单金额
- `lpEmail`: LP的PayPal邮箱

### 6. 查看Functions日志

通过Chainlink Functions UI查看请求历史和详细日志，这将帮助识别问题的具体原因。

## 常见错误及解决方案

### 1. "PayPal API认证失败"

**原因**：PAYPAL_CLIENT_ID或PAYPAL_SECRET不正确，或凭证没有必要的权限。

**解决方案**：
- 检查PayPal开发者控制台中的凭证
- 确保使用的是正确的环境（沙盒或生产）
- 更新secrets文件并重新上传

### 2. "PayPal订单未找到"

**原因**：提供的订单ID不存在或不可访问。

**解决方案**：
- 验证订单ID的正确性
- 检查订单是否在相同的PayPal环境中（沙盒或生产）

### 3. "网络错误"或超时

**原因**：Chainlink Functions DON无法连接到PayPal API。

**解决方案**：
- 检查API基础URL是否正确
- 在handler中添加更长的超时时间
- 确保PayPal API服务正常运行

### 4. "金额不匹配"或"邮箱不匹配"

**原因**：合约中提供的验证数据与PayPal API返回的数据不匹配。

**解决方案**：
- 确保测试时使用与PayPal订单匹配的正确数据
- 检查LP和商家邮箱是否与PayPal订单中的一致

## 修复步骤

1. **使用改进的handler代码**：使用`functions/handler-improved.js`替换当前的handler
2. **重新生成source hash**：上传新的handler代码，获取新的sourceHash
3. **更新合约中的配置**：如果需要，更新合约中的sourceHash和secretsHash
4. **重新注册消费者**：如果必要，移除并重新添加合约作为消费者

## 测试建议

1. **直接测试PayPal API**：创建一个简单的脚本直接调用PayPal API，验证凭证和订单ID
2. **使用Chainlink Functions模拟器**：在本地测试函数代码，在部署到链上之前验证其行为
3. **增量测试**：先测试简单的API调用，然后再添加完整的验证逻辑

通过系统地检查这些点，您应该能够识别并解决Chainlink Functions PayPal验证的问题。 