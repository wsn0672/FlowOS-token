import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { WebSocket } from 'ws';
import { installProxy } from '../src/proxy.js';
import ServerTransport from '../public/proxy/transport.mjs';

test('failed HTTP and WebSocket upstream connections leave the server usable', { timeout: 5000 }, async t => {
  // Reserve then close a loopback port to simulate a refused upstream connection.
  const closed = createServer();
  closed.listen(0, '127.0.0.1');
  await once(closed, 'listening');
  const port = closed.address().port;
  await new Promise(resolve => closed.close(resolve));
  const app = express();
  const server = createServer(app);
  // Loopback is enabled only for this isolated failure-path test.
  installProxy(app, server, { write () {} }, { allowPrivateTargets: true });
  app.get('/health', (req, res) => res.send('ok'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const transport = new ServerTransport({ base });
  await assert.rejects(transport.request(new URL(`http://127.0.0.1:${port}/`), 'GET', null, {}), /502/);
  const meta = Buffer.from(JSON.stringify({ url: `ws://127.0.0.1:${port}/`, headers: {}, protocols: [] })).toString('base64url');
  const client = new WebSocket(base.replace('http:', 'ws:') + '/proxy/ws?meta=' + meta);
  t.after(() => client.terminate());
  const [code] = await once(client, 'close');
  assert.equal(code, 1011);
  assert.equal(await (await fetch(base + '/health')).text(), 'ok');
});
