module.exports = {
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
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        time: true
    }]
};