module.exports = {
  apps: [
    {
      name: 'brahmam-pandit-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1, // single process: rate limits are in-memory; scale out only after moving them to Redis
      exec_mode: 'fork',
      time: true, // timestamp log lines
      max_memory_restart: '400M',
      exp_backoff_restart_delay: 200, // back off if it crash-loops
      kill_timeout: 5000,
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
    },
  ],
};
