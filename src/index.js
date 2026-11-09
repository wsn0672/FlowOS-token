import 'dotenv/config';
import express from 'express';
import { createProxyLogs } from './proxyLogs.js';
import { installProxy } from './proxy.js';
import { createAdminApp } from './admin.js';
import { configureClientIP } from './clientIP.js';

import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';

import { exec } from 'child_process';

import { createServer } from 'http';
import fs from 'fs';

const publicPath = './public';

const port = process.env.PORT || 3743;

const app = express();
const server = createServer({ maxHeaderSize: 65536 }, app);

configureClientIP(app);
const logs = createProxyLogs();
installProxy(app, server, logs);
const adminServer = createServer(createAdminApp(logs));
adminServer.listen(Number(process.env.ADMIN_PORT || 3744), process.env.ADMIN_HOST || '127.0.0.1');
app.use('/', express.static(publicPath));
app.use('/uv/', express.static(uvPath));
app.use('/baremux/', express.static(baremuxPath));

// Add a route handler for the root path
app.get('/', (req, res) => {
  res.send('Welcome to the Fastify server!');
});

app.get('/uv/uv.config.js', (req, res) => {
  res
    .type('text/javascript')
    .send(fs.readFileSync(`${publicPath}/uv/uv.config.js`));
});

app.get('/ver', (req, res) => {
  exec('git rev-parse HEAD', (err1, hash) => {
    exec('git branch --show-current', (err2, branch) => {
      exec('git ls-remote --get-url', (err3, url) => {
        res.type('application/json').send({
          hash: hash.replace(/\n/g, ''),
          branch: branch.replace(/\n/g, ''),
          url: url.replace(/\n/g, '')
        });
      });
    });
  });
});

server.on('listening', () => {
  console.log(`Listening on: http://localhost:${port}`);
});

server.listen({ port: Number(port), host: process.env.HOST || '0.0.0.0' });

for (const running of [server, adminServer]) {
  running.on('error', error => {
    console.error(error);
    process.exit(1);
  });
}
function shutdown () {
  server.close();
  adminServer.close();
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
