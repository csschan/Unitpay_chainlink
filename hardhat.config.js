require("dotenv").config();
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");

const PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
const SOMNIA_RPC_URL = process.env.SOMNIA_RPC_URL;
const SOMNIA_API_KEY = process.env.SOMNIA_API_KEY;
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const SEPOLIA_API_KEY = process.env.SEPOLIA_API_KEY;

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 }
        }
      }
    ]
  },
  networks: {
    somnia: {
      url: process.env.SOMNIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    sepolia: {
      url: process.env.ALCHEMY_SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL || process.env.BLOCKCHAIN_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      timeout: 200000,
    }
  },
  etherscan: {
    apiKey: {
      somnia: SOMNIA_API_KEY,
      sepolia: "FKCFG1XHGEUQ1SIBEUXAR5TZQ8QKM1XZ7B"
    },
    customChains: [
      {
        network: "somnia",
        chainId: 50312,
        urls: {
          apiURL: "https://api.somnia.network/api",
          browserURL: "https://shannon-explorer.somnia.network"
        }
      }
    ]
  },
  contractAddress: process.env.CONTRACT_ADDRESS
}; 