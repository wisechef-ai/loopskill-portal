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
  //
  // loopclose_3005 Phase E: the cookbook viz lives at /cookbooks/view?id=<uuid>
  // (static Astro can't pre-render per-user UUID routes). For the clean URL
  // /cookbooks/<id>, Caddy on wisechef-hq rewrites internally to the viz page —
  // add this block BEFORE the catch-all `handle { root * .../dist }`:
  //   @cookbook_id {
  //       path_regexp cbid ^/cookbooks/([A-Za-z0-9][A-Za-z0-9-]*)/?$
  //       not path /cookbooks/view /cookbooks/view/
  //   }
  //   handle @cookbook_id {
  //       rewrite * /cookbooks/view?id={http.regexp.cbid.1}
  //       root * /home/wisechef/recipes-portal/dist
  //       try_files /cookbooks/view/index.html
  //       file_server
  //   }
  // The viz page's JS resolves the id from ?id= (rewrite) or the path segment,
  // so it works on both the clean URL and /cookbooks/view?id= directly.
  //
  // spotify_0608 Ph F: PUBLIC cookbook page lives at /cookbooks/p/?slug=<slug>
  // (static Astro can't pre-render per-slug routes). For the clean shareable URL
  // /cookbooks/p/<slug>, add this Caddy block BEFORE the catch-all, AFTER the
  // @cookbook_id block above:
  //   @cookbook_pub {
  //       path_regexp cbslug ^/cookbooks/p/([A-Za-z0-9][A-Za-z0-9-]*)/?$
  //   }
  //   handle @cookbook_pub {
  //       rewrite * /cookbooks/p?slug={http.regexp.cbslug.1}
  //       root * /home/wisechef/recipes-portal/dist
  //       try_files /cookbooks/p/index.html
  //       file_server
  //   }
  // The page's JS resolves the slug from ?slug= (rewrite) or the trailing path
  // segment, so it works on both the clean URL and /cookbooks/p/?slug= directly.
  // /cookbooks (discover feed) is a normal static route — no rewrite needed.
  redirects: {
    '/creators': '/referrals',
  },

  vite: {
    plugins: [tailwindcss()]
  }
});