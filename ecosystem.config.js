export default {
    apps: [{
        name: 'devhubsharks-api',
        script: './index.js',
        interpreter: 'node',
        node_args: '--env-file .env',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production'
        }
    }]
};