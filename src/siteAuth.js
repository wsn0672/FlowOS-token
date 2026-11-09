import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
const COOKIE = 'flowos_session';
const digest = value => createHash('sha256').update(value).digest();

export function createSiteAuth ({ password, statePath = './data/auth-locks.json', secureCookies = false, now = Date.now }) {
  if (!password) throw new Error('SITE_PASSWORD must be set before starting the server.');
  const passwordHash = digest(password);
  const file = resolve(statePath);
  let attempts = {};
  const sessions = new Map();
  try {
    attempts = JSON.parse(readFileSync(file, 'utf8'));
    if (!attempts || Array.isArray(attempts) || typeof attempts !== 'object' ||
      Object.values(attempts).some(entry => !entry || !Number.isInteger(entry.failures) ||
        entry.failures < 1 || entry.failures > 5 || !Number.isFinite(entry.expires))) {
      throw new Error('Invalid authentication lock state.');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  attempts = Object.assign(Object.create(null), attempts);

  function persist () {
    for (const [ip, entry] of Object.entries(attempts)) {
      if (entry.expires <= now()) delete attempts[ip];
    }
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(`${file}.tmp`, JSON.stringify(attempts), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  // Verify persistence is writable before accepting requests.
  persist();

  function lock (ip) {
    const entry = attempts[ip];
    return entry && entry.expires > now() && entry.failures >= 5 ? entry : null;
  }

  function hasSession (req) {
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim())
      .find(value => value.startsWith(`${COOKIE}=`));
    if (!cookie) return false;
    const expires = sessions.get(cookie.slice(COOKIE.length + 1));
    return expires !== undefined && expires > now();
  }

  function page (res, status = 200, message = '') {
    return res.status(status).type('html').send(`<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FlowOS ログイン</title><style>
body{font-family:system-ui,sans-serif;background:#111827;color:#f9fafb;display:grid;place-items:center;min-height:100dvh;margin:0}
main{width:min(340px,80vw);padding:32px;background:#1f2937;border-radius:16px}h1{margin-top:0}
input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:12px;border-radius:8px;border:1px solid #6b7280;font:inherit}
button{background:#60a5fa;color:#111827;cursor:pointer}p{line-height:1.6}label{display:block}
</style><main><h1>FlowOS</h1><p>アクセスするにはパスワードを入力してください。</p>
${message ? `<p role="alert">${message}</p>` : ''}
<form method="post" action="/login"><label for="password">パスワード</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">ログイン</button></form></main></html>`);
  }

  function middleware (req, res, next) {
    res.set('Cache-Control', 'private, no-store');
    const locked = lock(req.ip);
    if (locked) {
      res.set('Retry-After', String(Math.ceil((locked.expires - now()) / 1000)));
      return page(res, 429, 'ログインの失敗が5回に達したため、このIPアドレスは24時間ロックされています。');
    }
    if (req.path === '/login') {
      res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.set('X-Content-Type-Options', 'nosniff');
      if (req.method === 'GET') return page(res);
      if (req.method !== 'POST') return res.sendStatus(405);
      const origin = req.get('origin');
      if (req.get('sec-fetch-site') === 'cross-site' ||
        (origin && origin !== `${req.protocol}://${req.get('host')}`)) return res.sendStatus(403);
      if (typeof req.body?.password !== 'string' || Buffer.byteLength(req.body.password) > 1024) {
        return page(res, 400, '有効なパスワードを入力してください。');
      }
      if (!timingSafeEqual(passwordHash, digest(req.body.password))) {
        const previous = attempts[req.ip];
        const failures = previous && previous.expires > now() ? previous.failures + 1 : 1;
        attempts[req.ip] = { failures, expires: now() + DAY };
        persist();
        if (failures >= 5) {
          res.set('Retry-After', String(DAY / 1000));
          return page(res, 429, 'ログインの失敗が5回に達したため、このIPアドレスは24時間ロックされています。');
        }
        return page(res, 401, `パスワードが正しくありません。あと${5 - failures}回失敗すると24時間ロックされます。`);
      }
      delete attempts[req.ip];
      persist();
      for (const [id, expires] of sessions) {
        if (expires <= now()) sessions.delete(id);
      }
      if (sessions.size >= 10000) return res.sendStatus(503);
      const session = randomBytes(32).toString('hex');
      sessions.set(session, now() + DAY);
      res.cookie(COOKIE, session, { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/', maxAge: DAY });
      return res.redirect(303, '/');
    }
    if (hasSession(req)) return next();
    return res.redirect(303, '/login');
  }

  return { middleware, hasSession, isLocked: ip => Boolean(lock(ip)) };
}
