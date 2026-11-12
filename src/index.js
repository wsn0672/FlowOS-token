import 'dotenv/config';
import express from 'express';
import MarkdownIt from 'markdown-it';
import { fileURLToPath } from 'node:url';
import { createProxyLogs } from './proxyLogs.js';
import { installProxy } from './proxy.js';
import { installRammerhead } from './rammerhead.js';
import { createAdminApp } from './admin.js';
import { configureClientIP, getClientIP } from './clientIP.js';
import { createTraffic } from './traffic.js';

import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';

import { exec } from 'child_process';

import { createServer } from 'http';
import fs from 'fs';

const publicPath = './public';
const announcementPath = process.env.ANNOUNCEMENT_FILE || fileURLToPath(new URL('../announcement.md', import.meta.url));
const markdown = new MarkdownIt({ html: false });

const port = process.env.PORT || 3743;

const app = express();
const server = createServer({ maxHeaderSize: 65536 }, app);

configureClientIP(app);
const logs = createProxyLogs();
const traffic = createTraffic({ directory: logs.root, assertStorage: logs.assertStorage });
const rammerhead = installRammerhead(app, logs, traffic);
app.get('/api/browser-engines', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    engines: ['Ultraviolet', 'Scramjet', 'Rammerhead'],
    rammerheadOrigin: rammerhead?.origin ?? null
  });
});
app.get('/api/announcement', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const source = await fs.promises.readFile(announcementPath, 'utf8');
    res.json({ html: markdown.render(source) });
  } catch (error) {
    if (error.code === 'ENOENT') return res.json({ html: '' });
    console.error('Could not read FlowOS announcement:', error.code);
    res.sendStatus(503);
  }
});
app.get('/api/proxy-health', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-FlowOS-Health', 'ok');
  res.sendStatus(204);
});
app.get('/api/usage', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(traffic.usage(getClientIP(req, app)));
});
installProxy(app, server, logs, { traffic, upgrade: rammerhead?.upgrade });
const adminServer = createServer(createAdminApp(logs, traffic));
adminServer.listen(Number(process.env.ADMIN_PORT || 3744), process.env.ADMIN_HOST || '127.0.0.1');
const runtimeAssets = {
  setHeaders (res, file) {
    // Keep the UI and the proxy runtime on the same release across deploys.
    if (!file.includes('/builtin/apps/games/') && /\.(?:html|[cm]?js|css|wasm)$/i.test(file)) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
};
app.use('/', express.static(publicPath, runtimeAssets));
app.use('/uv/', express.static(uvPath, runtimeAssets));
app.get('/scramjet/psl.js', (req, res) => {
  res.set('Cache-Control', 'no-store').type('text/javascript')
    .sendFile(fileURLToPath(new URL('./psl.umd.cjs', import.meta.resolve('psl'))));
});
app.use('/scramjet/assets/', express.static(scramjetPath, runtimeAssets));
app.use('/baremux/', express.static(baremuxPath, runtimeAssets));

// Add a route handler for the root path
app.get('/', (req, res) => {
  res.send('Welcome to the Fastify server!');
});

app.get('/uv/uv.config.js', (req, res) => {
  res
    .set('Cache-Control', 'no-store')
    .type('text/javascript')
    .send(fs.readFileSync(`${publicPath}/uv/uv.config.js`));
});

app.get('/ver', (req, res) => {
  res.set('Cache-Control', 'no-store');
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
