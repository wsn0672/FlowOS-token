/* eslint-env browser */
export const TRANSPORT_PATH = '/proxy/transport.mjs?v=2';

export async function withTimeout (operation, milliseconds = 5000) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('プロキシの応答がタイムアウトしました。')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export function createProxyRecovery ({ connection, probe, base = location.origin, notify = () => {}, delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  let pending;
  async function ensure () {
    const current = await withTimeout(connection.getTransport());
    if (current === TRANSPORT_PATH) return false;
    await withTimeout(connection.setTransport(TRANSPORT_PATH, [{ base }]));
    return true;
  }
  function recover () {
    if (pending) return pending;
    pending = (async () => {
      notify({ status: 'checking' });
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await probe();
          const restored = await ensure();
          notify({ status: 'ready', restored });
          return true;
        } catch {
          if (attempt < 2) await delay((attempt + 1) * 1000);
        }
      }
      notify({ status: 'unavailable' });
      return false;
    })().finally(() => { pending = null; });
    return pending;
  }
  return { ensure, recover };
}

export function watchProxyRecovery (recovery, page = window, doc = document) {
  let previous = Date.now();
  let lastCheck = 0;
  const check = () => {
    if (doc.hidden || Date.now() - lastCheck < 3000) return;
    lastCheck = Date.now();
    recovery.recover();
  };
  const visible = () => { if (!doc.hidden) check(); };
  page.addEventListener('online', check);
  page.addEventListener('pageshow', check);
  doc.addEventListener('visibilitychange', visible);
  const timer = setInterval(() => {
    const current = Date.now();
    if (current - previous > 45000) check();
    previous = current;
  }, 15000);
  return () => {
    clearInterval(timer);
    page.removeEventListener('online', check);
    page.removeEventListener('pageshow', check);
    doc.removeEventListener('visibilitychange', visible);
  };
}
