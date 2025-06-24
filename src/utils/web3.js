const Web3 = require('web3');

let web3Instance = null;

const getWeb3 = async () => {
    if (web3Instance) {
        return web3Instance;
    }

    // 使用Somnia网络的RPC URL
    const provider = new Web3.providers.HttpProvider(process.env.SOMNIA_RPC_URL || 'https://rpc.shannon.somnia.network');
    web3Instance = new Web3(provider);
    return web3Instance;
};

module.exports = {
    getWeb3
}; 