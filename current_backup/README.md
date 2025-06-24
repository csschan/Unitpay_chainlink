# UnitPay - Link Card MVP

基于扫码支付的去中心化支付系统

## Vercel部署说明

本项目已配置为可在Vercel上部署。以下是部署步骤：

1. 在Vercel上创建新项目，并连接到GitHub仓库
2. 在Vercel项目设置中配置以下环境变量：
   - `DB_HOST`: 数据库主机地址（推荐使用PlanetScale等云数据库）
   - `DB_PORT`: 数据库端口
   - `DB_USER`: 数据库用户名
   - `DB_PASSWORD`: 数据库密码
   - `DB_NAME`: 数据库名称
   - `DB_SSL`: 设置为"true"以启用SSL连接
   - `JWT_SECRET`: JWT密钥
   - `ETH_PROVIDER_URL`: 以太坊提供商URL
   - `CONTRACT_ADDRESS`: 合约地址
   - `ADMIN_WALLET_PRIVATE_KEY`: 管理员钱包私钥
   - `USDT_CONTRACT_ADDRESS`: USDT合约地址

3. 部署项目

## 访问地址

- 用户界面: https://hiunitpay.vercel.app/
- LP界面: https://hiunitpay.vercel.app/lp.html

## 本地开发

1. 克隆仓库
2. 安装依赖: `npm install`
3. 创建`.env`文件并配置环境变量
4. 启动开发服务器: `npm run dev`

## 技术栈

- 后端: Node.js, Express, Sequelize
- 前端: HTML, CSS, JavaScript, Bootstrap
- 数据库: MySQL (本地开发), PlanetScale (生产环境)
- 区块链: Ethereum, Web3.js
- 实时通信: Socket.io