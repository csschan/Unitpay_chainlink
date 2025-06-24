module.exports = {
  apps: [{
    name: "unitpay_4000",
    cwd: "/Users/css/Desktop/unitpay_doc/unitpay_evm",
    script: "src/index.js",
    exec_mode: "cluster",
    instances: "max",
    autorestart: true,
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: 4000
    },
    env_development: {
      NODE_ENV: "development",
      PORT: 4000
    }
  }]
} 