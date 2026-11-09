import express from 'express';
import { fileURLToPath } from 'node:url';

export function createAdminApp (logs) {
  const app = express();
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    // Reject cross-origin reads and DNS rebinding, including requests through the proxy.
    const host = req.hostname;
    const allowed = (process.env.ADMIN_ALLOWED_HOSTS || 'localhost,127.0.0.1,::1,[::1]').split(',').map(value => value.trim());
    if (!allowed.includes(host) || req.get('sec-fetch-site') === 'cross-site') return res.sendStatus(403);
    next();
  });
  app.get('/api/users', (req, res) => res.json(logs.users(String(req.query.day || ''))));
  app.get('/api/logs', (req, res) => {
    if (typeof req.query.ip !== 'string' || req.query.ip.length > 64) return res.sendStatus(400);
    res.json(logs.read(String(req.query.day || ''), req.query.ip, req.query.before));
  });
  app.use(express.static(fileURLToPath(new URL('../admin/', import.meta.url))));
  app.use((error, req, res, next) => {
    console.error('Log viewer error:', error.message);
    res.status(400).json({ error: 'ログを読み込めませんでした。日付や指定内容を確認してください。' });
  });
  return app;
}
