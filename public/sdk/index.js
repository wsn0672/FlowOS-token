/* eslint-env browser */

import { config } from '../scripts/managers.js';

class FlowSDK {
  constructor (win, src) {
    const decodedUrl = window.currentProxy.decodeUrl(src.replace(/\/uv\/service\//g, ''));
    this.window = win;
    (async () => {
      this.manifest = await this.#getManifest(decodedUrl);
      if (this.manifest.permissions) this.#handlePermissions(this.manifest.permissions, new URL(decodedUrl).origin);
    })().catch(error => console.error('Application manifest could not be loaded:', error));
  }

  onmanifest;

  #getManifest = async (decodedUrl) => {
    const res = await fetch(new URL(decodedUrl).origin + '/flow.json');
    if (res.status === 200) {
      const manifest = await res.json();
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return {};
      this.onmanifest?.(manifest);
      return manifest;
    } else {
      return {};
    }
  };

  #handlePermissions = (perms, origin) => {
    if (!Array.isArray(perms)) return;
    const requested = ['config', 'windowManager'].filter(permission => perms.includes(permission));
    if (!requested.length) return;
    // Use the desktop's dialog, not a callback supplied by the embedded app.
    const approved = window.confirm(`Application ${origin} requests access to: ${requested.join(', ')}.\nThis allows access to FlowOS settings or application windows. Allow access for this launch?`);
    if (!approved) return;
    if (requested.includes('config')) this.config = config;
    if (requested.includes('windowManager')) this.windowManager = window.Flow.wm;
  };
}

export default FlowSDK;
