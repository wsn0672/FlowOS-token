/* eslint-env browser */

// App manifests may configure presentation, but must not inject markup or code.
export function safeAppURL (value, fallback = '/404.html', image = false) {
  if (typeof value !== 'string') return fallback;
  try {
    const url = new URL(value, window.location.href);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
    if (image && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  } catch {}
  return fallback;
}

export function safeWindowConfig (input) {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
  for (const key of ['width', 'height', 'minwidth', 'minheight', 'maxwidth', 'maxheight', 'x', 'y', 'top', 'right', 'bottom', 'left', 'border', 'header']) {
    const value = input[key];
    if ((typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && /^(?:-?\d+(?:\.\d+)?(?:px|%)?|center|right|bottom)$/.test(value))) output[key] = value;
  }
  for (const key of ['min', 'max', 'hidden', 'modal', 'autosize', 'overflow']) {
    if (typeof input[key] === 'boolean') output[key] = input[key];
  }
  if (typeof input.background === 'string') output.background = input.background;
  const classes = typeof input.class === 'string' ? input.class.split(/\s+/) : input.class;
  if (Array.isArray(classes)) output.class = classes.filter(value => typeof value === 'string' && /^[\w-]+$/.test(value));
  return output;
}

export function readAppDefinition (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    typeof input.APP_ID !== 'string' || !/^[\w-]{1,128}$/.test(input.APP_ID) ||
    ['__proto__', 'prototype', 'constructor'].includes(input.APP_ID) ||
    typeof input.title !== 'string' || !input.title.trim() ||
    !safeAppURL(input.url, null)) throw new Error('Invalid application manifest.');
  return {
    APP_ID: input.APP_ID,
    title: input.title,
    url: safeAppURL(input.url),
    icon: safeAppURL(input.icon, '/assets/icons/application.svg', true),
    proxy: input.proxy === true,
    config: safeWindowConfig(input.config)
  };
}
