// 区块链合约配置
module.exports = {
    // 合约地址
    settlement: process.env.CONTRACT_ADDRESS || '0xB260ac385A5a7fA93094C1e8534c4b2b5C20e182',
    token: process.env.USDT_ADDRESS || '0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b',
    
    // 网络配置
    network: {
        somnia: {
            name: 'Somnia Shannon Testnet',
            rpcUrl: process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network',
            chainId: '0xC498', // 50312 in decimal
            blockExplorer: 'https://shannon-explorer.somnia.network',
            nativeCurrency: {
                name: 'Somnia Token',
                symbol: 'STT',
                decimals: 18
            }
        }
    }
}; 