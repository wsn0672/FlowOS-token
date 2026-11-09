module.exports = {
  apps: [{
    name: 'flowos',
    script: 'src/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    restart_delay: 3000,
    max_memory_restart: '768M',
    kill_timeout: 6000,
    time: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3743,
      HOST: '0.0.0.0',
      ADMIN_PORT: 3744,
      ADMIN_HOST: '127.0.0.1'
    }
  }]
};
