import { mkdirSync, appendFileSync, readdirSync, openSync, readSync, closeSync, fstatSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function safeHeaders (headers) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key,
    /cookie|authorization|token|api[-_]key|secret/i.test(key) ? '[REDACTED]' : value]));
}

export function createProxyLogs (directory) {
  const root = resolve(directory || process.env.PROXY_LOG_DIR || '/mnt/timemachine/flowos-logs');
  const requireMount = !directory && !process.env.PROXY_LOG_DIR && process.platform === 'linux';
  if (requireMount) {
    const mounted = readFileSync('/proc/self/mountinfo', 'utf8').split('\n')
      .some(line => line.split(' ')[4] === '/mnt/timemachine');
    if (!mounted) throw new Error('/mnt/timemachine must be mounted before starting FlowOS.');
  }
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const mountDevice = requireMount ? statSync('/mnt/timemachine').dev : null;
  const ipFile = ip => Buffer.from(ip).toString('base64url') + '.jsonl';
  function dayPath (day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid date.');
    return join(root, day);
  }
  function assertStorage () {
    if (requireMount && statSync('/mnt/timemachine').dev !== mountDevice) throw new Error('Log storage was unmounted.');
  }
  function write (ip, entry) {
    assertStorage();
    const timestamp = new Date().toISOString();
    const folder = dayPath(timestamp.slice(0, 10));
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    // Explicit allowlist: never serialize request objects or bodies.
    const record = {
      requestId: entry.requestId,
      timestamp,
      ip,
      type: entry.type,
      url: entry.url,
      method: entry.method,
      headers: safeHeaders(entry.headers || {}),
      status: entry.status,
      responseHeaders: entry.responseHeaders ? safeHeaders(entry.responseHeaders) : undefined,
      error: entry.error
    };
    appendFileSync(join(folder, ipFile(ip)), JSON.stringify(record) + '\n', { mode: 0o600 });
  }
  function users (day) {
    try {
      return readdirSync(dayPath(day)).filter(name => /^[\w-]+\.jsonl$/.test(name))
        .map(name => Buffer.from(name.slice(0, -6), 'base64url').toString()).sort();
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  function read (day, ip, before) {
    let fd;
    try {
      fd = openSync(join(dayPath(day), ipFile(ip)), 'r');
      const size = fstatSync(fd).size;
      const end = before === undefined ? size : Number(before);
      if (!Number.isSafeInteger(end) || end < 0 || end > size) throw new Error('Invalid cursor.');
      const start = Math.max(0, end - 512 * 1024);
      const buffer = Buffer.alloc(end - start);
      readSync(fd, buffer, 0, buffer.length, start);
      const skip = start ? buffer.indexOf(10) + 1 : 0;
      if (start && !skip) throw new Error('Log record exceeds page size.');
      const records = buffer.subarray(skip).toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
      return { records: records.reverse(), before: start + skip || null };
    } catch (error) {
      if (error.code === 'ENOENT') return { records: [], before: null };
      throw error;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }
  return { write, users, read, root, assertStorage };
}
