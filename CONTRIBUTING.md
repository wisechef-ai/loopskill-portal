# Contributing to loopskill-portal

This is the public frontend for [LoopSkill](https://app.loopskill.io), an
Astro static site. The backend lives in the sibling
[loopskill-api](https://github.com/wisechef-ai/loopskill-api) repo.

## Setup

```bash
npm install
npm run dev
```

## The golden rule: `main` is production

Every push to `main` triggers `.github/workflows/ci.yml`, which builds the
site and deploys it directly. There is no staging branch. **Never push
directly to `main`** — always go through a PR.

## Workflow

1. **Branch**, then open a PR against `main`.
2. **Write a test where it applies** — see `tests/` for the existing
   source-assertion style (read a page's source, assert the strings/DOM
   hooks a feature depends on). A bug fix without a regression test will be
   sent back.
3. **Run the suite locally**: `npm test`. It must be green before you open
   the PR.
4. **Build locally** (`npm run build`) if you touched routing, redirects, or
   build-time data fetches — some regressions (broken static paths, dead
   fetches) only show up at build time, not in `npm run dev`.
5. **Wait for CI green**, then the PR can be merged.

## Conventions

- Conventional commits: `fix(...)`, `feat(...)`, `test(...)`, `chore(...)`.
- Page-level data fetching happens in Astro frontmatter at build time via
  `src/lib/api.ts`'s `fetchApi()` helper (retry + backoff for the API's rate
  limiter). Prefer it over ad-hoc `fetch()` calls in new pages.
- Honest degradation over fabricated data: if a build-time fetch fails, a
  section should render empty or omitted — never a hardcoded placeholder
  that could silently drift from the real catalog.
- No secrets belong in this repo. All API calls are made against public,
  unauthenticated endpoints or the visitor's own session cookie.

## License

By contributing, you agree your contribution is licensed under the
project's [MPL-2.0 license](./LICENSE).
