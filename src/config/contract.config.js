// USDT代币ABI
const usdtABI = [
    "function transfer(address to, uint256 value) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

// 结算合约ABI
const contractABI = [
    // 直接支付
    "function settlePayment(address lp, address token, uint256 amount, string network, string paymentId) returns (bool)",
    
    // 托管支付
    "function lockPayment(address lp, address token, uint256 amount, string network, string paymentId) returns (bool)",
    "function confirmPayment(string paymentId) returns (bool)",
    "function autoReleasePayment(string paymentId) returns (bool)",
    "function withdrawPayment(string paymentId) returns (bool)",
    "function refundPayment(string paymentId) returns (bool)",
    
    // 查询函数
    "function getPaymentRecordsCount() view returns (uint256)",
    "function getUserPaymentCount(address user) view returns (uint256)",
    "function getLPPaymentCount(address lp) view returns (uint256)",
    "function isPaymentIdUsed(string paymentId) view returns (bool)",
    
    // 事件
    "event PaymentSettled(string indexed paymentId, address indexed user, address indexed lp, uint256 amount, string network)",
    "event PaymentLocked(string indexed paymentId, address indexed user, address indexed lp, uint256 amount, uint256 platformFee)",
    "event PaymentConfirmed(string indexed paymentId, bool isAuto)",
    "event PaymentReleased(string indexed paymentId, address indexed lp, uint256 amount, uint256 platformFee)"
];

// 托管合约ABI
const escrowABI = [
    "function lock(address token, uint256 amount, address beneficiary, string paymentId) returns (bool)",
    "function release(string paymentId) returns (bool)",
    "function withdraw(string paymentId) returns (bool)",
    "function getEscrowInfo(string paymentId) view returns (address token, uint256 amount, address sender, address beneficiary, uint256 lockTime, bool released)",
    "event Locked(string indexed paymentId, address indexed token, uint256 amount, address indexed sender, address beneficiary)",
    "event Released(string indexed paymentId)",
    "event Withdrawn(string indexed paymentId)"
];

// 网络配置
const networkConfig = {
    somnia: {
        chainId: '0xC498', // 50312 in decimal
        chainName: 'Somnia Shannon Testnet',
        nativeCurrency: {
            name: 'SOMNIA',
            symbol: 'STT',
            decimals: 18
        },
        rpcUrls: [process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network'],
        blockExplorer: 'https://shannon-explorer.somnia.network',
        contractAddress: '0xB260ac385A5a7fA93094C1e8534c4b2b5C20e182',
        usdtAddress: '0xa3EF117d0680EF025e99E09f44c0f6a5CafE141b',
        escrowAddress: '0x8379D68683272C534F29B300AECf8abAb76064F7' // 托管合约地址
    }
};

module.exports = {
    usdtABI,
    contractABI,
    escrowABI,
    networkConfig,
    somnia: networkConfig.somnia // 为了向后兼容
}; 