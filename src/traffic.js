import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { setTimeout as wait } from 'node:timers/promises';

const OFFSET = 9 * 60 * 60 * 1000;
export const DAILY_BYTES = 3_000_000_000;
export const LIMITED_BYTES_PER_SECOND = 125_000;
export const trafficDay = (time = Date.now()) => new Date(time + OFFSET).toISOString().slice(0, 10);
const nextReset = time => Date.parse(trafficDay(time) + 'T00:00:00+09:00') + 86400000;
const empty = () => ({ requests: 0, uploadBytes: 0, downloadBytes: 0 });
const totalBytes = value => value.uploadBytes + value.downloadBytes;

export function createTraffic ({ directory, quota = DAILY_BYTES, rate = LIMITED_BYTES_PER_SECOND, now = Date.now, assertStorage = () => {} } = {}) {
  const root = join(directory, 'usage');
  const cache = new Map();
  const queues = new Map();
  const validateDay = day => { if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid date.'); };
  const filename = (day, ip) => join(root, day, Buffer.from(ip).toString('base64url') + '.jsonl');
  function apply (state, event) {
    const site = state.sites[event.site] ||= empty();
    const hour = state.hours[event.hour] ||= empty();
    for (const target of [state, site, hour]) {
      target.requests += event.requests || 0;
      target.uploadBytes += event.uploadBytes || 0;
      target.downloadBytes += event.downloadBytes || 0;
    }
  }
  function stateFor (day, ip) {
    validateDay(day);
    const key = `${day}/${ip}`;
    if (cache.has(key)) return cache.get(key);
    const state = { ...empty(), ip, sites: Object.create(null), hours: Object.create(null) };
    try {
      for (const line of readFileSync(filename(day, ip), 'utf8').split('\n').filter(Boolean)) {
        const event = JSON.parse(line);
        if (typeof event.site !== 'string' || !Number.isInteger(event.hour) || event.hour < 0 || event.hour > 23 ||
          ['requests', 'uploadBytes', 'downloadBytes'].some(key => event[key] !== undefined && (!Number.isSafeInteger(event[key]) || event[key] < 0))) throw new Error('Invalid usage state.');
        apply(state, event);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Cache current usage only; historical reports must not accumulate in memory.
    if (day === trafficDay(now())) {
      for (const key of cache.keys()) if (!key.startsWith(day + '/')) cache.delete(key);
      cache.set(key, state);
    }
    return state;
  }
  function record (ip, site, values) {
    assertStorage();
    const time = now();
    const day = trafficDay(time);
    const state = stateFor(day, ip);
    const event = { site, hour: new Date(time + OFFSET).getUTCHours(), ...values };
    mkdirSync(join(root, day), { recursive: true, mode: 0o700 });
    // Append metadata before releasing bytes; restarting cannot reset the allowance.
    appendFileSync(filename(day, ip), JSON.stringify(event) + '\n', { mode: 0o600 });
    apply(state, event);
  }
  function usage (ip) {
    const time = now();
    const state = stateFor(trafficDay(time), ip);
    const bytes = totalBytes(state);
    return {
      day: trafficDay(time),
      timezone: 'Asia/Tokyo',
      ip,
      quotaBytes: quota,
      ...empty(),
      requests: state.requests,
      uploadBytes: state.uploadBytes,
      downloadBytes: state.downloadBytes,
      totalBytes: bytes,
      remainingBytes: Math.max(0, quota - bytes),
      limited: bytes >= quota,
      limitMbps: rate * 8 / 1e6,
      resetsAt: new Date(nextReset(time)).toISOString(),
      sites: Object.entries(state.sites).map(([site, value]) => ({ site, ...value, totalBytes: totalBytes(value) })).sort((a, b) => b.totalBytes - a.totalBytes)
    };
  }
  function grant (ip, site, direction, amount, signal) {
    if (signal?.aborted) return Promise.reject(new Error('Transfer cancelled.'));
    let queue = queues.get(ip);
    if (!queue) { queue = []; queues.set(ip, queue); }
    const promise = new Promise((resolve, reject) => queue.push({ site, direction, amount, signal, resolve, reject }));
    if (queue.length === 1) pump(ip, queue);
    return promise;
  }
  async function pump (ip, queue) {
    while (queue.length) {
      const job = queue[0];
      try {
        if (job.signal?.aborted) throw new Error('Transfer cancelled.');
        let remaining = quota - totalBytes(stateFor(trafficDay(now()), ip));
        let bytes = Math.min(job.amount, Math.max(1, remaining), 65536);
        if (remaining <= 0) {
          bytes = Math.min(job.amount, Math.max(1, Math.floor(rate / 10)));
          const day = trafficDay(now());
          await wait(Math.min(bytes / rate * 1000, Math.max(1, nextReset(now()) - now())), undefined, { signal: job.signal });
          if (day !== trafficDay(now())) {
            remaining = quota - totalBytes(stateFor(trafficDay(now()), ip));
            bytes = Math.min(job.amount, Math.max(1, remaining), 65536);
          }
        }
        if (job.signal?.aborted) throw new Error('Transfer cancelled.');
        record(ip, job.site, { [job.direction === 'upload' ? 'uploadBytes' : 'downloadBytes']: bytes });
        job.resolve(bytes);
      } catch (error) { job.reject(error); }
      queue.shift();
    }
    queues.delete(ip);
  }
  function stream (ip, url, direction, signal) {
    const site = new URL(url).hostname;
    const output = new Transform({
      transform (chunk, encoding, callback) {
        (async () => {
          for (let offset = 0; offset < chunk.length;) {
            const bytes = await grant(ip, site, direction, chunk.length - offset, signal);
            if (output.destroyed) return;
            output.push(chunk.subarray(offset, offset + bytes));
            offset += bytes;
          }
        })().then(() => callback(), callback);
      }
    });
    return output;
  }
  function statistics (day, selectedIP) {
    validateDay(day);
    let ips;
    try { ips = readdirSync(join(root, day)).filter(name => /^[\w-]+\.jsonl$/.test(name)).map(name => Buffer.from(name.slice(0, -6), 'base64url').toString()); } catch (error) { if (error.code !== 'ENOENT') throw error; ips = []; }
    const states = ips.map(ip => stateFor(day, ip));
    const selected = selectedIP ? states.filter(value => value.ip === selectedIP) : states;
    const summary = empty();
    const sites = Object.create(null);
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ...empty() }));
    for (const state of selected) {
      for (const key of Object.keys(summary)) summary[key] += state[key];
      for (const [site, values] of Object.entries(state.sites)) {
        const target = sites[site] ||= empty();
        for (const key of Object.keys(target)) target[key] += values[key];
      }
      for (const [hour, values] of Object.entries(state.hours)) for (const key of Object.keys(summary)) hours[hour][key] += values[key];
    }
    const totals = values => ({ ...values, totalBytes: totalBytes(values) });
    return {
      day,
      timezone: 'Asia/Tokyo',
      quotaBytes: quota,
      totals: totals(summary),
      ips: states.map(({ ip, requests, uploadBytes, downloadBytes }) => totals({ ip, requests, uploadBytes, downloadBytes })).sort((a, b) => b.totalBytes - a.totalBytes),
      sites: Object.entries(sites).map(([site, values]) => totals({ site, ...values })).sort((a, b) => b.totalBytes - a.totalBytes),
      hours: hours.map(totals)
    };
  }
  return { usage, statistics, stream, grant, request: (ip, url) => record(ip, new URL(url).hostname, { requests: 1 }) };
}
