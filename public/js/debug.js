// 代币配置检查脚本
async function checkTokenConfig() {
    try {
        console.log('========== 开始检查代币配置 ==========');
        
        // 初始化ContractService
        const contractService = new ContractService(contractConfig.somnia);
        
        // 初始化Web3连接
        const web3Initialized = await contractService.initializeWeb3();
        if (!web3Initialized) {
            throw new Error('Web3初始化失败');
        }
        
        // 初始化合约
        const contractsInitialized = await contractService.initializeContracts();
        if (!contractsInitialized) {
            throw new Error('合约初始化失败');
        }
        
        // 获取当前网络ID
        const networkId = await contractService.web3.eth.net.getId();
        console.log('当前网络ID:', networkId);
        
        // 检查USDT合约
        const usdtAddress = contractConfig.somnia.USDT_ADDRESS;
        console.log('USDT合约地址:', usdtAddress);
        
        // 检查USDT合约代码
        const usdtCode = await contractService.web3.eth.getCode(usdtAddress);
        console.log('USDT合约是否已部署:', usdtCode !== '0x' && usdtCode !== '0x0');
        
        // 获取USDT代币信息
        const usdtContract = contractService.usdtContract;
        if (usdtContract) {
            try {
                const name = await usdtContract.methods.name().call();
                const symbol = await usdtContract.methods.symbol().call();
                const decimals = await usdtContract.methods.decimals().call();
                console.log('USDT代币信息:', {
                    name,
                    symbol,
                    decimals
                });
            } catch (error) {
                console.error('获取USDT信息失败:', error.message);
            }
        }
        
        // 检查结算合约配置
        const settlementContract = contractService.settlementContract;
        if (settlementContract) {
            try {
                // 检查网络代币配置
                const network = "Somnia";
                const tokenConfig = await settlementContract.methods.networkTokens(network, usdtAddress).call();
                console.log('代币配置信息:', {
                    network,
                    tokenAddress: tokenConfig.tokenAddress,
                    decimals: tokenConfig.decimals,
                    isEnabled: tokenConfig.isEnabled
                });
                
                // 获取支持的代币列表
                const supportedTokens = await settlementContract.methods.getNetworkTokens(network).call();
                console.log('网络支持的代币列表:', supportedTokens);
                
                // 检查USDT是否在支持列表中
                const isUsdtSupported = supportedTokens.includes(usdtAddress);
                console.log('USDT是否在支持列表中:', isUsdtSupported);
            } catch (error) {
                console.error('获取代币配置失败:', error.message);
            }
        }
        
        // 如果有钱包地址，检查余额和授权
        if (contractService.walletAddress) {
            try {
                const balance = await usdtContract.methods.balanceOf(contractService.walletAddress).call();
                console.log('钱包USDT余额:', contractService.web3.utils.fromWei(balance, 'ether'));
                
                const allowance = await usdtContract.methods.allowance(
                    contractService.walletAddress,
                    settlementContract.options.address
                ).call();
                console.log('合约授权额度:', contractService.web3.utils.fromWei(allowance, 'ether'));
            } catch (error) {
                console.error('获取余额或授权信息失败:', error.message);
            }
        }
        
        console.log('========== 代币配置检查完成 ==========');
    } catch (error) {
        console.error('检查代币配置失败:', error);
    }
}

// 导出函数
window.checkTokenConfig = checkTokenConfig; 