import assert from 'node:assert/strict';
import { test } from 'node:test';
import ServerTransport from '../public/proxy/transport.mjs';
import { createProxyRecovery, TRANSPORT_PATH, withTimeout } from '../public/scripts/proxy-recovery.js';

const metadata = Buffer.from(JSON.stringify({ status: 200, statusText: 'OK', headers: {} })).toString('base64url');
const ok = () => new Response('ok', { headers: { 'x-flowos-response': metadata } });

test('transport retries body-free GET after network errors and gateway errors, without replaying POST', async () => {
  const original = globalThis.fetch;
  const transport = new ServerTransport({ base: 'https://flow.example', retryDelays: [0, 0] });
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch');
      if (calls === 2) return new Response('', { status: 502 });
      return ok();
    };
    const response = await transport.request(new URL('https://example.org'), 'GET', null, {});
    assert.equal(await new Response(response.body).text(), 'ok');
    assert.equal(calls, 3);
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new TypeError('Failed to fetch'); };
    await assert.rejects(transport.request(new URL('https://example.org'), 'POST', 'form-data', {}));
    assert.equal(calls, 1);
    calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('', { status: 400 }); };
    await assert.rejects(transport.request(new URL('https://example.org'), 'GET', null, {}));
    assert.equal(calls, 1);
    calls = 0;
    const controller = new AbortController();
    globalThis.fetch = async () => { calls++; controller.abort(); throw new TypeError('Disconnected'); };
    await assert.rejects(transport.request(new URL('https://example.org'), 'GET', null, {}, controller.signal));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('resume checks coalesce and restore missing transport without resetting a healthy transport', async () => {
  let current = '';
  let sets = 0;
  const statuses = [];
  const recovery = createProxyRecovery({
    base: 'https://flow.example',
    connection: {
      getTransport: async () => current,
      setTransport: async (path, options) => { current = path; sets++; assert.equal(options[0].base, 'https://flow.example'); }
    },
    probe: async () => {},
    notify: status => statuses.push(status)
  });
  const first = recovery.recover();
  assert.equal(recovery.recover(), first);
  assert.equal(await first, true);
  assert.equal(current, TRANSPORT_PATH);
  assert.equal(sets, 1);
  await recovery.recover();
  assert.equal(sets, 1);
  current = '';
  await recovery.recover();
  assert.equal(sets, 2);
  assert.equal(statuses.at(-1).restored, true);
});

test('unreachable server stops after bounded attempts and reports unavailability', async () => {
  let probes = 0;
  const statuses = [];
  const recovery = createProxyRecovery({
    base: 'https://flow.example',
    connection: { getTransport: () => { throw new Error('must not run while offline'); } },
    probe: async () => { probes++; throw new TypeError('Offline'); },
    delay: async () => {},
    notify: status => statuses.push(status)
  });
  assert.equal(await recovery.recover(), false);
  assert.equal(probes, 3);
  assert.equal(statuses.at(-1).status, 'unavailable');
  await assert.rejects(withTimeout(new Promise(() => {}), 1), /タイムアウト/);
});
