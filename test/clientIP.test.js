import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { configureClientIP, getClientIP } from '../src/clientIP.js';

test('local Cloudflare Tunnel resolves IPv4/IPv6 for HTTP and raw WebSocket requests', () => {
  const app = express();
  configureClientIP(app, 'loopback');
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
    for (const ip of ['203.0.113.20', '2001:db8::20']) {
      const req = { app, socket: { remoteAddress: peer }, headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': '198.51.100.1' } };
      assert.equal(getClientIP(req), ip);
      assert.equal(getClientIP({ socket: req.socket, headers: req.headers }, app), ip);
    }
  }
  assert.equal(getClientIP({ app, socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.21' } }), '203.0.113.21');
});

test('untrusted peers cannot spoof headers; invalid CF headers fall back and trust can be overridden', () => {
  const app = express();
  configureClientIP(app, 'loopback');
  const req = { app, socket: { remoteAddress: '198.51.100.50' }, headers: { 'cf-connecting-ip': '203.0.113.20', 'x-forwarded-for': '203.0.113.21' } };
  assert.equal(getClientIP(req), '198.51.100.50');
  req.socket.remoteAddress = '127.0.0.1';
  for (const invalid of ['invalid', '203.0.113.20, 203.0.113.22', ['203.0.113.20']]) {
    req.headers['cf-connecting-ip'] = invalid;
    assert.equal(getClientIP(req), '203.0.113.21');
  }
  configureClientIP(app, '');
  assert.equal(getClientIP(req), '127.0.0.1');
  configureClientIP(app, '172.18.0.2');
  req.socket.remoteAddress = '172.18.0.2';
  req.headers['cf-connecting-ip'] = '203.0.113.20';
  assert.equal(getClientIP(req), '203.0.113.20');
});
