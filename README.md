# UnitPay EVM — Chainlink Functions Integration Example

> A sample project demonstrating how to build decentralized payment and verification services using Chainlink Functions


## Project Overview

This project uses [Chainlink Functions](https://docs.chain.link/functions/) as its core to demonstrate how to bridge on-chain events with off-chain business logic, enabling decentralized payment, verification, and state update services.  
Key use cases include:  
- Payment request validation  
- Cryptographic signature verification  
- Multi-signature & settlement logic  
- Asynchronous Chainlink callback handling

## Features

- 🔗 On-chain smart contracts (Solidity)  
- ⏳ Asynchronous callbacks via Chainlink Functions  
- 🌐 RESTful API service (Express + Socket.io)  
- 📝 PM2 cluster deployment  
- ⚙️ One-click scripted deployment and testing

## Tech Stack

- Node.js & npm  
- Hardhat (Solidity compilation & deployment)  
- Express.js (REST API)  
- Socket.io (real-time event streaming)  
- Chainlink Functions  
- PM2 (process management)  
- SQLite / MySQL (optional)

## Prerequisites

- Node.js ≥ 16  
- npm ≥ 8  
- A local or remote Chainlink Functions node  
- An HTTP-webhook-capable environment (use `ngrok` for local testing)  
- PM2 (installed globally):  
  ```bash
  npm install -g pm2
  ```

## Installation & Usage

```bash
git clone https://github.com/csschan/Unitpay_chainlink.git
cd Unitpay_chainlink
npm install
```

### Running in Development

```bash
# Start backend service (default port 4000)
npm run dev

# Or use PM2 in cluster mode
pm2 start ecosystem.config.js --env development
```

## Configuration

1. Copy and update the Chainlink Functions secrets template:  
   ```bash
   cp functions/secrets.json.example functions/secrets.json
   ```
2. In `functions/secrets.json`, fill in:  
   - `nodeUrl`, `walletPrivateKey`  
   - Chainlink Functions API key & webhook URL  
   - Other third-party service keys as needed  

3. Create a `.env` file in the root (next to `package.json`), e.g.:  
   ```env
   NODE_ENV=development
   PORT=4000
   DATABASE_URL=mysql://user:pass@localhost:3306/unitpay
   ```

## Smart Contract Deployment

```bash
# Compile contracts
npx hardhat compile

# Deploy to a local Hardhat node
npx hardhat run scripts/deploy.js --network localhost

# Deploy to testnet or mainnet
npx hardhat run scripts/deploy.js --network sepolia
```

After deployment, the ABI and addresses are recorded in `deployment.json` for frontend or Functions handler reference.

## Chainlink Functions Workflow

1. A user submits an on-chain transaction (e.g., payment or contract call)  
2. The contract emits an event; a Chainlink Functions node captures it and sends a request to the Functions handler  
3. The handler executes custom JS logic off-chain (API calls, signature checks, etc.)  
4. The result is sent back on-chain via a Chainlink callback  
5. The contract emits subsequent events, which the frontend/backend listen to and update state  

See example handlers in `functions/handler-improved.js`.

## Local Testing

- Simulate Functions execution:  
  ```bash
  npm run test:functions
  # or
  node scripts/test-chainlink-inline-js.js
  ```
- Run integration tests:  
  ```bash
  npm run test
  ```

## Scripts

The `scripts/` directory contains various helper and deployment scripts:

| Script                           | Description                          |
| -------------------------------- | ------------------------------------ |
| `deploy.js`                      | General smart contract deployment    |
| `deploy-enhanced-unitpay.js`     | Deploy enhanced payment contract     |
| `test-chainlink-inline-js.js`    | Local Chainlink Functions simulation |
| `register-lp-and-create-order.js`| Register LP and create an order     |
| `verify-source-hash.js`          | Verify contract source hash          |
| …                                | …                                    |

## Production Deployment with PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
```

- View processes: `pm2 list`  
- View logs: `pm2 logs unitpay_4000`


## Chainlink Functions PayPal Verification Integration

This project has integrated Chainlink Functions into the `UnitpayFull` contract to securely verify PayPal orders on-chain.

1. **Write the validation script**  
   Implement the PayPal order verification logic in `functions/handler.js`.

2. **Generate identifiers for script and secrets**  
   Use the `@chainlink/functions-cli` to encode your handler and secrets, producing the `SOURCE` and `SECRETS` hashes.

3. **Create deployment environment**  
   In the project root, create a `.env` file with:
   ```ini
   DEFAULT_TOKEN_ADDRESS=0x...              # Default ERC20 token address  
   FUNCTIONS_ROUTER_ADDRESS=0x...           # Chainlink Functions Router address  
   SOURCE=0x...                             # Identifier for handler.js code  
   SECRETS=0x...                            # Identifier for secrets.json  
   SUBSCRIPTION_ID=123                      # Chainlink Functions subscription ID  
   ```

4. **Deploy the contract**  
   ```bash
   npx hardhat run scripts/deploy-unitpay.js --network <network>
   ```

5. **Configure in the Chainlink Functions UI**  
   - Add the deployed contract address as a Consumer of your subscription.  
   - Add Secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`.  
   - Add environment variable: `API_BASE_URL`.  
   - Create a new Functions Job with:
     - `SOURCE` (handler code identifier)  
     - `SECRETS` (secrets identifier)  
     - Arguments: `["orderId", "merchantEmail", "amount", "lpEmail"]`  
     - Expected Return Type: `string`

6. **Trigger on-chain verification**  
   Call the contract’s `createOrder` and then `submitOrderId` to initiate PayPal order validation.  
   Wait for the Chainlink node to invoke `fulfillRequest`, which will update the payment status on-chain.
