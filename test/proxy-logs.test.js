import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProxyLogs } from '../src/proxyLogs.js';

test('new logs follow JST midnight and old UTC records stay separately readable', t => {
  const directory = mkdtempSync(join(tmpdir(), 'flowos-log-zone-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const ip = '203.0.113.1';
  const file = Buffer.from(ip).toString('base64url') + '.jsonl';
  const legacy = { timestamp: '2026-11-11T14:59:59.000Z', ip, type: 'http-request' };
  const day = '2026-11-11';
  mkdirSync(join(directory, day));
  const legacyPath = join(directory, day, file);
  const original = JSON.stringify(legacy) + '\n';
  writeFileSync(legacyPath, original);
  let now = Date.parse(legacy.timestamp);
  const logs = createProxyLogs(directory, { now: () => now });
  logs.write(ip, { type: 'http-request' });
  now += 1000;
  logs.write(ip, { type: 'http-response' });

  assert.deepEqual(logs.users(day), [ip]);
  assert.equal(logs.read(day, ip).records[0].timestamp, '2026-11-11T23:59:59.000+09:00');
  assert.equal(logs.read('2026-11-12', ip).records[0].timestamp, '2026-11-12T00:00:00.000+09:00');
  assert.deepEqual(logs.read(day, ip, undefined, 'UTC').records, [legacy]);
  assert.equal(readFileSync(legacyPath, 'utf8'), original);
  assert.throws(() => logs.users(day, '../'), /Invalid timezone/);
});
