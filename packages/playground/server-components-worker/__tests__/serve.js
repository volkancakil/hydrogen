// @ts-check
// this is automtically detected by scripts/jest-e2e-setup-test.ts and will replace
// the default e2e test serve behavior

const path = require('path');
const {spawn} = require('child_process');

const port = (exports.port = 9528);

/**
 * @param {string} root
 * @param {boolean} isProd
 */
exports.serve = async function serve(root, isProd) {
    // we build first, regardless of whether it's prod/build mode
    // because Vite doesn't support the concept of a "webworker server"
    const {build} = require('vite');

    // client build
    await build({
        root,
        logLevel: 'silent',
        build: {
            outDir: 'dist/client',
            manifest: true,
        },
    });

    process.env.WORKER = 'true';

    // worker build
    await build({
        root,
        logLevel: 'silent',
        build: {
            ssr: 'worker.js',
            outDir: 'dist/worker',
        },
    });

    delete process.env.WORKER;

    let oxygenRunPath = process.env.OXYGEN_RUN_PATH
    oxygenRunPath = '/Users/mklocke/src/github.com/Shopify/oxygen-sws/bin/oxygen-run-darwin-amd64'

    if (oxygenRunPath) {
        console.info("Using oxygen run binary to perform e2e tests.");

        const assetPath = path.resolve(root, 'dist/client/assets');
        const workerPath = path.resolve(root, 'dist/worker/worker.js');
        try {
            const child = spawn(`${oxygenRunPath}`, ['--address', `localhost:${port}`, '-a', `${assetPath}`, '-w', `${workerPath}`])
            await child.unref();

            child.on('error', (err) => {
                console.error('Failed to start subprocess.', err);
            });

            await new Promise(resolve => {
                child.on('message', (message) => {
                    resolve();
                })
                child.stdout.on('data', (data) => {
                    resolve();
                });
            });

            console.log("Oxygen Started")

            return {
                async close() {
                    console.log('killed')
                    child.kill();
                },
            };

        } catch (e) {
            console.error(e)
        }
    } else {
        console.info("Using miniflare to perform e2e tests.");

        const {createServer} = require(path.resolve(root, 'start-worker.js'));
        const {app} = await createServer(root, isProd);

        return new Promise((resolve, reject) => {
            try {
                const server = app.listen(port, () => {
                    resolve({
                        // for test teardown
                        async close() {
                            await new Promise((resolve) => {
                                server.close(resolve);
                            });
                        },
                    });
                });
            } catch (e) {
                reject(e);
            }
        });
    }
};
