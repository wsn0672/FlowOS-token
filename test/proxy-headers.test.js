import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import { installProxy } from '../src/proxy.js';

test('large upstream response headers work within 64 KiB and larger responses fail safely', async t => {
  const records = [];
  const upstream = createServer((req, res) => {
    res.setHeader('x-large-header', 'a'.repeat(req.url === '/too-large' ? 70000 : 20000));
    res.end('page');
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise(resolve => upstream.close(resolve)));
  const app = express();
  const server = createServer(app);
  installProxy(app, server, { write: (ip, record) => records.push(record) }, { allowPrivateTargets: true });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const fetchPage = path => new Promise((resolve, reject) => {
    const metadata = Buffer.from(JSON.stringify({ url: `http://127.0.0.1:${upstream.address().port}${path}`, method: 'GET', headers: {} })).toString('base64url');
    // Match browser-sized header support when reading the metadata envelope.
    const req = request(`http://127.0.0.1:${server.address().port}/proxy/http`, { method: 'POST', maxHeaderSize: 128 * 1024, headers: { 'x-flowos-request': metadata } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
  const response = await fetchPage('/large');
  assert.equal(response.status, 200);
  assert.equal(response.body, 'page');
  const metadata = JSON.parse(Buffer.from(response.headers['x-flowos-response'], 'base64url').toString());
  assert.equal(metadata.headers['x-large-header'].length, 20000);
  assert.equal((await fetchPage('/too-large')).status, 502);
  assert.ok(records.some(record => record.error === 'HPE_HEADER_OVERFLOW'));
  assert.equal((await fetchPage('/large')).status, 200);
});
