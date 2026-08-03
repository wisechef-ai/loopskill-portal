# LoopSkill Portal

The public web frontend for [LoopSkill](https://app.loopskill.io) — a registry
of vetted, runnable agent loops and skills for AI coding agents (Claude Code,
Cursor, Cline, and others).

This is a static [Astro](https://astro.build) site. It renders the marketplace
(skills, bundles, loops), account/billing pages, and docs, and talks to the
[loopskill-api](https://github.com/wisechef-ai/loopskill-api) backend over a
public JSON API. It ships no server-side secrets — all API calls are made
either at static-build time or client-side against public, unauthenticated
endpoints (auth-gated pages use the visitor's own session cookie).

## Quickstart

```sh
npm install
npm run dev       # http://localhost:4321
```

By default the site talks to the hosted API at `https://app.loopskill.io`.
To point it at a local `loopskill-api` instance instead, set:

```sh
export PUBLIC_LOOPSKILL_API_BASE=http://localhost:8200
```

## Commands

| Command           | Action                                          |
| :----------------- | :---------------------------------------------- |
| `npm install`      | Install dependencies                             |
| `npm run dev`       | Start the local dev server                       |
| `npm run build`     | Build the static site to `./dist/`               |
| `npm run preview`   | Preview the production build locally             |
| `npm test`          | Run the vitest suite                             |

## Project structure

```text
src/
├── components/   # Shared Astro/React components
├── layouts/       # Page shells (AppShell, etc.)
├── lib/           # Build-time API client, tier config, small helpers
├── pages/         # File-based routes (each .astro/.ts is a page or API route)
└── content/       # Blog posts (Astro content collections)
```

## License

MPL-2.0 — see [LICENSE](./LICENSE). See [CONTRIBUTING.md](./CONTRIBUTING.md)
for how to propose a change.
