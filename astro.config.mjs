// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  // Phase C (top1pct_1105): /creators → /referrals permanent redirect.
  // The Astro SSG redirect emits a meta-refresh in dist/creators/index.html.
  // In production (Caddy on wisechef-hq) also add:
  //   redir /creators /referrals 301
  // to /etc/caddy/Caddyfile for a true HTTP 301 before the HTML is served.
  redirects: {
    '/creators': '/referrals',
  },

  vite: {
    plugins: [tailwindcss()]
  }
});