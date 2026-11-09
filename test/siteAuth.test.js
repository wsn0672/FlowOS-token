import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { createSiteAuth } from '../src/siteAuth.js';

test('password gate, sessions, persistent IP lockout and expiry', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'flowos-auth-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let time = Date.now();
  const options = { password: 'test-password', statePath: join(directory, 'locks.json'), now: () => time };
  assert.throws(() => createSiteAuth({ ...options, password: '' }), /SITE_PASSWORD/);
  let auth = createSiteAuth(options);
  const app = express();
  app.use(express.urlencoded({ extended: false, limit: '2kb' }));
  app.use((req, res, next) => auth.middleware(req, res, next));
  app.get('/private.js', (req, res) => res.send('protected'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(base + path, { redirect: 'manual', ...options });
  const login = (password, extraHeaders = {}) => request('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...extraHeaders },
    body: new URLSearchParams({ password })
  });

  assert.equal((await request('/private.js')).status, 303);
  assert.equal((await request('/login')).status, 200);
  assert.equal((await login('test-password', { origin: 'https://attacker.invalid' })).status, 403);
  assert.equal((await login('wrong')).status, 401);
  const success = await login('test-password');
  assert.equal(success.status, 303);
  const cookie = success.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const headers = { cookie: cookie.split(';')[0] };
  assert.equal((await request('/private.js', { headers })).status, 200);
  assert.equal((await request('/private.js', { headers: { cookie: 'flowos_session=forged' } })).status, 303);

  for (let i = 1; i <= 5; i++) {
    const response = await login('wrong', { 'x-forwarded-for': `192.0.2.${i}` });
    assert.equal(response.status, i === 5 ? 429 : 401);
    if (i === 5) assert.equal(response.headers.get('retry-after'), '86400');
  }
  assert.equal((await login('test-password')).status, 429);
  assert.equal((await request('/private.js', { headers })).status, 429);
  auth = createSiteAuth(options);
  assert.equal((await login('test-password')).status, 429);
  assert.equal(auth.isLocked('192.0.2.200'), false);
  time += 24 * 60 * 60 * 1000;
  assert.equal((await login('test-password')).status, 303);
  assert.equal((await request('/private.js', { headers })).status, 303);
});
