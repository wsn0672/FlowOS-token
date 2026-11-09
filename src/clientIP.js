import { isIP } from 'node:net';
import express from 'express';

export function configureClientIP (app, trustedProxies = process.env.TRUST_PROXY ?? 'loopback') {
  // cloudflared normally connects through loopback. Never trust remote peers by default.
  app.set('trust proxy', trustedProxies.split(',').map(value => value.trim()).filter(Boolean));
}

export function getClientIP (req, app = req.app) {
  const peer = req.socket.remoteAddress;
  const trust = app.get('trust proxy fn');
  const cloudflareIP = req.headers['cf-connecting-ip'];
  if (peer && trust?.(peer, 0) && typeof cloudflareIP === 'string' && isIP(cloudflareIP)) {
    return cloudflareIP;
  }
  // Use the same Express forwarding rules for HTTP requests and raw WS upgrades.
  const forwarded = Reflect.get(express.request, 'ip', { app, connection: req.socket, headers: req.headers });
  return isIP(forwarded || '') ? forwarded : peer;
}
