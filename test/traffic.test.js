import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createTraffic, trafficDay } from '../src/traffic.js';

function storage (t) {
  const directory = mkdtempSync(join(tmpdir(), 'flowos-traffic-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('usage persists across restart and resets at Japan midnight; site/IP statistics agree', async t => {
  const directory = storage(t);
  let time = Date.parse('2026-11-09T14:59:00Z');
  const options = { directory, quota: 100, now: () => time };
  let traffic = createTraffic(options);
  traffic.request('203.0.113.1', 'https://example.org/a');
  traffic.request('203.0.113.1', 'https://other.example/');
  await traffic.grant('203.0.113.1', 'example.org', 'upload', 30);
  await traffic.grant('203.0.113.1', 'example.org', 'download', 70);
  await traffic.grant('203.0.113.2', 'other.example', 'download', 10);
  assert.equal(traffic.usage('203.0.113.1').limited, true);
  traffic = createTraffic(options);
  assert.equal(traffic.usage('203.0.113.1').totalBytes, 100);
  const stats = traffic.statistics('2026-11-09', '203.0.113.1');
  assert.equal(stats.totals.totalBytes, 100);
  assert.equal(stats.totals.requests, 2);
  assert.equal(stats.hours[23].totalBytes, 100);
  assert.equal(stats.ips.length, 2);
  assert.equal(stats.sites.find(site => site.site === 'example.org').uploadBytes, 30);
  assert.equal(traffic.statistics('2026-11-09').totals.totalBytes, 110);
  time = Date.parse('2026-11-09T15:00:00Z');
  assert.equal(trafficDay(time), '2026-11-10');
  assert.equal(traffic.usage('203.0.113.1').limited, false);
  assert.equal(traffic.usage('203.0.113.1').totalBytes, 0);
  assert.equal(traffic.statistics('2026-11-09').totals.totalBytes, 110);
});

test('upload/download and parallel transfers share one IP rate; another IP remains unrestricted', async t => {
  const traffic = createTraffic({ directory: storage(t), quota: 10, rate: 1000 });
  await traffic.grant('203.0.113.1', 'example.org', 'download', 10);
  const started = performance.now();
  const pending = [traffic.grant('203.0.113.1', 'example.org', 'upload', 100), traffic.grant('203.0.113.1', 'other.example', 'download', 100), traffic.grant('203.0.113.1', 'other.example', 'download', 100)];
  await traffic.grant('203.0.113.2', 'example.org', 'download', 1);
  assert.ok(performance.now() - started < 150, 'a different IP must not wait for the limited queue');
  assert.deepEqual(await Promise.all(pending), [100, 100, 100]);
  assert.ok(performance.now() - started >= 280, 'parallel transfers must share the 1000 byte/s rate');
  assert.equal(traffic.usage('203.0.113.1').totalBytes, 310);
  const controller = new AbortController();
  const cancelled = traffic.grant('203.0.113.1', 'example.org', 'download', 100, controller.signal);
  controller.abort();
  await assert.rejects(cancelled);
  assert.equal(traffic.usage('203.0.113.1').totalBytes, 310);
});
