import 'dotenv/config';
import express from 'express';
import { createSiteAuth } from './siteAuth.js';
import wisp from 'wisp-server-node';

import { uvPath } from '@titaniumnetwork-dev/ultraviolet';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';

import { exec } from 'child_process';

import { createServer } from 'http';
import fs from 'fs';

const publicPath = './public';

const port = process.env.PORT || 8000;

const app = express();
const server = createServer(app);

// Only trust explicitly configured proxy addresses, never arbitrary forwarded headers.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(value => value.trim()));
}
const auth = createSiteAuth({
  password: process.env.SITE_PASSWORD,
  statePath: process.env.AUTH_STATE_PATH,
  secureCookies: process.env.COOKIE_SECURE === 'true'
});
app.use(express.urlencoded({ extended: false, limit: '2kb' }));
app.use(auth.middleware);

app.use('/', express.static(publicPath));
app.use('/uv/', express.static(uvPath));
app.use('/epoxy/', express.static(epoxyPath));
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

server.on('upgrade', (req, socket, head) => {
// Express computes the client IP using the same proxy rules for HTTP and upgrades.
  const ip = Reflect.get(express.request, 'ip', {
    app,
    connection: req.socket,
    headers: req.headers
  });
  if (auth.isLocked(ip) || !auth.hasSession(req)) {
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    return;
  }
  wisp.routeRequest(req, socket, head);
});

server.on('listening', () => {
  console.log(`Listening on: http://localhost:${port}`);
});

server.listen({ port, hostname: '127.0.0.1' });
