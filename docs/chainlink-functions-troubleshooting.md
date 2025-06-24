# Chainlink Functions 故障排除指南

## CBOR 解析错误问题分析与解决方案

### 问题描述

在使用 Chainlink Functions 验证 PayPal 支付时，我们遇到了 `CBOR parsing error` 错误。这个错误发生在合约尝试从 Chainlink Functions DON 节点接收并解码响应数据时。

### 问题分析

根据我们的测试和分析，CBOR 解析错误的主要原因有：

1. **源代码哈希同步问题**：
   - 合约中的源代码哈希已更新，但 Chainlink Functions DON 网络可能仍在使用旧版本的代码。
   - 必须确保 DON 网络中注册的源代码与合约中的源代码哈希一致。

2. **数据格式不兼容**：
   - handler.js 返回的数据格式可能与 Chainlink Functions 期望的格式不兼容。
   - 特别是 handler.js 中使用了错误的编码方式（如 `Functions.encodeBytes()`）或返回了原始字符串。

3. **Chainlink Functions 版本兼容性**：
   - 合约使用的 Chainlink Functions 版本 (v1_3_0) 可能与我们的实现方式不兼容。
   - 需要确保 handler.js 的返回格式符合该版本的要求。

### 解决方案

1. **修改 handler.js 文件**：
   - 确保 handler.js 使用正确的数据编码方式，直接返回 ABI 编码的数据。
   - 参考示例：
     ```javascript
     const abiCoder = new ethers.utils.AbiCoder();
     const encoded = abiCoder.encode(
       ["string", "string", "uint256", "string"],
       [payerEmail, merchantEmail, amount, status]
     );
     return encoded;
     ```
   - 不要使用 `Functions.encodeBytes()` 或其他额外的编码层。

2. **更新合约中的源代码哈希**：
   - 使用 `update-handler-cli.js` 脚本计算并更新合约中的源代码哈希。
   - 验证源代码哈希是否成功更新到合约中：
     ```
     node scripts/verify-source-hash.js
     ```

3. **上传源代码到 Chainlink Functions DON**：
   - 通过 Chainlink Functions UI 上传源代码：https://functions.chain.link/
   - 确保上传的源代码与计算哈希值的代码完全一致。
   - 验证 DON 网络中的源代码哈希与合约中的哈希一致。

4. **验证秘密哈希**：
   - 确保合约中的秘密哈希 (secrets hash) 与 DON 网络中注册的一致。

### 测试流程

1. 更新 handler.js，确保它直接返回 ABI 编码的数据。
2. 运行 `update-handler-cli.js` 更新合约中的源代码哈希。
3. 运行 `verify-source-hash.js` 验证源代码哈希是否已更新。
4. 通过 Chainlink Functions UI 上传源代码。
5. 运行 `test-order-flow.js` 测试完整流程。

### 重要提示

如果在完成上述步骤后仍然遇到 CBOR 解析错误，可能需要：

1. 查阅 Chainlink Functions 官方文档，确认 v1_3_0 版本的正确数据格式。
2. 联系 Chainlink 社区支持，寻求专业帮助。
3. 考虑使用 Chainlink 官方示例中的 handler.js 模板，并根据需要进行修改。

### 补充资源

- [Chainlink Functions 官方文档](https://docs.chain.link/chainlink-functions)
- [Chainlink Functions GitHub 仓库](https://github.com/smartcontractkit/chainlink)
- [Chainlink Discord 社区](https://discord.gg/chainlink) 