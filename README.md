# UnitPay MVP

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

# UnitPay MongoDB to MySQL Migration

This project provides tools and scripts to migrate UnitPay's data from MongoDB to MySQL. The migration process includes data extraction, transformation, and loading into a new MySQL database structure.

## Requirements

- Node.js (v16+)
- MySQL Server (v8+)
- MongoDB (for source data)
- npm packages (see `package.json`)

## Setup

1. Clone the repository and install dependencies:

```bash
git clone [repository-url]
cd unitpay
npm install
```

2. Set up your environment variables in `.env`:

```
# MySQL Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=unitpay_user
MYSQL_PASSWORD=your_password
MYSQL_DB=unitpay_db

# MongoDB Configuration (source)
MONGODB_URI=mongodb://localhost:27017/unitpay

# Migration Settings
BACKUP_RETENTION_DAYS=7
BACKUP_HOUR=1
BACKUP_MINUTE=0
```

3. Create MySQL database and user:

```sql
CREATE DATABASE unitpay_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'unitpay_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON unitpay_db.* TO 'unitpay_user'@'localhost';
FLUSH PRIVILEGES;
```

## Database Migration

### Step 1: Create MySQL Tables

First, create the MySQL table structure using the provided SQL script:

```bash
node scripts/create-mysql-tables.js
```

This will create all the necessary tables:
- `users` - User information
- `lps` - Liquidity providers information
- `lp_supported_platforms` - Supported platforms for LPs
- `payment_intents` - Payment intent records
- `payment_status_history` - History of payment status changes
- `tasks` - Task records
- `paypal_logs` - PayPal transaction logs

### Step 2: Run the Migration

The migration script will:
1. Connect to both MongoDB and MySQL
2. Read data from MongoDB collections
3. Transform and load data into MySQL tables
4. Log the migration process

```bash
node scripts/migrate-to-mysql.js
```

The script includes detailed logging and error handling. Check the `logs` directory for migration logs.

### Step 3: Verify Migration

After migration, verify the data integrity:

```bash
# Check record counts
node scripts/verify-migration.js
```

## Database Backup & Restore

### Setting Up Automated Backups

Configure daily backups using:

```bash
node scripts/setup-cron.js
```

This will create a cron job to run backups daily at the specified time (default: 1:00 AM).

### Manual Backup

To manually create a backup:

```bash
node scripts/backup-mysql.js
```

Backups are stored in the `backups` directory and are automatically cleaned up after the retention period.

### Restore from Backup

To restore from the most recent backup:

```bash
node scripts/restore-mysql.js
```

To restore from a specific backup file:

```bash
node scripts/restore-mysql.js /path/to/backup_file.sql
```

To use interactive mode for selecting a backup:

```bash
node scripts/restore-mysql.js --interactive
```

## Switching to MySQL

After successful migration, update your application to use MySQL instead of MongoDB:

1. Set `ENABLE_MONGODB=false` in your `.env` file.
2. Make sure your code is using the new MySQL models in `src/models/mysql/`.

The application includes a transition period where both databases can be used simultaneously before fully deprecating MongoDB.

## Troubleshooting

- Check log files in the `logs` directory for detailed information about the migration process.
- If a migration fails, you can safely run it again as it handles existing records appropriately.
- For database connection issues, verify your `.env` configuration and database server status.

## Support

For assistance with migration issues, please contact the system administrator.

## Chainlink Functions PayPal 验证集成

本项目已在 `UnitpayFull` 合约中集成 Chainlink Functions，用于在链上安全验证 PayPal 订单。

1. 编写验证脚本：在 `functions/handler.js` 中实现 PayPal 订单校验逻辑；
2. 为脚本和 Secrets 生成标识：使用 `@chainlink/functions-cli` 编码生成 `SOURCE` 和 `SECRETS`; 
3. 创建部署环境：在项目根目录新建 `.env`，配置以下变量：
   ```ini
   DEFAULT_TOKEN_ADDRESS=0x...              # 默认 ERC20 代币地址
   FUNCTIONS_ROUTER_ADDRESS=0x...           # Chainlink Functions Router 地址
   SOURCE=0x...                             # handler.js 代码标识
   SECRETS=0x...                            # secrets.json 标识
   SUBSCRIPTION_ID=123                      # Chainlink Functions 订阅 ID
   ```
4. 部署合约：
   ```bash
   npx hardhat run scripts/deploy-unitpay.js --network <network>
   ```
5. 在 Functions UI 配置：
   - 将合约地址添加为订阅的 Consumer；
   - 添加 Secrets：`PAYPAL_CLIENT_ID`、`PAYPAL_SECRET`；
   - 添加环境变量：`API_BASE_URL`；
   - 新建 Functions Job，填写 `SOURCE`、`SECRETS`，以及 Arguments `[
       "orderId","merchantEmail","amount","lpEmail"
     ]`，Expected return type 选 `string`。
6. 在链上调用 `createOrder`、`submitOrderId` 发起校验，等待 Chainlink 回调完成 `fulfillRequest`，即可触发支付状态更新。

---