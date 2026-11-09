import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, get } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { WebSocketServer } from 'ws';
import { installProxy } from '../src/proxy.js';
import { createProxyLogs } from '../src/proxyLogs.js';
import { createAdminApp } from '../src/admin.js';
import { isPublicAddress } from '../src/proxyTargets.js';
import ServerTransport from '../public/proxy/transport.mjs';

async function listen (server, t) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections?.(); return new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('server transport forwards HTTP/WS, records metadata only and serves the IP viewer', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'flowos-logs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const logs = createProxyLogs(directory);
  let received;
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { method: req.method, body: Buffer.concat(chunks).toString(), headers: req.headers };
    res.writeHead(200, { 'content-encoding': 'gzip', 'set-cookie': ['session=secret-cookie'], 'x-example': 'yes' });
    res.end(gzipSync('private-response-body'));
  });
  const echo = new WebSocketServer({ server: upstream });
  echo.on('connection', socket => socket.on('message', (data, binary) => socket.send(data, { binary })));
  const target = await listen(upstream, t);
  const app = express();
  const server = createServer(app);
  installProxy(app, server, logs, { allowPrivateTargets: true });
  const base = await listen(server, t);
  const transport = new ServerTransport({ base });
  const response = await transport.request(new URL(target + '/example'), 'POST', 'private-request-body', {
    'content-type': 'text/plain', authorization: 'Bearer secret-token', cookie: 'private-cookie', 'x-test': 'present'
  });
  assert.equal(await new Response(response.body).text(), 'private-response-body');
  assert.equal(received.method, 'POST');
  assert.equal(received.body, 'private-request-body');
  assert.equal(received.headers['x-test'], 'present');
  assert.equal(response.headers['x-example'], 'yes');
  assert.equal(response.headers['content-encoding'], undefined);
  assert.deepEqual(response.headers['set-cookie'], 'session=secret-cookie');

  await new Promise((resolve, reject) => {
    const [send, close] = transport.connect(new URL(target.replace('http:', 'ws:') + '/socket'), 'https://example.org', [], {},
      () => send('private-websocket-payload'), data => {
        try { assert.equal(data, 'private-websocket-payload'); close(1000, 'done'); } catch (error) { reject(error); }
      }, () => resolve(), reject);
  });
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(logs.users(today), ['127.0.0.1']);
  const records = logs.read(today, '127.0.0.1').records;
  assert.ok(records.some(entry => entry.type === 'http-request' && entry.method === 'POST'));
  assert.ok(records.some(entry => entry.type === 'websocket-response' && entry.status === 101));
  const serialized = readdirSync(join(directory, today)).map(file => readFileSync(join(directory, today, file), 'utf8')).join('');
  for (const secret of ['private-request-body', 'private-response-body', 'private-websocket-payload', 'secret-token', 'private-cookie', 'secret-cookie']) assert.ok(!serialized.includes(secret), secret);
  assert.match(serialized, /REDACTED/);
  const reloaded = createProxyLogs(directory);
  assert.equal(reloaded.read(today, '127.0.0.1').records.length, records.length);
  assert.throws(() => logs.read('../..', '127.0.0.1'), /Invalid date/);
  for (let i = 0; i < 100; i++) logs.write('192.0.2.1', { type: 'http-request', method: 'GET', url: 'https://example.org/' + i, headers: { 'x-long': 'a'.repeat(9000) } });
  const latest = logs.read(today, '192.0.2.1');
  const earlier = logs.read(today, '192.0.2.1', latest.before);
  assert.equal(latest.records.length + earlier.records.length, 100);
  assert.notEqual(latest.records.at(-1).url, earlier.records[0].url);

  const admin = await listen(createServer(createAdminApp(logs)), t);
  assert.equal((await fetch(admin)).status, 200);
  assert.deepEqual(await (await fetch(admin + '/api/users?day=' + today)).json(), ['127.0.0.1', '192.0.2.1']);
  const denied = await new Promise(resolve => get(admin, { headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }));
  assert.equal(denied, 403);
  assert.equal((await fetch(base + '/wisp/')).status, 404);
});

test('public proxy blocks private addresses including the local admin viewer', async t => {
  for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '::1', '::ffff:127.0.0.1', '169.254.169.254']) assert.equal(isPublicAddress(address), false);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  const app = express();
  const server = createServer(app);
  installProxy(app, server, { write: () => {} });
  const base = await listen(server, t);
  const transport = new ServerTransport({ base });
  await assert.rejects(transport.request(new URL('http://127.0.0.1:3744/'), 'GET', null, {}), /400/);
  await assert.rejects(transport.request(new URL('http://localhost:3744/'), 'GET', null, {}), /502/);
});
