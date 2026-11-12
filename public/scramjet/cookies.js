/* eslint-env serviceworker */
/* global psl */

function openCookieDatabase () {
  return new Promise((resolve, reject) => {
    // The controller creates this database and its stores before registration.
    const request = indexedDB.open('$scramjet', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readCookies (db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction('cookies').objectStore('cookies').get('cookies');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeCookies (db, cookies) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('cookies', 'readwrite');
    transaction.objectStore('cookies').put(cookies, 'cookies');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

function matchesDomain (hostname, domain, hostOnly) {
  return hostname === domain || (!hostOnly && hostname.endsWith('.' + domain));
}

function expired (cookie, now) {
  if (cookie.expires) return Date.parse(cookie.expires) <= now;
  return cookie.maxAge != null && cookie.maxAge <= 0;
}

function appliesTo (cookie, url, fromJs) {
  const domain = cookie.domain?.replace(/^\./, '');
  const path = cookie.path || '/';
  return !!domain &&
    matchesDomain(url.hostname, domain, cookie.hostOnly !== false) &&
    (!cookie.secure || url.protocol === 'https:') &&
    (!fromJs || !cookie.httpOnly) &&
    (url.pathname === path || url.pathname.startsWith(path.endsWith('/') ? path : path + '/'));
}

class ScramjetCookies {
  constructor (parser) {
    this.parser = parser;
    this.cookies = Object.create(null);
    this.database = openCookieDatabase();
    this.ready = this.database.then(readCookies).then(saved => {
      // Scramjet 1.1.0 stores an object. Its own loader accepts only JSON text.
      const values = typeof saved === 'string' ? JSON.parse(saved) : saved;
      for (const cookie of Object.values(values || {})) {
        if (typeof cookie?.domain !== 'string' || typeof cookie.name !== 'string' || expired(cookie, Date.now())) continue;
        const path = cookie.path || '/';
        this.cookies[`${cookie.domain}@${path}@${cookie.name}`] = cookie;
      }
    }).catch(() => console.warn('Scramjet cookies could not be restored.'));
    this.written = Promise.resolve();
  }

  save () {
    const snapshot = Object.fromEntries(Object.entries(this.cookies).filter(([, cookie]) => !expired(cookie, Date.now())));
    this.written = this.written.then(() => this.database).then(db => writeCookies(db, snapshot))
      .catch(() => console.warn('Scramjet cookies could not be saved.'));
    return this.written;
  }

  setCookies (values, url, fromJs = false) {
    let changed = false;
    const visible = [];
    for (const value of values) {
      if (typeof value !== 'string' || !value.includes('=')) continue;
      this.parser.load('{}');
      this.parser.setCookies([value], url);
      const cookie = Object.values(JSON.parse(this.parser.dump()))[0];
      if (!cookie?.name || (fromJs && cookie.httpOnly) || (cookie.secure && url.protocol !== 'https:')) continue;
      const domain = cookie.domain.toLowerCase().replace(/^\./, '');
      const hostOnly = !/;\s*domain\s*=/i.test(value);
      if (!matchesDomain(url.hostname, domain, hostOnly) ||
          (!hostOnly && domain !== url.hostname && (!psl.get(domain) || url.hostname.startsWith('[')))) continue;
      const path = /;\s*path\s*=\s*\//i.test(value) ? cookie.path : url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/';
      const key = `.${domain}@${path}@${cookie.name}`;
      if (fromJs && this.cookies[key]?.httpOnly) continue;
      cookie.domain = '.' + domain;
      cookie.hostOnly = hostOnly || !psl.get(domain);
      cookie.path = path;
      if (Number.isFinite(cookie.maxAge)) {
        const now = Date.now();
        cookie.expires = new Date(now + Math.min(Math.max(cookie.maxAge, 0), 34560000) * 1000).toISOString();
      }
      if (expired(cookie, Date.now())) delete this.cookies[key];
      else this.cookies[key] = cookie;
      changed = true;
      if (!cookie.httpOnly) visible.push(value);
    }
    const save = this.save.bind(this);
    if (changed) save();
    return visible;
  }

  getCookies (url) {
    return Object.values(this.cookies)
      .filter(cookie => !expired(cookie, Date.now()) && appliesTo(cookie, url, false))
      .sort((a, b) => b.path.length - a.path.length)
      .map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  }

  dump (url) {
    if (!url) return '{}';
    const matching = Object.entries(this.cookies).filter(([, cookie]) => !expired(cookie, Date.now()) && appliesTo(cookie, url, true));
    return JSON.stringify(Object.fromEntries(matching));
  }
}

self.ScramjetCookies = ScramjetCookies;
