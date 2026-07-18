module.exports = {
  apps: [{
    name: 'coinflip-api',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_size: '10M',
    retain: 10,
    max_restarts: 10,
    restart_delay: 5000,
    autorestart: true
  }]
};
