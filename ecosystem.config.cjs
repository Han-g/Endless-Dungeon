module.exports = {
    apps: [{
        name: "endless-dungeon-server",
        script: "build/index.js",
        time: true,
        watch: false,
        instances: 1,
        exec_mode: "fork",
        wait_ready: true,
        env: { NODE_ENV: "production" }
    }]
};
